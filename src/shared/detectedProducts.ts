// Group camera detections into list lines.
// The vision model may return one entry per visible unit ("four beer
// bottles" -> four items); the grocery list wants one line per distinct
// generic product + brand with a summed quantity.

export interface RawDetectedProduct {
  rawName?: string;
  normalizedName?: string;
  brand?: string | null;
  qty?: number | null;
}

export interface DetectedProduct {
  rawName: string;
  brand: string | null;
  qty: number;
}

function displayName(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function groupKey(name: string, brand: string | null): string {
  return `${name.trim().toLowerCase()}|${brand?.trim().toLowerCase() ?? ""}`;
}

function clampQty(value: number | null | undefined): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.max(1, Math.min(99, Math.round(number)));
}

/**
 * Merge identical generic products (same normalized name + brand) by summing
 * quantities. Different brands stay separate lines. Names are display-cased.
 */
export function groupDetectedProducts(
  items: RawDetectedProduct[],
): DetectedProduct[] {
  const grouped = new Map<string, DetectedProduct>();

  for (const item of items) {
    const rawName = (item.normalizedName || item.rawName || "").trim();
    if (!rawName) continue;
    const brand = item.brand?.trim() || null;
    const key = groupKey(rawName, brand);
    const qty = clampQty(item.qty);

    const existing = grouped.get(key);
    if (existing) {
      existing.qty = Math.min(99, existing.qty + qty);
    } else {
      grouped.set(key, {
        rawName: displayName(rawName.toLowerCase()),
        brand,
        qty,
      });
    }
  }

  return [...grouped.values()];
}
