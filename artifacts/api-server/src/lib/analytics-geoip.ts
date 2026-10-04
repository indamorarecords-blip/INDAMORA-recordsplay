import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Reader, type CountryResponse } from "mmdb-lib";
import { logger } from "./logger";

let reader: Reader<CountryResponse> | null = null;
let release: string | null = null;
let lastCheck = 0;
let pending: Promise<void> | null = null;
const DAY = 86400000;

function ageInDays(month: string): number {
  return (Date.now() - Date.parse(`${month}-01T00:00:00Z`)) / DAY;
}

export function geoipInfo() {
  return {
    geoipRelease: release,
    geoipStatus: !reader ? "unavailable" as const : release && ageInDays(release) <= 62 ? "ready" as const : "stale" as const,
  };
}

function load(bytes: Buffer, month: string) {
  const next = new Reader<CountryResponse>(gunzipSync(bytes));
  if (next.metadata.databaseType !== "DBIP-Country-Lite") throw new Error("Unexpected GeoIP database");
  reader = next;
  release = month;
}

async function refresh() {
  if (!reader) {
    try {
      // build.mjs copies the licensed snapshot beside the server bundle.
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const roots = [path.join(dir, "analytics-data"), path.resolve("artifacts/api-server/analytics-data")];
      for (const root of roots) {
        try {
          const metadata = JSON.parse(await readFile(path.join(root, "release.json"), "utf8"));
          load(await readFile(path.join(root, "country.mmdb.gz")), metadata.release);
          break;
        } catch { /* Try the source snapshot when executing unbundled tests. */ }
      }
    } catch { /* Collection continues with an explicit unavailable country. */ }
  }
  const current = new Date().toISOString().slice(0, 7);
  if (release === current) return;
  try {
    // The URL contains only the release month. No visitor IP, hash or request
    // information is included. All lookups use the in-memory local Reader.
    const response = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${current}.mmdb.gz`, {
      signal: AbortSignal.timeout(20000), redirect: "error",
    });
    if (!response.ok) throw new Error(`GeoIP database download HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new Error("GeoIP database too large");
    load(bytes, current);
  } catch {
    logger.warn("Local analytics GeoIP update failed; database status is visible in ADMIN");
  }
}

export async function ensureGeoip(): Promise<void> {
  if (pending) return pending;
  if (Date.now() - lastCheck < DAY) return;
  lastCheck = Date.now();
  pending = refresh().finally(() => { pending = null; });
  return pending;
}

export function lookupCountry(ip: string): string | null {
  if (geoipInfo().geoipStatus !== "ready") return null;
  const code = reader?.get(ip)?.country?.iso_code;
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}