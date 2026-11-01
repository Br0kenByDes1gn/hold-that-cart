import { describe, expect, it } from "vitest";
import { parseListText } from "../src/shared/listText.js";

describe("parseListText", () => {
  it("splits dictated items on commas, newlines and joining words", () => {
    expect(parseListText("milk, eggs\nbread and butter plus jam")).toEqual([
      { rawName: "milk", qty: 1 },
      { rawName: "eggs", qty: 1 },
      { rawName: "bread", qty: 1 },
      { rawName: "butter", qty: 1 },
      { rawName: "jam", qty: 1 },
    ]);
  });

  it("strips leading verbs and filler words", () => {
    expect(parseListText("Please add some milk")).toEqual([
      { rawName: "milk", qty: 1 },
    ]);
    expect(parseListText("I need to buy bread")).toEqual([
      { rawName: "bread", qty: 1 },
    ]);
  });

  it("reads leading, trailing and word quantities", () => {
    expect(parseListText("2 milk")).toEqual([{ rawName: "milk", qty: 2 }]);
    expect(parseListText("milk x3")).toEqual([{ rawName: "milk", qty: 3 }]);
    expect(parseListText("two eggs")).toEqual([{ rawName: "eggs", qty: 2 }]);
    expect(parseListText("bananas 4 pcs")).toEqual([
      { rawName: "bananas", qty: 4 },
    ]);
  });

  it("merges duplicate names case-insensitively", () => {
    expect(parseListText("milk, Milk 2")).toEqual([{ rawName: "milk", qty: 3 }]);
  });

  it("keeps names that only look like quantities", () => {
    expect(parseListText("olive oil")).toEqual([
      { rawName: "olive oil", qty: 1 },
    ]);
    expect(parseListText("salt")).toEqual([{ rawName: "salt", qty: 1 }]);
  });

  it("returns nothing for blank input", () => {
    expect(parseListText("   \n  ")).toEqual([]);
  });

  it("caps the number of items", () => {
    const input = Array.from({ length: 60 }, (_, i) => `item-${i}`).join("\n");
    expect(parseListText(input)).toHaveLength(50);
  });
});
