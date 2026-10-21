import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("Shop runtime boundaries are fail-closed without changing environment settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shop-runtime-fixture-"));
  try {
    await build({
      entryPoints: ["src/lib/shop-runtime.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: join(directory, "runtime.mjs"),
      platform: "node", format: "esm", bundle: true,
    });
    const runtime = await import(pathToFileURL(join(directory, "runtime.mjs")).href);
    const dev = { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "fixture.replit.dev",
      STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET: "whsec_test_fixture" };
    const live = { NODE_ENV: "production", STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET: "whsec_test_fixture" };
    assert.equal(runtime.shopMode(dev), "test");
    assert.equal(runtime.shopMode(live), "live");
    assert.equal(runtime.shopRoutesEnabled(dev), true);
    assert.equal(runtime.shopRoutesEnabled(live), false);
    assert.equal(runtime.shopRoutesEnabled({ NODE_ENV: "test", BOUTIQUE_LIVE_ENABLED: "true" }), false);
    assert.equal(runtime.shopRoutesEnabled({ ...live, BOUTIQUE_LIVE_ENABLED: "true" }), true);
    const catalogSetup = { ...live, BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED: "true" };
    assert.equal(runtime.shopAdminSetupRoutesEnabled(live), false);
    assert.equal(runtime.shopAdminSetupRoutesEnabled(catalogSetup), true);
    assert.equal(runtime.shopRoutesEnabled(catalogSetup), false, "catalog setup never opens public routes");
    assert.equal(runtime.shopRouteAccessEnabled("/admin/products", catalogSetup), true);
    assert.equal(runtime.shopRouteAccessEnabled("/api/shop/admin/products", catalogSetup), true);
    assert.equal(runtime.shopRouteAccessEnabled("/catalog", catalogSetup), false);
    assert.equal(runtime.shopRouteAccessEnabled("/api/shop/quote", catalogSetup), false);
    assert.equal(runtime.shopRouteAccessEnabled("/shop-admin", catalogSetup), false);
    assert.equal(runtime.shopAdminSetupRoutesEnabled({
      NODE_ENV: "test", BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED: "true",
    }), false);
    assert.equal(runtime.shopWebhookSecret(live), undefined);
    assert.equal(runtime.shopWebhookEnabled(live), false);
    assert.equal(runtime.shopWebhookEnabled({ ...live, STRIPE_BOUTIQUE_LIVE_WEBHOOK_SECRET: "whsec_live_fixture" }), true);
    assert.equal(runtime.shopReturnBase(dev), "https://fixture.replit.dev/boutique");
    assert.equal(runtime.shopReturnBase(live), "https://indamoraplay.com/boutique");
    assert.equal(runtime.shopReturnBase({ ...dev, REPLIT_DEV_DOMAIN: "https://attacker.invalid" }), null);
    assert.equal(runtime.shopReturnBase({ ...dev, REPLIT_DEV_DOMAIN: "https://user:pass@fixture.replit.dev" }), null);
    assert.deepEqual([...runtime.shopAllowedHosts(live)], ["indamoraplay.com"]);
    assert.ok(runtime.SHOP_WEBHOOK_EVENTS.includes("checkout.session.expired"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
