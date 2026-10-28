import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // PGlite for dev; real Postgres via DATABASE_URL later.
    // drizzle-kit needs a URL only when pushing; dev schema applies at runtime.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/holdthatcart",
  },
});
