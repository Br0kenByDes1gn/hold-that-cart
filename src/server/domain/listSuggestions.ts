import type { ListSuggestion, Suggestion } from "../../shared/schemas.js";
import type { SuggestionProduct } from "./suggestions.js";
import { suggestForProducts } from "./suggestions.js";
import { normalizeName } from "./normalize.js";

/**
 * PREVIEW ONLY — temporary rhythm-based stub.
 *
 * The grocery-list UI needs a stable interface while the pantry prediction
 * service is being developed. This module maps the existing deterministic
 * BUY suggestions into that interface. Replace the implementation, not the
 * contract (`listSuggestionsResponseSchema` in `src/shared/schemas.ts`).
 */

export interface ListSuggestionOptions {
  /** Names already on the list (checked or not) — never suggested again. */
  excludeNames?: Iterable<string>;
  limit?: number;
  now?: Date;
}

function reasonFor(suggestion: Suggestion): string {
  if (suggestion.reasonCodes.includes("marked_out")) {
    return "You marked this as out";
  }
  const days = suggestion.evidence.typicalIntervalDays;
  if (days && days > 0) {
    return `Usually bought every ${days} days`;
  }
  return "Due from your pantry";
}

function toListSuggestion(suggestion: Suggestion): ListSuggestion {
  return {
    productId: suggestion.productId,
    rawName: suggestion.rawName,
    qty: 1,
    reasonCode: suggestion.reasonCodes[0] ?? "due",
    reason: reasonFor(suggestion),
    confidence: suggestion.confidence,
    evidence: {
      daysSince: suggestion.evidence.daysSince,
      typicalIntervalDays: suggestion.evidence.typicalIntervalDays,
    },
  };
}

/**
 * Pure mapping: product views → list suggestions.
 * Muted products ("never remind") are omitted because this is a
 * recommendation surface, not a hold alert.
 */
export function suggestionsFromViews(
  views: SuggestionProduct[],
  opts: ListSuggestionOptions = {},
): ListSuggestion[] {
  const excluded = new Set(
    [...(opts.excludeNames ?? [])].map((name) => normalizeName(name)),
  );
  const visible = views.filter((view) => !view.muted);
  const grouped = suggestForProducts(visible, {
    now: opts.now,
    limits: { buy: 50, swap: 0, skip: 0 },
  });

  return grouped.buy
    .filter((suggestion) => !excluded.has(normalizeName(suggestion.rawName)))
    .slice(0, opts.limit ?? 10)
    .map(toListSuggestion);
}
