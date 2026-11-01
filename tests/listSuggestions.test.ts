import { describe, expect, it } from "vitest";
import { suggestionsFromViews } from "../src/server/domain/listSuggestions.js";
import type { SuggestionProduct } from "../src/server/domain/suggestions.js";

function dueView(
  rawName: string,
  overrides: Partial<SuggestionProduct> = {},
): SuggestionProduct {
  return {
    productId: "11111111-1111-4111-8111-111111111111",
    rawName,
    shelfLifeClass: "perishable",
    muted: false,
    state: {
      lastPurchasedAt: new Date("2026-10-26T00:00:00Z"),
      purchaseCount: 3,
      T: 5,
      d: 6,
      ratio: 1.2,
      status: "due",
      confidence: "high",
      imOut: false,
    },
    enrichment: null,
    moneyPurchases: [],
    lastTotalPrice: null,
    ...overrides,
  };
}

describe("suggestionsFromViews (preview stub)", () => {
  it("maps a due product into the list suggestion contract", () => {
    const [suggestion] = suggestionsFromViews([dueView("Milk")]);
    expect(suggestion).toMatchObject({
      rawName: "Milk",
      qty: 1,
      reasonCode: "due",
      reason: "Usually bought every 5 days",
      confidence: 0.85,
      evidence: { daysSince: 6, typicalIntervalDays: 5 },
    });
  });

  it("marks im_out products as marked out", () => {
    const view = dueView("Rice", {
      state: { ...dueView("Rice").state, imOut: true },
    });
    expect(suggestionsFromViews([view])[0].reasonCode).toBe("marked_out");
    expect(suggestionsFromViews([view])[0].reason).toBe("You marked this as out");
  });

  it("excludes names already on the list, case-insensitively", () => {
    const suggestions = suggestionsFromViews([dueView("Milk"), dueView("Bread")], {
      excludeNames: ["  milk "],
    });
    expect(suggestions.map((s) => s.rawName)).toEqual(["Bread"]);
  });

  it("omits muted products", () => {
    const suggestions = suggestionsFromViews([dueView("Milk", { muted: true })]);
    expect(suggestions).toEqual([]);
  });

  it("never suggests durables or unknown products", () => {
    const suggestions = suggestionsFromViews([
      dueView("Steel bottle", { shelfLifeClass: "durable" }),
      dueView("Mystery item", { shelfLifeClass: "unknown" }),
    ]);
    expect(suggestions).toEqual([]);
  });

  it("respects the limit", () => {
    const views = Array.from({ length: 15 }, (_, i) => dueView(`Item ${i}`));
    expect(suggestionsFromViews(views, { limit: 4 })).toHaveLength(4);
  });
});
