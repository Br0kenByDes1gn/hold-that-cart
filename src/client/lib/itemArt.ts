import {
  ITEM_CATEGORY_LABELS,
  isItemCategory,
  type ItemCategory,
} from "../../shared/itemCategories";
import {
  productArtEntryBySlug,
  productArtExact,
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
  alcohol: "alcohol-bottle-icon",
  pet: "pet-food-icon",
  cleaning: "laundry-detergent",
  paper: "toilet-paper",
  personal_care: "toothpaste",
  other: "food-container",
};

export interface ItemArt {
  category: ItemCategory;
  categoryLabel: string;
  entry: ProductArtEntry;
  /** True when the category image was used instead of an exact model-name image. */
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
 * 1. exact image from the model's product name when confidence > 0.93
 * 2. representative image for the model-returned category
 */
export function resolveItemArt(item: {
  rawName?: string | null;
  normalizedName?: string | null;
  brand?: string | null;
  category?: unknown;
  confidence?: number | null;
}): ItemArt {
  const category = normalizeCategory(item.category);
  const categoryEntry = productArtEntryBySlug(CATEGORY_IMAGE_SLUGS[category])!;
  const highConfidence =
    typeof item.confidence === "number" && item.confidence > 0.93;
  const modelEntry = highConfidence
    ? productArtExact(item.normalizedName ?? null) ??
      productArtExact(item.rawName ?? null)
    : null;
  const entry = modelEntry ?? categoryEntry;

  return {
    category,
    categoryLabel: ITEM_CATEGORY_LABELS[category],
    entry,
    usedCategory: !modelEntry,
  };
}

export { CATEGORY_IMAGE_SLUGS };
