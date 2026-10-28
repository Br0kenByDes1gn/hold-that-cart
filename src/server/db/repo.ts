import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./client.js";
import {
  corrections,
  households,
  listItems,
  productKnowledge,
  products,
  purchases,
  scans,
  shoppingLists,
} from "./schema.js";
import type { ProductEnrichment } from "../../shared/schemas.js";
import { productEnrichmentSchema } from "../../shared/schemas.js";
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
  if (product.knowledgeKey) {
    const krows = await db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.key, product.knowledgeKey));
    if (krows[0]) know = krows[0].enrichment as ProductEnrichment;
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

export { scans, shoppingLists, listItems, corrections, products, purchases, households };
