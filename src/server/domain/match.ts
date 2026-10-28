import { normalizeName, tokens } from "./normalize.js";

export interface MatchCandidate {
  id: string;
  name: string;
  catalogKey?: string | null;
}

export interface MatchResult {
  productId: string | null;
  confidence: number; // 0..1
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let carry = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        carry + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      carry = tmp;
    }
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function candidateStrings(c: MatchCandidate): string[] {
  const out = [normalizeName(c.name)];
  if (c.catalogKey) {
    out.push(normalizeName(c.catalogKey.replace(/[-_]/g, " ")));
  }
  return out.filter(Boolean);
}

function scoreOne(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  const qt = new Set(tokens(query));
  const ct = new Set(tokens(candidate));
  if (qt.size > 0 && ct.size > 0) {
    let hit = 0;
    for (const t of qt) if (ct.has(t)) hit++;
    const containment = hit / qt.size;
    if (containment === 1) return 0.85; // all query tokens present
    if (containment >= 0.5) return 0.6 + 0.2 * containment;
  }
  const sim = similarity(query, candidate);
  return sim >= 0.72 ? 0.4 + 0.3 * sim : sim * 0.4;
}

export const MATCH_THRESHOLD = 0.55;

export function matchProduct(
  rawQuery: string,
  candidates: MatchCandidate[],
  threshold = MATCH_THRESHOLD,
): MatchResult {
  const q = normalizeName(rawQuery);
  if (!q || candidates.length === 0) return { productId: null, confidence: 0 };
  let best: MatchResult = { productId: null, confidence: 0 };
  for (const c of candidates) {
    for (const s of candidateStrings(c)) {
      const score = scoreOne(q, s);
      if (score > best.confidence) best = { productId: c.id, confidence: score };
    }
  }
  if (best.confidence < threshold) return { productId: null, confidence: best.confidence };
  return best;
}
