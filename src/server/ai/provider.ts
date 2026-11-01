import type { PantryItemInsight, SpokenListModel } from "../../shared/schemas.js";

export interface ExtractedItemLike {
  rawName: string;
  normalizedName: string;
  brand?: string;
  qty?: number;
}

export interface ProductEnrichmentLike {
  shelfLifeClass?: string;
  typicalIntervalDays?: number;
  health?: { score: number | null; confidence: number };
  sustainability?: { score: number | null; confidence: number };
  alternatives?: Array<{
    title: string;
    swapType: string;
    healthDelta?: number;
    sustainabilityDelta?: number;
    rationale?: string;
    confidence?: number;
  }>;
  modelName?: string;
  promptVersion?: string;
  generatedAt?: string;
}

export interface PantryClassifyInput {
  rawName: string;
  normalizedName: string;
  category?: string;
  brand?: string;
  qty?: number;
}

export interface PantryClassifyResult {
  items: PantryItemInsight[];
  /** Raw per-item JSON exactly as parsed from the model response. */
  rawItems?: unknown[];
  modelName?: string;
  promptVersion?: string;
}

export interface AIProvider {
  name: string;
  extractItems(image: Buffer, mimeType: string): Promise<unknown>;
  enrichProduct(input: {
    name: string;
    brand?: string;
    form?: string;
  }): Promise<ProductEnrichmentLike>;
  classifyPantryItems(items: PantryClassifyInput[]): Promise<PantryClassifyResult>;
  /** Split a dictated shopping list into product names. No list decisions. */
  parseShoppingList(text: string): Promise<SpokenListModel>;
  /**
   * Speech-to-text seam. The app currently dictates in the browser
   * (Web Speech API); implement this when Meta audio transcription is
   * confirmed, then point the client at POST /api/ai/transcribe.
   */
  transcribe?(audio: Buffer, mimeType: string): Promise<string>;
}

export class StubAIProvider implements AIProvider {
  name = "stub";
  async extractItems(): Promise<never> {
    throw new Error("AI extraction not configured (MODEL_API_KEY / dev.meta.ai endpoint missing)");
  }
  async enrichProduct(): Promise<never> {
    throw new Error("AI enrichment not configured");
  }
  async classifyPantryItems(): Promise<never> {
    throw new Error("AI pantry classification not configured");
  }
  async parseShoppingList(): Promise<never> {
    throw new Error("AI list parsing not configured");
  }
  async transcribe(): Promise<never> {
    throw new Error("Audio transcription not configured");
  }
}

import { MetaProvider } from "./meta.js";

export function getAIProvider(): AIProvider {
  const meta = new MetaProvider();
  if (meta.configured) return meta;
  return new StubAIProvider();
}

export { MetaProvider };
