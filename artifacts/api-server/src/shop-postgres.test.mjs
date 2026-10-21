import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("Postgres Shop can initialize an empty catalog without overwriting existing records", async t => {
  const previousNodeEnv = process.env.NODE_ENV;
  const dir = await fs.mkdtemp(path.join(tmpdir(), "shop-postgres-fixture-"));
  const fixture = { orphanTable: null, writes: [] };
  globalThis.__shopPostgresFixture = fixture;
  process.env.NODE_ENV = "production";
  try {
    await build({
      entryPoints: ["src/lib/shop-postgres.ts"],
      absWorkingDir: process.cwd(),
      outfile: path.join(dir, "shop-postgres.mjs"),
      platform: "node",
      format: "esm",
      bundle: true,
      plugins: [{
        name: "isolated-postgres-shop-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
          builder.onResolve({ filter: /\/shop-test$/ }, () => ({ path: "shop-test", namespace: "fixture" }));
          builder.onResolve({ filter: /\/shop-stripe-catalog$/ }, () => ({ path: "stripe-catalog", namespace: "fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
            if (args.path === "db") return { contents: `
              const run = async sql => {
                const f = globalThis.__shopPostgresFixture;
                const text = String(sql).trim();
                if (/^(INSERT|UPDATE|DELETE|DROP|TRUNCATE)/i.test(text)) f.writes.push(text);
                if (/SELECT \\* FROM shop_catalog_links/i.test(text)) return { rows: [], rowCount: 0 };
                if (/SELECT stripe_product_id FROM shop_catalog_links/i.test(text)) return { rows: [], rowCount: 0 };
                if (["shop_inventory", "shop_audit", "shop_orders"].some(table =>
                  f.orphanTable === table && text.includes("FROM " + table))) return { rows: [{}], rowCount: 1 };
                return { rows: [], rowCount: 0 };
              };
              export const pool = {
                query: run,
                async connect() { return { query: run, release() {} }; }
              };
            `, loader: "js" };
            if (args.path === "shop-test") return { contents: `
              export class ShopError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
              export class ShopTestRepository { constructor(_filename, mode) { this.mode = mode; } }
              export const validateState = state => state;
            `, loader: "js" };
            return { contents: `
              export const shopStripeMode = () => "live";
              export const readStripeShopProduct = async () => { throw new Error("unexpected Stripe read"); };
              export const writeStripeShopProduct = async () => "prod_live_fixture";
              export const stripeShopPrice = async () => { throw new Error("unexpected Stripe price read"); };
            `, loader: "js" };
          });
        },
      }],
    });
    const { PostgresShopRepository } = await import(pathToFileURL(path.join(dir, "shop-postgres.mjs")).href);

    await t.test("empty tables load as an empty state and allow first admin catalog write", async () => {
      fixture.writes.length = 0;
      fixture.orphanTable = null;
      const repository = new PostgresShopRepository();
      const empty = await repository.read();
      assert.equal(repository.mode, "live");
      assert.deepEqual(empty, { version: 1, products: [], history: [], reservations: [] });
      assert.deepEqual(fixture.writes, []);

      const product = {
        id: "fixture-product", name: "Fixture Shop item", description: "", category: "T-shirts",
        priceCents: 1500, status: "draft", visible: false, shippingInfo: "",
        variants: [{ id: "rose", color: "Rose", size: "Taille unique", stock: 50, photos: [] }],
        revision: 1, updatedAt: "2026-10-21T00:00:00.000Z",
      };
      const saved = await repository.mutate(state => {
        state.products.push(product);
        return product.id;
      });
      assert.equal(saved, "fixture-product");
      assert.equal(fixture.writes.filter(sql => sql.startsWith("INSERT INTO shop_catalog_links")).length, 1);
      assert.equal(fixture.writes.filter(sql => sql.startsWith("INSERT INTO shop_inventory")).length, 1);
      assert.equal(fixture.writes.some(sql => /^(UPDATE|DELETE|DROP|TRUNCATE)/i.test(sql)), false);
    });

    await t.test("orphan stock, history, or orders block initialization without changing records", async () => {
      for (const table of ["shop_inventory", "shop_audit", "shop_orders"]) {
        fixture.writes.length = 0;
        fixture.orphanTable = table;
        const repository = new PostgresShopRepository();
        await assert.rejects(repository.read(), /Catalogue Shop vide/);
        assert.deepEqual(fixture.writes, []);
      }
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    delete globalThis.__shopPostgresFixture;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
