import { describe, expect, it } from "vitest";
import {
  hasBetterSwap,
  pantrySectionFor,
  pantryTagsFor,
  scoreIsYes,
  trueCount,
} from "../src/server/domain/pantrySection.js";
import type { PantryItemInsight } from "../src/shared/schemas.js";

function insight(overrides: Partial<PantryItemInsight> = {}): PantryItemInsight {
  return {
    normalizedName: "item",
    savesMoney: 0.2,
    healthy: 0.2,
    sustainable: 0.2,
    swap: false,
    ...overrides,
  };
}

describe("pantry sectioning", () => {
  it("counts a parameter as true only at 0.6 or above", () => {
    expect(scoreIsYes(0.6)).toBe(true);
    expect(scoreIsYes(0.59)).toBe(false);
    expect(scoreIsYes(0)).toBe(false);
    expect(scoreIsYes(1)).toBe(true);
  });

  it("counts true parameters", () => {
    expect(trueCount(insight())).toBe(0);
    expect(trueCount(insight({ savesMoney: 0.7, healthy: 0.65 }))).toBe(2);
    expect(
      trueCount(insight({ savesMoney: 0.7, healthy: 0.5, sustainable: 0.4 })),
    ).toBe(1);
  });

  it("a better swap always wins, even with fewer original trues", () => {
    const item = insight({
      healthy: 0.7,
      swap: {
        name: "Oat milk",
        savesMoney: 0.7,
        healthy: 0.8,
        sustainable: 0.7,
      },
    });
    expect(hasBetterSwap(item)).toBe(true);
    expect(pantrySectionFor(item)).toBe("swap");
  });

  it("rejects a swap that is not strictly better", () => {
    const item = insight({
      savesMoney: 0.7,
      healthy: 0.7,
      swap: {
        name: "Similar item",
        savesMoney: 0.7,
        healthy: 0.7,
        sustainable: 0.2,
      },
    });
    expect(hasBetterSwap(item)).toBe(false);
    expect(pantrySectionFor(item)).toBe("buy");
  });

  it("2+ true parameters → BUY", () => {
    expect(pantrySectionFor(insight({ savesMoney: 0.7, sustainable: 0.61 }))).toBe(
      "buy",
    );
    expect(
      pantrySectionFor(
        insight({ savesMoney: 0.7, healthy: 0.9, sustainable: 0.8 }),
      ),
    ).toBe("buy");
  });

  it("0–1 true parameters → SKIP", () => {
    expect(pantrySectionFor(insight())).toBe("skip");
    expect(pantrySectionFor(insight({ healthy: 0.7 }))).toBe("skip");
    expect(
      pantrySectionFor(insight({ healthy: 0.5, sustainable: 0.59 })),
    ).toBe("skip");
  });

  it("maps true scores to tag kinds", () => {
    expect(pantryTagsFor(insight({ savesMoney: 0.7, sustainable: 0.6 }))).toEqual([
      "money",
      "planet",
    ]);
  });
});
