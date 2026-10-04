import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Reader } from "mmdb-lib";

const dir = await mkdtemp(join(tmpdir(), "analytics-logic-"));
await build({
  entryPoints: ["artifacts/api-server/src/lib/analytics-privacy.ts"],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "privacy.mjs"),
});
const privacy = await import(pathToFileURL(join(dir, "privacy.mjs")).href);
await build({
  entryPoints: ["artifacts/api-server/src/middlewares/auth.ts"],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "auth.mjs"),
  plugins: [{
    name: "isolated-auth-test",
    setup(builder) {
      builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "fake-clerk", namespace: "unit-test" }));
      builder.onLoad({ filter: /.*/, namespace: "unit-test" }, () => ({
        contents: `export const clerkClient = { users: { getUser: async(id) => ({
          primaryEmailAddressId: "primary",
          publicMetadata: { role: id === "artist" ? "artist" : "admin" },
          emailAddresses: [
            { id: "primary", emailAddress: ["verified-admin", "unverified-admin"].includes(id) ? "indamorarecords@gmail.com" : "ordinary@example.invalid",
              verification: { status: id === "unverified-admin" ? "unverified" : "verified" } },
            { id: "secondary", emailAddress: "indamorarecords@gmail.com", verification: { status: "verified" } }
          ]
        }) } };
          export const getAuth = (req) => ({ userId: req.unitTestUserId ?? null });`,
        loader: "js",
      }));
    },
  }],
});
// The existing middleware is exercised in isolation; no Clerk account or role
// is created/changed and no live authorization success is claimed.
const auth = await import(pathToFileURL(join(dir, "auth.mjs")).href);
await rm(dir, { recursive: true });

test("only public route paths; no terms, tokens, personal routes or arbitrary URLs", () => {
  assert.equal(privacy.normalizeAnalyticsPath("/recherche?q=private#token"), "/recherche");
  assert.equal(privacy.normalizeAnalyticsPath("/explorer/"), "/explorer");
  assert.equal(privacy.normalizeAnalyticsPath("/oeuvres/12"), "/oeuvres/12");
  assert.equal(privacy.normalizeAnalyticsPath("/artists/2"), "/artists/2");
  assert.equal(privacy.normalizeAnalyticsPath("/categorie/musique"), "/categorie/musique");
  for (const path of ["/administration", "/moderation", "/profil", "/espace-artiste", "/submit", "/sign-in", "/sign-up", "/pricing/secret", "//evil.com", "https://evil.com", "/oeuvres/../../../profil"]) {
    assert.equal(privacy.normalizeAnalyticsPath(path), null, path);
  }
});
test("proxy chain chooses rightmost public address, never a supplied prefix or private proxy", () => {
  assert.equal(privacy.analyticsClientIp("1.1.1.1, 8.8.8.8, 10.1.2.3", "::1"), "8.8.8.8");
  assert.equal(privacy.analyticsClientIp("::ffff:8.8.8.8", "::1"), "8.8.8.8");
  assert.equal(privacy.analyticsClientIp("invalid, 2001:4860:4860::8888, fd00::1", "::1"), "2001:4860:4860::8888");
  assert.equal(privacy.analyticsClientIp("127.0.0.1, 192.168.1.1", "::1"), null);
  assert.equal(privacy.analyticsClientIp(undefined, "1.1.1.1"), "1.1.1.1");
});
test("pseudonyms are keyed, deterministic, not raw IPs or user agents", () => {
  const one = privacy.visitorFingerprint("8.8.8.8", "browser", "isolated-test-key");
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.equal(one, privacy.visitorFingerprint("8.8.8.8", "browser", "isolated-test-key"));
  assert.notEqual(one, privacy.visitorFingerprint("8.8.8.8", "browser", "other-key"));
  assert.notEqual(one, privacy.visitorFingerprint("8.8.8.8", "other-browser", "isolated-test-key"));
});
test("privacy preferences and robots excluded", () => {
  assert.equal(privacy.excludedTraffic("Mozilla/5.0", undefined, undefined), false);
  for (const ua of ["Googlebot", "HeadlessChrome", "curl/8", ""]) {
    assert.equal(privacy.excludedTraffic(ua, undefined, undefined), true);
  }
  assert.equal(privacy.excludedTraffic("Mozilla/5.0", "1", undefined), true);
  assert.equal(privacy.excludedTraffic("Mozilla/5.0", undefined, "1"), true);
});
test("Paris dates, leap days and 90-day inclusive range", () => {
  assert.equal(privacy.parisDate(new Date("2026-10-03T23:00:00Z")), "2026-10-04");
  assert.equal(privacy.validRange("2026-07-07", "2026-10-04", "2026-10-04"), true);
  assert.equal(privacy.validRange("2026-07-06", "2026-10-04", "2026-10-04"), false);
  assert.equal(privacy.validRange("2026-10-05", "2026-10-05", "2026-10-04"), false);
  assert.equal(privacy.validRange("2026-10-04", "2026-10-03", "2026-10-04"), false);
  assert.equal(privacy.validRange("2026-02-30", "2026-03-01", "2026-03-01"), false);
});
test("licensed local DB-IP snapshot integrity and IPv4/IPv6 lookups", async () => {
  const data = gunzipSync(await readFile("artifacts/api-server/analytics-data/country.mmdb.gz"));
  const meta = JSON.parse(await readFile("artifacts/api-server/analytics-data/release.json", "utf8"));
  assert.equal(createHash("sha1").update(data).digest("hex"), meta.uncompressedSha1);
  const reader = new Reader(data);
  assert.equal(reader.metadata.databaseType, "DBIP-Country-Lite");
  assert.equal(reader.metadata.buildEpoch.toISOString().slice(0, 7), meta.release);
  assert.equal(reader.get("8.8.8.8").country.iso_code, "US");
  assert.match(reader.get("2001:4860:4860::8888").country.iso_code, /^[A-Z]{2}$/);
  assert.equal(reader.get("127.0.0.1"), null);
});
test("existing ADMIN middleware denies anonymous reads before querying Clerk", async () => {
  const statuses = [];
  const res = { status(code) { statuses.push(code); return this; }, json() {} };
  let passed = false;
  await auth.requireAdmin({}, res, () => { passed = true; });
  assert.deepEqual(statuses, [401]);
  assert.equal(passed, false);
});
test("existing ADMIN middleware denies artists, ordinary users and unverified/secondary admin email", async () => {
  for (const id of ["ordinary", "artist", "unverified-admin", "secondary-admin"]) {
    const statuses = [];
    const res = { status(code) { statuses.push(code); return this; }, json() {} };
    let passed = false;
    await auth.requireAdmin({ unitTestUserId: id }, res, () => { passed = true; });
    assert.deepEqual(statuses, [403], id);
    assert.equal(passed, false, id);
  }
});
test("existing ADMIN middleware accepts only the verified authorized primary email", async () => {
  const req = { unitTestUserId: "verified-admin" };
  let passed = false;
  await auth.requireAdmin(req, { status() { throw new Error("unexpected refusal"); } }, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.clerkIsAdmin, true);
});