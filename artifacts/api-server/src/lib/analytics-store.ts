import { pool } from "@workspace/db";

let ready: Promise<void> | null = null;
let lastPurge = 0;

// Additive, analytics-only setup for both development and production.
// Do not run a broad schema push against existing product tables.
export function ensureAnalyticsStore(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_pageviews (
          id SERIAL PRIMARY KEY,
          visitor_hash TEXT NOT NULL,
          path TEXT NOT NULL,
          country TEXT,
          viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          dedup_bucket TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS analytics_pageviews_viewed_at_idx ON analytics_pageviews(viewed_at);
        CREATE UNIQUE INDEX IF NOT EXISTS analytics_pageviews_dedup_idx
          ON analytics_pageviews(visitor_hash, path, dedup_bucket);
      `);
    })().catch((err) => { ready = null; throw err; });
  }
  return ready;
}

export async function purgeOldAnalytics(): Promise<void> {
  if (Date.now() - lastPurge < 86400000) return;
  await pool.query(`DELETE FROM analytics_pageviews
    WHERE viewed_at < ((now() AT TIME ZONE 'Europe/Paris')::date - 89)::timestamp AT TIME ZONE 'Europe/Paris'`);
  lastPurge = Date.now();
}