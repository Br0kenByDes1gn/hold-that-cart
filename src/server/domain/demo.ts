import type { PantryScore, ProductEnrichment } from "../../shared/schemas.js";
import type { ItemCategory } from "../../shared/itemCategories.js";
import { knowledgeKey } from "./normalize.js";

// Hand-written fixture enrichments for the demo set (stand-ins for the
// future Muse enricher — same Zod contract, stored in product_knowledge).
// No prices anywhere by design.

interface DemoItem {
  name: string;
  brand?: string;
  icon: string; // public/icons/products slug
  enrichment: ProductEnrichment;
}

function e(
  category: string,
  shelfLifeClass: ProductEnrichment["shelfLifeClass"],
  typicalIntervalDays: number,
  health: number | null,
  planet: number | null,
  alternatives: ProductEnrichment["alternatives"] = [],
): ProductEnrichment {
  return {
    category,
    shelfLifeClass,
    typicalIntervalDays,
    health: { score: health, confidence: health === null ? 0 : 0.8, basis: ["curated demo fixture"] },
    sustainability: {
      score: planet,
      confidence: planet === null ? 0 : 0.75,
      factors: [],
    },
    alternatives,
  };
}

export const DEMO_ITEMS: DemoItem[] = [
  {
    name: "Milk",
    icon: "milk-bottle",
    enrichment: e("dairy", "perishable", 5, 3, 2, [
      { title: "Larger bottle instead of small cartons", swapType: "larger_pack", healthDelta: 0, sustainabilityDelta: 1, rationale: "Less packaging per litre", confidence: 0.7 },
    ]),
  },
  {
    name: "Bread",
    icon: "bread-loaf",
    enrichment: e("bakery", "perishable", 4, 2, 3, [
      { title: "Wholegrain instead of white", swapType: "wholegrain", healthDelta: 2, sustainabilityDelta: 0, rationale: "More fibre, same shelf", confidence: 0.85 },
    ]),
  },
  {
    name: "Eggs",
    icon: "eggs",
    enrichment: e("dairy", "perishable", 7, 4, 2),
  },
  {
    name: "Yogurt",
    icon: "yogurt",
    enrichment: e("dairy", "perishable", 6, 4, 2, [
      { title: "Big tub instead of single cups", swapType: "larger_pack", healthDelta: 0, sustainabilityDelta: 2, rationale: "Much less plastic per serving", confidence: 0.8 },
    ]),
  },
  {
    name: "Rice",
    icon: "rice-grains-bowl",
    enrichment: e("grains", "staple", 30, 4, 3, [
      { title: "Loose rice instead of packaged", swapType: "loose_instead_of_packaged", healthDelta: 0, sustainabilityDelta: 2, rationale: "No plastic packaging", confidence: 0.75 },
    ]),
  },
  {
    name: "Olive oil",
    icon: "olive-oil",
    enrichment: e("oils", "staple", 35, 4, 3, [
      { title: "Store brand instead of branded", swapType: "store_brand", healthDelta: 0, sustainabilityDelta: 0, rationale: "Usually cheaper, same quality tier", confidence: 0.6 },
      { title: "Larger bottle instead of small", swapType: "larger_pack", healthDelta: 0, sustainabilityDelta: 1, rationale: "Cheaper per litre", confidence: 0.7 },
    ]),
  },
  {
    name: "Cooking oil",
    icon: "cooking-oil",
    enrichment: e("oils", "staple", 40, 2, 2),
  },
  {
    name: "Honey",
    icon: "honey-jar",
    enrichment: e("spreads", "staple", 60, 3, 4),
  },
  {
    name: "Peanut butter",
    icon: "peanut-butter",
    enrichment: e("spreads", "staple", 30, 3, 3),
  },
  {
    name: "Coffee",
    icon: "coffee-jar",
    enrichment: e("drinks", "staple", 21, 3, 2, [
      { title: "Refill pack instead of new jar", swapType: "refill", healthDelta: 0, sustainabilityDelta: 2, rationale: "Less glass waste", confidence: 0.7 },
    ]),
  },
  {
    name: "Chips",
    icon: "chips",
    enrichment: e("snacks", "staple", 14, 1, 1, [
      { title: "Nuts instead of chips", swapType: "other", healthDelta: 2, sustainabilityDelta: 1, rationale: "Less processed, better fats", confidence: 0.8 },
      { title: "Store brand instead of branded", swapType: "store_brand", healthDelta: 0, sustainabilityDelta: 0, rationale: "Usually cheaper", confidence: 0.55 },
    ]),
  },
  {
    name: "Laundry detergent",
    icon: "laundry-detergent",
    enrichment: e("cleaning", "household", 45, null, 2, [
      { title: "Refill instead of new bottle", swapType: "refill", healthDelta: 0, sustainabilityDelta: 2, rationale: "Less plastic", confidence: 0.75 },
      { title: "Concentrated instead of regular", swapType: "concentrate", healthDelta: 0, sustainabilityDelta: 1, rationale: "Fewer washes per bottle", confidence: 0.65 },
    ]),
  },
  {
    name: "Dish soap",
    icon: "dish-soap",
    enrichment: e("cleaning", "household", 40, null, 2, [
      { title: "Refill instead of new bottle", swapType: "refill", healthDelta: 0, sustainabilityDelta: 2, rationale: "Less plastic", confidence: 0.75 },
    ]),
  },
  {
    name: "Toilet paper",
    icon: "toilet-paper",
    enrichment: e("paper", "household", 30, null, 2, [
      { title: "Bigger pack instead of small", swapType: "larger_pack", healthDelta: 0, sustainabilityDelta: 1, rationale: "Less packaging per roll", confidence: 0.7 },
    ]),
  },
  {
    name: "Steel water bottle",
    icon: "steel-water-bottle",
    enrichment: e("containers", "durable", 3650, null, 5),
  },
  {
    name: "Plastic water bottle",
    icon: "plastic-water-bottle",
    enrichment: e("drinks", "staple", 7, 2, 1, [
      { title: "Tap water in a reusable bottle", swapType: "tap_instead_of_bottled", healthDelta: 0, sustainabilityDelta: 3, rationale: "Near-zero packaging waste", confidence: 0.9 },
    ]),
  },
  {
    name: "Toothpaste",
    icon: "toothpaste",
    enrichment: e("care", "household", 60, null, 2),
  },
];

export function demoKnowledgeKey(name: string): string {
  return knowledgeKey(name);
}

// Curated pantry insights keep the demo deterministic while the live flow
// obtains the same shape from the pantry classification prompt.
export interface DemoInsight {
  category: ItemCategory;
  savesMoney: PantryScore;
  healthy: PantryScore;
  sustainable: PantryScore;
  swap?: {
    name: string;
    savesMoney: PantryScore;
    healthy: PantryScore;
    sustainable: PantryScore;
  };
}

export const DEMO_INSIGHTS: Record<string, DemoInsight> = {
  Milk: {
    category: "dairy",
    savesMoney: 0.7,
    healthy: 0.8,
    sustainable: 0.35,
  },
  Bread: {
    category: "bread",
    savesMoney: 0.45,
    healthy: 0.65,
    sustainable: 0.62,
  },
  Eggs: {
    category: "eggs",
    savesMoney: 0.65,
    healthy: 0.8,
    sustainable: 0.35,
  },
  Rice: {
    category: "grains",
    savesMoney: 0.5,
    healthy: 0.4,
    sustainable: 0.65,
  },
  "Olive oil": {
    category: "oils",
    savesMoney: 0.35,
    healthy: 0.75,
    sustainable: 0.45,
    swap: {
      name: "Store-brand olive oil",
      savesMoney: 0.7,
      healthy: 0.75,
      sustainable: 0.65,
    },
  },
  "Laundry detergent": {
    category: "cleaning",
    savesMoney: 0.65,
    healthy: 0.5,
    sustainable: 0.7,
  },
  "Steel water bottle": {
    category: "other",
    savesMoney: 0.35,
    healthy: 0.5,
    sustainable: 0.85,
  },
  "Toilet paper": {
    category: "paper",
    savesMoney: 0.6,
    healthy: 0.5,
    sustainable: 0.4,
  },
};

// ── Demo purchase plan (offsets in days before "now") ──
// Designed so a fresh seed deterministically shows: one stocked (rice),
// one getting-low, one due (milk depends on timing — milk bought 6d ago,
// T=5 → due), one durable hold alert (steel bottle), and a money story
// (branded vs store-brand olive oil unit prices).

export interface DemoPurchase {
  item: string;
  daysAgo: number;
  brand?: string;
  qty?: number;
  packQty?: number;
  packUnit?: string;
  totalPrice?: number;
}

export const DEMO_PURCHASES: DemoPurchase[] = [
  // Milk: every ~5d ×4 → personal rhythm, last 6d ago → due (BUY)
  { item: "Milk", daysAgo: 21, brand: "Dairy Pure", qty: 1, packQty: 1, packUnit: "L", totalPrice: 1.4 },
  { item: "Milk", daysAgo: 16, brand: "Dairy Pure", qty: 1, packQty: 1, packUnit: "L", totalPrice: 1.4 },
  { item: "Milk", daysAgo: 11, brand: "Dairy Pure", qty: 1, packQty: 1, packUnit: "L", totalPrice: 1.45 },
  { item: "Milk", daysAgo: 6, brand: "Dairy Pure", qty: 1, packQty: 1, packUnit: "L", totalPrice: 1.4 },
  // Bread: frequent → due-ish
  { item: "Bread", daysAgo: 9, qty: 1, totalPrice: 2.1 },
  { item: "Bread", daysAgo: 5, qty: 1, totalPrice: 2.1 },
  { item: "Bread", daysAgo: 1, qty: 1, totalPrice: 2.2 },
  // Eggs: last 2d ago, T=7 → stocked but perishable → never SKIP
  { item: "Eggs", daysAgo: 9, qty: 1, packQty: 10, packUnit: "pcs", totalPrice: 3.0 },
  { item: "Eggs", daysAgo: 2, qty: 1, packQty: 10, packUnit: "pcs", totalPrice: 3.1 },
  // Rice: 3 purchases (personal rhythm), last 10d ago, T=30 → stocked (SKIP with € evidence)
  { item: "Rice", daysAgo: 70, brand: "Golden Grain", qty: 1, packQty: 1, packUnit: "kg", totalPrice: 2.6 },
  { item: "Rice", daysAgo: 40, brand: "Golden Grain", qty: 1, packQty: 1, packUnit: "kg", totalPrice: 2.6 },
  { item: "Rice", daysAgo: 10, brand: "Golden Grain", qty: 1, packQty: 1, packUnit: "kg", totalPrice: 2.6 },
  // Olive oil money story: branded habit, one cheaper store-brand trial in between.
  // Current habit (Borges @ €12/L) vs proven-cheaper variant (store @ €8/L) → SWAP.
  { item: "Olive oil", daysAgo: 70, brand: "Borges", qty: 1, packQty: 500, packUnit: "ml", totalPrice: 6.0 },
  { item: "Olive oil", daysAgo: 52, brand: "Store brand", qty: 1, packQty: 1, packUnit: "L", totalPrice: 8.0 },
  { item: "Olive oil", daysAgo: 35, brand: "Borges", qty: 1, packQty: 500, packUnit: "ml", totalPrice: 6.0 },
  // Detergent: 50d ago, T=45 → due (BUY)
  { item: "Laundry detergent", daysAgo: 95, brand: "Persil", qty: 1, packQty: 20, packUnit: "wash", totalPrice: 7.5 },
  { item: "Laundry detergent", daysAgo: 50, brand: "Persil", qty: 1, packQty: 20, packUnit: "wash", totalPrice: 7.5 },
  // Steel bottle: bought 90d ago → durable hold alert when re-scanned
  { item: "Steel water bottle", daysAgo: 90, qty: 1, totalPrice: 18.0 },
  // Toilet paper: 20d ago, T=30 → getting low
  { item: "Toilet paper", daysAgo: 50, qty: 1, packQty: 8, packUnit: "roll", totalPrice: 4.5 },
  { item: "Toilet paper", daysAgo: 20, qty: 1, packQty: 8, packUnit: "roll", totalPrice: 4.7 },
];
