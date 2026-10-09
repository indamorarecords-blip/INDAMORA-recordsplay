import { createHash } from "node:crypto";
import { storeStripeApi, formData } from "../storeStripeClient";
import { validateProduct, ShopError, type Product } from "./shop-test";

export type CataloguePrice = { id: string; active: boolean; livemode: boolean; currency: string; type: string; unit_amount: number };
export type CatalogueProduct = {
  id: string; name: string; description?: string; active: boolean; livemode: boolean;
  metadata: Record<string, string>; default_price: CataloguePrice | string | null;
};
const FLOW = "indamora-play-boutique-v1";
const ORIGINAL_SKUS = new Set(["tshirt", "bob", "tote-bag", "hoodie"]);
export function shopStripeMode(): "test" | "live" {
  return process.env.NODE_ENV === "development" ? "test" : "live";
}
function assertMode(product: CatalogueProduct) {
  if (product.livemode !== (shopStripeMode() === "live")) throw new ShopError("Environnement Stripe Boutique incorrect.", 503);
}
export async function readStripeShopProduct(stripeId: string, id: string, revision: number, updatedAt: string): Promise<Product> {
  const p = await storeStripeApi<CatalogueProduct>(`/v1/products/${encodeURIComponent(stripeId)}?expand[]=default_price`);
  assertMode(p);
  if (p.metadata.storeFlow !== FLOW || p.metadata.indamoraStoreSku !== id) throw new ShopError("Référence Boutique Stripe non autorisée.", 503);
  const count = Number(p.metadata.shopConfigParts);
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new ShopError("Configuration Boutique Stripe absente.", 503);
  const data: unknown = JSON.parse(Array.from({ length: count }, (_, i) => p.metadata[`shopConfig${i}`] ?? "").join(""));
  const price = p.default_price;
  if (!price || typeof price !== "object" || !price.active || price.livemode !== p.livemode ||
      price.currency !== "eur" || price.type !== "one_time" || !Number.isSafeInteger(price.unit_amount)) {
    throw new ShopError("Prix Boutique Stripe invalide. Paiement bloqué.", 503);
  }
  const parsed = validateProduct({ ...(data as object), name: p.name, description: p.description ?? "", priceCents: price.unit_amount });
  return { ...parsed, id, revision, updatedAt };
}
export async function stripeShopPrice(stripeId: string): Promise<CataloguePrice> {
  const p = await storeStripeApi<CatalogueProduct>(`/v1/products/${encodeURIComponent(stripeId)}?expand[]=default_price`);
  assertMode(p);
  const price = p.default_price;
  if (!p.active || p.metadata.storeFlow !== FLOW || !price || typeof price !== "object" ||
      !price.active || price.livemode !== p.livemode || price.currency !== "eur" || price.type !== "one_time") {
    throw new ShopError("Prix Boutique Stripe indisponible.", 503);
  }
  return price;
}

// Called only for explicitly authorized Shop edits/imports. Never changes a
// Premium/donation resource, never writes the Stripe database schema.
export async function writeStripeShopProduct(value: Product, existingId?: string): Promise<string> {
  let stripeId = existingId;
  if (stripeId) {
    const existing = await storeStripeApi<CatalogueProduct>(`/v1/products/${encodeURIComponent(stripeId)}`);
    assertMode(existing);
    if (existing.metadata.indamoraStoreSku !== value.id ||
        (existing.metadata.storeFlow !== FLOW && !(shopStripeMode() === "test" && ORIGINAL_SKUS.has(value.id)))) {
      throw new ShopError("Le produit Stripe ne relève pas de la Boutique.", 403);
    }
  } else {
    const query = new URLSearchParams({ limit: "100" });
    const page = await storeStripeApi<{ data: CatalogueProduct[]; has_more: boolean }>(`/v1/products?${query}`);
    if (page.has_more) throw new ShopError("Catalogue Stripe trop volumineux pour un import automatique sûr.", 503);
    const matches = page.data.filter(p => p.metadata.indamoraStoreSku === value.id &&
      (p.metadata.storeFlow === FLOW || (shopStripeMode() === "test" && ORIGINAL_SKUS.has(value.id))) && p.livemode === (shopStripeMode() === "live"));
    if (matches.length > 1) throw new ShopError("Plusieurs références Stripe correspondent au même article. Import arrêté.", 409);
    stripeId = matches[0]?.id;
    if (!stripeId) {
      const created = await storeStripeApi<CatalogueProduct>("/v1/products", {
        method: "POST", idempotencyKey: `shop-${shopStripeMode()}-product-${value.id}`,
        params: formData({ name: value.name, "metadata[storeFlow]": FLOW, "metadata[indamoraStoreSku]": value.id }),
      });
      assertMode(created); stripeId = created.id;
    }
  }
  const prices = await storeStripeApi<{ data: CataloguePrice[]; has_more: boolean }>(
    `/v1/prices?product=${encodeURIComponent(stripeId)}&active=true&limit=100`);
  if (prices.has_more) throw new ShopError("Trop de prix pour une sélection automatique sûre.", 409);
  const matching = prices.data.filter(p => p.livemode === (shopStripeMode() === "live") &&
    p.unit_amount === value.priceCents && p.currency === "eur" && p.type === "one_time");
  if (matching.length > 1) throw new ShopError("Plusieurs prix Stripe identiques. Vérification manuelle nécessaire.", 409);
  const price = matching[0] ?? await storeStripeApi<CataloguePrice>("/v1/prices", {
    method: "POST", idempotencyKey: `shop-${shopStripeMode()}-price-${value.id}-${value.priceCents}`,
    params: formData({ product: stripeId, unit_amount: value.priceCents, currency: "eur",
      "metadata[indamoraStoreSku]": value.id, "metadata[storeFlow]": FLOW }),
  });
  const { name, description, priceCents: _price, id: _id, revision: _revision, updatedAt: _date, ...config } = value;
  const serialized = JSON.stringify({ ...config, variants: config.variants.map(({ stock: _stock, ...v }) => ({ ...v, stock: null })) });
  const parts = serialized.match(/[\s\S]{1,400}/g) ?? [];
  if (parts.length > 40) throw new ShopError("Les références photos/variantes dépassent la capacité des métadonnées Stripe.");
  const params = formData({ name, description, default_price: price.id,
    active: value.status === "active" && value.visible ? "true" : "false",
    "metadata[storeFlow]": FLOW, "metadata[indamoraStoreSku]": value.id, "metadata[shopConfigParts]": parts.length });
  for (let i = 0; i < 40; i++) params.set(`metadata[shopConfig${i}]`, parts[i] ?? "");
  const hash = createHash("sha256").update(params.toString()).digest("hex");
  // A later A -> B -> A edit is a new operation, not a retry of the first A.
  // Keep retries idempotent within one revision without replaying old responses.
  await storeStripeApi(`/v1/products/${encodeURIComponent(stripeId)}`, {
    method: "POST", params, idempotencyKey: `shop-${shopStripeMode()}-config-${stripeId}-r${value.revision}-${hash}`,
  });
  return stripeId;
}
