// Deterministic parser for list text, typed or dictated.
// No model calls: "code decides" (see AGENTS.md). Kept in `shared` so the
// server and client can both use it without duplicating rules.

export interface ParsedListItem {
  rawName: string;
  qty: number;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
};

// Leading filler / verbs that dictation often adds.
const LEADING_FILLER =
  /^(?:(?:please|also|and|then)\s+)*(?:(?:i|we)\s+)?(?:(?:to\s+)?(?:need|want|add|buy|get|grab|pick\s+up|remember|put)\s+)*(?:(?:some|a|an|the)\s+)*/i;

// Quantities: "x2", "2x", "2 pcs", "3 packs".
const TRAILING_QTY =
  /\s+(?:x\s*(\d{1,3})|(\d{1,3})\s*(?:x|pcs?|pieces?|units?|packs?)|(\d{1,3}))$/i;

const LEADING_QTY = /^(\d{1,3}|[a-z]+)\s*(?:x\s+|\s+)(.+)$/i;

function quantityValue(token: string): number | null {
  const value = token.toLowerCase();
  if (/^\d{1,3}$/.test(value)) {
    const n = Number(value);
    return n > 0 ? n : null;
  }
  return NUMBER_WORDS[value] ?? null;
}

function extractQuantity(input: string): ParsedListItem {
  let qty = 1;
  let name = input.trim();

  const trailing = name.match(TRAILING_QTY);
  if (trailing && trailing.index !== undefined) {
    const value = Number(trailing[1] ?? trailing[2] ?? trailing[3]);
    if (value > 0) {
      qty = value;
      name = name.slice(0, trailing.index).trim();
    }
  }

  const leading = name.match(LEADING_QTY);
  if (leading) {
    const value = quantityValue(leading[1]);
    if (value) {
      qty = value;
      name = leading[2].trim();
    }
  }

  return { rawName: name, qty };
}

function cleanName(input: string): string {
  return input
    .replace(LEADING_FILLER, "")
    .replace(/^[\s\-–—•·*]+/, "")
    .replace(/[\s.!?]+$/, "")
    .trim();
}

/**
 * Turn free text / a voice transcript into list items.
 *
 * "milk, 2 eggs and bread" → milk ×1, eggs ×2, bread ×1.
 * Duplicate names (case-insensitive) are merged by summing quantities.
 */
export function parseListText(input: string): ParsedListItem[] {
  if (typeof input !== "string" || !input.trim()) return [];

  const chunks = input
    .split(/[\n,;•·]+|\s+(?:and|plus|&)\s+/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const merged = new Map<string, ParsedListItem>();

  for (const chunk of chunks) {
    const withoutFiller = cleanName(chunk);
    if (!withoutFiller) continue;
    const parsed = extractQuantity(withoutFiller);
    const rawName = cleanName(parsed.rawName);
    if (!rawName) continue;

    const key = rawName.toLowerCase().replace(/\s+/g, " ");
    const existing = merged.get(key);
    if (existing) {
      existing.qty += parsed.qty;
    } else {
      merged.set(key, { rawName, qty: parsed.qty });
    }
  }

  return [...merged.values()].slice(0, 50);
}
