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

  it("uses the model category image when available", () => {
    const art = resolveItemArt({ rawName: "Mystery pack", category: "meat" });
    expect(art.category).toBe("meat");
    expect(art.categoryLabel).toBe("Meat");
    expect(art.usedCategory).toBe(true);
    expect(art.entry.file).toContain("beef_steak");
  });

  it("falls back to the product name for other/unknown categories", () => {
    const art = resolveItemArt({ rawName: "Chips bag", category: "other" });
    expect(art.category).toBe("other");
    expect(art.usedCategory).toBe(false);
    expect(art.entry.file).toContain("chips");
  });
});
