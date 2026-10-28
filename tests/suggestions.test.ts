import { describe, expect, it } from "vitest";
import { suggestForProducts, type SuggestionProduct } from "../src/server/domain/suggestions";
import type { RhythmState } from "../src/server/domain/rhythm";

const NOW = new Date("2026-10-28T12:00:00Z");

function prod(over: Partial<SuggestionProduct> & { productId: string; rawName: string }): SuggestionProduct {
  const state: RhythmState = {
    lastPurchasedAt: new Date("2026-10-18T12:00:00Z"),
    purchaseCount: 3,
    T: 30,
    d: 10,
    ratio: 10 / 30,
    status: "stocked",
    confidence: "high",
    imOut: false,
  };
  return {
    shelfLifeClass: "staple",
    muted: false,
    state,
    enrichment: null,
    moneyPurchases: [],
    lastTotalPrice: 2.6,
    ...over,
  };
}

describe("suggestions", () => {
  it("perishable stocked → never SKIP", () => {
    const g = suggestForProducts([prod({ productId: "p1", rawName: "Milk", shelfLifeClass: "perishable" })]);
    expect(g.skip).toHaveLength(0);
  });

  it("staple stocked with history → SKIP with money evidence", () => {
    const g = suggestForProducts([prod({ productId: "p1", rawName: "Rice" })]);
    expect(g.skip).toHaveLength(1);
    expect(g.skip[0].tags).toContain("money");
    expect(g.skip[0].evidence.expectedSaving).toBe(2.6);
  });

  it("muted → SKIP suppressed", () => {
    const g = suggestForProducts([prod({ productId: "p1", rawName: "Rice", muted: true })]);
    expect(g.skip).toHaveLength(0);
  });

  it("low confidence → no SKIP (quiet by default)", () => {
    const p = prod({ productId: "p1", rawName: "Rice" });
    p.state = { ...p.state, confidence: "low" };
    expect(suggestForProducts([p]).skip).toHaveLength(0);
  });

  it("durable stocked → strongest hold alert, never auto-BUY", () => {
    const stocked = prod({ productId: "d1", rawName: "Steel bottle", shelfLifeClass: "durable" });
    expect(suggestForProducts([stocked]).skip[0].reasonCodes).toContain("durable_hold");
    const due = prod({ productId: "d1", rawName: "Steel bottle", shelfLifeClass: "durable" });
    due.state = { ...due.state, status: "due", ratio: 2, d: 400 };
    const g = suggestForProducts([due]);
    expect(g.buy).toHaveLength(0);
  });

  it("unknown product → no SKIP, no rhythm claims", () => {
    const p = prod({ productId: "u1", rawName: "Mystery item", shelfLifeClass: "unknown" });
    p.state = { ...p.state, status: "unknown", confidence: "low", T: null, d: null, ratio: null };
    const g = suggestForProducts([p]);
    expect(g.skip).toHaveLength(0);
    expect(g.buy).toHaveLength(0);
  });

  it("enrichment absent → no health/planet tags, no crash", () => {
    const p = prod({ productId: "p1", rawName: "Rice" });
    p.state = { ...p.state, status: "due", ratio: 1.5, d: 45 };
    const g = suggestForProducts([p]);
    expect(g.buy).toHaveLength(1);
    expect(g.buy[0].tags).toHaveLength(0);
    expect(g.swap).toHaveLength(0);
  });

  it("model swap without price evidence → no € claimed", () => {
    const p = prod({ productId: "p1", rawName: "Chips" });
    p.state = { ...p.state, status: "getting_low", ratio: 0.8, d: 11, T: 14 };
    p.enrichment = {
      category: "snacks",
      shelfLifeClass: "staple",
      typicalIntervalDays: 14,
      health: { score: 1, confidence: 0.8, basis: ["fixture"] },
      sustainability: { score: 1, confidence: 0.7, factors: [{ factor: "packaging", rating: 2, note: "plastic" }] },
      alternatives: [
        { title: "Nuts instead of chips", swapType: "other", healthDelta: 2, sustainabilityDelta: 1, rationale: "x", confidence: 0.8 },
      ],
    };
    const g = suggestForProducts([p]);
    expect(g.swap).toHaveLength(1);
    expect(g.swap[0].tags).toContain("health");
    expect(g.swap[0].tags).toContain("planet");
    expect(g.swap[0].tags).not.toContain("money");
    expect(g.swap[0].evidence.expectedSaving).toBeNull();
  });

  it("due staple → BUY", () => {
    const p = prod({ productId: "p1", rawName: "Detergent", shelfLifeClass: "household" });
    p.state = { ...p.state, status: "due", ratio: 1.2, d: 54, T: 45 };
    const g = suggestForProducts([p]);
    expect(g.buy).toHaveLength(1);
    expect(g.buy[0].reasonCodes).toContain("due");
  });

  it("ordered: SKIP by confidence; caps respected", () => {
    const a = prod({ productId: "a", rawName: "A" });
    const b = prod({ productId: "b", rawName: "B" });
    b.state = { ...b.state, purchaseCount: 2 }; // lower confidence value 0.65
    const g = suggestForProducts([b, a], { limits: { skip: 1 } });
    expect(g.skip).toHaveLength(1);
    expect(g.skip[0].productId).toBe("a");
  });
});
