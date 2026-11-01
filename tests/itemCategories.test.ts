import { describe, expect, it } from "vitest";
import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
} from "../src/shared/itemCategories.js";
import { itemCategorySchema } from "../src/shared/schemas.js";
import { CATEGORY_IMAGE_SLUGS, resolveItemArt } from "../src/client/lib/itemArt.js";
import { productArtEntryBySlug } from "../src/client/lib/productArt.js";

describe("item categories", () => {
  it("accepts the fixed category pool and normalises casing", () => {
    expect(itemCategorySchema.parse("meat")).toBe("meat");
    expect(itemCategorySchema.parse("Ice-Cream")).toBe("ice_cream");
    expect(itemCategorySchema.parse("personal care")).toBe("personal_care");
  });

  it("falls back to other for unknown or missing categories", () => {
    expect(itemCategorySchema.parse("not-a-category")).toBe("other");
    expect(itemCategorySchema.parse(undefined)).toBe("other");
  });

  it("has a label for every category", () => {
    for (const category of ITEM_CATEGORIES) {
      expect(ITEM_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("has a bundled representative image for every category", () => {
    for (const category of ITEM_CATEGORIES) {
      const slug = CATEGORY_IMAGE_SLUGS[category];
      expect(productArtEntryBySlug(slug), `missing image for ${category}`).toBeTruthy();
    }
  });

  it("uses the category image when confidence is not above 0.93", () => {
    const art = resolveItemArt({
      rawName: "Chips bag",
      normalizedName: "chips",
      category: "snacks",
      confidence: 0.93,
    });
    expect(art.category).toBe("snacks");
    expect(art.usedCategory).toBe(true);
    expect(art.entry.file).toContain("crackers");
  });

  it("uses the exact model-name image when confidence is above 0.93", () => {
    const art = resolveItemArt({
      rawName: "Chips bag",
      normalizedName: "chips",
      category: "snacks",
      confidence: 0.95,
    });
    expect(art.category).toBe("snacks");
    expect(art.usedCategory).toBe(false);
    expect(art.entry.file).toContain("chips");
  });

  it("uses the food-container image for unknown/other categories", () => {
    const art = resolveItemArt({ rawName: "Mystery pack", category: "other" });
    expect(art.category).toBe("other");
    expect(art.usedCategory).toBe(true);
    expect(art.entry.file).toContain("food_container");
  });

  it("uses the dedicated alcohol and pet images", () => {
    const alcohol = resolveItemArt({
      rawName: "Prosecco",
      category: "alcohol",
      confidence: 0.5,
    });
    expect(alcohol.entry.file).toContain("alcohol_bottle_icon");

    const pet = resolveItemArt({
      rawName: "Dog food",
      category: "pet",
      confidence: 0.5,
    });
    expect(pet.entry.file).toContain("pet_food_icon");
  });
});
