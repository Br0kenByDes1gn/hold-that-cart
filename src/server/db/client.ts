import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { sql } from "drizzle-orm";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

let db: Db | null = null;
let pglite: PGlite | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  email TEXT,
  household_size INTEGER NOT NULL DEFAULT 2,
  account_type TEXT NOT NULL DEFAULT 'household',
  currency TEXT NOT NULL DEFAULT '€',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_knowledge (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  enrichment JSONB NOT NULL,
  model_name TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  catalog_key TEXT,
  knowledge_key TEXT REFERENCES product_knowledge(key),
  name TEXT NOT NULL,
  shelf_life_class TEXT NOT NULL DEFAULT 'unknown',
  icon TEXT,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  purchased_at TIMESTAMPTZ NOT NULL,
  qty NUMERIC NOT NULL DEFAULT '1',
  pack_qty NUMERIC,
  pack_unit TEXT,
  unit_price NUMERIC,
  total_price NUMERIC,
  brand TEXT,
  store TEXT,
  variant TEXT,
  scan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_insights (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  scan_id TEXT,
  category TEXT,
  saves_money BOOLEAN NOT NULL DEFAULT FALSE,
  healthy BOOLEAN NOT NULL DEFAULT FALSE,
  sustainable BOOLEAN NOT NULL DEFAULT FALSE,
  swap_name TEXT,
  swap_saves_money BOOLEAN,
  swap_healthy BOOLEAN,
  swap_sustainable BOOLEAN,
  assessment JSONB,
  source TEXT NOT NULL DEFAULT 'scan',
  model_name TEXT,
  prompt_version TEXT,
  classification_error TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE product_insights ADD COLUMN IF NOT EXISTS raw_json JSONB;
ALTER TABLE product_insights ADD COLUMN IF NOT EXISTS assessment JSONB;
ALTER TABLE product_insights ADD COLUMN IF NOT EXISTS classification_error TEXT;
ALTER TABLE product_insights ADD COLUMN IF NOT EXISTS category TEXT;
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  kind TEXT NOT NULL DEFAULT 'unknown',
  raw_extraction JSONB NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  title TEXT NOT NULL DEFAULT 'Shopping list',
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES shopping_lists(id),
  product_id TEXT REFERENCES products(id),
  raw_name TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 1,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  decision TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
);
ALTER TABLE list_items ADD COLUMN IF NOT EXISTS qty NUMERIC NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const driver = process.env.DB_DRIVER ?? "pglite";
  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for DB_DRIVER=postgres");
    const client = postgres(url);
    db = drizzlePg(client, { schema }) as unknown as Db;
    return db;
  }
  const dataDir = process.env.PGLITE_DIR ?? "./.data/pglite";
  mkdirSync(dataDir, { recursive: true });
  pglite = new PGlite({ dataDir });
  db = drizzlePglite(pglite, { schema });
  await pglite.exec(DDL);
  // sanity
  await db.execute(sql`SELECT 1`);
  return db;
}
