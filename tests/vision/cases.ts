import type { ScanKind } from "../../src/shared/schemas.js";

export interface VisionCase {
  /** Stable slug — snapshot filenames derive from this. */
  id: string;
  /** Exact filename inside tests/fixtures/receipts/. */
  file: string;
  /** What the photo actually is (asserted against the model's detection). */
  kindHint: ScanKind;
  /** Human note for reviewers. */
  note: string;
  /**
   * Items that must survive extraction, as normalised substrings.
   * Filled in after the first reviewed run (see AGENTS.md "vision tests").
   */
  mustInclude: string[];
  /**
   * Snapshot-only name canonicalisation for receipt abbreviations the model
   * legitimately reads two ways (measured over repeated runs). Keys are
   * already-normalised names. A NEW variant that is not listed here will fail
   * the snapshot — review it, then either alias it or fix the prompt.
   */
  aliases?: Record<string, string>;
}

export const VISION_CASES: VisionCase[] = [
  {
    id: "walmart-san-angelo",
    file: "Screenshot_2026-10-28_at_9.29.29_AM.png",
    kindHint: "receipt",
    note: "Clean US receipt screenshot, 10 items, tax line, barcode.",
    mustInclude: ["mango yogurt", "banana yogurt", "potatoes", "lemons"],
    aliases: {
      // "HEALTHCHOICE" reads as either "health choice" or "healthy choice meal".
      "choice health meal": "choice health",
    },
  },
  {
    id: "wholefoods-north-miami",
    file: "Screenshot_2026-10-28_at_9.29.48_AM.png",
    kindHint: "receipt",
    note: "Crumpled receipt, weighed items (lb), discounts, bag refund.",
    mustInclude: ["banana", "kombucha", "mango chunks"],
  },
  {
    id: "aldi-brockton",
    file: "Screenshot_2026-10-28_at_9.30.02_AM.png",
    kindHint: "receipt",
    note: "Repeated line items (sourdough ×3, buns ×2), bottle deposits, no per-line totals column.",
    mustInclude: ["sourdough", "hamburger buns", "organic baby spinach"],
  },
  {
    id: "wholefoods-tribeca",
    file: "Screenshot_2026-10-28_at_9.30.14_AM.png",
    kindHint: "receipt",
    note: "18 items, weight lines with tare, mixed tax codes (F/T).",
    mustInclude: ["cilantro", "romaine", "sour cream"],
  },
  {
    id: "trader-joes-nyc",
    file: "Screenshot_2026-10-28_at_9.30.27_AM.png",
    kindHint: "receipt",
    note: "Yogurt variants with sizes (6oz), tax suffix 'T', cash change lines.",
    mustInclude: ["hamburger buns", "peanuts", "yogurt"],
  },
  {
    id: "supermart-india",
    file: "IMG_1437.jpg",
    kindHint: "receipt",
    note: "Phone photo. Indian receipt, MRP vs our-price columns, qty in decimals, GST table.",
    mustInclude: ["cream"],
    aliases: {
      // The chocolate lines (Cadbury 5Star / Celebrations) are read several ways.
      "assortment chocolate": "chocolate",
      "assorted chocolate": "chocolate",
      "bar chocolate": "chocolate",
      "box chocolate": "chocolate",
      "celebration": "chocolate",
      "celebration chocolate": "chocolate",
      "5star": "chocolate",
    },
  },
  {
    id: "moonmilk-vietnam",
    file: "IMG_20261028_205527.jpg",
    kindHint: "receipt",
    note: "Phone photo. Vietnamese receipt, bilingual item names, VAT %, kg weight lines.",
    mustInclude: ["carrot", "pork", "onion"],
  },
];
