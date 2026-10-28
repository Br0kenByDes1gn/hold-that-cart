import type { ShelfLifeClass } from "../../shared/schemas.js";

export type StockStatus = "stocked" | "getting_low" | "due" | "unknown";
export type RhythmConfidence = "low" | "high";

export interface RhythmPurchase {
  purchasedAt: Date;
}

export interface RhythmState {
  lastPurchasedAt: Date | null;
  purchaseCount: number;
  /** Typical interval in days. */
  T: number | null;
  /** Days since last purchase. */
  d: number | null;
  ratio: number | null; // d / T
  status: StockStatus;
  confidence: RhythmConfidence;
  imOut: boolean;
}

export const STOCKED_BELOW = 0.6;
export const DUE_AT = 1.0;

const CLASS_DEFAULT_DAYS: Record<ShelfLifeClass, number | null> = {
  perishable: 5,
  staple: 30,
  household: 45,
  durable: null, // interval is meaningless; durables never auto-BUY
  unknown: 30,
};

export function classDefaultDays(cls: ShelfLifeClass): number | null {
  return CLASS_DEFAULT_DAYS[cls];
}

/** Scale a default interval by household size (defaults calibrated for 2 people). Clamped 0.5x–2x. */
export function scaleDefault(baseDays: number, householdSize: number): number {
  const size = Math.min(20, Math.max(1, householdSize || 2));
  const factor = Math.min(2, Math.max(0.5, 2 / size));
  return baseDays * factor;
}

function medianGapDays(sortedAsc: Date[]): number | null {
  if (sortedAsc.length < 3) return null; // need >= 2 gaps
  const gaps: number[] = [];
  for (let i = 1; i < sortedAsc.length; i++) {
    gaps.push((sortedAsc[i].getTime() - sortedAsc[i - 1].getTime()) / 86_400_000);
  }
  const valid = gaps.filter((g) => g >= 0).sort((a, b) => a - b);
  if (valid.length < 2) return null;
  const mid = Math.floor(valid.length / 2);
  const m = valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return Math.max(1, m);
}

export interface ComputeStateInput {
  purchases: RhythmPurchase[];
  /** Enrichment/catalogue default, days. Null for durables. */
  defaultIntervalDays: number | null;
  householdSize: number;
  shelfLifeClass: ShelfLifeClass;
  /** Latest "I'm out" correction still in effect (no purchase since). */
  imOutActive: boolean;
  muted: boolean;
  now?: Date;
}

export function computeState(input: ComputeStateInput): RhythmState {
  const now = input.now ?? new Date();
  const sorted = [...input.purchases].sort(
    (a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime(),
  );
  const last = sorted.length > 0 ? sorted[sorted.length - 1].purchasedAt : null;
  const d = last ? Math.max(0, (now.getTime() - last.getTime()) / 86_400_000) : null;

  let T: number | null = medianGapDays(sorted.map((p) => p.purchasedAt));
  let confidence: RhythmConfidence = T !== null ? "high" : "low";
  if (T === null) {
    if (input.defaultIntervalDays !== null) {
      T = scaleDefault(input.defaultIntervalDays, input.householdSize);
    } else {
      T = null;
    }
  }

  // "I'm out" forces due until the next purchase.
  if (input.imOutActive && last) {
    return {
      lastPurchasedAt: last,
      purchaseCount: sorted.length,
      T,
      d,
      ratio: T && d !== null ? d / T : null,
      status: "due",
      confidence,
      imOut: true,
    };
  }

  // Durables: interval math is meaningless — owning one means stocked.
  // Any past purchase (without a later "I'm out") is a strong hold signal.
  if (input.shelfLifeClass === "durable" && last && !input.imOutActive) {
    return {
      lastPurchasedAt: last,
      purchaseCount: sorted.length,
      T: T ?? null,
      d,
      ratio: null,
      status: "stocked",
      confidence: "high",
      imOut: false,
    };
  }

  if (!last || T === null) {
    return {
      lastPurchasedAt: last ?? null,
      purchaseCount: sorted.length,
      T,
      d,
      ratio: null,
      status: "unknown",
      confidence: "low",
      imOut: false,
    };
  }

  const ratio = d! / T;
  const status: StockStatus =
    ratio < STOCKED_BELOW ? "stocked" : ratio < DUE_AT ? "getting_low" : "due";
  return {
    lastPurchasedAt: last,
    purchaseCount: sorted.length,
    T,
    d,
    ratio,
    status,
    confidence,
    imOut: false,
  };
}
