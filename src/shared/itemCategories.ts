/**
 * Fixed category pool returned by the vision extraction model.
 * Keep this list in sync with the extraction prompt; the schema rejects
 * categories outside it (unknown values fall back to "other").
 */
export const ITEM_CATEGORIES = [
  "meat",
  "seafood",
  "dairy",
  "eggs",
  "bread",
  "fruit",
  "vegetables",
  "grains",
  "pasta",
  "cereal",
  "chips",
  "snacks",
  "nuts",
  "chocolate",
  "ice_cream",
  "frozen",
  "canned",
  "condiments",
  "oils",
  "spices",
  "baking",
  "spreads",
  "coffee_tea",
  "soda",
  "water",
  "juice",
  "alcohol",
  "cleaning",
  "paper",
  "personal_care",
  "other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  meat: "Meat",
  seafood: "Seafood",
  dairy: "Dairy",
  eggs: "Eggs",
  bread: "Bread",
  fruit: "Fruit",
  vegetables: "Vegetables",
  grains: "Grains",
  pasta: "Pasta",
  cereal: "Cereal",
  chips: "Chips",
  snacks: "Snacks",
  nuts: "Nuts",
  chocolate: "Chocolate",
  ice_cream: "Ice cream",
  frozen: "Frozen",
  canned: "Canned goods",
  condiments: "Condiments",
  oils: "Oils",
  spices: "Spices",
  baking: "Baking",
  spreads: "Spreads",
  coffee_tea: "Coffee & tea",
  soda: "Soda",
  water: "Water",
  juice: "Juice",
  alcohol: "Alcohol",
  cleaning: "Cleaning",
  paper: "Paper goods",
  personal_care: "Personal care",
  other: "Other",
};

export function isItemCategory(value: unknown): value is ItemCategory {
  return typeof value === "string" && (ITEM_CATEGORIES as readonly string[]).includes(value);
}
