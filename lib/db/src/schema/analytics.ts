import { index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Isolated from accounts, artists, works, submissions and billing.
export const analyticsPageviewsTable = pgTable("analytics_pageviews", {
  id: serial("id").primaryKey(),
  visitorHash: text("visitor_hash").notNull(),
  path: text("path").notNull(),
  country: text("country"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  dedupBucket: text("dedup_bucket").notNull(),
}, (table) => [
  index("analytics_pageviews_viewed_at_idx").on(table.viewedAt),
  uniqueIndex("analytics_pageviews_dedup_idx").on(table.visitorHash, table.path, table.dedupBucket),
]);

export const insertAnalyticsPageviewSchema = createInsertSchema(analyticsPageviewsTable).omit({ id: true });
export type InsertAnalyticsPageview = z.infer<typeof insertAnalyticsPageviewSchema>;
export type AnalyticsPageview = typeof analyticsPageviewsTable.$inferSelect;