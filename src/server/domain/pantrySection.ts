import type { PantryItemInsight, PantryScore } from "../../shared/schemas.js";

export type PantrySectionKey = "buy" | "skip" | "swap";
export type PantryTagKind = "money" | "health" | "planet";

/** A parameter counts as true when its directional score is at least 0.6. */
export const MIN_SCORE = 0.6;

interface ScoreFlags {
  savesMoney: PantryScore;
  healthy: PantryScore;
  sustainable: PantryScore;
}

export function scoreIsYes(value: PantryScore): boolean {
  return value >= MIN_SCORE;
}

/** Count how many of the three pantry parameters are above the threshold. */
export function trueCount(flags: ScoreFlags): number {
  return [flags.savesMoney, flags.healthy, flags.sustainable].filter(scoreIsYes)
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

export function pantryTagsFor(flags: ScoreFlags): PantryTagKind[] {
  const tags: PantryTagKind[] = [];
  if (scoreIsYes(flags.savesMoney)) tags.push("money");
  if (scoreIsYes(flags.healthy)) tags.push("health");
  if (scoreIsYes(flags.sustainable)) tags.push("planet");
  return tags;
}
