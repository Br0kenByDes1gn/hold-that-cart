import type {
  ListParseMatch,
  SpokenListItem,
} from "../../shared/schemas.js";
import { matchProduct, type MatchCandidate } from "./match.js";
import { parseListText } from "../../shared/listText.js";

/**
 * Deterministic processing for dictated lists.
 *
 * The model only splits the transcript into product names and normalises them.
 * Everything here is code: grounding, quantities, de-duplication, limits and
 * pantry matching. Keep it pure.
 */

export interface VoiceItem {
  /** Display name: generic pantry type, capitalised ("Olive oil"). */
  name: string;
  brand: string | null;
  qty: number;
  confidence: number;
}

export type VoiceItemWithMatch = VoiceItem & { match: ListParseMatch };

export const MAX_VOICE_ITEMS = 30;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return fold(value)
    .split(/[\s-]+/)
    .filter(Boolean);
}

/** Crude singular form so "eggs" supports "egg" without substring cheating. */
function baseToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

function isGrounded(transcriptTokens: Set<string>, phrase: string): boolean {
  const phraseTokens = tokens(phrase);
  if (phraseTokens.length === 0) return false;
  return phraseTokens.every((token) => transcriptTokens.has(baseToken(token)));
}

function cleanName(value: string): string {
  return value
    .replace(/^[\s"'“”‘’\-–—•·*]+/, "")
    .replace(/[\s"'“”‘’!?.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function itemKey(name: string, brand: string | null): string {
  return `${fold(name)}|${fold(brand ?? "")}`;
}

function clampQty(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.min(99, Math.round(value)));
}

/**
 * Turn validated model items into grounded voice items.
 * - an item whose name is not supported by the transcript is dropped;
 * - an unsupported brand is dropped but the item stays;
 * - duplicates (same name + brand) merge quantities;
 * - items are capped.
 */
export function validateSpokenItems(
  items: SpokenListItem[],
  transcript: string,
): VoiceItem[] {
  const transcriptTokens = new Set(tokens(transcript).map(baseToken));
  const merged = new Map<string, VoiceItem>();

  for (const item of items) {
    const name = cleanName(item.name);
    if (!name || !isGrounded(transcriptTokens, name)) continue;

    const rawBrand = item.brand ? cleanName(item.brand) : null;
    const brand =
      rawBrand && isGrounded(transcriptTokens, rawBrand) ? rawBrand : null;

    const key = itemKey(name, brand);
    const existing = merged.get(key);
    const qty = clampQty(item.qty);
    if (existing) {
      existing.qty = Math.min(99, existing.qty + qty);
    } else {
      merged.set(key, {
        name: displayName(name.toLowerCase()),
        brand,
        qty,
        confidence: 0.7,
      });
    }
  }

  return [...merged.values()].slice(0, MAX_VOICE_ITEMS);
}

/** Deterministic fallback when the model is unavailable or unusable. */
export function fallbackVoiceItems(transcript: string): VoiceItem[] {
  return parseListText(transcript)
    .slice(0, MAX_VOICE_ITEMS)
    .map((item) => ({
      name: displayName(cleanName(item.rawName).toLowerCase()),
      brand: null,
      qty: clampQty(item.qty),
      confidence: 0.3,
    }));
}

export function attachPantryMatches(
  items: VoiceItem[],
  products: MatchCandidate[],
): VoiceItemWithMatch[] {
  return items.map((item) => {
    const result = matchProduct(item.name, products);
    const product = result.productId
      ? products.find((candidate) => candidate.id === result.productId) ?? null
      : null;
    return {
      ...item,
      match: {
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        confidence: result.confidence,
        inPantry: Boolean(product),
      },
    };
  });
}
