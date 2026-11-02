import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DID = "test-device-001";

beforeAll(() => {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "htc-test-"));
  process.env.DB_DRIVER = "pglite";
});

async function api(path: string, init?: RequestInit) {
  const { app } = await import("../src/server/index.js");
  const res = await app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Device-Id": DID, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("seed → briefing flow", () => {
  it("creates household, seeds demo, briefs expected groups", async () => {
    const hh = await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    expect(hh.status).toBe(200);

    const seed = await api("/api/demo/seed", { method: "POST" });
    expect(seed.status).toBe(200);

    const briefing = await api("/api/briefing");
    expect(briefing.status).toBe(200);
    const kinds = {
      buy: briefing.body.buy.map((s: any) => s.rawName),
      skip: briefing.body.skip.map((s: any) => s.rawName),
      swap: briefing.body.swap.map((s: any) => s.rawName),
    };
    // Milk due (T=5 personal, last 6d ago) → BUY
    expect(kinds.buy).toContain("Milk");
    // Rice stocked (10d of 30d) → SKIP with € evidence
    expect(kinds.skip).toContain("Rice");
    const rice = briefing.body.skip.find((s: any) => s.rawName === "Rice");
    expect(rice.tags).toContain("money");
    // Perishables never in SKIP
    expect(kinds.skip).not.toContain("Eggs");
    // Durable never auto-BUY
    expect(kinds.buy).not.toContain("Steel water bottle");
    // Olive oil money story → SWAP with computed saving
    const oil = briefing.body.swap.find((s: any) => s.rawName === "Olive oil");
    expect(oil).toBeTruthy();
    expect(oil.evidence.expectedSaving).toBeGreaterThan(0);

    // Pantry view is driven by curated demo insights, not briefing rhythm.
    const sections = await api("/api/pantry/sections");
    expect(sections.status).toBe(200);
    expect(sections.body.buy.map((s: any) => s.rawName)).toContain("Milk");
    expect(sections.body.buy.map((s: any) => s.rawName)).toContain("Bread");
    const milk = sections.body.buy.find((s: any) => s.rawName === "Milk");
    expect(milk.category).toBe("dairy");
    expect(milk.scores).toMatchObject({
      savesMoney: 0.7,
      healthy: 0.8,
      sustainable: 0.35,
    });
    expect(sections.body.skip.map((s: any) => s.rawName)).toContain("Rice");
    expect(sections.body.swap.map((s: any) => s.rawName)).toContain("Olive oil");
    expect(sections.body.swap[0].swapTitle).toBeTruthy();

    const reset = await api("/api/demo/reset", { method: "POST" });
    expect(reset.status).toBe(200);
    const empty = await api("/api/briefing");
    expect(empty.body.buy).toHaveLength(0);
    expect(empty.body.skip).toHaveLength(0);
    const emptySections = await api("/api/pantry/sections");
    expect(emptySections.body.total).toBe(0);
  });

  it("same receipt 3× with spaced dates → personal rhythm", async () => {
    await api("/api/demo/reset", { method: "POST" });
    const now = Date.now();
    const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
    for (const daysAgo of [20, 10, 0]) {
      const scan = await api("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          kind: "receipt",
          items: [{ rawName: "Honey", normalizedName: "honey", qty: 1, price: 5.0, confidence: 1 }],
        }),
      });
      expect(scan.status).toBe(200);
      const conf = await api(`/api/scans/${scan.body.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          kind: "receipt",
          purchasedAt: iso(daysAgo),
          items: [{ rawName: "Honey", qty: 1, price: 5.0 }],
        }),
      });
      expect(conf.status).toBe(200);
    }
    // Honey default 60d; 3 purchases with 10d gaps → T=10 personal → stocked now
    const briefing = await api("/api/briefing?skip=10");
    const honey = briefing.body.skip.find((s: any) => s.rawName === "Honey");
    expect(honey).toBeTruthy();
    expect(honey.confidence).toBe(0.85);
    await api("/api/demo/reset", { method: "POST" });
  });

  it("I'm out clears a SKIP; never_remind mutes", async () => {
    await api("/api/demo/seed", { method: "POST" });
    const pantry = await api("/api/pantry");
    const rice = pantry.body.products.find((p: any) => p.name === "Rice");
    expect(rice).toBeTruthy();
    await api(`/api/products/${rice.productId}/corrections`, {
      method: "POST",
      body: JSON.stringify({ type: "im_out" }),
    });
    let briefing = await api("/api/briefing?buy=10&skip=10");
    expect(briefing.body.skip.map((s: any) => s.rawName)).not.toContain("Rice");
    expect(briefing.body.buy.map((s: any) => s.rawName)).toContain("Rice");
    await api(`/api/products/${rice.productId}/corrections`, {
      method: "POST",
      body: JSON.stringify({ type: "never_remind" }),
    });
    briefing = await api("/api/briefing?buy=10&skip=10");
    expect(briefing.body.skip.map((s: any) => s.rawName)).not.toContain("Rice");
    await api("/api/demo/reset", { method: "POST" });
  });

  it("model classification stores insights and drives SWAP", async () => {
    await api("/api/demo/reset", { method: "POST" });
    const oldClassify = process.env.PANTRY_CLASSIFY;
    const oldKey = process.env.MODEL_API_KEY;
    process.env.PANTRY_CLASSIFY = "on";
    process.env.MODEL_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    normalizedName: "honey",
                    savesMoney: 0.4,
                    healthy: 0.8,
                    sustainable: 0.7,
                    swap: {
                      name: "Raw honey",
                      savesMoney: 0.7,
                      healthy: 0.8,
                      sustainable: 0.7,
                    },
                  },
                ],
              }),
            },
          },
        ],
      }),
      text: async () => "",
    } as any);

    try {
      const scan = await api("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          kind: "receipt",
          items: [{ rawName: "Honey", normalizedName: "honey", qty: 1, confidence: 1 }],
        }),
      });
      const conf = await api(`/api/scans/${scan.body.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          kind: "receipt",
          items: [{ rawName: "Honey", normalizedName: "honey", qty: 1 }],
        }),
      });
      expect(conf.status).toBe(200);
      expect(conf.body.classification.classified).toBe(1);

      const sections = await api("/api/pantry/sections");
      expect(sections.body.swap.map((s: any) => s.rawName)).toContain("Honey");
      const honey = sections.body.swap.find((s: any) => s.rawName === "Honey");
      expect(honey.swapTitle).toBe("Raw honey");
      expect(honey.tags).toEqual(["health", "planet"]);

      const dev = await api("/api/dev/pantry-insights");
      expect(dev.status).toBe(200);
      const devHoney = dev.body.items.find((s: any) => s.rawName === "Honey");
      expect(devHoney.raw).toMatchObject({
        normalizedName: "honey",
        healthy: 0.8,
        sustainable: 0.7,
        swap: { name: "Raw honey" },
      });
      expect(devHoney.assessment).toMatchObject({
        normalizedName: "honey",
        healthy: 0.8,
      });
      expect(devHoney.classification.swap.name).toBe("Raw honey");
    } finally {
      fetchSpy.mockRestore();
      if (oldClassify === undefined) delete process.env.PANTRY_CLASSIFY;
      else process.env.PANTRY_CLASSIFY = oldClassify;
      if (oldKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = oldKey;
      await api("/api/demo/reset", { method: "POST" });
    }
  });

  it("confirmed receipt items get fallback insights → pantry SKIP", async () => {
    await api("/api/demo/reset", { method: "POST" });
    const scan = await api("/api/scans", {
      method: "POST",
      body: JSON.stringify({
        kind: "receipt",
        items: [{ rawName: "Honey", normalizedName: "honey", qty: 1, confidence: 1 }],
      }),
    });
    expect(scan.status).toBe(200);
    const conf = await api(`/api/scans/${scan.body.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        kind: "receipt",
        items: [{ rawName: "Honey", normalizedName: "honey", qty: 1 }],
      }),
    });
    expect(conf.status).toBe(200);

    const sections = await api("/api/pantry/sections");
    expect(sections.status).toBe(200);
    expect(sections.body.skip.map((s: any) => s.rawName)).toContain("Honey");
    expect(sections.body.buy.map((s: any) => s.rawName)).not.toContain("Honey");

    const dev = await api("/api/dev/pantry-insights");
    const honey = dev.body.items.find((s: any) => s.rawName === "Honey");
    expect(honey.raw).toBeNull();
    expect(honey.assessment).toMatchObject({
      savesMoney: 0.5,
      healthy: 0.5,
      sustainable: 0.5,
      swap: false,
    });
    await api("/api/demo/reset", { method: "POST" });
  });

  it("dev latest scan exposes the model category", async () => {
    await api("/api/demo/reset", { method: "POST" });
    const scan = await api("/api/scans", {
      method: "POST",
      body: JSON.stringify({
        kind: "receipt",
        items: [
          {
            rawName: "Steak",
            normalizedName: "steak",
            category: "meat",
            qty: 1,
            confidence: 1,
          },
        ],
      }),
    });
    expect(scan.status).toBe(200);
    const latest = await api("/api/dev/scans/latest");
    expect(latest.status).toBe(200);
    expect(latest.body.scan.rawExtraction.items[0]).toMatchObject({
      rawName: "Steak",
      category: "meat",
    });
    await api("/api/demo/reset", { method: "POST" });
  });

  it("enrich endpoint validates schema and rejects prices", async () => {
    await api("/api/demo/reset", { method: "POST" });
    const scan = await api("/api/scans", {
      method: "POST",
      body: JSON.stringify({
        kind: "receipt",
        items: [{ rawName: "Honey", normalizedName: "honey", qty: 1, confidence: 1 }],
      }),
    });
    await api(`/api/scans/${scan.body.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ kind: "receipt", items: [{ rawName: "Honey", qty: 1 }] }),
    });
    const pantry = await api("/api/pantry");
    const honey = pantry.body.products.find((p: any) => p.name === "Honey");
    const bad = await api(`/api/products/${honey.productId}/enrich`, {
      method: "POST",
      body: JSON.stringify({ price: 5, savings: "€2" }),
    });
    expect(bad.status).toBe(400);
    await api("/api/demo/reset", { method: "POST" });
  });
});

describe("grocery list editing", () => {
  it("adds, edits, deletes and previews pantry suggestions", async () => {
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/seed", { method: "POST" });

    // Preview contract: pantry-rhythm-stub, never auto-added.
    const preview = await api("/api/lists/suggestions");
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      source: "pantry-rhythm-stub",
      preview: true,
    });
    expect(preview.body.suggestions.map((s: any) => s.rawName)).toContain("Milk");
    const milkPreview = preview.body.suggestions.find((s: any) => s.rawName === "Milk");
    expect(milkPreview).toMatchObject({ qty: 1, reasonCode: "due" });
    expect(milkPreview.evidence.typicalIntervalDays).toBe(5);

    const created = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ title: "Weekly shop" }),
    });
    expect(created.status).toBe(200);
    const listId = created.body.id;

    const added = await api(`/api/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({ rawName: "Bananas", qty: 2, source: "voice" }),
    });
    expect(added.status).toBe(200);
    expect(added.body.item).toMatchObject({ rawName: "Bananas", qty: 2, source: "voice" });

    let list = await api(`/api/lists/${listId}`);
    expect(list.body.items).toHaveLength(1);
    expect(Number(list.body.items[0].qty)).toBe(2);
    expect(list.body.items[0].source).toBe("voice");
    expect(list.body.items[0].productId).toBeNull();

    // Renaming re-matches the canonical product.
    await api(`/api/lists/${listId}/items/${added.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ rawName: "Milk", qty: 3 }),
    });
    list = await api(`/api/lists/${listId}`);
    expect(list.body.items[0]).toMatchObject({ rawName: "Milk", source: "voice" });
    expect(Number(list.body.items[0].qty)).toBe(3);
    expect(list.body.items[0].productId).toBeTruthy();

    // Already-listed items are excluded from suggestions.
    const excluded = await api(`/api/lists/suggestions?listId=${listId}`);
    expect(excluded.body.suggestions.map((s: any) => s.rawName)).not.toContain("Milk");

    // Bulk add keeps per-item source and brand.
    const bulk = await api(`/api/lists/${listId}/items/bulk`, {
      method: "POST",
      body: JSON.stringify({
        items: [
          { rawName: "Eggs", qty: 1, source: "auto" },
          { rawName: "Bread", qty: 2, source: "camera", brand: "Hovis" },
        ],
      }),
    });
    expect(bulk.status).toBe(200);
    expect(bulk.body.items.map((item: any) => item.source)).toEqual(["auto", "camera"]);
    expect(bulk.body.items[1].brand).toBe("Hovis");

    list = await api(`/api/lists/${listId}`);
    expect(list.body.items).toHaveLength(3);
    expect(
      list.body.items.find((item: any) => item.rawName === "Bread").brand,
    ).toBe("Hovis");

    const deleted = await api(`/api/lists/${listId}/items/${added.body.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    list = await api(`/api/lists/${listId}`);
    expect(list.body.items.map((item: any) => item.rawName)).toEqual(["Eggs", "Bread"]);

    // Clear empties the list in place and keeps it open.
    const cleared = await api(`/api/lists/${listId}/items`, {
      method: "DELETE",
    });
    expect(cleared.status).toBe(200);
    list = await api(`/api/lists/${listId}`);
    expect(list.body.items).toHaveLength(0);
    expect(list.body.list.status).toBe("open");

    // Cleared names are no longer excluded from pantry suggestions.
    const afterClear = await api(`/api/lists/suggestions?listId=${listId}`);
    expect(afterClear.body.suggestions.map((s: any) => s.rawName)).toContain("Milk");

    const closed = await api(`/api/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    });
    expect(closed.status).toBe(200);
    const lists = await api("/api/lists");
    expect(lists.body.lists.find((item: any) => item.id === listId).status).toBe("done");

    await api("/api/demo/reset", { method: "POST" });
  });

  it("rejects unknown lists and invalid payloads", async () => {
    const missing = await api("/api/lists/00000000-0000-0000-0000-000000000000/items", {
      method: "POST",
      body: JSON.stringify({ rawName: "Milk" }),
    });
    expect(missing.status).toBe(404);

    const missingClear = await api(
      "/api/lists/00000000-0000-0000-0000-000000000000/items",
      { method: "DELETE" },
    );
    expect(missingClear.status).toBe(404);

    const created = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ title: "Bad payloads" }),
    });
    const listId = created.body.id;
    const bad = await api(`/api/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({ rawName: "", qty: 0, source: "telepathy" }),
    });
    expect(bad.status).toBe(400);
    await api(`/api/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    });
  });
});

describe("pantry auto-add to grocery list", () => {
  it("adds due items under normalized names and undoes the batch", async () => {
    await api("/api/demo/reset", { method: "POST" });
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/seed", { method: "POST" });

    const first = await api("/api/lists/pantry-refresh", {
      method: "POST",
      body: "{}",
    });
    expect(first.status).toBe(200);
    expect(first.body.refreshed).toBe(true);
    expect(first.body.listId).toBeTruthy();

    const names = first.body.added.map((item: any) => item.rawName);
    // Milk (6d since purchase, 3d interval) and olive oil (35d, 14d interval)
    // are due; detergent (50d, 60d interval) is not.
    expect(names).toContain("milk");
    expect(names).toContain("olive oil");
    expect(names).not.toContain("laundry detergent");
    expect(names.every((name: string) => name === name.toLowerCase())).toBe(true);

    const list = await api(`/api/lists/${first.body.listId}`);
    expect(list.status).toBe(200);
    expect(list.body.auto.refreshIntervalDays).toBe(3);
    expect(list.body.auto.added).toHaveLength(first.body.added.length);
    const oil = list.body.items.find((item: any) => item.rawName === "olive oil");
    expect(oil).toMatchObject({ source: "auto", brand: null });

    // A second sweep inside the 3-day window changes nothing.
    const second = await api("/api/lists/pantry-refresh", {
      method: "POST",
      body: "{}",
    });
    expect(second.body.refreshed).toBe(false);
    expect(second.body.added).toHaveLength(0);

    // Undo removes only the auto batch, not manually added rows.
    await api(`/api/lists/${first.body.listId}/items`, {
      method: "POST",
      body: JSON.stringify({ rawName: "Bananas", qty: 1, source: "manual" }),
    });
    const undo = await api(`/api/lists/${first.body.listId}/auto-items`, {
      method: "DELETE",
    });
    expect(undo.status).toBe(200);
    expect(undo.body.removed).toBe(first.body.added.length);

    const after = await api(`/api/lists/${first.body.listId}`);
    expect(after.body.items.map((item: any) => item.rawName)).toEqual(["Bananas"]);
    expect(after.body.auto.added).toHaveLength(0);

    await api("/api/demo/reset", { method: "POST" });
  });

  it("does not duplicate a normalized name already on the list", async () => {
    await api("/api/demo/reset", { method: "POST" });
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/seed", { method: "POST" });

    const created = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ title: "Manual list" }),
    });
    await api(`/api/lists/${created.body.id}/items`, {
      method: "POST",
      body: JSON.stringify({ rawName: "Milk", qty: 1, source: "manual" }),
    });

    const refresh = await api("/api/lists/pantry-refresh", {
      method: "POST",
      body: "{}",
    });
    const names = refresh.body.added.map((item: any) => item.rawName);
    expect(names).not.toContain("milk");
    expect(names).toContain("olive oil");

    const list = await api(`/api/lists/${created.body.id}`);
    expect(
      list.body.items.filter((item: any) => item.rawName.toLowerCase() === "milk"),
    ).toHaveLength(1);

    await api("/api/demo/reset", { method: "POST" });
  });

  it("exposes the sorted schedule in dev mode", async () => {
    await api("/api/demo/reset", { method: "POST" });
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/seed", { method: "POST" });

    const dev = await api("/api/dev/pantry-schedule");
    expect(dev.status).toBe(200);
    expect(dev.body.refreshIntervalDays).toBe(3);
    expect(dev.body.items.length).toBeGreaterThan(0);
    expect(dev.body.items[0].shelfLifeClass).toBe("perishable");
    expect(dev.body.items[0].name).toBe("milk");
    expect(dev.body.items.every((item: any) => item.name === item.name.toLowerCase())).toBe(
      true,
    );
    const detergent = dev.body.items.find(
      (item: any) => item.name === "laundry detergent",
    );
    expect(detergent).toMatchObject({
      shelfLifeClass: "household",
      intervalDays: 60,
      due: false,
    });
    expect(detergent.daysLeft).toBeGreaterThan(0);

    await api("/api/demo/reset", { method: "POST" });
  });
});

describe("voice list parsing", () => {
  it("splits with the model, grounds items and matches the pantry", async () => {
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/seed", { method: "POST" });

    const oldKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { name: "milk", brand: null, qty: null },
                  { name: "olive oil", brand: "Borges", qty: null },
                  { name: "saffron", brand: null, qty: 2 },
                  { name: "bread", brand: null, qty: null },
                ],
              }),
            },
          },
        ],
      }),
      text: async () => "",
    } as any);

    try {
      const res = await api("/api/ai/parse-list", {
        method: "POST",
        body: JSON.stringify({
          // "bread" is returned by the model but never said → must be dropped.
          text: "milk, Borges olive oil and two saffron",
        }),
      });
      expect(res.status).toBe(200);
      expect(res.body.source).toBe("model");
      expect(res.body.items.map((item: any) => item.name)).toEqual([
        "Milk",
        "Olive oil",
        "Saffron",
      ]);

      const milk = res.body.items.find((item: any) => item.name === "Milk");
      expect(milk.match).toMatchObject({
        productName: "Milk",
        inPantry: true,
      });
      const oil = res.body.items.find((item: any) => item.name === "Olive oil");
      expect(oil).toMatchObject({ brand: "Borges", qty: 1 });
      expect(oil.match.productName).toBe("Olive oil");
      const saffron = res.body.items.find((item: any) => item.name === "Saffron");
      expect(saffron).toMatchObject({ qty: 2 });
      expect(saffron.match.inPantry).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      if (oldKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = oldKey;
      await api("/api/demo/reset", { method: "POST" });
    }
  });

  it("falls back to the deterministic splitter without a model key", async () => {
    const oldKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "";
    try {
      const res = await api("/api/ai/parse-list", {
        method: "POST",
        body: JSON.stringify({ text: "milk, two eggs and bread" }),
      });
      expect(res.status).toBe(200);
      expect(res.body.source).toBe("fallback");
      expect(res.body.items.map((item: any) => item.name)).toEqual([
        "Milk",
        "Eggs",
        "Bread",
      ]);
      expect(res.body.items[1].qty).toBe(2);
      expect(res.body.items[0].match.inPantry).toBe(false);
    } finally {
      if (oldKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = oldKey;
    }
  });

  it("rejects empty or oversized transcripts", async () => {
    const empty = await api("/api/ai/parse-list", {
      method: "POST",
      body: JSON.stringify({ text: "   " }),
    });
    expect(empty.status).toBe(400);

    const tooLong = await api("/api/ai/parse-list", {
      method: "POST",
      body: JSON.stringify({ text: "a".repeat(2001) }),
    });
    expect(tooLong.status).toBe(400);
  });
});
