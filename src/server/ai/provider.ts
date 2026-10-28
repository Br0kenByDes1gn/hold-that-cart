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

export interface AIProvider {
  name: string;
  extractItems(image: Buffer, mimeType: string): Promise<unknown>;
  enrichProduct(input: {
    name: string;
    brand?: string;
    form?: string;
  }): Promise<ProductEnrichmentLike>;
}

export class StubAIProvider implements AIProvider {
  name = "stub";
  async extractItems(): Promise<never> {
    throw new Error("AI extraction not configured (MODEL_API_KEY / dev.meta.ai endpoint missing)");
  }
  async enrichProduct(): Promise<never> {
    throw new Error("AI enrichment not configured");
  }
}

import { MetaProvider } from "./meta.js";

export function getAIProvider(): AIProvider {
  const meta = new MetaProvider();
  if (meta.configured) return meta;
  return new StubAIProvider();
}

export { MetaProvider };
