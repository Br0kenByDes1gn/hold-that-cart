import { baseQuantity, canonicalUnit, median, unitPrice } from "./units.js";

export interface MoneyPurchase {
  purchasedAt: Date;
  qty: number;
  packQty?: number | string | null;
  packUnit?: string | null;
  totalPrice?: number | string | null;
  brand?: string | null;
}

/** Variant signature: brand + pack size (same product, different variant). */
export function variantKey(p: MoneyPurchase): string {
  const brand = (p.brand ?? "").toLowerCase().trim() || "nobrand";
  const pq = p.packQty === null || p.packQty === undefined ? "" : String(Number(p.packQty));
  const pu = (p.packUnit ?? "").toLowerCase().trim();
  return `${brand}|${pq}${pu}`;
}

export interface VariantStats {
  key: string;
  brand: string | null;
  medianPerUnit: number;
  baseUnit: string;
  lastPerUnit: number | null;
  purchaseCount: number;
  medianQty: number;
}

/** Median unit prices per variant (last 3 purchases each, promo-resistant). */
export function variantStats(purchases: MoneyPurchase[]): VariantStats[] {
  const byVariant = new Map<string, MoneyPurchase[]>();
  for (const p of purchases) {
    const k = variantKey(p);
    if (!byVariant.has(k)) byVariant.set(k, []);
    byVariant.get(k)!.push(p);
  }
  const out: VariantStats[] = [];
  for (const [key, ps] of byVariant) {
    const sorted = [...ps].sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
    const recent = sorted.slice(0, 3);
    const perUnits: number[] = [];
    let baseUnit = "each";
    let lastPerUnit: number | null = null;
    for (const [i, p] of recent.entries()) {
      const up = unitPrice(p.totalPrice, p.qty, p.packQty, p.packUnit);
      if (up) {
        // Only compare variants sharing the same base unit.
        baseUnit = up.baseUnit;
        perUnits.push(up.perUnit);
        if (i === 0) lastPerUnit = up.perUnit;
      }
    }
    // Require consistent base unit across all recent? Simplify: drop variants with <1 priced point.
    const m = median(perUnits);
    if (m === null) continue;
    const qtys = recent.map((p) => Number(p.qty)).filter((q) => Number.isFinite(q) && q > 0);
    out.push({
      key,
      brand: recent[0].brand ?? null,
      medianPerUnit: m,
      baseUnit,
      lastPerUnit,
      purchaseCount: ps.length,
      medianQty: median(qtys) ?? 1,
    });
  }
  return out;
}

export const CHEAPER_THRESHOLD = 0.1; // 10% median unit-price advantage

export interface CheaperVariantEvidence {
  cheaperKey: string;
  currentKey: string;
  cheaperMedian: number;
  currentMedian: number;
  pctCheaper: number;
  baseUnit: string;
  expectedSavingPerTrip: number;
}

/**
 * Same product bought in ≥2 variants: is the cheapest variant ≥10% cheaper
 * (median unit price) than the most recently bought variant?
 */
export function findCheaperVariant(purchases: MoneyPurchase[]): CheaperVariantEvidence | null {
  const stats = variantStats(purchases).filter((s) => s.purchaseCount >= 1);
  if (stats.length < 2) return null;
  // Current = variant of the most recent priced purchase.
  const sorted = [...purchases].sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
  let currentKey: string | null = null;
  for (const p of sorted) {
    const up = unitPrice(p.totalPrice, p.qty, p.packQty, p.packUnit);
    if (up) {
      currentKey = variantKey(p);
      break;
    }
  }
  if (!currentKey) return null;
  const current = stats.find((s) => s.key === currentKey);
  if (!current) return null;
  const sameUnit = stats.filter((s) => s.baseUnit === current.baseUnit && s.key !== current.key);
  if (sameUnit.length === 0) return null;
  // Suggest only when the CURRENT habit is not already the cheapest:
  // cheapest overall must differ from current and be ≥10% cheaper.
  const cheapest = sameUnit.sort((a, b) => a.medianPerUnit - b.medianPerUnit)[0];
  if (cheapest.medianPerUnit >= current.medianPerUnit) return null;
  const pct = (current.medianPerUnit - cheapest.medianPerUnit) / current.medianPerUnit;
  if (pct < CHEAPER_THRESHOLD) return null;
  // Expected saving per trip: unit-price diff × typical trip quantity (in base units).
  const currentPurchases = purchases.filter((p) => variantKey(p) === current.key);
  const baseQtys = currentPurchases
    .map((p) => baseQuantity(p.qty, p.packQty, p.packUnit))
    .filter((b): b is NonNullable<typeof b> => b !== null && b.baseUnit === current.baseUnit)
    .map((b) => b.qtyBase);
  const typicalBaseQty = median(baseQtys) ?? current.medianQty;
  const expected = (current.medianPerUnit - cheapest.medianPerUnit) * typicalBaseQty;
  return {
    cheaperKey: cheapest.key,
    currentKey: current.key,
    cheaperMedian: cheapest.medianPerUnit,
    currentMedian: current.medianPerUnit,
    pctCheaper: pct,
    baseUnit: current.baseUnit,
    expectedSavingPerTrip: expected,
  };
}

export interface LargerPackEvidence {
  pctCheaper: number;
  baseUnit: string;
  extraUpfront: number;
  expectedSavingPerTrip: number;
}

/**
 * Larger-pack economics: among priced purchases of the same brand family,
 * is a bigger pack ≥10% cheaper per unit? Perishables excluded by the caller.
 */
export function findLargerPackSaving(purchases: MoneyPurchase[]): LargerPackEvidence | null {
  const priced = purchases
    .map((p) => ({ p, up: unitPrice(p.totalPrice, p.qty, p.packQty, p.packUnit) }))
    .filter((x): x is { p: MoneyPurchase; up: NonNullable<ReturnType<typeof unitPrice>> } => x.up !== null);
  if (priced.length < 2) return null;
  // Group by brand; compare smallest vs largest pack within a brand.
  const byBrand = new Map<string, typeof priced>();
  for (const x of priced) {
    const b = (x.p.brand ?? "").toLowerCase().trim() || "nobrand";
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b)!.push(x);
  }
  let best: LargerPackEvidence | null = null;
  for (const group of byBrand.values()) {
    const units = new Set(group.map((x) => x.up.baseUnit));
    if (units.size !== 1) continue;
    // Pack sizes compared in BASE units (500 g vs 1 kg, not 500 vs 1).
    const sized = group
      .map((x) => {
        const c = canonicalUnit(x.p.packUnit);
        const n = Number(x.p.packQty ?? 1);
        return { ...x, sizeBase: c ? n * c.factor : NaN };
      })
      .filter((x) => Number.isFinite(x.sizeBase));
    if (sized.length < 2) continue;
    // Compare cheapest-per-unit vs most-expensive-per-unit within brand.
    const byRate = [...sized].sort((a, b) => a.up.perUnit - b.up.perUnit);
    const cheap = byRate[0];
    const pricey = byRate[byRate.length - 1];
    if (cheap === pricey) continue;
    const cheapSize = cheap.sizeBase;
    const priceySize = pricey.sizeBase;
    if (!(cheapSize > priceySize)) continue; // the cheaper one must be the bigger pack
    const pct = (pricey.up.perUnit - cheap.up.perUnit) / pricey.up.perUnit;
    if (pct < CHEAPER_THRESHOLD) continue;
    const cheapTotal = Number(cheap.p.totalPrice ?? 0);
    const priceyTotal = Number(pricey.p.totalPrice ?? 0);
    const ev: LargerPackEvidence = {
      pctCheaper: pct,
      baseUnit: cheap.up.baseUnit,
      extraUpfront: Math.max(0, cheapTotal - priceyTotal),
      expectedSavingPerTrip: (pricey.up.perUnit - cheap.up.perUnit) * cheapSize,
    };
    if (!best || ev.pctCheaper > best.pctCheaper) best = ev;
  }
  return best;
}
