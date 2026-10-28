import { describe, expect, it } from "vitest";
import { matchProduct } from "../src/server/domain/match";

const CANDS = [
  { id: "a", name: "Olive oil", catalogKey: "olive-oil" },
  { id: "b", name: "Milk", catalogKey: "milk" },
  { id: "c", name: "Rice", catalogKey: "rice" },
];

describe("match", () => {
  it("exact + alias hits", () => {
    expect(matchProduct("Olive oil", CANDS).productId).toBe("a");
    expect(matchProduct("olive-oil", CANDS).productId).toBe("a");
    expect(matchProduct("MILK", CANDS).productId).toBe("b");
  });

  it("diacritics/punctuation tolerant", () => {
    expect(matchProduct("Olive-oil!", CANDS).productId).toBe("a");
  });

  it("unknown below threshold → null", () => {
    const r = matchProduct("quantum flux capacitor", CANDS);
    expect(r.productId).toBeNull();
  });

  it("empty query → null", () => {
    expect(matchProduct("", CANDS).productId).toBeNull();
  });
});
