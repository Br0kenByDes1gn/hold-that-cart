import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { getDb } from "./db/client.js";
import { households } from "./db/schema.js";
import { householdUpsertSchema, householdPatchSchema } from "../shared/schemas.js";
import { routes } from "./routes.js";

export const app = new Hono();

const isProduction = process.env.NODE_ENV === "production";

app.use("*", cors());

// Azure Container Apps terminates TLS at the ingress, so plain-HTTP visits
// arrive with x-forwarded-proto: http. Bounce them to HTTPS: the PWA can only
// register its service worker on a secure origin.
if (isProduction) {
  app.use("*", async (c, next) => {
    const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto === "http") {
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      const url = new URL(c.req.url);
      return c.redirect(`https://${host}${url.pathname}${url.search}`, 301);
    }
    await next();
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });
}

// Inspection endpoints stay available in dev; production must opt in.
if (isProduction && process.env.DEV_ENDPOINTS !== "on") {
  app.use("/api/dev/*", async () => new Response("Not Found", { status: 404 }));
}

app.get("/api/health", (c) =>
  c.json({ ok: true, version: process.env.APP_VERSION ?? "0.1.0" }),
);
app.route("/", routes);

// ── Static client (production: Hono serves Vite dist) ──
const DIST = "./dist";
if (existsSync(DIST + "/index.html")) {
  const { serveStatic } = await import("@hono/node-server/serve-static").catch(() => ({ serveStatic: null }) as any);
  if (serveStatic) {
    app.use("/assets/*", serveStatic({ root: DIST }));
    app.use("/icons/*", serveStatic({ root: DIST }));
    app.use("/fixtures/*", serveStatic({ root: DIST }));
    app.use("/*.png", serveStatic({ root: DIST }));
    app.use("/*.svg", serveStatic({ root: DIST }));
    app.use("/*.webmanifest", serveStatic({ root: DIST }));
    app.use("/sw.js", serveStatic({ root: DIST }));
    app.use("/workbox-*.js", serveStatic({ root: DIST }));
  }
  const indexHtml = readFileSync(DIST + "/index.html", "utf8");
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound();
    return c.html(indexHtml);
  });
}

function deviceId(c: { req: { header: (n: string) => string | undefined } }): string | null {
  return c.req.header("X-Device-Id") ?? null;
}

async function requireHousehold(c: any) {
  const did = deviceId(c);
  if (!did) return null;
  const db = await getDb();
  const rows = await db.select().from(households).where(eq(households.deviceId, did));
  return rows[0] ?? null;
}

// Device upsert (anonymous id → household)
app.post("/api/households", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = householdUpsertSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = await getDb();
  const existing = await db.select().from(households).where(eq(households.deviceId, parsed.data.deviceId));
  if (existing[0]) return c.json(existing[0]);
  const row = {
    id: randomUUID(),
    deviceId: parsed.data.deviceId,
    email: null as string | null,
    householdSize: parsed.data.householdSize ?? 2,
    accountType: parsed.data.accountType ?? "household",
    currency: "€",
    createdAt: new Date(),
  };
  await db.insert(households).values(row);
  return c.json(row);
});

app.patch("/api/households/me", async (c) => {
  const hh = await requireHousehold(c);
  if (!hh) return c.json({ error: "unknown device (POST /api/households first)" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = householdPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = await getDb();
  const patch: Partial<typeof hh> = {};
  if (parsed.data.householdSize !== undefined) (patch as any).householdSize = parsed.data.householdSize;
  if (parsed.data.accountType !== undefined) (patch as any).accountType = parsed.data.accountType;
  if (parsed.data.email !== undefined) (patch as any).email = parsed.data.email;
  if (parsed.data.currency !== undefined) (patch as any).currency = parsed.data.currency;
  if (Object.keys(patch).length > 0) {
    await db.update(households).set(patch).where(eq(households.id, hh.id));
  }
  const rows = await db.select().from(households).where(eq(households.id, hh.id));
  return c.json(rows[0]);
});

export default app;
