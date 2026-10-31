import { describe, expect, it } from "vitest";
import {
  activeTagCount,
  allocateVisibleCards,
  inactiveTagCount,
  sortSectionItems,
} from "../src/client/lib/pantryVisibility.js";

function item(rawName: string, scores: [number, number, number]) {
  return {
    rawName,
    scores: {
      savesMoney: scores[0],
      healthy: scores[1],
      sustainable: scores[2],
    },
  };
}

function items(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({ rawName: `${prefix} ${index}` }));
}

describe("pantry visibility", () => {
  it("counts active and inactive tags from scores", () => {
    expect(activeTagCount(item("a", [0.7, 0.2, 0.4]))).toBe(1);
    expect(inactiveTagCount(item("a", [0.7, 0.2, 0.4]))).toBe(2);
    expect(activeTagCount({ tags: ["money", "planet"] })).toBe(2);
  });

  it("sorts BUY by most active tags", () => {
    const sorted = sortSectionItems("buy", [
      item("one", [0.2, 0.2, 0.2]),
      item("three", [0.7, 0.7, 0.7]),
      item("two", [0.7, 0.7, 0.2]),
    ]);
    expect(sorted.map((x) => x.rawName)).toEqual(["three", "two", "one"]);
  });

  it("sorts SKIP and SWAP by most inactive tags", () => {
    for (const section of ["skip", "swap"] as const) {
      const sorted = sortSectionItems(section, [
        item("three", [0.7, 0.7, 0.7]),
        item("one", [0.2, 0.2, 0.2]),
        item("two", [0.7, 0.2, 0.2]),
      ]);
      expect(sorted.map((x) => x.rawName)).toEqual(["one", "two", "three"]);
    }
  });

  it("splits the 3/2/2 example across sections", () => {
    const slide = allocateVisibleCards(
      [
        { id: "buy", items: items(7, "buy") },
        { id: "skip", items: items(4, "skip") },
        { id: "swap", items: items(14, "swap") },
      ],
      7,
    );
    expect(slide).toEqual({ buy: 3, skip: 2, swap: 2 });
  });

  it("redistributes unused slots from short sections", () => {
    const allocation = allocateVisibleCards(
      [
        { id: "buy", items: items(1, "buy") },
        { id: "skip", items: [] },
        { id: "swap", items: items(20, "swap") },
      ],
      7,
    );
    expect(allocation).toEqual({ buy: 1, skip: 0, swap: 6 });
  });

  it("never allocates more than a section contains", () => {
    const allocation = allocateVisibleCards(
      [
        { id: "buy", items: items(2, "buy") },
        { id: "skip", items: items(2, "skip") },
        { id: "swap", items: items(2, "swap") },
      ],
      20,
    );
    expect(allocation).toEqual({ buy: 2, skip: 2, swap: 2 });
  });
});
