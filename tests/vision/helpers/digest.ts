import { normalizeName, singularize } from "../../../src/server/domain/normalize.js";
import type { ExtractedItem } from "../../../src/shared/schemas.js";

export interface DigestItem {
  name: string;
  price: number | null;
}

/**
 * Strict, stable half of the golden: structure that the model reproduces
 * reliably. Names live in the tolerant half (see namesBelow).
 */
export interface StableDigest {
  fixture: string;
  expectedKind: string;
  kind: string;
  itemCount: number;
  /** Sum of effective quantity (qty × packQty when a pack size is given). */
  totalQty: number;
  /** Sorted price multiset — catches misread/missing prices without name coupling. */
  prices: number[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Receipt noise tokens that carry no product identity. */
const NOISE_TOKENS = new Set(["og", "og2", "organic"]);

/**
 * Order-insensitive product key: normalised, pure numbers dropped (the pack
 * size has its own field), singularised, deduped, sorted.
 */
export function canonicalName(input: string): string {
  const tokens = normalizeName(input)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !NOISE_TOKENS.has(t))
    .map(singularize);
  return [...new Set(tokens)].sort().join(" ");
}

export function canonicalTokens(input: string): string[] {
  return canonicalName(input).split(" ").filter(Boolean);
}

/** "1 × 1.59 lb" and "1.59 lb" describe the same purchase → both 1.59. */
export function effectiveQty(item: ExtractedItem): number {
  const qty = Number(item.qty ?? 1);
  const pack = item.packQty == null ? null : Number(item.packQty);
  return Number.isFinite(pack) && pack !== null ? qty * pack! : qty;
}

export function stableDigestOf(
  fixtureId: string,
  expectedKind: string,
  kind: string,
  items: ExtractedItem[],
): StableDigest {
  const prices = items
    .map((it) => (it.price == null ? null : round2(Number(it.price))))
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  return {
    fixture: fixtureId,
    expectedKind,
    kind,
    itemCount: items.length,
    totalQty: round2(items.reduce((sum, it) => sum + effectiveQty(it), 0)),
    prices,
  };
}

/** Canonical names + prices, sorted — the tolerant half of the golden. */
export function namesOf(items: ExtractedItem[], aliases: Record<string, string> = {}): DigestItem[] {
  return items
    .map((it) => {
      const canonical = canonicalName(it.normalizedName || it.rawName);
      return {
        name: aliases[canonical] ?? canonical,
        price: it.price == null ? null : round2(Number(it.price)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.price ?? 0) - (b.price ?? 0));
}

/** Token-set similarity (Jaccard) between two canonical names. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface NameComparison {
  similarity: number;
  matched: number;
  expected: number;
  missing: string[];
  extra: string[];
}

/**
 * Pair each golden name with its best current name. "avocado hass" ↔ "avocado"
 * and "blueberry" ↔ "blueberries" (after singularisation) are acceptable.
 */
export function compareNames(golden: DigestItem[], current: DigestItem[]): NameComparison {
  const used = new Set<number>();
  let matched = 0;
  const missing: string[] = [];
  for (const g of golden) {
    let best = -1;
    let bestScore = 0;
    current.forEach((c, i) => {
      if (used.has(i)) return;
      const score = nameSimilarity(g.name, c.name);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.6) {
      used.add(best);
      matched++;
    } else {
      missing.push(g.name);
    }
  }
  const extra = current.filter((_, i) => !used.has(i)).map((c) => c.name);
  const expected = Math.max(golden.length, 1);
  return { similarity: matched / expected, matched, expected: golden.length, missing, extra };
}
