import { formData, stripeApi } from "./stripeClient";

const premiumPlans = [
  {
    key: "premium_africa_monthly",
    name: "INDAMORA PLAY Premium Afrique",
    currency: "xaf" as const,
    amount: 500,
  },
  {
    key: "premium_international_monthly",
    name: "INDAMORA PLAY Premium International",
    currency: "eur" as const,
    amount: 500,
  },
];
const donationAmounts = [1, 5, 10, 20, 50, 100];

async function findOrCreateProduct(
  metadata: Record<string, string>,
  name: string,
  description: string,
) {
  const products = await stripeApi<{ data: Array<{ id: string; metadata: Record<string, string> }> }>(
    "/v1/products?active=true&limit=100",
  );
  const existing = products.data.find((product) =>
    Object.entries(metadata).every(([key, value]) => product.metadata[key] === value),
  );
  return existing ?? stripeApi<{ id: string }>("/v1/products", {
    method: "POST",
    params: formData({
      name,
      description,
      ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`metadata[${key}]`, value])),
    }),
  });
}

async function createProducts(): Promise<void> {
  const premiumProduct = await findOrCreateProduct(
    { indamoraProduct: "premium" },
    "INDAMORA PLAY Premium",
    "Contribution mensuelle au fonctionnement et au développement de la plateforme associative INDAMORA PLAY.",
  );
  const donationProduct = await findOrCreateProduct(
    { indamoraProduct: "donation" },
    "Soutenir INDAMORA PLAY",
    "Don ponctuel pour soutenir le développement d’INDAMORA PLAY.",
  );

  const createdPrices: string[] = [];
  for (const plan of premiumPlans) {
    const prices = await stripeApi<{ data: Array<{ id: string; metadata: Record<string, string> }> }>(
      `/v1/prices?product=${premiumProduct.id}&active=true&limit=100`,
    );
    const existing = prices.data.find((price) => price.metadata.indamoraPlan === plan.key);
    const price = existing ?? await stripeApi<{ id: string }>("/v1/prices", {
      method: "POST",
      params: formData({
        product: premiumProduct.id,
        currency: plan.currency,
        unit_amount: plan.amount,
        "recurring[interval]": "month",
        "metadata[indamoraPlan]": plan.key,
      }),
    });
    createdPrices.push(`${plan.key}=${price.id}`);
  }

  for (const amount of donationAmounts) {
    const prices = await stripeApi<{ data: Array<{ id: string; metadata: Record<string, string> }> }>(
      `/v1/prices?product=${donationProduct.id}&active=true&limit=100`,
    );
    const existing = prices.data.find((price) => price.metadata.indamoraDonationEur === String(amount));
    const price = existing ?? await stripeApi<{ id: string }>("/v1/prices", {
      method: "POST",
      params: formData({
        product: donationProduct.id,
        currency: "eur",
        unit_amount: amount * 100,
        "metadata[indamoraDonationEur]": String(amount),
      }),
    });
    createdPrices.push(`donation_${amount}_eur=${price.id}`);
  }

  console.log("Stripe test products are ready.");
  for (const value of createdPrices) console.log(value);
}

createProducts().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});