import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { households } from "./db/schema.js";
import { householdUpsertSchema, householdPatchSchema } from "../shared/schemas.js";

export const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.0" }));

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
