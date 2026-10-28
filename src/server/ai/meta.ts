import { extractedItemSchema, productEnrichmentSchema } from "../../shared/schemas.js";
import type { AIProvider, ProductEnrichmentLike } from "./provider.js";

// ── Prompt builders (exported for tests / tuning) ──

export const EXTRACTION_SYSTEM = `You extract grocery data from a photo for a pantry-tracking app.
The photo shows ONE of: a shopping receipt, a shopping list (paper/handwritten/screenshot), or a shopping cart with groceries.
Output JSON ONLY, no markdown, no commentary, with this shape:
{"kind": "receipt" | "list" | "cart" | "unknown", "items": [{"rawName": string, "normalizedName": string, "brand": string | null, "qty": number, "packQty": number | null, "packUnit": string | null, "unit": string | null, "price": number | null, "store": string | null, "confidence": number}]}
Rules:
- receipt: transcribe EVERY line item. price = total line price as printed. packQty/packUnit from the description when shown (e.g. "500 g" -> 500, "g"). store = merchant name if visible.
- list: one entry per list line. No prices (use null) unless a price is written on the list. qty defaults to 1.
- cart: only items you can actually identify, top layer. price is always null. confidence reflects occlusion (0.4-0.7 typical).
- normalizedName: lowercase generic product name in English ("olive oil", NOT "Borges Olio Evo 500ml").
- Omit the brand when unsure (null). NEVER invent prices, brands, or items that are not visible.`;

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

  private async chat(messages: ChatMessage[], maxTokens = 4000): Promise<string> {
    if (!this.configured) throw new Error("MODEL_API_KEY is not set");
    // NOTE: Muse is a reasoning model — reasoning tokens count against
    // max_tokens, so budgets must be generous even for short outputs.
    if (!this.configured) throw new Error("MODEL_API_KEY is not set");
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Meta API ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as any;
    const rawContent = json?.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
              .join("")
          : "";
    if (!content) throw new Error("empty model response");
    return content;
  }

  async extractItems(image: Buffer, mimeType = "image/jpeg", kindHint?: string) {
    const b64 = image.toString("base64");
    const content = await this.chat(
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
      4000,
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
    return { kind, items: validated };
  }

  async enrichProduct(input: { name: string; brand?: string; form?: string }): Promise<ProductEnrichmentLike> {
    const content = await this.chat(
      [
        { role: "system", content: ENRICHMENT_SYSTEM },
        { role: "user", content: enrichmentUser(input.name, input.brand, input.form) },
      ],
      2500,
    );
    const raw = JSON.parse(content);
    assertNoPrices(raw);
    const parsed = productEnrichmentSchema
      .omit({ modelName: true, promptVersion: true, generatedAt: true })
      .parse(raw);
    return {
      ...parsed,
      modelName: this.model,
      promptVersion: "v1",
      generatedAt: new Date().toISOString(),
    };
  }
}
