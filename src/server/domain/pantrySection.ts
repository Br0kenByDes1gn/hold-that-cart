import type { PantryItemInsight, PantryVerdict } from "../../shared/schemas.js";

export type PantrySectionKey = "buy" | "skip" | "swap";
export type PantryTagKind = "money" | "health" | "planet";

export const MIN_VERDICT_CONFIDENCE = 0.5;

interface VerdictFlags {
  savesMoney: PantryVerdict;
  healthy: PantryVerdict;
  sustainable: PantryVerdict;
}

/** A tag lights only for a positive verdict with reasonable confidence. */
export function verdictIsYes(verdict: PantryVerdict): boolean {
  return verdict.verdict === true && verdict.confidence >= MIN_VERDICT_CONFIDENCE;
}

/** Count how many of the three pantry parameters are confidently true. */
export function trueCount(flags: VerdictFlags): number {
  return [flags.savesMoney, flags.healthy, flags.sustainable].filter(verdictIsYes)
    .length;
}

/**
 * A swap is only accepted when it is strictly better than the original item
 * across the three parameters. The model proposes; this function decides.
 */
export function hasBetterSwap(insight: PantryItemInsight): boolean {
  if (!insight.swap) return false;
  return trueCount(insight.swap) > trueCount(insight);
}

/** SWAP takes precedence; otherwise 2+ true fields → BUY, else SKIP. */
export function pantrySectionFor(insight: PantryItemInsight): PantrySectionKey {
  if (hasBetterSwap(insight)) return "swap";
  return trueCount(insight) >= 2 ? "buy" : "skip";
}

export function pantryTagsFor(flags: VerdictFlags): PantryTagKind[] {
  const tags: PantryTagKind[] = [];
  if (verdictIsYes(flags.savesMoney)) tags.push("money");
  if (verdictIsYes(flags.healthy)) tags.push("health");
  if (verdictIsYes(flags.sustainable)) tags.push("planet");
  return tags;
}
