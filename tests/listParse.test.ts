import { describe, expect, it } from "vitest";
import {
  attachPantryMatches,
  fallbackVoiceItems,
  validateSpokenItems,
} from "../src/server/domain/listParse.js";
import type { SpokenListItem } from "../src/shared/schemas.js";

function item(
  name: string,
  brand: string | null = null,
  qty: number | null = null,
): SpokenListItem {
  return { name, brand, qty };
}

describe("validateSpokenItems", () => {
  it("keeps grounded items, brands and explicit counts", () => {
    const items = validateSpokenItems(
      [
        item("milk"),
        item("egg", null, 2),
        item("olive oil", "Borges"),
      ],
      "milk two eggs and Borges olive oil",
    );
    expect(items).toEqual([
      { name: "Milk", brand: null, qty: 1, confidence: 0.7 },
      { name: "Egg", brand: null, qty: 2, confidence: 0.7 },
      { name: "Olive oil", brand: "Borges", qty: 1, confidence: 0.7 },
    ]);
  });

  it("drops items the speaker never said", () => {
    const items = validateSpokenItems(
      [item("milk"), item("bread")],
      "milk and eggs",
    );
    expect(items.map((entry) => entry.name)).toEqual(["Milk"]);
  });

  it("drops a brand that was not said but keeps the item", () => {
    const [entry] = validateSpokenItems(
      [item("olive oil", "Borges")],
      "olive oil",
    );
    expect(entry.name).toBe("Olive oil");
    expect(entry.brand).toBeNull();
  });

  it("merges duplicates by name and brand", () => {
    const items = validateSpokenItems(
      [item("milk"), item("milk"), item("olive oil", "Borges"), item("olive oil")],
      "milk milk Borges olive oil olive oil",
    );
    // Branded and unbranded olive oil are different shopping intents.
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: "Milk", qty: 2 });
    expect(items[1]).toMatchObject({ name: "Olive oil", brand: "Borges" });
    expect(items[2]).toMatchObject({ name: "Olive oil", brand: null });
  });

  it("clamps quantities and the item count", () => {
    const transcript = Array.from({ length: 40 }, (_, i) => `thing${i}`).join(" ");
    const raw = Array.from({ length: 40 }, (_, i) => item(`thing${i}`, null, 500));
    const items = validateSpokenItems(raw, transcript);
    expect(items).toHaveLength(30);
    expect(items[0].qty).toBe(99);
  });
});

describe("fallbackVoiceItems", () => {
  it("uses the deterministic splitter when the model is unavailable", () => {
    const items = fallbackVoiceItems("milk, two eggs and bread");
    expect(items.map((entry) => entry.name)).toEqual(["Milk", "Eggs", "Bread"]);
    expect(items[1].qty).toBe(2);
    expect(items[0].confidence).toBe(0.3);
  });
});

describe("attachPantryMatches", () => {
  it("matches generic names to household products deterministically", () => {
    const products = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Milk" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Olive oil" },
    ];
    const [milk, saffron] = attachPantryMatches(
      [
        { name: "Milk", brand: null, qty: 1, confidence: 0.7 },
        { name: "Saffron", brand: null, qty: 1, confidence: 0.7 },
      ],
      products,
    );
    expect(milk.match).toMatchObject({
      productId: products[0].id,
      productName: "Milk",
      inPantry: true,
    });
    expect(saffron.match).toMatchObject({
      productId: null,
      productName: null,
      inPantry: false,
    });
  });
});
