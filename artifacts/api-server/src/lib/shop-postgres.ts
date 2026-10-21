import { pool, type PoolClient } from "@workspace/db";
import { ShopTestRepository, validateState, ShopError, type State, type Product } from "./shop-test";
import { readStripeShopProduct, writeStripeShopProduct, stripeShopPrice, shopStripeMode } from "./shop-stripe-catalog";

// A PostgreSQL advisory lock serializes Shop edits/reservations across server
// instances, not just within one process. TEST and LIVE never share rows.
export class PostgresShopRepository extends ShopTestRepository {
  constructor() { super(undefined, shopStripeMode()); }
  private async locked<T>(operation: (client: PoolClient) => Promise<T>, exclusive = true): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      if (exclusive) await client.query("SELECT pg_advisory_xact_lock(736421, $1)", [this.mode === "test" ? 1 : 2]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  private async load(client: PoolClient): Promise<State> {
    const links = await client.query("SELECT * FROM shop_catalog_links WHERE mode=$1 ORDER BY id", [this.mode]);
    if (!links.rowCount) {
      const [stock, history, orders] = await Promise.all([
        client.query("SELECT 1 FROM shop_inventory WHERE mode=$1 LIMIT 1", [this.mode]),
        client.query("SELECT 1 FROM shop_audit WHERE mode=$1 LIMIT 1", [this.mode]),
        client.query("SELECT 1 FROM shop_orders WHERE mode=$1 LIMIT 1", [this.mode]),
      ]);
      if (stock.rowCount || history.rowCount || orders.rowCount) {
        throw new ShopError("Catalogue Shop vide avec des stocks, commandes ou mouvements existants. Initialisation bloquée.", 503);
      }
      return validateState({ version: 1, products: [], history: [], reservations: [] }, this.mode);
    }
    const stock = await client.query("SELECT * FROM shop_inventory WHERE mode=$1", [this.mode]);
    const products = await Promise.all(links.rows.map(async link => {
      const product = await readStripeShopProduct(link.stripe_product_id, link.id, link.revision, link.updated_at?.toISOString() ?? "");
      for (const variant of product.variants) {
        const row = stock.rows.find(r => r.product_id === product.id && r.variant_id === variant.id);
        if (!row) throw new ShopError("Stock de variante non préparé. Paiement bloqué.", 503);
        variant.stock = row.stock;
      }
      return product;
    }));
    const history = await client.query("SELECT * FROM shop_audit WHERE mode=$1 ORDER BY at DESC", [this.mode]);
    const orders = await client.query("SELECT * FROM shop_orders WHERE mode=$1 ORDER BY created_at", [this.mode]);
    return validateState({ version: 1, products,
      history: history.rows.map(r => ({ id: r.id, productId: r.product_id, at: r.at.toISOString(), action: r.action, detail: r.detail })),
      reservations: orders.rows.map(r => ({ id: r.id, status: r.status, expiresAt: r.expires_at.toISOString(),
        ...(r.session_id ? { sessionId: r.session_id } : {}), items: r.items, ...(r.quote ? { quote: r.quote } : {}) })),
    }, this.mode);
  }
  async read(): Promise<State> { return this.locked(client => this.load(client), false); }
  private async persist(client: PoolClient, state: State, before?: State) {
    validateState(state, this.mode);
    for (const product of state.products) {
      const previous = before?.products.find(p => p.id === product.id);
      const link = await client.query("SELECT stripe_product_id FROM shop_catalog_links WHERE mode=$1 AND id=$2", [this.mode, product.id]);
      const changed = !previous || JSON.stringify(previous) !== JSON.stringify(product);
      // Stock changes do not rewrite Stripe. Stripe remains the catalog source.
      const editorial = (p: Product) => JSON.stringify({ ...p, revision: 0, updatedAt: "", variants: p.variants.map(v => ({ ...v, stock: null })) });
      const stripeId = !previous || editorial(previous) !== editorial(product)
        ? await writeStripeShopProduct(product, link.rows[0]?.stripe_product_id)
        : link.rows[0]?.stripe_product_id;
      if (!stripeId) throw new ShopError("Référence Stripe Shop absente.", 503);
      if (changed) {
        await client.query(`INSERT INTO shop_catalog_links(mode,id,stripe_product_id,revision,updated_at) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(mode,id) DO UPDATE SET revision=EXCLUDED.revision, updated_at=EXCLUDED.updated_at`,
          [this.mode, product.id, stripeId, product.revision, product.updatedAt || null]);
        for (const variant of product.variants) {
          await client.query(`INSERT INTO shop_inventory(mode,product_id,variant_id,stock) VALUES($1,$2,$3,$4)
            ON CONFLICT(mode,product_id,variant_id) DO UPDATE SET stock=EXCLUDED.stock`,
            [this.mode, product.id, variant.id, variant.stock]);
        }
      }
    }
    for (const entry of state.history) await client.query(
      `INSERT INTO shop_audit(mode,id,product_id,at,action,detail) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(mode,id) DO NOTHING`,
      [this.mode, entry.id, entry.productId, entry.at, entry.action, entry.detail]);
    for (const order of state.reservations) await client.query(
      `INSERT INTO shop_orders(mode,id,session_id,status,expires_at,items,quote) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
       ON CONFLICT(mode,id) DO UPDATE SET session_id=EXCLUDED.session_id,status=EXCLUDED.status,items=EXCLUDED.items,quote=EXCLUDED.quote`,
      [this.mode, order.id, order.sessionId ?? null, order.status, order.expiresAt, JSON.stringify(order.items), order.quote ? JSON.stringify(order.quote) : null]);
  }
  async mutate<T>(action: (state: State) => T): Promise<T> {
    return this.locked(async client => {
      const state = await this.load(client);
      const before = structuredClone(state);
      const result = action(state);
      await this.persist(client, state, before);
      return result;
    });
  }
  async importTestState(state: State) {
    if (process.env.NODE_ENV !== "development" || this.mode !== "test") throw new ShopError("Import réservé à TEST.", 403);
    validateState(state);
    return this.locked(async client => {
      const count = await client.query("SELECT count(*)::int AS n FROM shop_catalog_links WHERE mode=$1", [this.mode]);
      if (count.rows[0].n) throw new ShopError("Un catalogue persistant existe déjà. Aucune donnée n’a été remplacée.", 409);
      await this.persist(client, state);
    });
  }
  async prices() {
    const links = await pool.query("SELECT id,stripe_product_id FROM shop_catalog_links WHERE mode=$1", [this.mode]);
    const state = await this.read();
    const prices = new Map<string, Awaited<ReturnType<typeof stripeShopPrice>>>();
    for (const product of state.products.filter(p => p.status === "active" && p.visible)) {
      const link = links.rows.find(l => l.id === product.id);
      if (!link) throw new ShopError("Référence de paiement absente.", 503);
      const price = await stripeShopPrice(link.stripe_product_id);
      if (price.unit_amount !== product.priceCents) throw new ShopError("Prix divergent. Paiement bloqué.", 503);
      prices.set(product.id, price);
    }
    return prices;
  }
  async objectPath(reference: string): Promise<string> {
    const result = await pool.query("SELECT object_path FROM shop_media WHERE mode=$1 AND reference=$2 AND ready='ready'", [this.mode, reference]);
    if (!result.rowCount) throw new ShopError("Photo persistante introuvable.", 404);
    return result.rows[0].object_path;
  }
}
