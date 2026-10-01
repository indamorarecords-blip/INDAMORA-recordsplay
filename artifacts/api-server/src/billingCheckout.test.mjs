import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

// Exercise the real production router with isolated Stripe/auth/DB fixtures.
// No request in this regression test can reach Stripe or Clerk.
test("Premium Checkout registration diagnostics do not disable valid LIVE offers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "indamora-checkout-"));
  const environmentKeys = [
    "NODE_ENV", "STRIPE_PRICE_AFRICA_MONTHLY",
    "STRIPE_PRICE_INTERNATIONAL_MONTHLY", "PUBLIC_APP_URL",
  ];
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  let server;
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      STRIPE_PRICE_AFRICA_MONTHLY: "price_live_africa",
      STRIPE_PRICE_INTERNATIONAL_MONTHLY: "price_live_international",
      PUBLIC_APP_URL: "https://indamoraplay.com",
    });
    const mockModules = {
      "@clerk/express": `
        export const clerkClient = { users: { getUser() { throw new Error("Unexpected Clerk write/read"); } } };
        export const getAuth = () => ({ userId: globalThis.billingFixture.authenticated ? "fixture-user" : null });
      `,
      "@workspace/db": `
        const selection = { from() { return this; }, where() { return this; },
          limit: async () => [{ stripeCustomerId: "cus_fixture" }] };
        export const db = { select: () => selection, transaction: async fn => fn(db), execute: async () => {} };
        export const billingAccountsTable = { clerkUserId: "user", stripeCustomerId: "customer" };
      `,
      "../middlewares/auth": "export const requireAuth = (_req, _res, next) => next();",
      "../stripeClient": `
        export const formData = entries => {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(entries)) {
            if (value !== undefined) params.set(key, String(value));
          }
          return params;
        };
        export const stripeApi = async (path, options = {}) => {
          const fixture = globalThis.billingFixture;
          if (path.startsWith("/v1/prices/")) {
            const africa = path.endsWith("price_live_africa");
            return { id: africa ? "price_live_africa" : "price_live_international",
              active: true, livemode: !fixture.testPrice, type: "recurring",
              currency: africa ? "xaf" : "eur", unit_amount: fixture.wrongAmount ? 501 : 500,
              recurring: { interval: "month" },
              metadata: { indamoraPlan: africa ? "premium_africa_monthly" : "premium_international_monthly" } };
          }
          if (path.startsWith("/v1/webhook_endpoints")) return { data: [] };
          if (path === "/v1/customers/cus_fixture") return { id: "cus_fixture", livemode: true };
          if (path.startsWith("/v1/subscriptions?")) return { data: [], has_more: false };
          if (path.startsWith("/v1/checkout/sessions?")) return { data: [], has_more: false };
          if (path === "/v1/checkout/sessions" && options.method === "POST") {
            fixture.checkoutParams = Object.fromEntries(options.params);
            return { id: "cs_fixture", mode: "subscription", status: "open",
              livemode: !fixture.testSession,
              url: fixture.untrustedUrl ? "https://example.com/pay" : "https://checkout.stripe.com/c/pay/cs_fixture" };
          }
          throw new Error("Unexpected Stripe operation: " + path);
        };
      `,
    };
    const outputPath = join(directory, "billing.mjs");
    await build({
      entryPoints: ["src/routes/billing.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: outputPath,
      platform: "node",
      format: "esm",
      bundle: true,
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      plugins: [{
        name: "isolated-billing-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(mockModules, args.path)
              ? { path: args.path, namespace: "billing-fixture" }
              : undefined);
          builder.onLoad({ filter: /.*/, namespace: "billing-fixture" }, (args) => ({
            contents: mockModules[args.path],
            loader: "js",
          }));
        },
      }],
    });
    const harnessPath = join(directory, "harness.mjs");
    await writeFile(harnessPath, `
      import express from ${JSON.stringify(import.meta.resolve("express"))};
      import billing from "./billing.mjs";
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => { req.log = { error() {} }; next(); });
      app.use("/api", billing);
      export default app;
    `);
    const { default: app } = await import(pathToFileURL(harnessPath).href);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const checkout = (plan) => fetch(`${base}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "subscription", plan, priceId: "untrusted-client-price" }),
    });
    const reset = (overrides = {}) => {
      globalThis.billingFixture = { authenticated: true, ...overrides };
    };
    await t.test("both validated LIVE prices stay available with webhookReady false", async () => {
      reset();
      const response = await fetch(`${base}/billing/plans`);
      const readiness = await response.json();
      assert.equal(readiness.mode, "live");
      assert.equal(readiness.available, true);
      assert.equal(readiness.webhookReady, false);
      assert.deepEqual(readiness.plans, { africa: { available: true }, international: { available: true } });
    });
    for (const [plan, priceId] of [
      ["africa", "price_live_africa"],
      ["international", "price_live_international"],
    ]) {
      await t.test(`${plan} uses only its server-configured price and opens secure LIVE Checkout`, async () => {
        reset();
        const response = await checkout(plan);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).url, "https://checkout.stripe.com/c/pay/cs_fixture");
        assert.equal(globalThis.billingFixture.checkoutParams["line_items[0][price]"], priceId);
        assert.equal(globalThis.billingFixture.checkoutParams.mode, "subscription");
        assert.equal(globalThis.billingFixture.checkoutParams["line_items[0][quantity]"], "1");
      });
    }
    await t.test("authentication remains mandatory", async () => {
      reset({ authenticated: false });
      assert.equal((await checkout("africa")).status, 401);
      assert.equal(globalThis.billingFixture.checkoutParams, undefined);
    });
    for (const overrides of [{ testPrice: true }, { wrongAmount: true }]) {
      await t.test(`invalid price cannot create Checkout: ${JSON.stringify(overrides)}`, async () => {
        reset(overrides);
        assert.equal((await checkout("africa")).status, 503);
        assert.equal(globalThis.billingFixture.checkoutParams, undefined);
      });
    }
    for (const overrides of [{ testSession: true }, { untrustedUrl: true }]) {
      await t.test(`unsafe returned Checkout is rejected: ${JSON.stringify(overrides)}`, async () => {
        reset(overrides);
        assert.equal((await checkout("africa")).status, 502);
      });
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete globalThis.billingFixture;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});