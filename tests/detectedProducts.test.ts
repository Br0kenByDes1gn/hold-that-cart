import { describe, expect, it } from "vitest";
import { groupDetectedProducts } from "../src/shared/detectedProducts.js";

describe("groupDetectedProducts", () => {
  it("merges identical units into one line with summed quantity", () => {
    expect(
      groupDetectedProducts([
        { normalizedName: "beer", brand: "Heineken", qty: 1 },
        { normalizedName: "beer", brand: "Heineken", qty: 1 },
        { normalizedName: "beer", brand: "Heineken", qty: 1 },
        { normalizedName: "beer", brand: "Heineken", qty: 1 },
      ]),
    ).toEqual([{ rawName: "Beer", brand: "Heineken", qty: 4 }]);
  });

  it("keeps different brands as separate lines", () => {
    const result = groupDetectedProducts([
      { normalizedName: "beer", brand: "Heineken", qty: 2 },
      { normalizedName: "beer", brand: "Corona", qty: 2 },
    ]);
    expect(result).toEqual([
      { rawName: "Beer", brand: "Heineken", qty: 2 },
      { rawName: "Beer", brand: "Corona", qty: 2 },
    ]);
  });

  it("groups by generic name when the brand is missing", () => {
    const result = groupDetectedProducts([
      { normalizedName: "beer", qty: 1 },
      { rawName: "Beer", brand: null, qty: 3 },
    ]);
    expect(result).toEqual([{ rawName: "Beer", brand: null, qty: 4 }]);
  });

  it("is case-insensitive on name and brand", () => {
    const result = groupDetectedProducts([
      { normalizedName: "beer", brand: "heineken", qty: 1 },
      { normalizedName: "BEER", brand: "Heineken", qty: 1 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(2);
  });

  it("falls back to rawName and skips empty names", () => {
    const result = groupDetectedProducts([
      { rawName: "Olive oil", qty: 1 },
      { normalizedName: "  ", qty: 2 },
      { normalizedName: "", brand: "X", qty: 1 },
    ]);
    expect(result).toEqual([{ rawName: "Olive oil", brand: null, qty: 1 }]);
  });

  it("clamps bad quantities", () => {
    const result = groupDetectedProducts([
      { normalizedName: "beer", qty: 0 },
      { normalizedName: "beer", qty: null },
      { normalizedName: "wine", qty: 500 },
    ]);
    expect(result).toEqual([
      { rawName: "Beer", brand: null, qty: 2 },
      { rawName: "Wine", brand: null, qty: 99 },
    ]);
  });
});
