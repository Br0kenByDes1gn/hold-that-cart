import { z } from "zod";

// ── Enums ──────────────────────────────────────────────

export const shelfLifeClassSchema = z.enum([
  "perishable",
  "staple",
  "household",
  "durable",
  "unknown",
]);
export type ShelfLifeClass = z.infer<typeof shelfLifeClassSchema>;

export const swapTypeSchema = z.enum([
  "loose_instead_of_packaged",
  "refill",
  "store_brand",
  "larger_pack",
  "tap_instead_of_bottled",
  "concentrate",
  "reusable_instead_of_disposable",
  "wholegrain",
  "plant_based",
  "other",
]);
export type SwapType = z.infer<typeof swapTypeSchema>;

export const scanKindSchema = z.enum(["receipt", "list", "cart", "unknown"]);
export type ScanKind = z.infer<typeof scanKindSchema>;

export const suggestionActionSchema = z.enum(["BUY", "SWAP", "SKIP"]);
export type SuggestionAction = z.infer<typeof suggestionActionSchema>;

export const correctionTypeSchema = z.enum(["im_out", "never_remind"]);
export type CorrectionType = z.infer<typeof correctionTypeSchema>;

export const listItemDecisionSchema = z.enum(["buy", "skip", "needs_it"]);
export type ListItemDecision = z.infer<typeof listItemDecisionSchema>;

// ── Extraction (what the vision model / fixtures produce) ──

export const extractedItemSchema = z.object({
  rawName: z.string().min(1),
  normalizedName: z.string().min(1),
  brand: z.string().optional(),
  qty: z.number().positive().default(1),
  packQty: z.number().positive().optional(),
  packUnit: z.string().optional(),
  unit: z.string().optional(),
  price: z.number().nonnegative().optional(), // total line price, as printed
  store: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

// ── Enrichment (model-provided knowledge, cached in product_knowledge) ──
// NOTE: no price fields by design — the model must never invent prices.

export const sustainabilityFactorSchema = z.object({
  factor: z.enum(["packaging", "carbon", "water", "animal_welfare", "durability"]),
  rating: z.number().int().min(1).max(5),
  note: z.string().max(280),
});

export const productAlternativeSchema = z.object({
  title: z.string().min(1), // type-level only: "loose instead of packaged", never brand/SKU
  swapType: swapTypeSchema,
  healthDelta: z.number().int().min(-4).max(4).default(0),
  sustainabilityDelta: z.number().int().min(-4).max(4).default(0),
  rationale: z.string().max(280),
  confidence: z.number().min(0).max(1),
});

export const productEnrichmentSchema = z.object({
  category: z.string().min(1),
  shelfLifeClass: shelfLifeClassSchema,
  typicalIntervalDays: z.number().int().positive(),
  health: z.object({
    score: z.number().int().min(1).max(5).nullable(),
    confidence: z.number().min(0).max(1),
    basis: z.array(z.string()).default([]),
  }),
  sustainability: z.object({
    score: z.number().int().min(1).max(5).nullable(),
    confidence: z.number().min(0).max(1),
    factors: z.array(sustainabilityFactorSchema).default([]),
  }),
  alternatives: z.array(productAlternativeSchema).default([]),
  modelName: z.string().optional(),
  promptVersion: z.string().optional(),
  generatedAt: z.string().optional(),
});
export type ProductEnrichment = z.infer<typeof productEnrichmentSchema>;

// ── Suggestions (engine output) ──

export const tagKindSchema = z.enum(["money", "health", "planet"]);
export type TagKind = z.infer<typeof tagKindSchema>;

export const suggestionSchema = z.object({
  productId: z.string().uuid().nullable(),
  rawName: z.string(),
  action: suggestionActionSchema,
  reasonCodes: z.array(z.string()),
  tags: z.array(tagKindSchema),
  swapType: swapTypeSchema.nullable().default(null),
  swapTitle: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  evidence: z
    .object({
      lastPurchasedAt: z.string().nullable(),
      daysSince: z.number().nullable(),
      typicalIntervalDays: z.number().nullable(),
      lastPrice: z.number().nullable(),
      expectedSaving: z.number().nullable(),
    })
    .default({
      lastPurchasedAt: null,
      daysSince: null,
      typicalIntervalDays: null,
      lastPrice: null,
      expectedSaving: null,
    }),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

// ── API payloads ──

export const householdUpsertSchema = z.object({
  deviceId: z.string().min(1),
  householdSize: z.number().int().min(1).max(20).optional(),
  accountType: z.enum(["household", "business"]).optional(),
});
export const householdPatchSchema = z.object({
  householdSize: z.number().int().min(1).max(20).optional(),
  accountType: z.enum(["household", "business"]).optional(),
  email: z.string().email().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
});

export const scanCreateSchema = z.object({
  kind: scanKindSchema.default("unknown"),
  items: z.array(extractedItemSchema).min(1),
});

export const scanConfirmItemSchema = z.object({
  rawName: z.string().min(1),
  /** Canonical generic type ("peanut oil") — product identity. Brand is a variant, never identity. */
  normalizedName: z.string().min(1).optional(),
  productId: z.string().uuid().nullable().default(null),
  qty: z.number().positive().default(1),
  packQty: z.number().positive().optional(),
  packUnit: z.string().optional(),
  price: z.number().nonnegative().optional(),
  brand: z.string().optional(),
  purchasedAt: z.string().datetime().optional(),
});

export const scanConfirmSchema = z.object({
  kind: scanKindSchema,
  items: z.array(scanConfirmItemSchema),
  purchasedAt: z.string().datetime().optional(),
});

export const manualPurchaseSchema = z.object({
  name: z.string().min(1),
  /** Canonical generic type; defaults to `name` when omitted. */
  normalizedName: z.string().min(1).optional(),
  brand: z.string().optional(),
  qty: z.number().positive().default(1),
  packQty: z.number().positive().optional(),
  packUnit: z.string().optional(),
  totalPrice: z.number().nonnegative().optional(),
  purchasedAt: z.string().datetime().optional(),
  store: z.string().optional(),
});

export const listCreateSchema = z.object({
  title: z.string().min(1).default("Shopping list"),
  source: z.enum(["auto", "manual", "scan"]).default("manual"),
});

export const listItemCreateSchema = z.object({
  productId: z.string().uuid().nullable().default(null),
  rawName: z.string().min(1),
  decision: listItemDecisionSchema.optional(),
});

export const listItemPatchSchema = z.object({
  checked: z.boolean().optional(),
  decision: listItemDecisionSchema.optional(),
});

export const correctionSchema = z.object({
  type: correctionTypeSchema,
});
