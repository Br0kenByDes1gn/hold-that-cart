// Unit normalization: every comparable price becomes € per BASE unit.
// Mass -> kg, volume -> L, count/wash -> each/wash. Unknown -> null (no comparison).
export type BaseUnit = "kg" | "L" | "each" | "wash";

const MASS: Record<string, number> = {
  kg: 1,
  g: 0.001,
  mg: 0.000001,
};
const VOLUME: Record<string, number> = {
  l: 1,
  liter: 1,
  litre: 1,
  ml: 0.001,
  cl: 0.01,
  dl: 0.1,
};
const COUNT: Record<string, number> = {
  each: 1,
  pc: 1,
  pcs: 1,
  piece: 1,
  pieces: 1,
  pack: 1,
  roll: 1,
  sheet: 1,
  wash: 1,
  load: 1,
};

export function canonicalUnit(unit: string | undefined | null): {
  base: BaseUnit;
  factor: number;
} | null {
  if (!unit) return null;
  const u = unit.toLowerCase().trim().replace(/\./g, "");
  if (MASS[u] !== undefined) return { base: "kg", factor: MASS[u] };
  if (VOLUME[u] !== undefined) return { base: "L", factor: VOLUME[u] };
  if (u === "wash" || u === "washes" || u === "load" || u === "loads")
    return { base: "wash", factor: COUNT[u] ?? 1 };
  if (COUNT[u] !== undefined) return { base: "each", factor: 1 };
  return null;
}

/** Total quantity in base units, or null when pack info is missing/unknown. */
export function baseQuantity(
  qty: number,
  packQty?: number | string | null,
  packUnit?: string | null,
): { qtyBase: number; baseUnit: BaseUnit } | null {
  const pq = packQty === null || packQty === undefined ? NaN : Number(packQty);
  if (!Number.isFinite(pq) || pq <= 0) {
    // No pack size: only countable "each" items can be compared per piece.
    if (packUnit) return null;
    if (!Number.isFinite(qty) || qty <= 0) return null;
    return { qtyBase: qty, baseUnit: "each" };
  }
  const c = canonicalUnit(packUnit);
  if (!c) return null;
  return { qtyBase: qty * pq * c.factor, baseUnit: c.base };
}

/** Normalized unit price (€ per base unit), or null when not computable. */
export function unitPrice(
  totalPrice: number | string | null | undefined,
  qty: number,
  packQty?: number | string | null,
  packUnit?: string | null,
): { perUnit: number; baseUnit: BaseUnit } | null {
  const t = totalPrice === null || totalPrice === undefined ? NaN : Number(totalPrice);
  if (!Number.isFinite(t) || t < 0) return null;
  const bq = baseQuantity(qty, packQty, packUnit);
  if (!bq || bq.qtyBase <= 0) return null;
  return { perUnit: t / bq.qtyBase, baseUnit: bq.baseUnit };
}

export function median(values: number[]): number | null {
  const vs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (vs.length === 0) return null;
  const mid = Math.floor(vs.length / 2);
  return vs.length % 2 === 1 ? vs[mid] : (vs[mid - 1] + vs[mid]) / 2;
}
