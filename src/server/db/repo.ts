import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./client.js";
import {
  corrections,
  households,
  listItems,
  productInsights,
  productKnowledge,
  products,
  purchases,
  scans,
  shoppingLists,
} from "./schema.js";
import type { ProductEnrichment, ShelfLifeClass } from "../../shared/schemas.js";
import {
  productEnrichmentSchema,
  shelfLifeClassSchema,
} from "../../shared/schemas.js";
import { knowledgeKey, normalizeName, slugify } from "../domain/normalize.js";
import { computeState } from "../domain/rhythm.js";
import { unitPrice } from "../domain/units.js";
import type { MoneyPurchase } from "../domain/money.js";
import type { SuggestionProduct } from "../domain/suggestions.js";

export async function getHouseholdByDevice(deviceId: string) {
  const db = await getDb();
  const rows = await db.select().from(households).where(eq(households.deviceId, deviceId));
  return rows[0] ?? null;
}

export async function upsertKnowledge(key: string, enrichment: ProductEnrichment) {
  const parsed = productEnrichmentSchema.parse(enrichment);
  const db = await getDb();
  const existing = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.key, key));
  if (existing[0]) {
    await db
      .update(productKnowledge)
      .set({ enrichment: parsed, updatedAt: new Date() })
      .where(eq(productKnowledge.key, key));
    return existing[0];
  }
  const row = {
    id: randomUUID(),
    key,
    enrichment: parsed,
    modelName: parsed.modelName ?? "fixture",
    promptVersion: parsed.promptVersion ?? "v0",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(productKnowledge).values(row);
  return row;
}

export async function getOrCreateProduct(
  householdId: string,
  name: string,
  opts: { brand?: string; form?: string; icon?: string } = {},
) {
  const db = await getDb();
  const norm = normalizeName(name);
  const existing = await db
    .select()
    .from(products)
    .where(and(eq(products.householdId, householdId), eq(products.catalogKey, norm)));
  if (existing[0]) return existing[0];
  const key = knowledgeKey(name, opts.brand, opts.form);
  const know = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.key, key));
  const shelf = (know[0]?.enrichment as ProductEnrichment | undefined)?.shelfLifeClass ?? "unknown";
  const row = {
    id: randomUUID(),
    householdId,
    catalogKey: norm,
    knowledgeKey: know[0] ? key : null,
    name,
    shelfLifeClass: shelf as string,
    icon: opts.icon ?? slugify(name),
    muted: false,
    createdAt: new Date(),
  };
  await db.insert(products).values(row);
  return row;
}

export interface PurchaseInput {
  productId: string;
  householdId: string;
  purchasedAt: Date;
  qty?: number;
  packQty?: number;
  packUnit?: string;
  totalPrice?: number;
  brand?: string;
  store?: string;
  variant?: string;
  scanId?: string;
}

export async function addPurchase(input: PurchaseInput) {
  const db = await getDb();
  const qty = input.qty ?? 1;
  const up = unitPrice(input.totalPrice, qty, input.packQty, input.packUnit);
  const row = {
    id: randomUUID(),
    householdId: input.householdId,
    productId: input.productId,
    purchasedAt: input.purchasedAt,
    qty: String(qty),
    packQty: input.packQty !== undefined ? String(input.packQty) : null,
    packUnit: input.packUnit ?? null,
    unitPrice: up ? String(up.perUnit) : null,
    totalPrice: input.totalPrice !== undefined ? String(input.totalPrice) : null,
    brand: input.brand ?? null,
    store: input.store ?? null,
    variant: input.variant ?? null,
    scanId: input.scanId ?? null,
    createdAt: new Date(),
  };
  await db.insert(purchases).values(row);
  return row;
}

export type ProductRow = typeof products.$inferSelect;
export type PurchaseRow = typeof purchases.$inferSelect;

/** Load a product with purchases + corrections + enrichment → SuggestionProduct. */
export async function loadProductView(
  householdId: string,
  product: ProductRow,
  now = new Date(),
): Promise<SuggestionProduct> {
  const db = await getDb();
  const purchRows = await db
    .select()
    .from(purchases)
    .where(
      and(eq(purchases.householdId, householdId), eq(purchases.productId, product.id)),
    )
    .orderBy(desc(purchases.purchasedAt));

  const corrRows = await db
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.householdId, householdId),
        eq(corrections.productId, product.id),
      ),
    )
    .orderBy(desc(corrections.createdAt));

  let know: ProductEnrichment | null = null;
  const keys = [
    product.knowledgeKey,
    knowledgeKey(product.name), // fallback: shared cache by plain name
  ].filter((k): k is string => !!k);
  for (const k of keys) {
    const krows = await db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.key, k));
    if (krows[0]) {
      know = krows[0].enrichment as ProductEnrichment;
      break;
    }
  }

  const lastDate = purchRows.length > 0 ? new Date(purchRows[0].purchasedAt) : null;
  const imOutActive =
    corrRows.some((c) => c.type === "im_out") &&
    (corrRows.find((c) => c.type === "im_out")!.createdAt > (lastDate ?? new Date(0)));

  const state = computeState({
    purchases: purchRows.map((p) => ({ purchasedAt: new Date(p.purchasedAt) })),
    defaultIntervalDays: know?.typicalIntervalDays ?? 30,
    householdSize: 2, // patched by caller when known
    shelfLifeClass: (product.shelfLifeClass as SuggestionProduct["shelfLifeClass"]) ?? "unknown",
    imOutActive,
    muted: product.muted,
    now,
  });

  const moneyPurchases: MoneyPurchase[] = purchRows.map((p) => ({
    purchasedAt: new Date(p.purchasedAt),
    qty: Number(p.qty),
    packQty: p.packQty ? Number(p.packQty) : null,
    packUnit: p.packUnit,
    totalPrice: p.totalPrice ? Number(p.totalPrice) : null,
    brand: p.brand,
  }));

  const lastTotal = purchRows[0]?.totalPrice ? Number(purchRows[0].totalPrice) : null;

  return {
    productId: product.id,
    rawName: product.name,
    shelfLifeClass: (product.shelfLifeClass ?? "unknown") as SuggestionProduct["shelfLifeClass"],
    muted: product.muted,
    state,
    enrichment: know,
    moneyPurchases,
    lastTotalPrice: lastTotal,
  };
}

export async function loadAllProductViews(
  householdId: string,
  householdSize: number,
  now = new Date(),
): Promise<SuggestionProduct[]> {
  const db = await getDb();
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, householdId));
  const views = await Promise.all(prows.map((p) => loadProductView(householdId, p, now)));
  // Patch household size into rhythm (loadProductView defaults to 2).
  for (const v of views) {
    const st = computeState({
      purchases: v.moneyPurchases.map((m) => ({ purchasedAt: m.purchasedAt })),
      defaultIntervalDays: v.enrichment?.typicalIntervalDays ?? 30,
      householdSize,
      shelfLifeClass: v.shelfLifeClass,
      imOutActive: v.state.imOut,
      muted: v.muted,
      now,
    });
    v.state = st;
  }
  return views;
}

export interface PantryScheduleSource {
  productId: string;
  name: string;
  shelfLifeClass: ShelfLifeClass;
  /** Latest purchase = the date the item entered the pantry. */
  lastPurchasedAt: Date | null;
  muted: boolean;
}

/** Minimal product data needed by the pantry → list schedule (no rhythm). */
export async function loadPantryScheduleSources(
  householdId: string,
): Promise<PantryScheduleSource[]> {
  const db = await getDb();
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, householdId));
  const purchaseRows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.householdId, householdId))
    .orderBy(desc(purchases.purchasedAt));

  const latest = new Map<string, Date>();
  for (const row of purchaseRows) {
    if (!latest.has(row.productId)) {
      latest.set(row.productId, new Date(row.purchasedAt));
    }
  }

  // Fall back to cached enrichment when the product row has no class yet:
  // products created before their knowledge entry existed stay "unknown"
  // until enrichment or classification fills them.
  const keys = [
    ...new Set(
      prows
        .flatMap((product) => [product.knowledgeKey, knowledgeKey(product.name)])
        .filter((key): key is string => !!key),
    ),
  ];
  const knowledgeRows =
    keys.length > 0
      ? await db
          .select()
          .from(productKnowledge)
          .where(inArray(productKnowledge.key, keys))
      : [];
  const classByKey = new Map<string, ShelfLifeClass>();
  for (const row of knowledgeRows) {
    const cls = shelfLifeClassSchema.safeParse(
      (row.enrichment as ProductEnrichment | null)?.shelfLifeClass,
    );
    if (cls.success) classByKey.set(row.key, cls.data);
  }
  const classFor = (product: (typeof prows)[number]): ShelfLifeClass => {
    const stored = shelfLifeClassSchema.safeParse(product.shelfLifeClass);
    if (stored.success && stored.data !== "unknown") return stored.data;
    const cached =
      (product.knowledgeKey ? classByKey.get(product.knowledgeKey) : undefined) ??
      classByKey.get(knowledgeKey(product.name));
    return cached ?? "unknown";
  };

  return prows.map((product) => ({
    productId: product.id,
    name: product.name,
    shelfLifeClass: classFor(product),
    lastPurchasedAt: latest.get(product.id) ?? null,
    muted: product.muted,
  }));
}

export interface ProductInsightInput {
  householdId: string;
  productId: string;
  scanId?: string | null;
  category?: string | null;
  savesMoney: boolean;
  healthy: boolean;
  sustainable: boolean;
  swapName?: string | null;
  swapSavesMoney?: boolean | null;
  swapHealthy?: boolean | null;
  swapSustainable?: boolean | null;
  assessment?: unknown;
  source?: string;
  modelName?: string | null;
  promptVersion?: string | null;
  classificationError?: string | null;
  raw?: unknown;
}

/** Replace the current insight for a product (latest scan wins). */
export async function saveProductInsight(input: ProductInsightInput) {
  const db = await getDb();
  await db
    .delete(productInsights)
    .where(
      and(
        eq(productInsights.householdId, input.householdId),
        eq(productInsights.productId, input.productId),
      ),
    );
  const row = {
    id: randomUUID(),
    householdId: input.householdId,
    productId: input.productId,
    scanId: input.scanId ?? null,
    category: input.category ?? null,
    savesMoney: input.savesMoney,
    healthy: input.healthy,
    sustainable: input.sustainable,
    swapName: input.swapName ?? null,
    swapSavesMoney: input.swapSavesMoney ?? null,
    swapHealthy: input.swapHealthy ?? null,
    swapSustainable: input.swapSustainable ?? null,
    assessment: input.assessment ?? null,
    source: input.source ?? "scan",
    modelName: input.modelName ?? null,
    promptVersion: input.promptVersion ?? null,
    classificationError: input.classificationError ?? null,
    raw: input.raw ?? null,
    createdAt: new Date(),
  };
  await db.insert(productInsights).values(row);
  return row;
}

export type ProductInsightRow = typeof productInsights.$inferSelect;

/** Latest insight per product for a household. */
export async function loadLatestProductInsights(
  householdId: string,
): Promise<ProductInsightRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(productInsights)
    .where(eq(productInsights.householdId, householdId))
    .orderBy(desc(productInsights.createdAt));
  const byProduct = new Map<string, ProductInsightRow>();
  for (const row of rows) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, row);
  }
  return [...byProduct.values()];
}

export { scans, shoppingLists, listItems, corrections, products, purchases, households, productInsights };
