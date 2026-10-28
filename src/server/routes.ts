import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import {
  addPurchase,
  getHouseholdByDevice,
  getOrCreateProduct,
  loadAllProductViews,
  loadProductView,
  upsertKnowledge,
} from "./db/repo.js";
import {
  corrections,
  households,
  listItems,
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
  manualPurchaseSchema,
  productEnrichmentSchema,
  scanConfirmSchema,
  scanCreateSchema,
} from "../shared/schemas.js";
import { matchProduct } from "./domain/match.js";
import { suggestForProducts } from "./domain/suggestions.js";
import { DEMO_ITEMS, DEMO_PURCHASES, demoKnowledgeKey } from "./domain/demo.js";
import { knowledgeKey, normalizeName } from "./domain/normalize.js";
import { getAIProvider } from "./ai/provider.js";

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

  if (parsed.data.kind === "receipt") {
    for (const it of parsed.data.items) {
      const prod =
        it.productId &&
        (await db.select().from(products).where(eq(products.id, it.productId))).length > 0
          ? (await db.select().from(products).where(eq(products.id, it.productId)))[0]
          : await getOrCreateProduct(hh!.id, it.rawName, { brand: it.brand });
      await addPurchase({
        productId: prod.id,
        householdId: hh!.id,
        purchasedAt: it.purchasedAt ? new Date(it.purchasedAt) : purchasedAt,
        qty: it.qty,
        packQty: it.packQty,
        packUnit: it.packUnit,
        totalPrice: it.price,
        brand: it.brand,
        scanId: srows[0].id,
      });
      committed.push(prod.id);
    }
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

  await db.update(scans).set({ confirmedAt: new Date() }).where(eq(scans.id, srows[0].id));
  return c.json({ ok: true, products: committed });
});

// ── Manual purchase ──
routes.post("/api/purchases/manual", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const body = await c.req.json().catch(() => ({}));
  const parsed = manualPurchaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const prod = await getOrCreateProduct(hh!.id, parsed.data.name, { brand: parsed.data.brand });
  const row = await addPurchase({
    productId: prod.id,
    householdId: hh!.id,
    purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : new Date(),
    qty: parsed.data.qty,
    packQty: parsed.data.packQty,
    packUnit: parsed.data.packUnit,
    totalPrice: parsed.data.totalPrice,
    brand: parsed.data.brand,
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
  return c.json({
    product: rows[0],
    state: { ...view.state, lastPurchasedAt: view.state.lastPurchasedAt?.toISOString() ?? null },
    enrichment: view.enrichment,
    history: hist,
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
  if (typeof body.shelfLifeClass === "string") patch.shelfLifeClass = body.shelfLifeClass;
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
  return c.json({ list: lrows[0], items });
});

routes.post("/api/lists/:id/items", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const lrows = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, c.req.param("id")), eq(shoppingLists.householdId, hh!.id)));
  if (!lrows[0]) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listItemCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const id = randomUUID();
  await db.insert(listItems).values({
    id,
    listId: lrows[0].id,
    productId: parsed.data.productId,
    rawName: parsed.data.rawName,
    checked: false,
    decision: parsed.data.decision ?? null,
    source: "manual",
  });
  return c.json({ id });
});

routes.patch("/api/lists/:id/items/:itemId", async (c) => {
  const hh = await household(c);
  const err = needHH(c, hh);
  if (err) return err;
  const db = await getDb();
  const lrows = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, c.req.param("id")), eq(shoppingLists.householdId, hh!.id)));
  if (!lrows[0]) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = listItemPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const patch: Record<string, unknown> = {};
  if (parsed.data.checked !== undefined) patch.checked = parsed.data.checked;
  if (parsed.data.decision !== undefined) patch.decision = parsed.data.decision;
  if (Object.keys(patch).length > 0) {
    await db
      .update(listItems)
      .set(patch)
      .where(and(eq(listItems.id, c.req.param("itemId")), eq(listItems.listId, lrows[0].id)));
  }
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
  for (const item of DEMO_ITEMS) {
    await upsertKnowledge(demoKnowledgeKey(item.name), item.enrichment);
  }
  for (const p of DEMO_PURCHASES) {
    const demo = DEMO_ITEMS.find((d) => d.name === p.item);
    const prod = await getOrCreateProduct(hh!.id, p.item, { icon: demo?.icon });
    // Link knowledge + icon + class from fixture.
    const db = await getDb();
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
  await db.delete(purchases).where(eq(purchases.householdId, hh!.id));
  await db.delete(corrections).where(eq(corrections.householdId, hh!.id));
  await db.delete(scans).where(eq(scans.householdId, hh!.id));
  await db.delete(products).where(eq(products.householdId, hh!.id));
  return c.json({ ok: true });
});
