import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { sql } from "drizzle-orm";
import { DDL } from "./ddl.js";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

let db: Db | null = null;
let pglite: PGlite | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const driver = process.env.DB_DRIVER ?? "pglite";
  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for DB_DRIVER=postgres");
    // Azure Postgres requires TLS; postgres.js only needs the flag when the
    // connection string asks for it (which our Bicep template always does).
    const needsSsl = /[?&]sslmode=(require|verify-ca|verify-full)/.test(url);
    const client = postgres(url, {
      ...(needsSsl ? { ssl: "require" as const } : {}),
      // The schema bootstrap below is idempotent, so "already exists, skipping"
      // notices are expected on every boot. Keep the logs quiet.
      onnotice: () => {},
    });
    // Managed Postgres arrives empty: apply the idempotent schema once. Set
    // DB_AUTO_MIGRATE=off when the schema is managed outside the app.
    if (process.env.DB_AUTO_MIGRATE !== "off") {
      await client.unsafe(DDL);
    }
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
