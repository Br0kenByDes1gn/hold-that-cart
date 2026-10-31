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
    expect(
      sections.body.buy.find((s: any) => s.rawName === "Milk").category,
    ).toBe("dairy");
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
                    savesMoney: {
                      verdict: false,
                      confidence: 0.7,
                      reason: "Price is uncertain.",
                    },
                    healthy: {
                      verdict: true,
                      confidence: 0.8,
                      reason: "Generally a simple food.",
                    },
                    sustainable: {
                      verdict: true,
                      confidence: 0.6,
                      reason: "Plant-based sweetener.",
                    },
                    swap: {
                      name: "Raw honey",
                      savesMoney: {
                        verdict: true,
                        confidence: 0.7,
                        reason: "Less processing.",
                      },
                      healthy: {
                        verdict: true,
                        confidence: 0.8,
                        reason: "Minimally processed.",
                      },
                      sustainable: {
                        verdict: true,
                        confidence: 0.7,
                        reason: "Less packaging.",
                      },
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
        healthy: { verdict: true, confidence: 0.8 },
        sustainable: { verdict: true, confidence: 0.6 },
        swap: { name: "Raw honey" },
      });
      expect(devHoney.assessment).toMatchObject({
        normalizedName: "honey",
        healthy: { verdict: true, confidence: 0.8 },
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
      savesMoney: { verdict: null, confidence: 0 },
      healthy: { verdict: null, confidence: 0 },
      sustainable: { verdict: null, confidence: 0 },
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
