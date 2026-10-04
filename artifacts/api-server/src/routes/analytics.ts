import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { GetAdminAnalyticsQueryParams, GetAdminAnalyticsResponse, RecordPageviewBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { analyticsClientIp, excludedTraffic, normalizeAnalyticsPath, validRange, visitorFingerprint } from "../lib/analytics-privacy";
import { ensureGeoip, geoipInfo, lookupCountry } from "../lib/analytics-geoip";
import { ensureAnalyticsStore, purgeOldAnalytics } from "../lib/analytics-store";

const router: IRouter = Router();
const rate = new Map<string, { minute: number; count: number }>();
let warnedMissingIp = false;

router.post("/analytics/pageviews", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  // Reject cross-site browsers. No cookies or user accounts are needed.
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).end();
    return;
  }
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== forwardedHost) { res.status(403).end(); return; }
    } catch { res.status(403).end(); return; }
  }
  const input = RecordPageviewBody.strict().safeParse(req.body);
  const path = input.success ? normalizeAnalyticsPath(input.data.path) : null;
  if (!path) { res.status(400).end(); return; }
  const ua = req.get("user-agent") ?? "";
  if (excludedTraffic(ua, req.get("dnt"), req.get("sec-gpc"))) { res.status(204).end(); return; }
  const ip = analyticsClientIp(req.get("x-forwarded-for"), req.socket.remoteAddress);
  // Never invent an identity or a country from proxy/private addresses.
  if (!ip) {
    if (!warnedMissingIp) {
      req.log.warn("Analytics requires a public client IP from the reverse proxy; internal requests are not counted");
      warnedMissingIp = true;
    }
    res.status(503).end();
    return;
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(503).end(); return; }
  const visitor = visitorFingerprint(ip, ua, secret);
  const minute = Math.floor(Date.now() / 60000);
  if (rate.size > 5000) {
    for (const [key, item] of rate) if (item.minute < minute) rate.delete(key);
    if (rate.size > 5000) { res.status(429).end(); return; }
  }
  const item = rate.get(visitor);
  const count = item?.minute === minute ? item.count + 1 : 1;
  rate.set(visitor, { minute, count });
  if (count > 60) { res.status(429).end(); return; }
  try {
    await Promise.all([ensureAnalyticsStore(), ensureGeoip()]);
    await purgeOldAnalytics();
    await pool.query(`INSERT INTO analytics_pageviews(visitor_hash, path, country, dedup_bucket)
      VALUES ($1, $2, $3, $4) ON CONFLICT (visitor_hash, path, dedup_bucket) DO NOTHING`,
    [visitor, path, lookupCountry(ip), String(Math.floor(Date.now() / 5000))]);
    res.status(204).end();
  } catch {
    req.log.warn("Analytics pageview could not be recorded");
    res.status(503).end();
  }
});

router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const input = GetAdminAnalyticsQueryParams.safeParse(req.query);
  if (!input.success || !validRange(input.data.start, input.data.end)) {
    res.status(400).json({ error: "Choisissez une période valide dans les 90 derniers jours, jusqu’à aujourd’hui." });
    return;
  }
  const { start, end } = input.data;
  try {
    await Promise.all([ensureAnalyticsStore(), ensureGeoip()]);
    await purgeOldAnalytics();
    // PostgreSQL computes the Paris calendar boundaries, including DST.
    // Period visitors are DISTINCT across the entire period, never a sum of days.
    const result = await pool.query(`
      WITH visits AS (
        SELECT *, (viewed_at AT TIME ZONE 'Europe/Paris')::date AS day
        FROM analytics_pageviews
        WHERE viewed_at >= $1::date::timestamp AT TIME ZONE 'Europe/Paris'
          AND viewed_at < ($2::date + 1)::timestamp AT TIME ZONE 'Europe/Paris'
      ), days AS (
        SELECT to_char(d, 'YYYY-MM-DD') AS date,
          count(DISTINCT v.visitor_hash)::int AS visitors, count(v.id)::int AS pageviews
        FROM generate_series($1::date::timestamp, $2::date::timestamp, '1 day') d
        LEFT JOIN visits v ON v.day = d::date GROUP BY d ORDER BY d
      ), countries AS (
        SELECT country, count(DISTINCT visitor_hash)::int AS visitors, count(*)::int AS pageviews
        FROM visits GROUP BY country ORDER BY visitors DESC, country ASC NULLS LAST
      ), pages AS (
        SELECT path, count(DISTINCT visitor_hash)::int AS visitors, count(*)::int AS pageviews
        FROM visits GROUP BY path ORDER BY pageviews DESC, path LIMIT 20
      )
      SELECT
        (SELECT count(DISTINCT visitor_hash)::int FROM visits) AS visitors,
        (SELECT count(*)::int FROM visits) AS pageviews,
        COALESCE((SELECT json_agg(days) FROM days), '[]') AS daily,
        COALESCE((SELECT json_agg(countries) FROM countries), '[]') AS countries,
        COALESCE((SELECT json_agg(pages) FROM pages), '[]') AS pages,
        (SELECT min(viewed_at) FROM analytics_pageviews) AS first_collected_at
    `, [start, end]);
    const row = result.rows[0];
    res.json(GetAdminAnalyticsResponse.parse({
      start, end, timezone: "Europe/Paris",
      visitors: row.visitors, pageviews: row.pageviews,
      daily: row.daily, countries: row.countries, pages: row.pages,
      firstCollectedAt: row.first_collected_at?.toISOString() ?? null,
      retentionDays: 90, ...geoipInfo(),
    }));
  } catch {
    req.log.error("Private analytics report could not be loaded");
    res.status(503).json({ error: "Les statistiques sont temporairement indisponibles." });
  }
});

export default router;