import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

// All Stripe operations use fixtures. This test never reaches Stripe or a DB.
test("Boutique TEST validates prices, shipping, payment proof and production isolation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "indamora-store-"));
  let server;
  const skus = ["tshirt", "cap", "bob", "tote-bag", "phone-case"];
  process.env.NODE_ENV = "development";
  process.env.REPLIT_DEV_DOMAIN = "store-fixture.replit.dev";
  process.env.STRIPE_WEBHOOK_SECRET = "fixture-only-not-a-real-secret";

  const reset = (overrides = {}) => {
    process.env.NODE_ENV = "development";
    globalThis.storeFixture = {
      prices: skus.map((sku) => ({
        id: `price_test_${sku}`,
        active: true,
        type: "one_time",
        currency: "eur",
        unit_amount: 1500,
        livemode: false,
        metadata: { indamoraStoreSku: sku },
        product: { id: `prod_test_${sku}`, active: true, livemode: false, metadata: { indamoraStoreSku: sku } },
      })),
      webhookReady: true,
      calls: [],
      ...overrides,
    };
  };

  try {
    const stripeMock = `
      export const formData = (entries) => new URLSearchParams(Object.entries(entries).filter(([,value]) => value !== undefined).map(([key,value]) => [key,String(value)]));
      export async function stripeApi(path, options = {}) {
        const fixture = globalThis.storeFixture;
        fixture.calls.push({path, options});
        if (path.startsWith("/v1/prices?")) return {data: fixture.prices, has_more:false};
        if (path.startsWith("/v1/webhook_endpoints?")) return {data: fixture.webhookReady ? [{
          url:"https://store-fixture.replit.dev/api/stripe/webhook", status:"enabled", livemode:false,
          enabled_events:["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed"]
        }] : []};
        if (path === "/v1/checkout/sessions" && options.method === "POST") {
          fixture.checkoutParams = Object.fromEntries(options.params);
          const params = fixture.checkoutParams;
          const quantity = Object.entries(params).filter(([key]) => /^line_items\\[\\d+\\]\\[quantity\\]$/.test(key)).reduce((sum,[,value]) => sum + Number(value),0);
          return {
            id:"cs_test_store_fixture_123", url:"https://checkout.stripe.com/c/pay/cs_test_store_fixture_123",
            mode:"payment", livemode:false, currency:"eur",
            amount_total:quantity * 1500 + Number(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]),
            metadata:{storeFlow:"indamora-play-boutique-v1"}, ...fixture.sessionOverride
          };
        }
        if (path.startsWith("/v1/checkout/sessions/")) return {
          id:"cs_test_store_fixture_123", mode:"payment", livemode:false, currency:"eur", amount_total:1500,
          status:"complete", payment_status:"unpaid", metadata:{storeFlow:"indamora-play-boutique-v1"},
          ...fixture.sessionOverride
        };
        if (path.startsWith("/v1/payment_intents/")) return {livemode:false, status:fixture.paymentIntentStatus ?? "processing"};
        throw new Error("Unexpected Stripe fixture request");
      }
    `;
    await build({
      entryPoints: ["src/routes/store.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: join(directory, "store.mjs"),
      platform: "node",
      format: "esm",
      bundle: true,
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      plugins: [{
        name: "isolated-store-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /^\.\.\/stripeClient$/ }, () => ({ path: "stripeClient", namespace: "store-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "store-fixture" }, () => ({ contents: stripeMock, loader: "js" }));
        },
      }],
    });
    await writeFile(join(directory, "harness.mjs"), `
      import express from ${JSON.stringify(import.meta.resolve("express"))};
      import store from "./store.mjs";
      const app = express();
      app.use(express.json());
      app.use((req,_res,next) => {req.log = {warn(){},error(){}}; next();});
      app.use("/api", store);
      export default app;
    `);
    const { default: app } = await import(pathToFileURL(join(directory, "harness.mjs")).href);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/store`;
    const checkout = (shippingCountry, items = [{ sku: "tshirt", quantity: 2 }], extra = {}) =>
      fetch(`${base}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, shippingCountry, ...extra }),
      });

    await t.test("catalog has exactly the five €15 products", async () => {
      reset();
      const response = await fetch(`${base}/catalog`);
      const catalog = await response.json();
      assert.equal(response.status, 200);
      assert.equal(catalog.mode, "test");
      assert.equal(catalog.checkoutAvailable, true);
      assert.deepEqual(catalog.products.map((product) => product.sku), skus);
      assert.ok(catalog.products.every((product) => product.priceCents === 1500));
    });
    for (const [country, shipping] of [["FR", 0], ["DE", 700]]) {
      await t.test(`${country} shipping is ${shipping} cents and only server prices are used`, async () => {
        reset();
        const response = await checkout(country);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).mode, "test");
        const params = globalThis.storeFixture.checkoutParams;
        assert.equal(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], String(shipping));
        assert.equal(params["shipping_address_collection[allowed_countries][0]"], country);
        assert.equal(params["line_items[0][price]"], "price_test_tshirt");
        assert.equal(params["line_items[0][quantity]"], "2");
        assert.equal(params.mode, "payment");
        assert.ok(params.success_url.startsWith("https://store-fixture.replit.dev/boutique"));
        assert.ok(!Object.keys(params).some((key) => key.startsWith("payment_method_types")));
      });
    }
    await t.test("unsupported countries, invalid quantities, duplicates and client prices are refused", async () => {
      for (const [country, items, extra] of [
        ["US", [{ sku: "tshirt", quantity: 1 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 0 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 1 }, { sku: "tshirt", quantity: 1 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 1 }], { priceId: "client-selected-price" }],
      ]) {
        reset();
        assert.equal((await checkout(country, items, extra)).status, 400);
        assert.equal(globalThis.storeFixture.checkoutParams, undefined);
      }
    });
    await t.test("missing signed TEST webhook blocks Session creation", async () => {
      reset({ webhookReady: false });
      assert.equal((await checkout("FR")).status, 503);
      assert.equal(globalThis.storeFixture.checkoutParams, undefined);
    });
    await t.test("LIVE prices and LIVE sessions are never accepted", async () => {
      reset();
      globalThis.storeFixture.prices[0].livemode = true;
      assert.equal((await checkout("FR")).status, 503);
      reset({ sessionOverride: { livemode: true } });
      assert.equal((await checkout("FR")).status, 502);
    });
    await t.test("return URL is not payment proof: only Stripe payment_status paid succeeds", async () => {
      reset();
      const pending = await fetch(`${base}/checkout/status?sessionId=cs_test_store_fixture_123`);
      assert.equal((await pending.json()).status, "pending");
      reset({ sessionOverride: { payment_status: "paid" } });
      const paid = await fetch(`${base}/checkout/status?sessionId=cs_test_store_fixture_123`);
      assert.equal((await paid.json()).status, "paid");
      reset({ sessionOverride: { livemode: true, payment_status: "paid" } });
      assert.equal((await fetch(`${base}/checkout/status?sessionId=cs_test_store_fixture_123`)).status, 404);
      reset();
      assert.equal((await fetch(`${base}/checkout/status?sessionId=cs_live_invalid`)).status, 400);
    });
    await t.test("production cannot expose these TEST APIs or call Stripe", async () => {
      reset();
      process.env.NODE_ENV = "production";
      assert.equal((await fetch(`${base}/catalog`)).status, 404);
      assert.equal((await checkout("FR")).status, 404);
      assert.equal(globalThis.storeFixture.calls.length, 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete globalThis.storeFixture;
    await rm(directory, { recursive: true, force: true });
  }
});
