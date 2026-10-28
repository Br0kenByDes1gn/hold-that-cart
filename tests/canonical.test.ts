import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DID = "test-device-canonical";

beforeAll(() => {
  process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "htc-canon-"));
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

async function confirmReceipt(items: unknown[]) {
  const scan = await api("/api/scans", {
    method: "POST",
    body: JSON.stringify({ kind: "receipt", items }),
  });
  expect(scan.status).toBe(200);
  const conf = await api(`/api/scans/${scan.body.id}/confirm`, {
    method: "POST",
    body: JSON.stringify({ kind: "receipt", items }),
  });
  expect(conf.status).toBe(200);
  return conf.body;
}

describe("canonical product pooling (brand = variant)", () => {
  it("Brand A and Brand B peanut oil pool into ONE product", async () => {
    await api("/api/households", {
      method: "POST",
      body: JSON.stringify({ deviceId: DID, householdSize: 2 }),
    });
    await api("/api/demo/reset", { method: "POST" });

    await confirmReceipt([
      {
        rawName: "Brand A Peanut Oil 500g",
        normalizedName: "peanut oil",
        brand: "Brand A",
        qty: 1,
        packQty: 500,
        packUnit: "g",
        price: 3.0,
        confidence: 0.9,
      },
    ]);
    await confirmReceipt([
      {
        rawName: "Peanut Oil Brand B 500g",
        normalizedName: "peanut oil",
        brand: "Brand B",
        qty: 1,
        packQty: 500,
        packUnit: "g",
        price: 2.5,
        confidence: 0.9,
      },
    ]);

    const pantry = await api("/api/pantry");
    const oils = pantry.body.products.filter((p: any) =>
      p.name.toLowerCase().includes("peanut"),
    );
    expect(oils).toHaveLength(1);
    expect(oils[0].name).toBe("Peanut oil");

    const detail = await api(`/api/pantry/${oils[0].productId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.history).toHaveLength(2);
    // Raw receipt lines preserved as variants
    const variantsText = detail.body.history.map((h: any) => h.variant).filter(Boolean);
    expect(variantsText).toContain("Brand A Peanut Oil 500g");
    expect(variantsText).toContain("Peanut Oil Brand B 500g");
    // Two brand variants with median unit prices (6/kg vs 5/kg)
    expect(detail.body.variants).toHaveLength(2);
    const medians = detail.body.variants.map((v: any) => v.medianPerUnit).sort((a: number, b: number) => a - b);
    expect(medians[0]).toBeCloseTo(5, 5);
    expect(medians[1]).toBeCloseTo(6, 5);

    await api("/api/demo/reset", { method: "POST" });
  });

  it("different normalized types stay separate products", async () => {
    await confirmReceipt([
      { rawName: "Olive Oil 1L", normalizedName: "olive oil", qty: 1, price: 8.0, confidence: 0.9 },
    ]);
    await confirmReceipt([
      { rawName: "Peanut Oil 1L", normalizedName: "peanut oil", qty: 1, price: 7.0, confidence: 0.9 },
    ]);
    const pantry = await api("/api/pantry");
    const names = pantry.body.products.map((p: any) => p.name);
    expect(names).toContain("Olive oil");
    expect(names).toContain("Peanut oil");
    await api("/api/demo/reset", { method: "POST" });
  });
});
