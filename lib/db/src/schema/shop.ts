import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, primaryKey, unique, check, foreignKey, index } from "drizzle-orm/pg-core";

// Shop application data only. Products/prices remain in the dedicated Stripe
// catalogue. No FK, UPDATE or DELETE targets another application's tables.
export const shopCatalogLinks = pgTable("shop_catalog_links", {
  mode: text("mode").notNull(),
  id: text("id").notNull(),
  stripeProductId: text("stripe_product_id").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.mode, t.id] }),
  unique("shop_catalog_links_stripe_unique").on(t.mode, t.stripeProductId),
  check("shop_catalog_links_mode_check", sql`${t.mode} IN ('test', 'live')`),
  check("shop_catalog_links_revision_check", sql`${t.revision} >= 0`),
]);

export const shopInventory = pgTable("shop_inventory", {
  mode: text("mode").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  stock: integer("stock"),
}, t => [
  primaryKey({ columns: [t.mode, t.productId, t.variantId] }),
  foreignKey({ columns: [t.mode, t.productId], foreignColumns: [shopCatalogLinks.mode, shopCatalogLinks.id] }),
  check("shop_inventory_stock_check", sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
]);

export const shopOrders = pgTable("shop_orders", {
  mode: text("mode").notNull(),
  id: text("id").notNull(),
  sessionId: text("session_id"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  items: jsonb("items").notNull(),
  quote: jsonb("quote"),
}, t => [
  primaryKey({ columns: [t.mode, t.id] }),
  unique("shop_orders_session_unique").on(t.mode, t.sessionId),
  check("shop_orders_mode_check", sql`${t.mode} IN ('test', 'live')`),
  check("shop_orders_status_check", sql`${t.status} IN ('pending', 'paid', 'released')`),
  check("shop_orders_session_mode_check", sql`${t.sessionId} IS NULL OR (${t.mode} = 'test' AND left(${t.sessionId}, 8) = 'cs_test_') OR (${t.mode} = 'live' AND left(${t.sessionId}, 8) = 'cs_live_')`),
  index("shop_orders_mode_created_idx").on(t.mode, t.createdAt.desc()),
]);

export const shopAudit = pgTable("shop_audit", {
  mode: text("mode").notNull(),
  id: text("id").notNull(),
  productId: text("product_id").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
}, t => [
  primaryKey({ columns: [t.mode, t.id] }),
  check("shop_audit_mode_check", sql`${t.mode} IN ('test', 'live')`),
  index("shop_audit_mode_at_idx").on(t.mode, t.at.desc()),
]);

export const shopMedia = pgTable("shop_media", {
  mode: text("mode").notNull(),
  reference: text("reference").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  ready: text("ready").notNull().default("pending"),
  sha256: text("sha256"),
}, t => [
  primaryKey({ columns: [t.mode, t.reference] }),
  check("shop_media_mode_check", sql`${t.mode} IN ('test', 'live')`),
  check("shop_media_size_check", sql`${t.size} > 0 AND ${t.size} <= 5242880`),
  check("shop_media_status_check", sql`${t.ready} IN ('pending', 'ready')`),
]);
