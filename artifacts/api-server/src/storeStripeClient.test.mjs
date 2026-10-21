import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("Boutique key-prefix matrix uses fictitious keys and mocked HTTP only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "boutique-prefix-fixture-"));
  const originalFetch = globalThis.fetch;
  try {
    await build({
      entryPoints: ["src/storeStripeClient.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: join(directory, "client.mjs"),
      platform: "node",
      format: "esm",
      bundle: true,
    });
    const { storeStripeApi, StoreTestConfigurationError } =
      await import(pathToFileURL(join(directory, "client.mjs")).href);
    const cases = [
      ["LIVE accepts sk_live_", "production", "sk_live_", true],
      ["LIVE accepts rk_live_", "production", "rk_live_", true],
      ["LIVE rejects sk_test_", "production", "sk_test_", false],
      ["LIVE rejects rk_test_", "production", "rk_test_", false],
      ["LIVE rejects pk_live_", "production", "pk_live_", false],
      ["LIVE rejects pk_test_", "production", "pk_test_", false],
      ["TEST accepts sk_test_", "development", "sk_test_", true],
      ["TEST rejects sk_live_", "development", "sk_live_", false],
      ["TEST rejects rk_live_", "development", "rk_live_", false],
      ["TEST accepts rk_test_", "development", "rk_test_", true],
      ["TEST rejects pk_live_", "development", "pk_live_", false],
      ["TEST rejects pk_test_", "development", "pk_test_", false],
    ];
    for (const [name, environment, prefix, accepted] of cases) {
      await t.test(name, async () => {
        const live = environment === "production";
        const candidate = `${prefix}fixture_not_a_real_key`;
        process.env.NODE_ENV = environment;
        process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = live
          ? "sk_test_fixture_not_a_real_key" : candidate;
        process.env.STRIPE_BOUTIQUE_LIVE_SECRET_KEY = live
          ? candidate : "sk_live_fixture_not_a_real_key";
        delete process.env.BOUTIQUE_LIVE_ENABLED;
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          return new Response(JSON.stringify({ livemode: live }), { status: 200 });
        };
        if (accepted) {
          assert.equal((await storeStripeApi("/v1/balance")).livemode, live);
          assert.equal(calls, 1);
          if (live) {
            await assert.rejects(
              storeStripeApi("/v1/checkout/sessions", { method: "POST" }),
              StoreTestConfigurationError,
            );
            assert.equal(calls, 1, "LIVE writes remain blocked before mocked HTTP");
          }
        } else {
          await assert.rejects(storeStripeApi("/v1/balance"), StoreTestConfigurationError);
          assert.equal(calls, 0, "Invalid prefixes are rejected before mocked HTTP");
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NODE_ENV;
    delete process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY;
    delete process.env.STRIPE_BOUTIQUE_LIVE_SECRET_KEY;
    delete process.env.BOUTIQUE_LIVE_ENABLED;
    await rm(directory, { recursive: true, force: true });
  }
});

test("dedicated Boutique transport isolates TEST/LIVE keys and blocks LIVE writes by default", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boutique-client-fixture-"));
  const originalFetch = globalThis.fetch;
  const envKeys = [
    "NODE_ENV",
    "STRIPE_BOUTIQUE_TEST_SECRET_KEY",
    "STRIPE_BOUTIQUE_LIVE_SECRET_KEY",
    "BOUTIQUE_LIVE_ENABLED",
    "BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED",
  ];
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  let calls = 0;
  try {
    await build({
      entryPoints: ["src/storeStripeClient.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: join(directory, "client.mjs"),
      platform: "node",
      format: "esm",
      bundle: true,
    });
    const { storeStripeApi, storeStripeCatalogSetupApi } =
      await import(pathToFileURL(join(directory, "client.mjs")).href);
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ object: "balance", livemode: false }), { status: 200 });
    };
    process.env.NODE_ENV = "development";
    delete process.env.STRIPE_BOUTIQUE_LIVE_SECRET_KEY;
    delete process.env.BOUTIQUE_LIVE_ENABLED;
    delete process.env.BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED;
    delete process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY;
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "sk_live_fixture_not_a_real_key";
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "rk_test_fixture_not_a_real_key";
    assert.equal((await storeStripeApi("/v1/balance")).livemode, false);
    assert.equal(calls, 1);
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "sk_test_fixture_not_a_real_key";
    assert.equal((await storeStripeApi("/v1/balance")).livemode, false);
    assert.equal(calls, 2);
    process.env.NODE_ENV = "production";
    await assert.rejects(storeStripeApi("/v1/balance"));
    assert.equal(calls, 2);
    process.env.NODE_ENV = "development";
    await assert.rejects(storeStripeApi("https://another-host.invalid/v1/balance"));
    assert.equal(calls, 2);
    assert.equal((await storeStripeApi("/v1/balance")).livemode, false);
    assert.equal(calls, 3);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ object: "balance", livemode: true }), { status: 200 });
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.NODE_ENV = "production";
    process.env.STRIPE_BOUTIQUE_LIVE_SECRET_KEY = "sk_test_fixture_not_a_real_key";
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_LIVE_SECRET_KEY = "sk_live_fixture_not_a_real_key";
    assert.equal((await storeStripeApi("/v1/balance")).livemode, true);
    await assert.rejects(storeStripeApi("/v1/checkout/sessions", { method: "POST" }));
    process.env.BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED = "true";
    await assert.rejects(storeStripeApi("/v1/products", { method: "POST" }));
    assert.equal((await storeStripeCatalogSetupApi("/v1/products", { method: "POST" })).livemode, true);
    process.env.BOUTIQUE_LIVE_ENABLED = "true";
    assert.equal((await storeStripeApi("/v1/checkout/sessions", { method: "POST" })).livemode, true);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ object: "balance", livemode: false }), { status: 200 });
    await assert.rejects(storeStripeApi("/v1/balance"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
