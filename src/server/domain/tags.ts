import type { ProductEnrichment } from "../../shared/schemas.js";

export type TagKind = "money" | "health" | "planet";

export const MIN_SCORE_DELTA = 1;
export const MIN_MODEL_CONFIDENCE = 0.5;

export interface AlternativeLike {
  healthDelta?: number | null;
  sustainabilityDelta?: number | null;
  confidence?: number | null;
}

export interface TagContext {
  /** SKIP with a known last price → money tag (duplicate avoidance). */
  skipWithPrice: boolean;
  /** SWAP backed by receipt-derived unit-price evidence. */
  moneyEvidence: boolean;
  enrichment: ProductEnrichment | null;
  alternative: AlternativeLike | null;
}

/**
 * Which tags light for a suggestion. Only tags with evidence light;
 * everything else stays dark. Enrichment absent → no health/planet tags.
 */
export function computeTags(ctx: TagContext): TagKind[] {
  const tags: TagKind[] = [];
  if (ctx.skipWithPrice || ctx.moneyEvidence) tags.push("money");
  const alt = ctx.alternative;
  const conf = alt?.confidence ?? 0;
  if (
    ctx.enrichment &&
    alt &&
    conf >= MIN_MODEL_CONFIDENCE &&
    (alt.healthDelta ?? 0) >= MIN_SCORE_DELTA
  ) {
    tags.push("health");
  }
  if (
    ctx.enrichment &&
    alt &&
    conf >= MIN_MODEL_CONFIDENCE &&
    (alt.sustainabilityDelta ?? 0) >= MIN_SCORE_DELTA
  ) {
    tags.push("planet");
  }
  return tags;
}

/** Best alternative for tag/swap purposes: highest combined delta, ties → confidence. */
export function bestAlternative<T extends AlternativeLike>(alts: T[]): T | null {
  if (alts.length === 0) return null;
  return [...alts].sort((a, b) => {
    const da = (a.healthDelta ?? 0) + (a.sustainabilityDelta ?? 0);
    const db = (b.healthDelta ?? 0) + (b.sustainabilityDelta ?? 0);
    if (db !== da) return db - da;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  })[0];
}
