import type {
  ProductEnrichment,
  Suggestion,
  SuggestionAction,
} from "../../shared/schemas.js";
import type { RhythmState } from "./rhythm.js";
import { bestAlternative, computeTags } from "./tags.js";
import {
  findCheaperVariant,
  findLargerPackSaving,
  type MoneyPurchase,
} from "./money.js";

export interface SuggestionProduct {
  productId: string;
  rawName: string;
  shelfLifeClass: "perishable" | "staple" | "household" | "durable" | "unknown";
  muted: boolean;
  state: RhythmState;
  enrichment: ProductEnrichment | null;
  moneyPurchases: MoneyPurchase[];
  lastTotalPrice: number | null;
}

export interface EvaluateOptions {
  now?: Date;
  limits?: { buy?: number; swap?: number; skip?: number };
}

const DEFAULT_LIMITS = { buy: 8, swap: 3, skip: 5 };

/**
 * Group a set of products into BUY / SWAP / SKIP.
 * Rules (grounded, deterministic):
 * - muted → never SKIP (hold alerts suppressed); BUY/SWAP still allowed
 * - perishable → never SKIP
 * - durable → never auto-BUY; stocked durables get the strongest hold alert
 * - unknown products (no history) → no SKIP, no rhythm claims
 * - enrichment absent → no health/planet tags, no SWAP from model
 * - money tag only with receipt-derived evidence; unverified swaps never render €
 */
export function suggestForProducts(
  products: SuggestionProduct[],
  opts: EvaluateOptions = {},
): { buy: Suggestion[]; swap: Suggestion[]; skip: Suggestion[] } {
  const buy: Suggestion[] = [];
  const swap: Suggestion[] = [];
  const skip: Suggestion[] = [];

  for (const p of products) {
    const { state } = p;
    const lastPrice = p.lastTotalPrice;
    const alt = p.enrichment ? bestAlternative(p.enrichment.alternatives) : null;

    // ── SKIP candidates ──
    const skipEligible =
      !p.muted &&
      p.shelfLifeClass !== "perishable" &&
      p.shelfLifeClass !== "unknown" &&
      state.status === "stocked" &&
      state.confidence === "high";
    if (skipEligible) {
      const strong = p.shelfLifeClass === "durable";
      skip.push({
        productId: p.productId,
        rawName: p.rawName,
        action: "SKIP",
        reasonCodes: strong ? ["durable_hold"] : ["probably_stocked"],
        tags: computeTags({
          skipWithPrice: lastPrice !== null,
          moneyEvidence: false,
          enrichment: p.enrichment,
          alternative: null,
        }),
        swapType: null,
        swapTitle: null,
        confidence: state.purchaseCount >= 3 ? 0.85 : 0.65,
        evidence: {
          lastPurchasedAt: state.lastPurchasedAt?.toISOString() ?? null,
          daysSince: state.d !== null ? Math.round(state.d) : null,
          typicalIntervalDays: state.T !== null ? Math.round(state.T) : null,
          lastPrice,
          expectedSaving: lastPrice,
        },
      });
      continue; // stocked items are not also BUY/SWAP candidates
    }

    // ── BUY candidates (due, not durable, not muted-out-of-stock logic) ──
    if (
      state.status === "due" &&
      p.shelfLifeClass !== "durable" &&
      p.shelfLifeClass !== "unknown"
    ) {
      buy.push({
        productId: p.productId,
        rawName: p.rawName,
        action: "BUY",
        reasonCodes: state.imOut ? ["marked_out"] : ["due"],
        tags: [],
        swapType: null,
        swapTitle: null,
        confidence: state.confidence === "high" ? 0.85 : 0.55,
        evidence: {
          lastPurchasedAt: state.lastPurchasedAt?.toISOString() ?? null,
          daysSince: state.d !== null ? Math.round(state.d) : null,
          typicalIntervalDays: state.T !== null ? Math.round(state.T) : null,
          lastPrice,
          expectedSaving: null,
        },
      });
    }

    // ── SWAP candidates ──
    // 1. Receipt-proven cheaper variant (money evidence).
    const cheaper = findCheaperVariant(p.moneyPurchases);
    // 2. Larger-pack economics (never perishables).
    const larger =
      p.shelfLifeClass !== "perishable" ? findLargerPackSaving(p.moneyPurchases) : null;
    // 3. Model-suggested alternative (unverified → no €).
    if (cheaper) {
      swap.push({
        productId: p.productId,
        rawName: p.rawName,
        action: "SWAP",
        reasonCodes: ["cheaper_variant"],
        tags: computeTags({
          skipWithPrice: false,
          moneyEvidence: true,
          enrichment: p.enrichment,
          alternative: alt,
        }),
        swapType: "store_brand",
        swapTitle: "Cheaper variant you've bought before",
        confidence: 0.8,
        evidence: {
          lastPurchasedAt: state.lastPurchasedAt?.toISOString() ?? null,
          daysSince: state.d !== null ? Math.round(state.d) : null,
          typicalIntervalDays: state.T !== null ? Math.round(state.T) : null,
          lastPrice,
          expectedSaving: cheaper.expectedSavingPerTrip,
        },
      });
    } else if (larger) {
      swap.push({
        productId: p.productId,
        rawName: p.rawName,
        action: "SWAP",
        reasonCodes: ["larger_pack"],
        tags: computeTags({
          skipWithPrice: false,
          moneyEvidence: true,
          enrichment: p.enrichment,
          alternative: alt,
        }),
        swapType: "larger_pack",
        swapTitle: "Bigger pack, cheaper per unit",
        confidence: 0.7,
        evidence: {
          lastPurchasedAt: state.lastPurchasedAt?.toISOString() ?? null,
          daysSince: state.d !== null ? Math.round(state.d) : null,
          typicalIntervalDays: state.T !== null ? Math.round(state.T) : null,
          lastPrice,
          expectedSaving: larger.expectedSavingPerTrip,
        },
      });
    } else if (alt) {
      swap.push({
        productId: p.productId,
        rawName: p.rawName,
        action: "SWAP",
        reasonCodes: ["model_swap"],
        tags: computeTags({
          skipWithPrice: false,
          moneyEvidence: false, // unverified: money tag stays dark, no € claimed
          enrichment: p.enrichment,
          alternative: alt,
        }),
        swapType: (alt as { swapType?: Suggestion["swapType"] }).swapType ?? "other",
        swapTitle: (alt as { title?: string }).title ?? "Consider an alternative",
        confidence: (alt.confidence ?? 0.5) * 0.8,
        evidence: {
          lastPurchasedAt: state.lastPurchasedAt?.toISOString() ?? null,
          daysSince: state.d !== null ? Math.round(state.d) : null,
          typicalIntervalDays: state.T !== null ? Math.round(state.T) : null,
          lastPrice,
          expectedSaving: null, // never invent savings
        },
      });
    }
  }

  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  // Order: SKIP by confidence then recency; BUY by most overdue (d/T desc);
  // SWAP by expected saving then confidence.
  skip.sort((a, b) => b.confidence - a.confidence);
  buy.sort(
    (a, b) => (b.evidence.daysSince ?? 0) - (a.evidence.daysSince ?? 0),
  );
  swap.sort(
    (a, b) => (b.evidence.expectedSaving ?? 0) - (a.evidence.expectedSaving ?? 0),
  );
  return {
    buy: buy.slice(0, limits.buy),
    swap: swap.slice(0, limits.swap),
    skip: skip.slice(0, limits.skip),
  };
}
