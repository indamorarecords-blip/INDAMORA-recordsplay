import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("Stripe Shop reactivation is a new revision; retries remain idempotent", async () => {
  process.env.NODE_ENV = "development";
  const dir = await fs.mkdtemp(path.join(tmpdir(), "shop-stripe-revision-"));
  try {
    await build({
      entryPoints: ["src/lib/shop-stripe-catalog.ts"], outfile: path.join(dir, "catalog.mjs"),
      platform: "node", format: "esm", bundle: true,
      plugins: [{ name: "isolated-stripe", setup(builder) {
        builder.onResolve({ filter: /storeStripeClient$/ }, () => ({ path: "stripe", namespace: "fixture" }));
        builder.onResolve({ filter: /shop-test$/ }, () => ({ path: "validation", namespace: "fixture" }));
        builder.onLoad({ filter: /validation/, namespace: "fixture" }, () => ({
          contents: "export const validateProduct = value => value; export class ShopError extends Error {}",
        }));
        builder.onLoad({ filter: /stripe/, namespace: "fixture" }, () => ({ contents: `
          const price = {id:"price_fixture",active:true,livemode:false,currency:"eur",type:"one_time",unit_amount:300};
          const product = {id:"prod_fixture",active:false,livemode:false,name:"QA",description:"",
            metadata:{storeFlow:"indamora-play-boutique-v1",indamoraStoreSku:"qa"},default_price:price};
          const replies = new Map();
          export const formData = data => new URLSearchParams(Object.entries(data).map(([k,v])=>[k,String(v)]));
          async function request(url, options) {
            if (url.startsWith("/v1/prices?")) return {data:[price],has_more:false};
            if (options?.method === "POST") {
              if (replies.has(options.idempotencyKey)) return structuredClone(replies.get(options.idempotencyKey));
              for (const [key,value] of options.params) {
                const match = key.match(/^metadata\\[(.*)\\]$/);
                if (match) product.metadata[match[1]]=value;
                else if (key==="active") product.active=value==="true";
                else if (key!=="default_price") product[key]=value;
              }
              replies.set(options.idempotencyKey,structuredClone(product));
            }
            return structuredClone(product);
          }
          export async function storeStripeApi(url, options) { return request(url, options); }
          export async function storeStripeCatalogSetupApi(url, options) { return request(url, options); }
        ` }));
      } }],
    });
    const { writeStripeShopProduct, readStripeShopProduct, stripeShopPrice } =
      await import(pathToFileURL(path.join(dir, "catalog.mjs")).href);
    const base = { id: "qa", name: "QA", description: "", priceCents: 300,
      visible: true, variants: [], updatedAt: "2026-10-09T00:00:00Z" };
    for (const [revision, status] of [[1, "active"], [2, "archived"], [3, "active"]]) {
      await writeStripeShopProduct({ ...base, revision, status }, "prod_fixture");
      const stored = await readStripeShopProduct("prod_fixture", "qa", revision, base.updatedAt);
      assert.equal(stored.status, status);
    }
    // Repeating the exact same edit must preserve the already-applied result.
    await writeStripeShopProduct({ ...base, revision: 3, status: "active" }, "prod_fixture");
    assert.equal((await stripeShopPrice("prod_fixture")).unit_amount, 300);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
