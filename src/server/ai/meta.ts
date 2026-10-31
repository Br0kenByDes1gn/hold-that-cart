import {
  extractedItemSchema,
  pantryInsightResponseSchema,
  productEnrichmentSchema,
} from "../../shared/schemas.js";
import { normalizeName } from "../domain/normalize.js";
import { ITEM_CATEGORIES } from "../../shared/itemCategories.js";
import type {
  AIProvider,
  PantryClassifyInput,
  PantryClassifyResult,
  ProductEnrichmentLike,
} from "./provider.js";

// ── Prompt builders (exported for tests / tuning) ──

export const EXTRACTION_SYSTEM = `You extract grocery data from a photo for a pantry-tracking app.
The photo shows ONE of: a shopping receipt, a shopping list (paper/handwritten/screenshot), or a shopping cart with groceries.
Output JSON ONLY, no markdown, no commentary, with this shape:
{"kind": "receipt" | "list" | "cart" | "unknown", "items": [{"rawName": string, "normalizedName": string, "category": string, "brand": string | null, "qty": number, "packQty": number | null, "packUnit": string | null, "unit": string | null, "price": number | null, "store": string | null, "confidence": number}]}
Rules:
- receipt: transcribe EVERY line item. price = total line price as printed. packQty/packUnit from the description when shown (e.g. "500 g" -> 500, "g"). store = merchant name if visible.
- list: one entry per list line. No prices (use null) unless a price is written on the list. qty defaults to 1.
- cart: only items you can actually identify, top layer. price is always null. confidence reflects occlusion (0.4-0.7 typical).
- normalizedName: lowercase generic product name in English ("olive oil", NOT "Borges Olio Evo 500ml").
- category: choose exactly ONE from this list: ${ITEM_CATEGORIES.join(", ")}. Base it on the product name/type. Examples: any meat product -> meat; wine/beer/whiskey -> alcohol; pet food/treats -> pet; bread/buns/bagels -> bread; milk/cheese/butter -> dairy. Use "other" when unsure. Never invent a category outside the list.
- Keep the printed product words, but drop brand names, sizes, percentages, tax letters, HSN/SKU codes and store names.
- Expand receipt abbreviations into readable words ("BRW" -> "brown", "GRANU" -> "granulated", "CHOC" -> "chocolate", "OG" -> "organic").
- Use the singular form for countable nouns ("blueberry", not "blueberries").
- One entry per printed line. Never merge or split receipt lines, even if two lines look similar.
- Omit the brand when unsure (null).
- Do not invent descriptors that are not printed. NEVER invent prices, brands, or items that are not visible.
- Keep dates, store addresses, card numbers and tax/total lines out of items.`;

export function extractionUser(kindHint?: string): string {
  return kindHint && kindHint !== "unknown"
    ? `This photo is a ${kindHint}. Extract it.`
    : "Detect what this photo shows (receipt, list, or cart) and extract it.";
}

export const ENRICHMENT_SYSTEM = `You provide grocery product knowledge for a sustainability app.
Output JSON ONLY, no markdown, with this shape:
{"category": string, "shelfLifeClass": "perishable" | "staple" | "household" | "durable", "typicalIntervalDays": number, "health": {"score": 1-5 | null, "confidence": 0-1, "basis": [string]}, "sustainability": {"score": 1-5 | null, "confidence": 0-1, "factors": [{"factor": "packaging" | "carbon" | "water" | "animal_welfare" | "durability", "rating": 1-5, "note": string}]}, "alternatives": [{"title": string, "swapType": "loose_instead_of_packaged" | "refill" | "store_brand" | "larger_pack" | "tap_instead_of_bottled" | "concentrate" | "reusable_instead_of_disposable" | "wholegrain" | "plant_based" | "other", "healthDelta": -4-4, "sustainabilityDelta": -4-4, "rationale": string, "confidence": 0-1}]}
Rules:
- shelfLifeClass: perishable (days: milk, bread), staple (weeks: rice, oil), household (1-3 months: detergent), durable (years: bottles, containers).
- typicalIntervalDays: typical days between purchases for a 2-person household.
- alternatives are product TYPES/FORMS (loose, refill, store brand, larger pack) — NEVER brands, SKUs, or store names.
- NEVER include prices, savings, or cost figures anywhere. Scores must be your honest estimate with confidence; use null when unknown.
- Max 3 alternatives, ordered by impact.`;

export function enrichmentUser(name: string, brand?: string, form?: string): string {
  let s = `Product: ${name}`;
  if (brand) s += ` | Brand: ${brand}`;
  if (form) s += ` | Form/packaging: ${form}`;
  return s + "\nReturn the knowledge JSON.";
}

export const PANTRY_CLASSIFY_SYSTEM = `You classify grocery items already extracted from a receipt for a pantry app.
Output JSON ONLY, no markdown, no commentary, with this shape:
{"items":[{"normalizedName":string,"savesMoney":verdict,"healthy":verdict,"sustainable":verdict,"swap":false | {"name":string,"savesMoney":verdict,"healthy":verdict,"sustainable":verdict}}]}
Each verdict is: {"verdict": true | false | null, "confidence": number 0-1, "reason": string}
Rules:
- Only return items from the input, one per input item, using the same normalizedName.
- savesMoney: likely cheaper than a typical alternative. Be conservative.
- healthy: generally healthier for a person. Be conservative and do not give medical advice.
- sustainable: lower environmental impact. Be conservative.
- Use verdict null when the item name does not provide enough information. Confidence must reflect how certain you are from the name alone.
- reason: one short sentence grounded only in the product name/category. Do not claim certifications, origin, nutrition facts, or packaging you cannot know.
- swap: a generic product type or form that is clearly better than the original because it has MORE confidently true verdicts among savesMoney, healthy, sustainable. Use false when there is no clearly better option.
- The swap must never be a brand, SKU, store name, or price. It is a product type/form such as "store-brand version", "larger pack", "refill", "wholegrain version", or "plant-based alternative".
- Never invent items that are not in the input. Never include prices or savings figures.`;

export function pantryClassifyUser(items: PantryClassifyInput[]): string {
  return `Classify these items:\n${JSON.stringify(
    items.map((item) => ({
      rawName: item.rawName,
      normalizedName: item.normalizedName,
      brand: item.brand ?? null,
      qty: item.qty ?? 1,
    })),
  )}\nReturn the pantry insight JSON.`;
}

// ── Meta Model API client (OpenAI-compatible Chat Completions) ──

const FORBIDDEN_ENRICH_KEYS = ["price", "prices", "savings", "saving", "cost", "amount", "eur", "usd"];

/** The model must never return prices — fail loudly instead of storing them. */
export function assertNoPrices(raw: unknown): void {
  const seen: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN_ENRICH_KEYS.includes(k.toLowerCase())) seen.push(k);
        walk(val);
      }
    }
  };
  walk(raw);
  if (seen.length > 0) throw new Error(`enrichment must not contain prices (saw: ${seen.join(", ")})`);
}

interface ChatMessage {
  role: "system" | "user";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface ChatMetrics {
  maxTokens: number;
  requestBytes: number;
  promptBytes: number;
  responseBytes: number;
  apiResponseBytes: number;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
  durationMs: number;
  finishReason: string | null;
  ok: boolean;
  error?: string;
}

interface ChatResult {
  content: string;
  metrics: ChatMetrics;
}

interface ChatLogExtra {
  items?: number;
  imageBytes?: number;
  tokensPerItem?: number;
}

export class MetaProvider implements AIProvider {
  name = "meta-muse";
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private fetchFn: typeof fetch;

  constructor(opts: { baseUrl?: string; apiKey?: string; model?: string; fetchFn?: typeof fetch } = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
    this.apiKey = opts.apiKey ?? process.env.MODEL_API_KEY ?? "";
    this.model = opts.model ?? process.env.META_MODEL ?? "muse-spark-1.3";
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  private logUsage(operation: string, metrics: ChatMetrics, extra: ChatLogExtra = {}) {
    const items = extra.items;
    const tokensPerItem =
      extra.tokensPerItem ??
      (items && items > 0 && metrics.totalTokens !== null
        ? Math.round((metrics.totalTokens / items) * 100) / 100
        : null);
    console.info(
      "[ai-usage]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        operation,
        model: this.model,
        ...(items !== undefined ? { items } : {}),
        ...(extra.imageBytes !== undefined ? { imageBytes: extra.imageBytes } : {}),
        ...(tokensPerItem !== null ? { tokensPerItem } : {}),
        maxTokens: metrics.maxTokens,
        requestBytes: metrics.requestBytes,
        promptBytes: metrics.promptBytes,
        responseBytes: metrics.responseBytes,
        apiResponseBytes: metrics.apiResponseBytes,
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        reasoningTokens: metrics.reasoningTokens,
        cachedTokens: metrics.cachedTokens,
        totalTokens: metrics.totalTokens,
        durationMs: metrics.durationMs,
        finishReason: metrics.finishReason,
        ok: metrics.ok,
        ...(metrics.error ? { error: metrics.error } : {}),
      }),
    );
  }

  private async chat(
    messages: ChatMessage[],
    maxTokens: number,
    operation: string,
  ): Promise<ChatResult> {
    if (!this.configured) throw new Error("MODEL_API_KEY is not set");
    // NOTE: Muse is a reasoning model — reasoning tokens count against
    // max_tokens, so budgets must be generous even for short outputs.
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    });
    const requestBytes = Buffer.byteLength(body);
    const promptBytes = Buffer.byteLength(JSON.stringify(messages));
    const started = Date.now();

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body,
      });
    } catch (e: any) {
      const error = String(e?.message ?? e).slice(0, 300);
      this.logUsage(operation, {
        maxTokens,
        requestBytes,
        promptBytes,
        responseBytes: 0,
        apiResponseBytes: 0,
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        cachedTokens: null,
        totalTokens: null,
        durationMs: Date.now() - started,
        finishReason: null,
        ok: false,
        error,
      });
      throw e;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = `Meta API ${res.status}: ${text.slice(0, 300)}`;
      this.logUsage(operation, {
        maxTokens,
        requestBytes,
        promptBytes,
        responseBytes: Buffer.byteLength(text),
        apiResponseBytes: Buffer.byteLength(text),
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        cachedTokens: null,
        totalTokens: null,
        durationMs: Date.now() - started,
        finishReason: null,
        ok: false,
        error,
      });
      throw new Error(error);
    }

    const json = (await res.json()) as any;
    const finishReason = json?.choices?.[0]?.finish_reason ?? null;
    const rawContent = json?.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
              .join("")
          : "";
    const usage = json?.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? null;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? null;
    const totalTokens =
      usage.total_tokens ??
      (typeof promptTokens === "number" && typeof completionTokens === "number"
        ? promptTokens + completionTokens
        : null);
    const reasoningTokens =
      usage.completion_tokens_details?.reasoning_tokens ??
      usage.output_tokens_details?.reasoning_tokens ??
      null;
    const cachedTokens =
      usage.prompt_tokens_details?.cached_tokens ??
      usage.input_tokens_details?.cached_tokens ??
      null;
    const metrics: ChatMetrics = {
      maxTokens,
      requestBytes,
      promptBytes,
      responseBytes: Buffer.byteLength(content),
      apiResponseBytes: Buffer.byteLength(JSON.stringify(json)),
      promptTokens,
      completionTokens,
      reasoningTokens,
      cachedTokens,
      totalTokens,
      durationMs: Date.now() - started,
      finishReason,
      ok: true,
    };

    if (finishReason === "length") {
      const error = `model response truncated (max_tokens=${maxTokens}); raise the budget for long receipts`;
      this.logUsage(operation, { ...metrics, ok: false, error });
      throw new Error(error);
    }
    if (!content) {
      const error = "empty model response";
      this.logUsage(operation, { ...metrics, ok: false, error });
      throw new Error(error);
    }
    return { content, metrics };
  }

  async extractItems(image: Buffer, mimeType = "image/jpeg", kindHint?: string) {
    const b64 = image.toString("base64");
    const { content, metrics } = await this.chat(
      [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: extractionUser(kindHint) },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
          ],
        },
      ],
      // Long receipts (25+ lines) need headroom: reasoning tokens count against
      // max_tokens, and truncation yields invalid JSON.
      Number(process.env.META_MAX_TOKENS ?? 16000),
      "extractItems",
    );
    const parsed = JSON.parse(content);
    const kind = parsed.kind ?? "unknown";
    const items = Array.isArray(parsed.items) ? parsed.items : parsed;
    const clean = (Array.isArray(items) ? items : []).map((it: any) => ({
      ...it,
      brand: it.brand ?? undefined,
      packQty: it.packQty ?? undefined,
      packUnit: it.packUnit ?? undefined,
      unit: it.unit ?? undefined,
      price: it.price ?? undefined,
      store: it.store ?? undefined,
    }));
    const validated = clean.map((it: unknown) => extractedItemSchema.parse(it));
    this.logUsage("extractItems", metrics, {
      items: validated.length,
      imageBytes: image.length,
    });
    return { kind, items: validated };
  }

  async enrichProduct(input: { name: string; brand?: string; form?: string }): Promise<ProductEnrichmentLike> {
    const { content, metrics } = await this.chat(
      [
        { role: "system", content: ENRICHMENT_SYSTEM },
        { role: "user", content: enrichmentUser(input.name, input.brand, input.form) },
      ],
      2500,
      "enrichProduct",
    );
    const raw = JSON.parse(content);
    assertNoPrices(raw);
    const parsed = productEnrichmentSchema
      .omit({ modelName: true, promptVersion: true, generatedAt: true })
      .parse(raw);
    this.logUsage("enrichProduct", metrics, { items: 1 });
    return {
      ...parsed,
      modelName: this.model,
      promptVersion: "v1",
      generatedAt: new Date().toISOString(),
    };
  }

  async classifyPantryItems(items: PantryClassifyInput[]): Promise<PantryClassifyResult> {
    const { content, metrics } = await this.chat(
      [
        { role: "system", content: PANTRY_CLASSIFY_SYSTEM },
        { role: "user", content: pantryClassifyUser(items) },
      ],
      // Muse Spark 1.3 supports up to 131,072 output tokens. The model still
      // stops naturally; this is only the truncation ceiling.
      131_072,
      "classifyPantryItems",
    );
    const raw = JSON.parse(content);
    assertNoPrices(raw);
    const parsed = pantryInsightResponseSchema.parse(raw);

    const allowed = new Set(
      items.map((item) => normalizeName(item.normalizedName || item.rawName)),
    );
    const seen = new Set<string>();
    const filtered = parsed.items.filter((item) => {
      const key = normalizeName(item.normalizedName);
      if (!allowed.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    this.logUsage("classifyPantryItems", metrics, { items: items.length });
    return {
      items: filtered,
      rawItems: Array.isArray((raw as { items?: unknown[] }).items)
        ? (raw as { items: unknown[] }).items
        : [],
      modelName: this.model,
      promptVersion: "pantry-v1",
    };
  }
}
