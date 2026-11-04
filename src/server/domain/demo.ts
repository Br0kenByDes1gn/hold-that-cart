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
    name: "Chicken breast",
    icon: "raw-chicken",
    enrichment: e("meat", "perishable", 4, 3, 1),
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
    name: "Trash bags",
    icon: "trash-bags",
    enrichment: e("cleaning", "household", 60, null, 2),
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
  Coffee: {
    category: "coffee_tea",
    savesMoney: 0.6,
    healthy: 0.55,
    sustainable: 0.6,
  },
  Yogurt: {
    category: "dairy",
    savesMoney: 0.6,
    healthy: 0.7,
    sustainable: 0.6,
  },
  "Trash bags": {
    category: "cleaning",
    savesMoney: 0.7,
    healthy: 0.4,
    sustainable: 0.7,
  },
  "Cooking oil": {
    category: "oils",
    savesMoney: 0.65,
    healthy: 0.55,
    sustainable: 0.45,
  },
  "Dish soap": {
    category: "cleaning",
    savesMoney: 0.5,
    healthy: 0.5,
    sustainable: 0.7,
  },
  Toothpaste: {
    category: "personal_care",
    savesMoney: 0.6,
    healthy: 0.5,
    sustainable: 0.55,
  },
};

// ── Demo purchase plan (offsets in days before "now") ──
// Designed so a fresh seed deterministically shows a full mix:
//   BUY: milk (perishable due), olive oil + cooking oil (staple due),
//        trash bags (household due)
//   SKIP: rice (staple stocked), steel bottle (durable), dish soap +
//         toothpaste (household stocked)
//   SWAP: olive oil (branded vs store-brand), laundry (20 vs 40 wash),
//         coffee (Lavazza vs store brand) — all receipt-derived € evidence
// The 3-day pantry→list sweep then adds milk, olive oil, coffee, trash bags
// and cooking oil to the seeded grocery list.

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
  // Detergent: 3 purchases, last 30d ago → getting low → cheaper-format SWAP.
  // Current habit (20-wash Persil @ €0.375/wash) vs 40-wash trial @ €0.275/wash.
  { item: "Laundry detergent", daysAgo: 95, brand: "Persil", qty: 1, packQty: 20, packUnit: "wash", totalPrice: 7.5 },
  { item: "Laundry detergent", daysAgo: 80, brand: "Persil", qty: 1, packQty: 40, packUnit: "wash", totalPrice: 11.0 },
  { item: "Laundry detergent", daysAgo: 30, brand: "Persil", qty: 1, packQty: 20, packUnit: "wash", totalPrice: 7.5 },
  // Coffee: 3 purchases, last 15d ago → getting low → cheaper-format SWAP.
  // Current habit (Lavazza 250g @ €18/kg) vs store 500g trial @ €12/kg.
  { item: "Coffee", daysAgo: 60, brand: "Lavazza", qty: 1, packQty: 250, packUnit: "g", totalPrice: 4.5 },
  { item: "Coffee", daysAgo: 40, brand: "Store brand", qty: 1, packQty: 500, packUnit: "g", totalPrice: 6.0 },
  { item: "Coffee", daysAgo: 15, brand: "Lavazza", qty: 1, packQty: 250, packUnit: "g", totalPrice: 4.5 },
  // Trash bags: 70d ago, household clock 60d → due (BUY + auto-add)
  { item: "Trash bags", daysAgo: 130, qty: 1, packQty: 30, packUnit: "pcs", totalPrice: 3.0 },
  { item: "Trash bags", daysAgo: 70, qty: 1, packQty: 30, packUnit: "pcs", totalPrice: 3.2 },
  // Cooking oil: last 45d ago, staple clock 14d → due (BUY + auto-add)
  { item: "Cooking oil", daysAgo: 85, qty: 1, packQty: 1, packUnit: "L", totalPrice: 2.5 },
  { item: "Cooking oil", daysAgo: 45, qty: 1, packQty: 1, packUnit: "L", totalPrice: 2.6 },
  // Dish soap: 3 purchases, last 10d ago → stocked household hold
  { item: "Dish soap", daysAgo: 90, qty: 1, packQty: 500, packUnit: "ml", totalPrice: 1.8 },
  { item: "Dish soap", daysAgo: 50, qty: 1, packQty: 500, packUnit: "ml", totalPrice: 1.8 },
  { item: "Dish soap", daysAgo: 10, qty: 1, packQty: 500, packUnit: "ml", totalPrice: 1.9 },
  // Toothpaste: 3 purchases, last 15d ago → stocked household hold
  { item: "Toothpaste", daysAgo: 135, qty: 1, packQty: 100, packUnit: "ml", totalPrice: 2.2 },
  { item: "Toothpaste", daysAgo: 75, qty: 1, packQty: 100, packUnit: "ml", totalPrice: 2.2 },
  { item: "Toothpaste", daysAgo: 15, qty: 1, packQty: 100, packUnit: "ml", totalPrice: 2.3 },
  // Yogurt: fresh perishable, used for camera/list matching
  { item: "Yogurt", daysAgo: 8, qty: 1, packQty: 500, packUnit: "g", totalPrice: 2.0 },
  { item: "Yogurt", daysAgo: 2, qty: 1, packQty: 500, packUnit: "g", totalPrice: 2.0 },
  // Steel bottle: bought 90d ago → durable hold alert when re-scanned
  { item: "Steel water bottle", daysAgo: 90, qty: 1, totalPrice: 18.0 },
  // Toilet paper: 20d ago, T=30 → getting low
  { item: "Toilet paper", daysAgo: 50, qty: 1, packQty: 8, packUnit: "roll", totalPrice: 4.5 },
  { item: "Toilet paper", daysAgo: 20, qty: 1, packQty: 8, packUnit: "roll", totalPrice: 4.7 },
];

// ── Demo grocery list ──
// Seeded as the open "Weekly shop" list. The auto-add sweep runs on the first
// /quick-view open (lastPantryRefreshAt is reset to null) and adds the due
// pantry items on top of these rows.

export interface DemoListItem {
  rawName: string;
  qty: number;
  source: "manual" | "voice" | "camera" | "scan";
  brand?: string;
  checked?: boolean;
  decision?: "needs_it" | "skip";
}

export const DEMO_LIST = {
  title: "Weekly shop",
  items: [
    { rawName: "Bananas", qty: 2, source: "manual" },
    { rawName: "Bread", qty: 1, source: "voice", brand: "Hovis" },
    { rawName: "Yogurt", qty: 2, source: "camera", brand: "Fage" },
    { rawName: "Rice", qty: 1, source: "scan" },
    { rawName: "Dish soap", qty: 1, source: "manual" },
    { rawName: "Toothpaste", qty: 1, source: "manual" },
    { rawName: "Steel water bottle", qty: 1, source: "manual" },
    { rawName: "Saffron", qty: 1, source: "manual" },
    { rawName: "Eggs", qty: 1, source: "manual", checked: true, decision: "needs_it" },
  ] as DemoListItem[],
};
