import {
  ITEM_CATEGORY_LABELS,
  isItemCategory,
  type ItemCategory,
} from "../../shared/itemCategories";
import {
  productArtEntry,
  productArtEntryBySlug,
  type ProductArtEntry,
} from "./productArt";

/** Representative assets for the model-returned category pool. */
const CATEGORY_IMAGE_SLUGS: Record<ItemCategory, string> = {
  meat: "beef-steak",
  seafood: "salmon-fillet",
  dairy: "milk-glass-and-carton",
  eggs: "eggs",
  bread: "bread-loaf",
  fruit: "fruit-assortment",
  vegetables: "vegetable-assortment",
  grains: "rice-grains-bowl",
  pasta: "pasta-bundle",
  cereal: "cereal-bowl",
  chips: "chips",
  snacks: "crackers",
  nuts: "mixed-nuts-bowl",
  chocolate: "chocolate",
  ice_cream: "ice-cream",
  frozen: "frozen-pizza",
  canned: "canned-food",
  condiments: "ketchup-bottle",
  oils: "olive-oil",
  spices: "spice-jar",
  baking: "flour-sack",
  spreads: "jam-jar",
  coffee_tea: "coffee-jar",
  soda: "cola-bottle",
  water: "plastic-water-bottle",
  juice: "juice-carton",
  alcohol: "cola-bottle",
  cleaning: "laundry-detergent",
  paper: "toilet-paper",
  personal_care: "toothpaste",
  other: "food-container",
};

export interface ItemArt {
  category: ItemCategory;
  categoryLabel: string;
  entry: ProductArtEntry;
  /** True when the category image was used, false when name fallback won. */
  usedCategory: boolean;
}

function normalizeCategory(value: unknown): ItemCategory {
  if (isItemCategory(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (isItemCategory(normalized)) return normalized;
  }
  return "other";
}

/**
 * Resolve the image for a detected item:
 * 1. model-returned category representative image
 * 2. name/brand asset fallback
 * 3. generic "other" image
 */
export function resolveItemArt(item: {
  rawName?: string | null;
  normalizedName?: string | null;
  brand?: string | null;
  category?: unknown;
}): ItemArt {
  const category = normalizeCategory(item.category);
  const categoryEntry =
    category === "other"
      ? null
      : productArtEntryBySlug(CATEGORY_IMAGE_SLUGS[category]);
  const fallback = productArtEntry(
    item.rawName ?? item.normalizedName ?? null,
    item.brand ?? null,
  );
  const entry =
    categoryEntry ??
    fallback ??
    productArtEntryBySlug(CATEGORY_IMAGE_SLUGS.other)!;

  return {
    category,
    categoryLabel: ITEM_CATEGORY_LABELS[category],
    entry,
    usedCategory: !!categoryEntry,
  };
}

export { CATEGORY_IMAGE_SLUGS };
