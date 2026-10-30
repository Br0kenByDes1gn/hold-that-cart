import { pgTable, text, integer, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const households = pgTable("households", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  email: text("email"),
  householdSize: integer("household_size").notNull().default(2),
  accountType: text("account_type").notNull().default("household"),
  currency: text("currency").notNull().default("€"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productKnowledge = pgTable("product_knowledge", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // normalized name (+brand/form)
  enrichment: jsonb("enrichment").notNull(),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  catalogKey: text("catalog_key"), // slug / normalized name
  knowledgeKey: text("knowledge_key").references(() => productKnowledge.key),
  name: text("name").notNull(),
  shelfLifeClass: text("shelf_life_class").notNull().default("unknown"),
  icon: text("icon"),
  muted: boolean("muted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
  qty: numeric("qty").notNull().default("1"),
  packQty: numeric("pack_qty"),
  packUnit: text("pack_unit"),
  unitPrice: numeric("unit_price"), // normalized € per base unit
  totalPrice: numeric("total_price"),
  brand: text("brand"),
  store: text("store"),
  variant: text("variant"),
  scanId: text("scan_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productInsights = pgTable("product_insights", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  scanId: text("scan_id"),
  savesMoney: boolean("saves_money").notNull().default(false),
  healthy: boolean("healthy").notNull().default(false),
  sustainable: boolean("sustainable").notNull().default(false),
  swapName: text("swap_name"),
  swapSavesMoney: boolean("swap_saves_money"),
  swapHealthy: boolean("swap_healthy"),
  swapSustainable: boolean("swap_sustainable"),
  assessment: jsonb("assessment"),
  source: text("source").notNull().default("scan"),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  classificationError: text("classification_error"),
  raw: jsonb("raw_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scans = pgTable("scans", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  kind: text("kind").notNull().default("unknown"),
  rawExtraction: jsonb("raw_extraction").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  title: text("title").notNull().default("Shopping list"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listItems = pgTable("list_items", {
  id: text("id").primaryKey(),
  listId: text("list_id")
    .notNull()
    .references(() => shoppingLists.id),
  productId: text("product_id").references(() => products.id),
  rawName: text("raw_name").notNull(),
  checked: boolean("checked").notNull().default(false),
  decision: text("decision"),
  source: text("source").notNull().default("manual"),
});

export const corrections = pgTable("corrections", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
