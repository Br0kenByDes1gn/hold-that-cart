import { describe, expect, it } from "vitest";
import {
  hasBetterSwap,
  pantrySectionFor,
  pantryTagsFor,
  trueCount,
  verdictIsYes,
} from "../src/server/domain/pantrySection.js";
import type { PantryItemInsight, PantryVerdict } from "../src/shared/schemas.js";

const no = (confidence = 0.7): PantryVerdict => ({
  verdict: false,
  confidence,
  reason: "No.",
});
const yes = (confidence = 0.7): PantryVerdict => ({
  verdict: true,
  confidence,
  reason: "Yes.",
});
const unknown = (): PantryVerdict => ({
  verdict: null,
  confidence: 0.2,
  reason: "Unknown.",
});

function insight(overrides: Partial<PantryItemInsight> = {}): PantryItemInsight {
  return {
    normalizedName: "item",
    savesMoney: no(),
    healthy: no(),
    sustainable: no(),
    swap: false,
    ...overrides,
  };
}

describe("pantry sectioning", () => {
  it("requires a confident positive verdict for a true parameter", () => {
    expect(verdictIsYes(yes(0.5))).toBe(true);
    expect(verdictIsYes(yes(0.49))).toBe(false);
    expect(verdictIsYes({ verdict: true, confidence: 0.4, reason: "unsure" })).toBe(
      false,
    );
    expect(verdictIsYes(unknown())).toBe(false);
  });

  it("counts confident true parameters", () => {
    expect(trueCount(insight())).toBe(0);
    expect(trueCount(insight({ savesMoney: yes(), healthy: yes() }))).toBe(2);
    expect(
      trueCount(insight({ savesMoney: yes(), healthy: yes(0.3), sustainable: unknown() })),
    ).toBe(1);
  });

  it("a better swap always wins, even with fewer original trues", () => {
    const item = insight({
      healthy: yes(),
      swap: {
        name: "Oat milk",
        savesMoney: yes(),
        healthy: yes(),
        sustainable: yes(),
      },
    });
    expect(hasBetterSwap(item)).toBe(true);
    expect(pantrySectionFor(item)).toBe("swap");
  });

  it("rejects a swap that is not strictly better", () => {
    const item = insight({
      savesMoney: yes(),
      healthy: yes(),
      swap: {
        name: "Similar item",
        savesMoney: yes(),
        healthy: yes(),
        sustainable: no(),
      },
    });
    expect(hasBetterSwap(item)).toBe(false);
    expect(pantrySectionFor(item)).toBe("buy");
  });

  it("2+ true parameters → BUY", () => {
    expect(pantrySectionFor(insight({ savesMoney: yes(), sustainable: yes() }))).toBe(
      "buy",
    );
    expect(
      pantrySectionFor(
        insight({ savesMoney: yes(), healthy: yes(), sustainable: yes() }),
      ),
    ).toBe("buy");
  });

  it("0–1 true parameters → SKIP", () => {
    expect(pantrySectionFor(insight())).toBe("skip");
    expect(pantrySectionFor(insight({ healthy: yes() }))).toBe("skip");
    expect(pantrySectionFor(insight({ healthy: unknown(), sustainable: yes(0.2) }))).toBe(
      "skip",
    );
  });

  it("maps confident booleans to tag kinds", () => {
    expect(pantryTagsFor(insight({ savesMoney: yes(), sustainable: yes() }))).toEqual([
      "money",
      "planet",
    ]);
  });
});
