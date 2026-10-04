import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
// This test creates only temporary tables on its own connection. It never
// inserts, deletes or updates any existing application data.
test("real report SQL: period distinct, Paris boundaries, empty days, country and page totals", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE analytics_pageviews (
      id serial, visitor_hash text, path text, country text, viewed_at timestamptz, dedup_bucket text
    ) ON COMMIT DROP`);
    await client.query(`INSERT INTO analytics_pageviews(visitor_hash,path,country,viewed_at) VALUES
      ('visitor-a','/','FR','2026-10-02T22:05:00Z'),
      ('visitor-a','/explorer','FR','2026-10-03T09:00:00Z'),
      ('visitor-a','/','FR','2026-10-03T22:05:00Z'),
      ('visitor-b','/',NULL,'2026-10-04T10:00:00Z'),
      ('outside','/','US','2026-10-02T21:59:59Z'),
      ('outside','/','US','2026-10-04T22:00:00Z')`);
    const source = await readFile("artifacts/api-server/src/routes/analytics.ts", "utf8");
    const sql = source.match(/pool\.query\(`(\s+WITH visits[\s\S]*?)`, \[start, end\]/)?.[1];
    assert.ok(sql, "test must execute the actual route's report SQL");
    const row = (await client.query(sql, ["2026-10-03", "2026-10-04"])).rows[0];
    assert.equal(row.visitors, 2);
    assert.equal(row.pageviews, 4);
    assert.deepEqual(row.daily, [
      { date: "2026-10-03", visitors: 1, pageviews: 2 },
      { date: "2026-10-04", visitors: 2, pageviews: 2 },
    ]);
    assert.deepEqual(row.countries, [
      { country: "FR", visitors: 1, pageviews: 3 },
      { country: null, visitors: 1, pageviews: 1 },
    ]);
    assert.deepEqual(row.pages, [
      { path: "/", visitors: 2, pageviews: 3 },
      { path: "/explorer", visitors: 1, pageviews: 1 },
    ]);
    const empty = (await client.query(sql, ["2026-10-01", "2026-10-01"])).rows[0];
    assert.equal(empty.visitors, 0);
    assert.equal(empty.pageviews, 0);
    assert.deepEqual(empty.daily, [{ date: "2026-10-01", visitors: 0, pageviews: 0 }]);
    assert.deepEqual(empty.countries, []);
    assert.deepEqual(empty.pages, []);
    // DST fall-back day has 25 hours in Paris.
    await client.query("TRUNCATE analytics_pageviews");
    await client.query(`INSERT INTO analytics_pageviews(visitor_hash,path,country,viewed_at) VALUES
      ('a','/','FR','2026-10-24T22:00:00Z'),
      ('a','/','FR','2026-10-25T22:59:59Z'),
      ('b','/','FR','2026-10-25T23:00:00Z')`);
    const dst = (await client.query(sql, ["2026-10-25", "2026-10-25"])).rows[0];
    assert.equal(dst.visitors, 1);
    assert.equal(dst.pageviews, 2);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});