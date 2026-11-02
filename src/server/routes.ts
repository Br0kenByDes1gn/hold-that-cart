import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "./db/client.js";
import {
  addPurchase,
  getHouseholdByDevice,
  getOrCreateProduct,
  loadAllProductViews,
  loadLatestProductInsights,
  loadPantryScheduleSources,
  loadProductView,
  saveProductInsight,
  upsertKnowledge,
} from "./db/repo.js";
import {
  corrections,
  households,
  listItems,
  productInsights,
  products,
  purchases,
  scans,
  shoppingLists,
} from "./db/schema.js";
import {
  correctionSchema,
  listCreateSchema,
  listItemCreateSchema,
  listItemPatchSchema,
  listItemsBulkCreateSchema,
  listParseRequestSchema,
  listUpdateSchema,
  manualPurchaseSchema,
  productEnrichmentSchema,
  scanConfirmSchema,
  scanCreateSchema,
  shelfLifeClassSchema,
} from "../shared/schemas.js";
import type { ListItemCreate } from "../shared/schemas.js";
import { matchProduct } from "./domain/match.js";
import { suggestForProducts } from "./domain/suggestions.js";
import { suggestionsFromViews } from "./domain/listSuggestions.js";
import {
  LIST_REFRESH_DAYS,
  autoAddCandidates,
  buildPantrySchedule,
  nextRefreshAt,
  shouldRefresh,
  type PantryScheduleItem,
} from "./domain/pantrySchedule.js";
import {
  attachPantryMatches,
  fallbackVoiceItems,
  validateSpokenItems,
  type VoiceItem,
} from "./domain/listParse.js";
import {
  DEMO_INSIGHTS,
  DEMO_ITEMS,
  DEMO_PURCHASES,
  demoKnowledgeKey,
} from "./domain/demo.js";
import {
  hasBetterSwap,
  pantrySectionFor,
  pantryTagsFor,
  scoreIsYes,
} from "./domain/pantrySection.js";
import { knowledgeKey, normalizeName } from "./domain/normalize.js";
import { variantStats } from "./domain/money.js";
import { getAIProvider, type PantryClassifyInput } from "./ai/provider.js";
import type { PantryItemInsight } from "../shared/schemas.js";

export const routes = new Hono();

async function household(c: any) {
  const did = c.req.header("X-Device-Id");
  if (!did) return null;
  return getHouseholdByDevice(did);
}

function needHH(c: any, hh: any) {
  if (!hh) return c.json({ error: "unknown device (POST /api/households first)" }, 401);
  return null;
}

interface InsightTarget extends PantryClassifyInput {
  productId: string;
}

/** 0.5 = unknown/neutral; below 0.6 does not count as true. */
function emptyInsight(normalizedName: string): PantryItemInsight {
  return {
    normalizedName,
    savesMoney: 0.5,
    healthy: 0.5,
    sustainable: 0.5,
    swap: false,
  };
}

function scheduleResponseItem(item: PantryScheduleItem, reason: string | null = null) {
  return {
    productId: item.productId,
    name: item.name,
    shelfLifeClass: item.shelfLifeClass,
    intervalDays: item.intervalDays,
    lastAddedAt: item.lastAddedAt?.toISOString() ?? null,
    dueAt: item.dueAt?.toISOString() ?? null,
    daysLeft: item.daysLeft,
    due: item.due,
    muted: item.muted,
    onList: item.onList,
    autoAddedAt: item.autoAddedAt?.toISOString() ?? null,
    reason,
  };
}

/**
 * Run the pantry classification prompt on the final confirmed items, then
 * store one insight per product. Classification failure is non-fatal: items
 * still enter the pantry with conservative false values (→ SKIP).
 */
async function classifyAndStoreInsights(
  householdId: string,
  scanId: string,
  targets: InsightTarget[],
) {
  if (targets.length === 0) {
    return { classified: 0, fallback: 0, error: null as string | null };
  }

  const db = await getDb();
  const byKey = new Map<string, PantryItemInsight>();
  const rawByKey = new Map<string, unknown>();
  let modelName: string | null = null;
  let promptVersion: string | null = null;
  let error: string | null = null;

  if (process.env.PANTRY_CLASSIFY === "off") {
    error = "Pantry classification disabled (PANTRY_CLASSIFY=off)";
  } else {
    try {
      const provider = getAIProvider();
      const result = await provider.classifyPantryItems(
        targets.map(({ productId: _productId, ...item }) => item),
      );
      modelName = result.modelName ?? provider.name;
      promptVersion = result.promptVersion ?? "pantry-v1";
      for (const insight of result.items) {
        byKey.set(normalizeName(insight.normalizedName), insight);
      }
      for (const rawItem of result.rawItems ?? []) {
        if (
          rawItem &&
          typeof rawItem === "object" &&
          typeof (rawItem as { normalizedName?: unknown }).normalizedName === "string"
        ) {
          const key = normalizeName(
            (rawItem as { normalizedName: string }).normalizedName,
          );
          if (!rawByKey.has(key)) rawByKey.set(key, rawItem);
        }
      }
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 200);
    }
  }

  for (const target of targets) {
    const key = normalizeName(target.normalizedName);
    const insight = byKey.get(key) ?? emptyInsight(target.normalizedName);
    const validSwap = hasBetterSwap(insight) ? insight.swap : false;
    await saveProductInsight({
      householdId,
      productId: target.productId,
      scanId,
      category: target.category ?? null,
      savesMoney: scoreIsYes(insight.savesMoney),
      healthy: scoreIsYes(insight.healthy),
      sustainable: scoreIsYes(insight.sustainable),
      swapName: validSwap ? validSwap.name : null,
      swapSavesMoney: validSwap ? scoreIsYes(validSwap.savesMoney) : null,
      swapHealthy: validSwap ? scoreIsYes(validSwap.healthy) : null,
      swapSustainable: validSwap ? scoreIsYes(validSwap.sustainable) : null,
      assessment: insight,
      source: byKey.has(key) ? "scan" : "fallback",
      modelName,
      promptVersion,
      classificationError: byKey.has(key) ? null : error,
      raw: rawByKey.get(key) ?? null,
    });
    // Classify shelf life once from the model when it's unknown; never
    // overwrite a user-edited class.
    if (insight.shelfLifeClass) {
      try {
        await db
          .update(products)
          .set({ shelfLifeClass: insight.shelfLifeClass })
          .where(
            and(
              eq(products.id, target.productId),
              eq(products.householdId, householdId),
              eq(products.shelfLifeClass, "unknown"),
            ),
          );
      } catch {
        // Non-fatal: a malformed enum should never block insight storage.
      }
    }
  }

  return {
    classified: byKey.size,
    fallback: targets.length - byKey.size,
    error,
  };
}

// ── Catalog (autocomplete for manual add) ──
routes.get("/api/catalog", async (c) => {
  const q = (c.req.query("search") ?? "").toLowerCase();
  const items = DEMO_ITEMS.filter((d) => !q || d.name.toLowerCase().includes(q)).map(
    (d) => ({ name: d.name, icon: d.icon, key: demoKnowledgeKey(d.name) }),
  );
  const hh = await household(c);
  let mine: Array<{ name: string; icon: string | null }> = [];
  if (hh) {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.householdId, hh.id));
    mine = rows
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({ name: r.name, icon: r.icon }));
  }
  return c.json({ demo: items, mine });
});

// ── Scans ──
routes.post("/api/scans", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const parsed = scanCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const db = await getDb();
  const id = randomUUID();
  await db.insert(scans).values({
    id,
    householdId: hh!.id,
    kind: parsed.data.kind,
    rawExtraction: parsed.data,
    confirmedAt: null,
    createdAt: new Date(),
  });

  // Match each extracted item against household products.
  const prows = await db.select().from(products).where(eq(products.householdId, hh!.id));
  const matches = parsed.data.items.map((it) => ({
    ...it,
    match: matchProduct(it.normalizedName || it.rawName, prows),
  }));
  return c.json({ id, kind: parsed.data.kind, matches });
});

routes.get("/api/scans/:id", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, c.req.param("id")), eq(scans.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  return c.json(rows[0]);
});

routes.post("/api/scans/:id/confirm", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const srows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, c.req.param("id")), eq(scans.householdId, hh!.id)));
  if (!srows[0]) return c.json({ error: "scan not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = scanConfirmSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const purchasedAt = parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : new Date();
  const listId = c.req.query("listId") ?? null;
  const committed: string[] = [];
  const insightTargets = new Map<string, InsightTarget>();

  if (parsed.data.kind === "receipt") {
    for (const it of parsed.data.items) {
      // Canonical identity: matched product wins; otherwise the generic
      // normalizedName ("peanut oil") — NEVER the raw receipt text, so
      // Brand A / Brand B pool into one product as variants.
      const canonical = it.normalizedName?.trim() || it.rawName;
      const displayName = canonical.charAt(0).toUpperCase() + canonical.slice(1);
      const prod =
        it.productId &&
        (await db.select().from(products).where(eq(products.id, it.productId))).length > 0
          ? (await db.select().from(products).where(eq(products.id, it.productId)))[0]
          : await getOrCreateProduct(hh!.id, displayName, { brand: it.brand });
      await addPurchase({
        productId: prod.id,
        householdId: hh!.id,
        purchasedAt: it.purchasedAt ? new Date(it.purchasedAt) : purchasedAt,
        qty: it.qty,
        packQty: it.packQty,
        packUnit: it.packUnit,
        totalPrice: it.price,
        brand: it.brand,
        variant: it.rawName !== prod.name ? it.rawName : undefined,
        scanId: srows[0].id,
      });
      committed.push(prod.id);
      if (!insightTargets.has(prod.id)) {
        insightTargets.set(prod.id, {
          productId: prod.id,
          rawName: it.rawName,
          normalizedName: canonical,
          category: it.category,
          brand: it.brand,
          qty: it.qty,
        });
      }
    }

    const classification = await classifyAndStoreInsights(
      hh!.id,
      srows[0].id,
      [...insightTargets.values()],
    );
    await db.update(scans).set({ confirmedAt: new Date() }).where(eq(scans.id, srows[0].id));
    return c.json({ ok: true, products: committed, classification });
  } else {
    // list/cart → shopping-list items (new list, or tick existing via ?listId=)
    let targetList = listId;
    if (listId) {
      const lrows = await db
        .select()
        .from(shoppingLists)
        .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.householdId, hh!.id)));
      if (!lrows[0]) return c.json({ error: "list not found" }, 404);
    } else {
      targetList = randomUUID();
      await db.insert(shoppingLists).values({
        id: targetList,
        householdId: hh!.id,
        title: `Scan ${new Date().toISOString().slice(0, 10)}`,
        source: "scan",
        status: "open",
        createdAt: new Date(),
      });
    }
    for (const it of parsed.data.items) {
      await db.insert(listItems).values({
        id: randomUUID(),
        listId: targetList!,
        productId: it.productId,
        rawName: it.rawName,
        checked: false,
        decision: null,
        source: "scan",
      });
    }
    await db
      .update(scans)
      .set({ confirmedAt: new Date() })
      .where(eq(scans.id, srows[0].id));
    return c.json({ ok: true, listId: targetList });
  }
});

// ── Manual purchase ──
routes.post("/api/purchases/manual", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const parsed = manualPurchaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const canonical = parsed.data.normalizedName?.trim() || parsed.data.name;
  const displayName = canonical.charAt(0).toUpperCase() + canonical.slice(1);
  const prod = await getOrCreateProduct(hh!.id, displayName, { brand: parsed.data.brand });
  const row = await addPurchase({
    productId: prod.id,
    householdId: hh!.id,
    purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : new Date(),
    qty: parsed.data.qty,
    packQty: parsed.data.packQty,
    packUnit: parsed.data.packUnit,
    totalPrice: parsed.data.totalPrice,
    brand: parsed.data.brand,
    variant: parsed.data.name !== prod.name ? parsed.data.name : undefined,
    store: parsed.data.store,
  });
  return c.json({ product: prod, purchase: row });
});

// ── Pantry ──
routes.get("/api/pantry", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const views = await loadAllProductViews(hh!.id, hh!.householdSize);
  return c.json({
    products: views.map((v) => ({
      productId: v.productId,
      name: v.rawName,
      shelfLifeClass: v.shelfLifeClass,
      muted: v.muted,
      state: {
        ...v.state,
        lastPurchasedAt: v.state.lastPurchasedAt?.toISOString() ?? null,
      },
      tags: undefined,
    })),
  });
});

/** Pantry view built only from confirmed receipt-scan insights. */
routes.get("/api/pantry/sections", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const insights = await loadLatestProductInsights(hh!.id);
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, hh!.id));
  const byId = new Map(prows.map((product) => [product.id, product]));
  const scanRows = await db
    .select()
    .from(scans)
    .where(eq(scans.householdId, hh!.id));
  const scanById = new Map(scanRows.map((scan) => [scan.id, scan]));

  const grouped: Record<"buy" | "skip" | "swap", any[]> = {
    buy: [],
    skip: [],
    swap: [],
  };

  for (const row of insights) {
    const product = byId.get(row.productId);
    if (!product) continue;

    // Backfill category for scans confirmed before categories were persisted.
    let category = row.category;
    if (!category && row.scanId) {
      const scan = scanById.get(row.scanId);
      const items = ((scan?.rawExtraction as any)?.items ?? []) as any[];
      const productKey = normalizeName(product.name);
      const match = items.find(
        (item) =>
          normalizeName(item.normalizedName ?? item.rawName ?? "") === productKey ||
          normalizeName(item.rawName ?? "") === productKey,
      );
      category = match?.category ?? null;
      if (category) {
        await db
          .update(productInsights)
          .set({ category })
          .where(eq(productInsights.id, row.id));
      }
    }

    const stored = row.assessment as PantryItemInsight | null;
    const storedScore = (value: boolean | null) =>
      value === null ? 0.5 : value ? 1 : 0;
    const hasNumericAssessment =
      stored &&
      typeof stored === "object" &&
      typeof (stored as PantryItemInsight).savesMoney === "number";
    const insight: PantryItemInsight =
      hasNumericAssessment
        ? stored
        : {
            normalizedName: normalizeName(product.name),
            savesMoney: storedScore(row.savesMoney),
            healthy: storedScore(row.healthy),
            sustainable: storedScore(row.sustainable),
            swap: row.swapName
              ? {
                  name: row.swapName,
                  savesMoney: storedScore(row.swapSavesMoney),
                  healthy: storedScore(row.swapHealthy),
                  sustainable: storedScore(row.swapSustainable),
                }
              : false,
          };
    const section = pantrySectionFor(insight);
    const swap = hasBetterSwap(insight) ? insight.swap : false;
    grouped[section].push({
      productId: product.id,
      rawName: product.name,
      icon: product.icon,
      category,
      scores: {
        savesMoney: insight.savesMoney,
        healthy: insight.healthy,
        sustainable: insight.sustainable,
      },
      tags: pantryTagsFor(insight),
      swapTitle: swap ? swap.name : null,
      swapTags: swap ? pantryTagsFor(swap) : [],
      source: row.source,
      scanId: row.scanId,
    });
  }

  return c.json({
    ...grouped,
    total: grouped.buy.length + grouped.skip.length + grouped.swap.length,
  });
});

/** Dev-only inspection of the latest scan extraction. */
routes.get("/api/dev/scans/latest", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(scans)
    .where(eq(scans.householdId, hh!.id))
    .orderBy(desc(scans.createdAt))
    .limit(1);
  const scan = rows[0];
  if (!scan) return c.json({ scan: null });
  return c.json({
    scan: {
      id: scan.id,
      kind: scan.kind,
      rawExtraction: scan.rawExtraction,
      confirmedAt: scan.confirmedAt,
      createdAt: scan.createdAt,
    },
  });
});

/** Dev-only inspection of the raw pantry classification data. */
routes.get("/api/dev/pantry-insights", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const insights = await loadLatestProductInsights(hh!.id);
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, hh!.id));
  const byId = new Map(prows.map((product) => [product.id, product]));

  return c.json({
    items: insights
      .map((row) => {
        const product = byId.get(row.productId);
        if (!product) return null;
        const stored = row.assessment as PantryItemInsight | null;
        const storedScore = (value: boolean | null) =>
          value === null ? 0.5 : value ? 1 : 0;
        const hasNumericAssessment =
          stored &&
          typeof stored === "object" &&
          typeof (stored as PantryItemInsight).savesMoney === "number";
        const assessment: PantryItemInsight =
          hasNumericAssessment
            ? stored
            : {
                normalizedName: normalizeName(product.name),
                savesMoney: storedScore(row.savesMoney),
                healthy: storedScore(row.healthy),
                sustainable: storedScore(row.sustainable),
                swap: row.swapName
                  ? {
                      name: row.swapName,
                      savesMoney: storedScore(row.swapSavesMoney),
                      healthy: storedScore(row.swapHealthy),
                      sustainable: storedScore(row.swapSustainable),
                    }
                  : false,
              };
        return {
          productId: row.productId,
          rawName: product.name,
          icon: product.icon,
          scanId: row.scanId,
          source: row.source,
          modelName: row.modelName,
          promptVersion: row.promptVersion,
          classificationError: row.classificationError,
          createdAt: row.createdAt,
          assessment,
          classification: {
            savesMoney: row.savesMoney,
            healthy: row.healthy,
            sustainable: row.sustainable,
            swap: row.swapName
              ? {
                  name: row.swapName,
                  savesMoney: row.swapSavesMoney ?? false,
                  healthy: row.swapHealthy ?? false,
                  sustainable: row.swapSustainable ?? false,
                }
              : false,
          },
          raw: row.raw ?? null,
        };
      })
      .filter(Boolean),
  });
});

/** Dev-only: pantry auto-add schedule, sorted perishables first. */
routes.get("/api/dev/pantry-schedule", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const now = new Date();
  const open = await latestOpenList(hh!.id);
  const existing = open
    ? await db.select().from(listItems).where(eq(listItems.listId, open.id))
    : [];
  const byName = new Map(
    existing.map((item) => [normalizeName(item.rawName), item]),
  );
  const sources = await loadPantryScheduleSources(hh!.id);
  const schedule = buildPantrySchedule(
    sources.map((source) => {
      const listed = byName.get(normalizeName(source.name));
      return {
        ...source,
        onList: Boolean(listed),
        autoAddedAt: listed?.source === "auto" ? listed.addedAt : null,
      };
    }),
    now,
  );
  // Model's one-line shelf-life rationale, when this product was classified.
  const insights = await loadLatestProductInsights(hh!.id);
  const reasonByProduct = new Map<string, string>();
  for (const row of insights) {
    const assessment = row.assessment as { reason?: unknown } | null;
    if (typeof assessment?.reason === "string" && assessment.reason.trim()) {
      reasonByProduct.set(row.productId, assessment.reason.trim());
    }
  }
  const lastRefreshedAt = hh!.lastPantryRefreshAt
    ? new Date(hh!.lastPantryRefreshAt)
    : null;

  return c.json({
    generatedAt: now.toISOString(),
    refreshIntervalDays: LIST_REFRESH_DAYS,
    lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
    nextRefreshAt: nextRefreshAt(lastRefreshedAt)?.toISOString() ?? null,
    items: schedule.map((item) =>
      scheduleResponseItem(item, reasonByProduct.get(item.productId) ?? null),
    ),
  });
});

routes.get("/api/pantry/:id", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, c.req.param("id")), eq(products.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  const view = await loadProductView(hh!.id, rows[0]);
  const hist = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.householdId, hh!.id), eq(purchases.productId, rows[0].id)))
    .orderBy(desc(purchases.purchasedAt));
  const corrs = await db
    .select()
    .from(corrections)
    .where(
      and(eq(corrections.householdId, hh!.id), eq(corrections.productId, rows[0].id)),
    )
    .orderBy(desc(corrections.createdAt));
  const grouped = suggestForProducts([view]);
  // Variants of this canonical product (brand + pack), with median unit prices.
  const variants = variantStats(view.moneyPurchases).map((v) => ({
    key: v.key,
    brand: v.brand,
    medianPerUnit: Math.round(v.medianPerUnit * 10000) / 10000,
    baseUnit: v.baseUnit,
    purchaseCount: v.purchaseCount,
  }));
  return c.json({
    product: rows[0],
    state: { ...view.state, lastPurchasedAt: view.state.lastPurchasedAt?.toISOString() ?? null },
    enrichment: view.enrichment,
    history: hist,
    variants,
    corrections: corrs,
    suggestions: grouped,
  });
});

routes.patch("/api/products/:id", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, c.req.param("id")), eq(products.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
    patch.catalogKey = normalizeName(body.name);
  }
  if (typeof body.shelfLifeClass === "string") {
    const cls = shelfLifeClassSchema.safeParse(body.shelfLifeClass);
    if (!cls.success) return c.json({ error: "invalid shelfLifeClass" }, 400);
    patch.shelfLifeClass = cls.data;
  }
  if (typeof body.muted === "boolean") patch.muted = body.muted;
  if (typeof body.icon === "string") patch.icon = body.icon;
  if (Object.keys(patch).length > 0) {
    await db.update(products).set(patch).where(eq(products.id, rows[0].id));
  }
  const updated = await db.select().from(products).where(eq(products.id, rows[0].id));
  return c.json(updated[0]);
});

routes.post("/api/products/:id/corrections", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, c.req.param("id")), eq(products.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (parsed.data.type === "never_remind") {
    await db.update(products).set({ muted: true }).where(eq(products.id, rows[0].id));
  }
  const row = {
    id: randomUUID(),
    householdId: hh!.id,
    productId: rows[0].id,
    type: parsed.data.type,
    createdAt: new Date(),
  };
  await db.insert(corrections).values(row);
  return c.json(row);
});

routes.post("/api/products/:id/enrich", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, c.req.param("id")), eq(products.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = productEnrichmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  // Reject invented prices: schema has no price fields, but guard anyway.
  if ("price" in body || "savings" in body) {
    return c.json({ error: "enrichment must not contain prices" }, 400);
  }
  const key = rows[0].knowledgeKey ?? `product:${rows[0].id}`;
  await upsertKnowledge(key, parsed.data);
  await db
    .update(products)
    .set({ knowledgeKey: key, shelfLifeClass: parsed.data.shelfLifeClass })
    .where(eq(products.id, rows[0].id));
  return c.json({ ok: true, key });
});

// ── Briefing ──
routes.get("/api/briefing", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const views = await loadAllProductViews(hh!.id, hh!.householdSize);
  const grouped = suggestForProducts(views, {
    limits: {
      buy: Number(c.req.query("buy") ?? 8),
      swap: Number(c.req.query("swap") ?? 3),
      skip: Number(c.req.query("skip") ?? 5),
    },
  });
  return c.json({ ...grouped, holdCount: grouped.skip.length });
});

// ── Lists ──

/** Insert list items, auto-matching each name to a household product. */
async function insertListItems(
  householdId: string,
  listId: string,
  items: ListItemCreate[],
) {
  const db = await getDb();
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, householdId));
  const created: Array<{
    id: string;
    rawName: string;
    brand: string | null;
    qty: number;
    source: string;
    productId: string | null;
  }> = [];

  for (const item of items) {
    const knownProduct =
      item.productId && prows.some((p) => p.id === item.productId)
        ? item.productId
        : null;
    const productId = knownProduct ?? matchProduct(item.rawName, prows).productId;
    const id = randomUUID();
    await db.insert(listItems).values({
      id,
      listId,
      productId,
      rawName: item.rawName,
      brand: item.brand ?? null,
      qty: String(item.qty),
      checked: false,
      decision: item.decision ?? null,
      source: item.source,
    });
    created.push({
      id,
      rawName: item.rawName,
      brand: item.brand ?? null,
      qty: item.qty,
      source: item.source,
      productId,
    });
  }
  return created;
}

async function ownedList(householdId: string, listId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.id, listId),
        eq(shoppingLists.householdId, householdId),
      ),
    );
  return rows[0] ?? null;
}

async function latestOpenList(householdId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        eq(shoppingLists.status, "open"),
      ),
    )
    .orderBy(desc(shoppingLists.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

routes.post("/api/lists", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const parsed = listCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = await getDb();
  const id = randomUUID();
  await db.insert(shoppingLists).values({
    id,
    householdId: hh!.id,
    title: parsed.data.title,
    source: parsed.data.source,
    status: "open",
    createdAt: new Date(),
  });
  return c.json({ id });
});

routes.get("/api/lists", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.householdId, hh!.id))
    .orderBy(desc(shoppingLists.createdAt));
  return c.json({ lists: rows });
});

/**
 * Pantry → grocery-list auto-add.
 *
 * Lazy 3-day refresh: the first time /quick-view opens after the window has
 * elapsed, every product whose category interval has passed (or is exactly
 * due today) is added under its normalized generic name. Items already on the
 * list and muted products are skipped. Returns the batch so the client can
 * offer a single Undo.
 */
routes.post("/api/lists/pantry-refresh", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const now = new Date();
  const lastRefreshedAt = hh!.lastPantryRefreshAt
    ? new Date(hh!.lastPantryRefreshAt)
    : null;

  if (!shouldRefresh(lastRefreshedAt, now)) {
    const open = await latestOpenList(hh!.id);
    return c.json({
      refreshed: false,
      listId: open?.id ?? null,
      added: [],
      lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
      nextRefreshAt: nextRefreshAt(lastRefreshedAt)?.toISOString() ?? null,
    });
  }

  const open = await latestOpenList(hh!.id);
  let listId = open?.id ?? null;
  const existing = listId
    ? await db.select().from(listItems).where(eq(listItems.listId, listId))
    : [];
  const byName = new Map(
    existing.map((item) => [normalizeName(item.rawName), item]),
  );

  const sources = await loadPantryScheduleSources(hh!.id);
  const schedule = buildPantrySchedule(
    sources.map((source) => {
      const listed = byName.get(normalizeName(source.name));
      return {
        ...source,
        onList: Boolean(listed),
        autoAddedAt: listed?.source === "auto" ? listed.addedAt : null,
      };
    }),
    now,
  );
  const candidates = autoAddCandidates(schedule);

  if (!listId && candidates.length > 0) {
    listId = randomUUID();
    await db.insert(shoppingLists).values({
      id: listId,
      householdId: hh!.id,
      title: "Shopping list",
      source: "auto",
      status: "open",
      createdAt: now,
    });
  }

  const added: Array<{
    id: string;
    productId: string;
    rawName: string;
    qty: number;
  }> = [];
  if (listId) {
    const insertedNames = new Set<string>();
    for (const item of candidates) {
      if (insertedNames.has(item.name)) continue;
      const id = randomUUID();
      await db.insert(listItems).values({
        id,
        listId,
        productId: item.productId,
        rawName: item.name,
        brand: null,
        qty: "1",
        checked: false,
        decision: null,
        source: "auto",
        addedAt: now,
      });
      insertedNames.add(item.name);
      added.push({
        id,
        productId: item.productId,
        rawName: item.name,
        qty: 1,
      });
    }
  }

  await db
    .update(households)
    .set({ lastPantryRefreshAt: now })
    .where(eq(households.id, hh!.id));

  return c.json({
    refreshed: true,
    listId,
    added,
    lastRefreshedAt: now.toISOString(),
    nextRefreshAt: nextRefreshAt(now)?.toISOString() ?? null,
  });
});

/** Undo the latest auto-add batch (items added since the last refresh). */
routes.delete("/api/lists/:id/auto-items", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const cutoff = hh!.lastPantryRefreshAt
    ? new Date(hh!.lastPantryRefreshAt)
    : null;
  if (!cutoff) return c.json({ removed: 0 });

  const db = await getDb();
  const rows = await db
    .select({ id: listItems.id })
    .from(listItems)
    .where(
      and(
        eq(listItems.listId, list.id),
        eq(listItems.source, "auto"),
        gte(listItems.addedAt, cutoff),
      ),
    );
  for (const row of rows) {
    await db.delete(listItems).where(eq(listItems.id, row.id));
  }
  return c.json({ removed: rows.length });
});

/**
 * PREVIEW: pantry-driven list suggestions. The response contract is final;
 * the implementation is a rhythm-based stub until the prediction service lands.
 */
routes.get("/api/lists/suggestions", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();

  let targetListId = c.req.query("listId") ?? null;
  if (targetListId) {
    const list = await ownedList(hh!.id, targetListId);
    if (!list) return c.json({ error: "not found" }, 404);
  } else {
    const latest = await latestOpenList(hh!.id);
    targetListId = latest?.id ?? null;
  }

  let excludeNames: string[] = [];
  if (targetListId) {
    const items = await db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, targetListId));
    excludeNames = items.map((item) => item.rawName);
  }

  const views = await loadAllProductViews(hh!.id, hh!.householdSize);
  const suggestions = suggestionsFromViews(views, {
    excludeNames,
    now: new Date(),
  });
  return c.json({
    source: "pantry-rhythm-stub",
    preview: true,
    generatedAt: new Date().toISOString(),
    suggestions,
  });
});

routes.patch("/api/lists/:id", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (Object.keys(patch).length > 0) {
    const db = await getDb();
    await db
      .update(shoppingLists)
      .set(patch)
      .where(eq(shoppingLists.id, list.id));
  }
  return c.json({ ok: true });
});

routes.get("/api/lists/:id", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const lrows = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, c.req.param("id")), eq(shoppingLists.householdId, hh!.id)));
  if (!lrows[0]) return c.json({ error: "not found" }, 404);
  const items = await db.select().from(listItems).where(eq(listItems.listId, lrows[0].id));
  const lastRefreshedAt = hh!.lastPantryRefreshAt
    ? new Date(hh!.lastPantryRefreshAt)
    : null;
  const added = (
    lastRefreshedAt
      ? items.filter(
          (item) =>
            item.source === "auto" &&
            item.productId &&
            item.addedAt &&
            new Date(item.addedAt).getTime() >= lastRefreshedAt.getTime(),
        )
      : []
  )
    .sort((a, b) => {
      const aAt = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const bAt = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return bAt - aAt;
    })
    .map((item) => ({
      id: item.id,
      productId: item.productId as string,
      rawName: item.rawName,
      qty: Number(item.qty) || 1,
    }));
  return c.json({
    list: lrows[0],
    items,
    auto: {
      refreshIntervalDays: LIST_REFRESH_DAYS,
      lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
      nextRefreshAt: nextRefreshAt(lastRefreshedAt)?.toISOString() ?? null,
      added,
    },
  });
});

routes.post("/api/lists/:id/items", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listItemCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const [created] = await insertListItems(hh!.id, list.id, [parsed.data]);
  return c.json({ id: created.id, item: created });
});

routes.post("/api/lists/:id/items/bulk", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listItemsBulkCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const created = await insertListItems(hh!.id, list.id, parsed.data.items);
  return c.json({ items: created });
});

routes.patch("/api/lists/:id/items/:itemId", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listItemPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const db = await getDb();
  const patch: Record<string, unknown> = {};
  if (parsed.data.checked !== undefined) patch.checked = parsed.data.checked;
  if (parsed.data.decision !== undefined) patch.decision = parsed.data.decision;
  if (parsed.data.qty !== undefined) patch.qty = String(parsed.data.qty);
  if (parsed.data.brand !== undefined) {
    patch.brand = parsed.data.brand?.trim() || null;
  }
  if (parsed.data.rawName !== undefined) {
    patch.rawName = parsed.data.rawName;
    // A renamed item must not keep pointing at its old product.
    const prows = await db
      .select()
      .from(products)
      .where(eq(products.householdId, hh!.id));
    patch.productId = matchProduct(parsed.data.rawName, prows).productId;
  }
  if (Object.keys(patch).length > 0) {
    await db
      .update(listItems)
      .set(patch)
      .where(and(eq(listItems.id, c.req.param("itemId")), eq(listItems.listId, list.id)));
  }
  return c.json({ ok: true });
});

routes.delete("/api/lists/:id/items", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const db = await getDb();
  await db.delete(listItems).where(eq(listItems.listId, list.id));
  return c.json({ ok: true });
});

routes.delete("/api/lists/:id/items/:itemId", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const list = await ownedList(hh!.id, c.req.param("id"));
  if (!list) return c.json({ error: "not found" }, 404);
  const db = await getDb();
  await db
    .delete(listItems)
    .where(and(eq(listItems.id, c.req.param("itemId")), eq(listItems.listId, list.id)));
  return c.json({ ok: true });
});

/** Evaluate list items against the pantry: match + BUY/SWAP/SKIP per item. */
routes.post("/api/lists/:id/evaluate", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const lrows = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, c.req.param("id")), eq(shoppingLists.householdId, hh!.id)));
  if (!lrows[0]) return c.json({ error: "not found" }, 404);
  const items = await db.select().from(listItems).where(eq(listItems.listId, lrows[0].id));
  const views = await loadAllProductViews(hh!.id, hh!.householdSize);
  const byId = new Map(views.map((v) => [v.productId, v]));
  const prows = await db.select().from(products).where(eq(products.householdId, hh!.id));

  const results = [];
  for (const it of items) {
    let view = it.productId ? byId.get(it.productId) ?? null : null;
    if (!view) {
      const m = matchProduct(it.rawName, prows);
      view = m.productId ? byId.get(m.productId) ?? null : null;
    }
    if (!view) {
      results.push({
        listItemId: it.id,
        rawName: it.rawName,
        suggestion: {
          productId: null,
          rawName: it.rawName,
          action: "BUY",
          reasonCodes: ["unknown_item"],
          tags: [],
          swapType: null,
          swapTitle: null,
          confidence: 0.3,
          evidence: {
            lastPurchasedAt: null,
            daysSince: null,
            typicalIntervalDays: null,
            lastPrice: null,
            expectedSaving: null,
          },
        },
      });
      continue;
    }
    const grouped = suggestForProducts([view], { limits: { buy: 5, swap: 3, skip: 5 } });
    const pick = grouped.skip[0] ?? grouped.swap[0] ?? grouped.buy[0] ?? null;
    results.push({
      listItemId: it.id,
      rawName: it.rawName,
      productId: view.productId,
      suggestion:
        pick ??
        ({
          productId: view.productId,
          rawName: view.rawName,
          action: "BUY",
          reasonCodes: ["no_signal"],
          tags: [],
          swapType: null,
          swapTitle: null,
          confidence: 0.3,
          evidence: {
            lastPurchasedAt: null,
            daysSince: null,
            typicalIntervalDays: null,
            lastPrice: null,
            expectedSaving: null,
          },
        } as const),
    });
  }
  const holdCount = results.filter((r) => r.suggestion.action === "SKIP").length;
  return c.json({ results, holdCount });
});

// ── AI (Muse via Meta Model API) ──

// POST /api/ai/parse-list { text } → grounded voice items + pantry matches.
// The model splits/normalises; validation, dedupe and matching stay in code.
routes.post("/api/ai/parse-list", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const parsed = listParseRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const text = parsed.data.text.trim();

  let source: "model" | "fallback" = "model";
  let items: VoiceItem[] = [];
  try {
    const provider = getAIProvider();
    const model = await provider.parseShoppingList(text);
    items = validateSpokenItems(model.items, text);
    // No grounded items means the output is unusable — use the fallback.
    if (items.length === 0) throw new Error("no grounded items");
  } catch {
    source = "fallback";
    items = fallbackVoiceItems(text);
  }

  const db = await getDb();
  const prows = await db
    .select()
    .from(products)
    .where(eq(products.householdId, hh!.id));
  return c.json({ source, items: attachPantryMatches(items, prows) });
});

// POST /api/ai/extract { image: dataURL|base64, mimeType?, kindHint? }
// Image is NOT persisted — only the validated extraction JSON is returned.
routes.post("/api/ai/extract", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const raw = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  const b64 = m ? m[2] : raw;
  if (!b64 || b64.length < 100) return c.json({ error: "missing image (base64 or data URL)" }, 400);
  if (b64.length > 14 * 1024 * 1024) return c.json({ error: "image too large (>10MB)" }, 413);
  try {
    const provider = getAIProvider() as any;
    const result = await provider.extractItems(
      Buffer.from(b64, "base64"),
      m ? m[1] : mimeType,
      typeof body.kindHint === "string" ? body.kindHint : undefined,
    );
    return c.json(result);
  } catch (e: any) {
    const status = /not configured/i.test(String(e?.message)) ? 503 : 502;
    return c.json({ error: String(e?.message ?? e).slice(0, 500) }, status);
  }
});

// POST /api/ai/enrich { name, brand?, form? } → cached in product_knowledge
routes.post("/api/ai/enrich", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.name !== "string" || !body.name.trim())
    return c.json({ error: "name is required" }, 400);
  try {
    const provider = getAIProvider();
    const enrichment = (await provider.enrichProduct({
      name: body.name.trim(),
      brand: body.brand,
      form: body.form,
    })) as any;
    const parsed = productEnrichmentSchema.parse(enrichment);
    const key = knowledgeKey(body.name.trim(), body.brand, body.form);
    await upsertKnowledge(key, parsed);
    // Link household products with the plain-name key so briefings pick it up.
    const db = await getDb();
    const prows = await db.select().from(products).where(eq(products.householdId, hh!.id));
    for (const p of prows) {
      if (!p.knowledgeKey && knowledgeKey(p.name) === key) {
        await db
          .update(products)
          .set({ knowledgeKey: key, shelfLifeClass: parsed.shelfLifeClass })
          .where(eq(products.id, p.id));
      }
    }
    return c.json({ key, enrichment: parsed });
  } catch (e: any) {
    const status = /not configured/i.test(String(e?.message)) ? 503 : 502;
    return c.json({ error: String(e?.message ?? e).slice(0, 500) }, status);
  }
});

// POST /api/products/:id/enrich-ai → enrich THIS product via Muse + link + reclassify
routes.post("/api/products/:id/enrich-ai", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, c.req.param("id")), eq(products.householdId, hh!.id)));
  if (!rows[0]) return c.json({ error: "not found" }, 404);
  try {
    const provider = getAIProvider();
    const enrichment = (await provider.enrichProduct({ name: rows[0].name })) as any;
    const parsed = productEnrichmentSchema.parse(enrichment);
    const key = knowledgeKey(rows[0].name);
    await upsertKnowledge(key, parsed);
    await db
      .update(products)
      .set({ knowledgeKey: key, shelfLifeClass: parsed.shelfLifeClass })
      .where(eq(products.id, rows[0].id));
    return c.json({ key, enrichment: parsed });
  } catch (e: any) {
    const status = /not configured/i.test(String(e?.message)) ? 503 : 502;
    return c.json({ error: String(e?.message ?? e).slice(0, 500) }, status);
  }
});

// ── Demo seed/reset ──
routes.post("/api/demo/seed", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const now = new Date();
  // A fresh demo pantry should auto-add on the next /quick-view open.
  const db = await getDb();
  await db
    .update(households)
    .set({ lastPantryRefreshAt: null })
    .where(eq(households.id, hh!.id));
  for (const item of DEMO_ITEMS) {
    await upsertKnowledge(demoKnowledgeKey(item.name), item.enrichment);
  }
  const seededInsights = new Set<string>();
  for (const p of DEMO_PURCHASES) {
    const demo = DEMO_ITEMS.find((d) => d.name === p.item);
    const prod = await getOrCreateProduct(hh!.id, p.item, { icon: demo?.icon });
    // Link knowledge + icon + class from fixture.
    if (demo) {
      await db
        .update(products)
        .set({
          knowledgeKey: demoKnowledgeKey(demo.name),
          shelfLifeClass: demo.enrichment.shelfLifeClass,
          icon: demo.icon,
        })
        .where(eq(products.id, prod.id));
    }
    const insight = DEMO_INSIGHTS[p.item];
    if (insight && !seededInsights.has(prod.id)) {
      seededInsights.add(prod.id);
      const swap = insight.swap;
      await saveProductInsight({
        householdId: hh!.id,
        productId: prod.id,
        scanId: null,
        category: insight.category,
        savesMoney: scoreIsYes(insight.savesMoney),
        healthy: scoreIsYes(insight.healthy),
        sustainable: scoreIsYes(insight.sustainable),
        swapName: swap?.name ?? null,
        swapSavesMoney: swap ? scoreIsYes(swap.savesMoney) : null,
        swapHealthy: swap ? scoreIsYes(swap.healthy) : null,
        swapSustainable: swap ? scoreIsYes(swap.sustainable) : null,
        assessment: { normalizedName: p.item, ...insight },
        source: "demo",
        modelName: "fixture",
        promptVersion: "demo-v1",
        raw: { normalizedName: p.item, ...insight },
      });
    }
    const purchasedAt = new Date(now.getTime() - p.daysAgo * 86_400_000);
    await addPurchase({
      productId: prod.id,
      householdId: hh!.id,
      purchasedAt,
      qty: p.qty ?? 1,
      packQty: p.packQty,
      packUnit: p.packUnit,
      totalPrice: p.totalPrice,
      brand: p.brand,
    });
  }
  return c.json({ ok: true });
});

routes.post("/api/demo/reset", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const lists = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.householdId, hh!.id));
  for (const l of lists) {
    await db.delete(listItems).where(eq(listItems.listId, l.id));
  }
  await db.delete(shoppingLists).where(eq(shoppingLists.householdId, hh!.id));
  await db.delete(productInsights).where(eq(productInsights.householdId, hh!.id));
  await db.delete(purchases).where(eq(purchases.householdId, hh!.id));
  await db.delete(corrections).where(eq(corrections.householdId, hh!.id));
  await db.delete(scans).where(eq(scans.householdId, hh!.id));
  await db.delete(products).where(eq(products.householdId, hh!.id));
  await db
    .update(households)
    .set({ lastPantryRefreshAt: null })
    .where(eq(households.id, hh!.id));
  return c.json({ ok: true });
});
