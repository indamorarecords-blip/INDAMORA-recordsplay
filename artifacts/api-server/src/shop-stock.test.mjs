import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// The real reservation/settlement methods operate on synthetic in-memory state.
// No workspace inventory, database, server, or Stripe service is touched.
test("Shop reservations keep unknown stock unavailable and settle only once in each mode", async t => {
  const directory = await mkdtemp(join(tmpdir(), "shop-stock-fixture-"));
  try {
    await build({
      entryPoints: ["src/lib/shop-test.ts"],
      absWorkingDir: new URL("..", import.meta.url).pathname,
      outfile: join(directory, "stock.mjs"),
      platform: "node", format: "esm", bundle: true,
    });
    const { ShopTestRepository, initialShopState, quoteCart, validateState } =
      await import(pathToFileURL(join(directory, "stock.mjs")).href);
    const official = initialShopState();
    assert.equal(official.products.flatMap(p => p.variants).length, 8);
    assert.ok(official.products.flatMap(p => p.variants).every(v => v.stock === null));
    for (const product of official.products) for (const variant of product.variants) {
      assert.throws(() => quoteCart(official, [{ productId: product.id, variantId: variant.id, quantity: 1 }], "FR"));
    }
    class MemoryShop extends ShopTestRepository {
      constructor(mode) {
        super("unused-fixture", mode);
        this.state = structuredClone(official);
        this.state.products = [{ ...this.state.products[0], id: "fixture-product",
          variants: [{ ...this.state.products[0].variants[0], stock: 2 }] }];
        this.pending = Promise.resolve();
      }
      async read() { return structuredClone(this.state); }
      async mutate(action) {
        const operation = this.pending.then(() => {
          const candidate = structuredClone(this.state);
          const result = action(candidate);
          this.state = validateState(candidate, this.mode);
          return result;
        });
        this.pending = operation.catch(() => {});
        return operation;
      }
    }
    for (const mode of ["test", "live"]) {
      await t.test(`${mode}: competing holds, duplicate payment and expiry do not oversell`, async () => {
        const repository = new MemoryShop(mode);
        const items = [{ productId: "fixture-product", variantId: "rose", quantity: 2 }];
        const outcomes = await Promise.allSettled([
          repository.reserve("first", items, "FR", new Map([["fixture-product", 1500]])),
          repository.reserve("second", items, "FR", new Map([["fixture-product", 1500]])),
        ]);
        assert.deepEqual(outcomes.map(outcome => outcome.status), ["fulfilled", "rejected"]);
        await assert.rejects(repository.attachSession("first", `cs_${mode === "test" ? "live" : "test"}_fixture`));
        await repository.attachSession("first", `cs_${mode}_fixture`);
        await repository.settleSession(`cs_${mode}_fixture`, false, false);
        assert.equal((await repository.read()).reservations[0].status, "pending");
        await Promise.all([
          repository.settleSession(`cs_${mode}_fixture`, true, false),
          repository.settleSession(`cs_${mode}_fixture`, true, false),
        ]);
        await repository.settleSession(`cs_${mode}_fixture`, false, true);
        const state = await repository.read();
        assert.equal(state.products[0].variants[0].stock, 0);
        assert.equal(state.history.length, 1);
        assert.equal(state.reservations[0].status, "paid");
        const expired = new MemoryShop(mode);
        await expired.reserve("expiry", items, "FR", new Map([["fixture-product", 1500]]));
        await expired.attachSession("expiry", `cs_${mode}_expired_fixture`);
        await expired.settleSession(`cs_${mode}_expired_fixture`, false, true);
        assert.equal((await expired.read()).products[0].variants[0].stock, 2);
        assert.equal((await expired.read()).reservations[0].status, "released");
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
