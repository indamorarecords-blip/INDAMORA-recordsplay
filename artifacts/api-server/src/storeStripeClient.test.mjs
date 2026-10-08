import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("dedicated Boutique transport refuses non-TEST keys and production before any network access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boutique-client-fixture-"));
  const originalFetch = globalThis.fetch;
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
    const { storeStripeApi } = await import(pathToFileURL(join(directory, "client.mjs")).href);
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ object: "balance", livemode: false }), { status: 200 });
    };
    process.env.NODE_ENV = "development";
    delete process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY;
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "sk_live_fixture_not_a_real_key";
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "rk_test_fixture_not_a_real_key";
    await assert.rejects(storeStripeApi("/v1/balance"));
    process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY = "sk_test_fixture_not_a_real_key";
    process.env.NODE_ENV = "production";
    await assert.rejects(storeStripeApi("/v1/balance"));
    assert.equal(calls, 0);
    process.env.NODE_ENV = "development";
    await assert.rejects(storeStripeApi("https://another-host.invalid/v1/balance"));
    assert.equal(calls, 0);
    assert.equal((await storeStripeApi("/v1/balance")).livemode, false);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ object: "balance", livemode: true }), { status: 200 });
    await assert.rejects(storeStripeApi("/v1/balance"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
