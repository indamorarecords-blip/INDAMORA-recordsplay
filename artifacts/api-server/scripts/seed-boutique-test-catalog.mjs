import { storeStripeApi as stripeApi } from "../src/storeStripeClient.ts";

const products = [
  ["tshirt", "T-shirt INDAMORA PLAY"],
  ["cap", "Casquette INDAMORA PLAY"],
  ["bob", "Bob INDAMORA PLAY"],
  ["tote-bag", "Tote bag INDAMORA PLAY"],
  ["phone-case", "Coque téléphone INDAMORA PLAY"],
];

if (process.env.NODE_ENV !== "development") {
  throw new Error("Refus : le catalogue Boutique ne peut être initialisé qu’en développement.");
}

const balance = await stripeApi("/v1/balance");
if (balance.livemode !== false) {
  throw new Error(
    "Refus de créer des produits : la clé dédiée n’a pas confirmé le mode Stripe TEST.",
  );
}

for (const [sku, name] of products) {
  const search = new URLSearchParams({
    query: `metadata['indamoraStoreSku']:'${sku}'`,
  });
  const result = await stripeApi(`/v1/products/search?${search}`);
  const matches = (result.data ?? []).filter(
    (product) =>
      product.active === true &&
      product.livemode === false &&
      product.metadata?.indamoraStoreSku === sku,
  );
  if (matches.length > 1) {
    throw new Error(`Plusieurs produits TEST actifs existent pour ${sku}; aucune modification effectuée.`);
  }

  const product =
    matches[0] ??
    (await stripeApi("/v1/products", {
      method: "POST",
      idempotencyKey: `indamora-boutique-test-product-${sku}-v1`,
      params: new URLSearchParams({
        name,
        description: "Produit officiel INDAMORA PLAY — soutien à l’écosystème culturel.",
        active: "true",
        [`metadata[indamoraStoreSku]`]: sku,
      }),
    }));
  if (product.livemode !== false || product.metadata?.indamoraStoreSku !== sku) {
    throw new Error(`Stripe n’a pas confirmé le mode TEST pour ${sku}.`);
  }

  const priceParams = new URLSearchParams({
    product: product.id,
    active: "true",
    limit: "100",
  });
  const priceResult = await stripeApi(`/v1/prices?${priceParams}`);
  const matchingPrices = (priceResult.data ?? []).filter(
    (price) =>
      price.active === true &&
      price.livemode === false &&
      price.type === "one_time" &&
      price.currency === "eur" &&
      price.unit_amount === 1500 &&
      price.metadata?.indamoraStoreSku === sku,
  );
  if (matchingPrices.length > 1) {
    throw new Error(`Plusieurs tarifs TEST actifs existent pour ${sku}; aucune modification effectuée.`);
  }
  if (matchingPrices.length === 0) {
    const price = await stripeApi("/v1/prices", {
      method: "POST",
      idempotencyKey: `indamora-boutique-test-price-${sku}-15-eur-v1`,
      params: new URLSearchParams({
        product: product.id,
        currency: "eur",
        unit_amount: "1500",
        [`metadata[indamoraStoreSku]`]: sku,
      }),
    });
    if (
      price.livemode !== false ||
      price.unit_amount !== 1500 ||
      price.currency !== "eur" ||
      price.metadata?.indamoraStoreSku !== sku
    ) {
      throw new Error(`Stripe n’a pas confirmé le prix TEST attendu pour ${sku}.`);
    }
  }
}

process.stdout.write("Catalogue TEST prêt : 5 produits, 5 prix à 15 € chacun. Aucun produit LIVE créé.\n");
