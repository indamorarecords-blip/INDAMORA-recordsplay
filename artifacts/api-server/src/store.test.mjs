import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { createHmac } from "node:crypto";

// All Stripe operations use fixtures. This test never reaches Stripe or a DB.
test("Boutique TEST validates prices, shipping, payment proof and production isolation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "indamora-store-"));
  let server;
  const skus = ["tshirt", "bob", "tote-bag", "hoodie"];
  process.env.NODE_ENV = "development";
  process.env.SHOP_TEST_PERSISTENCE = "files";
  process.env.REPLIT_DEV_DOMAIN = "store-fixture.replit.dev";
  const webhookSecret = "whsec_fixture_only_not_a_real_secret";

  const reset = (overrides = {}) => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET = webhookSecret;
    globalThis.storeFixture = {
      prices: skus.map((sku) => ({
        id: `price_test_${sku}`,
        active: true,
        type: "one_time",
        currency: "eur",
        unit_amount: sku === "hoodie" ? 2500 : 1500,
        livemode: false,
        metadata: { indamoraStoreSku: sku },
        product: { id: `prod_test_${sku}`, active: true, livemode: false, metadata: { indamoraStoreSku: sku } },
      })),
      webhookReady: true,
      calls: [],
      logs: [],
      ...overrides,
    };
  };

  try {
    const stripeMock = `
      export const formData = (entries) => new URLSearchParams(Object.entries(entries).filter(([,value]) => value !== undefined).map(([key,value]) => [key,String(value)]));
      export async function storeStripeApi(path, options = {}) {
        const fixture = globalThis.storeFixture;
        fixture.calls.push({path, options});
        if (path.startsWith("/v1/prices?")) return {data: fixture.prices, has_more:false};
        if (path.startsWith("/v1/webhook_endpoints?")) return {data: fixture.webhookReady ? [{
          url:"https://store-fixture.replit.dev/api/store/stripe/webhook", status:"enabled", livemode:false,
          enabled_events:["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed"]
        }] : []};
        if (path === "/v1/checkout/sessions" && options.method === "POST") {
          fixture.checkoutParams = Object.fromEntries(options.params);
          const params = fixture.checkoutParams;
          const subtotal = Object.entries(params).filter(([key]) => /^line_items\\[\\d+\\]\\[quantity\\]$/.test(key)).reduce((sum,[key,value]) => {
            const priceId = params[key.replace("[quantity]", "[price]")];
            return sum + Number(value) * fixture.prices.find(price => price.id === priceId).unit_amount;
          },0);
          return {
            id:"cs_test_store_fixture_123", url:"https://checkout.stripe.com/c/pay/cs_test_store_fixture_123",
            mode:"payment", livemode:false, currency:"eur",
            amount_total:subtotal + Number(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]),
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
      entryPoints: { store: "src/routes/store.ts", "store-webhook": "src/routes/store-webhook.ts" },
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outdir: directory,
      outExtension: { ".js": ".mjs" },
      platform: "node",
      format: "esm",
      bundle: true,
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      plugins: [{
        name: "isolated-store-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /\/lib\/shop-test$|shop-repository$/ }, () => ({ path: "shop-fixture", namespace: "shop-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "shop-fixture" }, () => ({ contents: `
            export const shopTest = {
              read: async () => ({ products: ["tshirt","bob","tote-bag","hoodie"].map(id => ({ id, variants: (id === "tshirt" ? ["rose","noir","blanc"] : id === "bob" ? ["blanc","noir","orange"] : ["unique"]).map(id => ({id})) })) }),
              reserve: async () => {}, release: async () => {}, attachSession: async () => {}, settleSession: async () => {}
            };
            export const shop = shopTest;
            export const persistentShop = {};
            export const isPersistentShop = () => false;
          `, loader: "js" }));
          builder.onResolve({ filter: /^\.\.\/storeStripeClient$/ }, () => ({ path: "storeStripeClient", namespace: "store-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "store-fixture" }, () => ({ contents: stripeMock, loader: "js" }));
        },
      }],
    });
    await writeFile(join(directory, "harness.mjs"), `
      import express from ${JSON.stringify(import.meta.resolve("express"))};
      import store from "./store.mjs";
      import storeWebhook from "./store-webhook.mjs";
      const app = express();
      app.use((req,_res,next) => {req.log = {warn(){},error(){},info(entry){globalThis.storeFixture.logs.push(entry);}}; next();});
      app.use(storeWebhook);
      app.use(express.json());
      app.use("/api", store);
      export default app;
    `);
    const { default: app } = await import(pathToFileURL(join(directory, "harness.mjs")).href);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/store`;
    const checkout = (shippingCountry, items = [{ sku: "tshirt", color: "rose", quantity: 2 }], extra = {}) =>
      fetch(`${base}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, shippingCountry, ...extra }),
      });
    const webhook = (overrides = {}, signingSecret = webhookSecret) => {
      const body = JSON.stringify({
        id: "evt_store_fixture_only",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: "cs_test_store_fixture_123", mode: "payment", metadata: { storeFlow: "indamora-play-boutique-v1" } } },
        ...overrides,
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${body}`).digest("hex");
      return fetch(`${base}/stripe/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` },
        body,
      });
    };

    await t.test("catalog has four products, hoodie €25 and other products €15", async () => {
      reset();
      const response = await fetch(`${base}/catalog`);
      const catalog = await response.json();
      assert.equal(response.status, 200);
      assert.equal(catalog.mode, "test");
      assert.equal(catalog.checkoutAvailable, true);
      assert.deepEqual(catalog.products.map((product) => product.sku), skus);
      assert.ok(catalog.products.every((product) => product.priceCents === (product.sku === "hoodie" ? 2500 : 1500)));
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
    await t.test("different colors share a SKU but retain separate checkout lines and metadata", async () => {
      reset();
      const items = [
        { sku: "tshirt", color: "rose", quantity: 1 },
        { sku: "tshirt", color: "noir", quantity: 2 },
        { sku: "bob", color: "orange", quantity: 1 },
        { sku: "hoodie", quantity: 2 },
      ];
      assert.equal((await checkout("DE", items)).status, 200);
      const params = globalThis.storeFixture.checkoutParams;
      assert.equal(params["metadata[item_1_color]"], "rose");
      assert.equal(params["metadata[item_2_color]"], "noir");
      assert.equal(params["payment_intent_data[metadata][item_3_color]"], "orange");
      assert.equal(params["line_items[3][price]"], "price_test_hoodie");
      assert.equal(params["line_items[3][quantity]"], "2");
    });
    await t.test("missing, unsupported and duplicate colors are refused before Stripe", async () => {
      for (const items of [
        [{ sku: "tshirt", quantity: 1 }],
        [{ sku: "tshirt", color: "orange", quantity: 1 }],
        [{ sku: "bob", color: "rose", quantity: 1 }],
        [{ sku: "hoodie", color: "blanc", quantity: 1 }],
        [{ sku: "bob", color: "noir", quantity: 1 }, { sku: "bob", color: "noir", quantity: 1 }],
      ]) {
        reset();
        assert.equal((await checkout("FR", items)).status, 400);
        assert.equal(globalThis.storeFixture.calls.length, 0);
      }
    });
    await t.test("old €15 hoodie price blocks TEST checkout instead of undercharging", async () => {
      reset();
      globalThis.storeFixture.prices.find(price => price.metadata.indamoraStoreSku === "hoodie").unit_amount = 1500;
      const catalog = await (await fetch(`${base}/catalog`)).json();
      assert.equal(catalog.products.find(product => product.sku === "hoodie").priceCents, 2500);
      assert.equal(catalog.checkoutAvailable, false);
      assert.equal((await checkout("FR", [{ sku: "hoodie", quantity: 1 }])).status, 503);
      assert.ok(!globalThis.storeFixture.calls.some(call => call.options.method === "POST"));
    });
    await t.test("unsupported countries, invalid quantities, duplicates and client prices are refused", async () => {
      for (const [country, items, extra] of [
        ["US", [{ sku: "tshirt", quantity: 1 }], {}],
        ["GB", [{ sku: "tshirt", quantity: 1 }], {}],
        ["CH", [{ sku: "tshirt", quantity: 1 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 0 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 1 }, { sku: "tshirt", quantity: 1 }], {}],
        ["FR", [{ sku: "tshirt", quantity: 1 }], { priceId: "client-selected-price" }],
        ["FR", [{ sku: "cap", quantity: 1 }], {}],
        ["FR", [{ sku: "phone-case", quantity: 1 }], {}],
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
    await t.test("dedicated webhook rejects invalid signatures and signed LIVE events", async () => {
      reset();
      assert.equal((await webhook({}, "whsec_wrong_fixture")).status, 400);
      assert.equal((await webhook({ livemode: true })).status, 400);
      assert.equal(globalThis.storeFixture.calls.length, 0);
    });
    await t.test("signed unrelated TEST events do not touch other payment flows", async () => {
      reset();
      const response = await webhook({ data: { object: { id: "cs_test_other_flow", mode: "payment", metadata: { kind: "donation" } } } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ignored, true);
      assert.equal(globalThis.storeFixture.calls.length, 0);
    });
    await t.test("webhook replays only verify Stripe and have no write-side business effects", async () => {
      reset({ sessionOverride: { payment_status: "paid" } });
      assert.equal((await webhook()).status, 200);
      assert.equal((await webhook()).status, 200);
      assert.ok(globalThis.storeFixture.logs.every((entry) => entry.paid === true));
      assert.equal(globalThis.storeFixture.calls.length, 2);
      assert.ok(globalThis.storeFixture.calls.every((call) => !call.options.method));
    });
    await t.test("async success requires authoritative paid status and missing webhook configuration fails closed", async () => {
      reset();
      assert.equal((await webhook({ type: "checkout.session.async_payment_succeeded" })).status, 503);
      assert.equal(globalThis.storeFixture.logs.length, 0);
      reset();
      assert.equal((await webhook({ type: "checkout.session.async_payment_failed" })).status, 200);
      assert.equal(globalThis.storeFixture.logs[0].paid, false);
      delete process.env.STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET;
      assert.equal((await webhook()).status, 503);
    });
    await t.test("production cannot expose these TEST APIs or call Stripe", async () => {
      reset();
      process.env.NODE_ENV = "production";
      assert.equal((await fetch(`${base}/catalog`)).status, 404);
      assert.equal((await checkout("FR")).status, 404);
      assert.equal((await webhook()).status, 404);
      assert.equal(globalThis.storeFixture.calls.length, 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete globalThis.storeFixture;
    await rm(directory, { recursive: true, force: true });
  }
});
