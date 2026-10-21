import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateStoreCheckoutBody,
  CreateStoreCheckoutResponse,
  GetStoreCatalogResponse,
  GetStoreCheckoutStatusQueryParams,
  GetStoreCheckoutStatusResponse,
} from "@workspace/api-zod";
import { formData, storeStripeApi as stripeApi } from "../storeStripeClient";
import { shop as shopTest, persistentShop, isPersistentShop } from "../lib/shop-repository";
import { ShopError } from "../lib/shop-test";
import { settleVerifiedShopSession, shopQuoteHash } from "../lib/shop-session";
import { shopMode, shopRoutesEnabled, shopAllowedHosts, shopReturnBase, shopWebhookSecret, SHOP_WEBHOOK_EVENTS } from "../lib/shop-runtime";

const router: IRouter = Router();

const STORE_PRODUCTS = [
  { sku: "tshirt", name: "T-shirt INDAMORA PLAY", priceCents: 1500 },
  { sku: "bob", name: "Bob INDAMORA PLAY", priceCents: 1500 },
  { sku: "tote-bag", name: "Tote bag INDAMORA PLAY", priceCents: 1500 },
  { sku: "hoodie", name: "Sweat à capuche INDAMORA PLAY", priceCents: 1500 },
] as const;

const EUROPEAN_UNION_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI",
  "ES", "SE",
] as const;

type StripeProduct = {
  id: string;
  active: boolean;
  livemode?: boolean;
  metadata?: Record<string, string>;
};

type StripePrice = {
  id: string;
  active: boolean;
  type: string;
  currency: string;
  unit_amount: number | null;
  livemode?: boolean;
  metadata?: Record<string, string>;
  product?: string | StripeProduct | null;
};

type StripePricePage = { data: StripePrice[]; has_more?: boolean };
type StripeWebhookEndpoint = {
  url?: string;
  status?: string;
  livemode?: boolean;
  enabled_events?: string[];
};
type StripeWebhookEndpointPage = { data: StripeWebhookEndpoint[] };

type StoreCheckoutSession = {
  id?: string;
  url?: string | null;
  mode?: string;
  status?: string | null;
  payment_status?: string;
  livemode?: boolean;
  currency?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string>;
  payment_intent?: string | { id: string } | null;
};

type StripePaymentIntent = {
  status?: string;
  livemode?: boolean;
};

function hasRequiredEvents(events: string[] | undefined): boolean {
  const enabled = new Set(events ?? []);
  return (
    enabled.has("*") ||
    SHOP_WEBHOOK_EVENTS.every((event) => enabled.has(event))
  );
}

function isConfiguredShopWebhook(endpoint: StripeWebhookEndpoint): boolean {
  if (
    endpoint.livemode !== (shopMode() === "live") ||
    endpoint.status !== "enabled" ||
    !hasRequiredEvents(endpoint.enabled_events)
  ) {
    return false;
  }

  try {
    const url = new URL(endpoint.url ?? "");
    return (
      url.protocol === "https:" &&
      shopAllowedHosts().has(url.host.toLowerCase()) &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/api/store/stripe/webhook"
    );
  } catch {
    return false;
  }
}

async function hasConfiguredShopWebhook(): Promise<boolean> {
  if ((shopMode() === "test" && process.env.SHOP_TEST_CHECKOUT_BLOCKED === "true") ||
      !shopWebhookSecret()?.startsWith("whsec_") || shopAllowedHosts().size === 0) {
    return false;
  }

  const endpoints = await stripeApi<StripeWebhookEndpointPage>(
    "/v1/webhook_endpoints?limit=100",
  );
  return endpoints.data.some(isConfiguredShopWebhook);
}

async function readStorePrices(): Promise<Map<string, StripePrice>> {
  if (isPersistentShop()) return persistentShop.prices();
  const prices: StripePrice[] = [];
  let startingAfter: string | undefined;

  for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
    const query = formData({
      active: "true",
      type: "one_time",
      limit: 100,
      starting_after: startingAfter,
    });
    query.append("expand[]", "data.product");
    const page = await stripeApi<StripePricePage>(
      `/v1/prices?${query.toString()}`,
    );
    prices.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  const result = new Map<string, StripePrice>();
  for (const product of STORE_PRODUCTS) {
    const matches = prices.filter((price) => {
      const stripeProduct =
        price.product && typeof price.product === "object"
          ? price.product
          : undefined;
      return (
        price.active === true &&
        price.livemode === (shopMode() === "live") &&
        price.type === "one_time" &&
        price.currency === "eur" &&
        price.unit_amount === product.priceCents &&
        price.metadata?.indamoraStoreSku === product.sku &&
        stripeProduct?.active === true &&
        stripeProduct.livemode === (shopMode() === "live") &&
        stripeProduct.metadata?.indamoraStoreSku === product.sku
      );
    });
    if (matches.length === 1) result.set(product.sku, matches[0]!);
  }

  return result;
}

async function storeReadiness(): Promise<{
  prices: Map<string, StripePrice>;
  webhookReady: boolean;
}> {
  if (!shopRoutesEnabled()) {
    return { prices: new Map(), webhookReady: false };
  }
  const [prices, webhookReady] = await Promise.all([
    readStorePrices(),
    hasConfiguredShopWebhook(),
  ]);
  return { prices, webhookReady };
}

function storeMessage(
  priceCount: number,
  webhookReady: boolean,
  expectedCount: number = STORE_PRODUCTS.length,
): string | null {
  if (priceCount !== expectedCount || expectedCount === 0) {
    return `Le catalogue Stripe ${shopMode().toUpperCase()} n’est pas encore complet. Le paiement reste désactivé.`;
  }
  if (!webhookReady) {
    return `Le webhook Stripe ${shopMode().toUpperCase()} signé n’est pas prêt. Le paiement reste désactivé.`;
  }
  return null;
}

function shippingForCountry(country: string): {
  amountCents: 0 | 700;
  displayName: string;
} | null {
  if (country === "FR") {
    return { amountCents: 0, displayName: "Livraison France" };
  }
  if (
    EUROPEAN_UNION_COUNTRIES.includes(
      country as (typeof EUROPEAN_UNION_COUNTRIES)[number],
    )
  ) {
    return { amountCents: 700, displayName: "Livraison Europe" };
  }
  return null;
}

router.get("/store/catalog", async (req, res): Promise<void> => {
  try {
    const readiness = await storeReadiness();
    const catalogue = isPersistentShop()
      ? (await shopTest.read()).products.filter(p => p.status === "active" && p.visible)
        .map(p => ({ sku: p.id, name: p.name, priceCents: p.priceCents }))
      : shopMode() === "live" ? [] : STORE_PRODUCTS;
    const message = storeMessage(
      readiness.prices.size,
      readiness.webhookReady,
      catalogue.length,
    );
    res.json(
      GetStoreCatalogResponse.parse({
        mode: shopMode(),
        checkoutAvailable: message === null,
        message,
        products: catalogue.map((product) => ({
          ...product,
          available: readiness.prices.has(product.sku),
        })),
      }),
    );
  } catch {
    req.log.warn("INDAMORA PLAY Shop catalog could not be verified");
    res.json(
      GetStoreCatalogResponse.parse({
        mode: shopMode(),
        checkoutAvailable: false,
        message: "Le paiement Boutique est temporairement indisponible.",
        products: (isPersistentShop() || shopMode() === "live" ? [] : STORE_PRODUCTS).map((product) => ({
          ...product,
          available: false,
        })),
      }),
    );
  }
});

router.post("/store/checkout", async (req, res): Promise<void> => {
  if (!shopRoutesEnabled()) {
    res.status(404).json({ error: "Checkout indisponible." });
    return;
  }

  const input = CreateStoreCheckoutBody.strict().safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Le panier ou le pays est invalide." });
    return;
  }

  const shipping = shippingForCountry(input.data.shippingCountry);
  if (!shipping) {
    res.status(400).json({
      error:
        "Pour une livraison hors France et Union européenne, contactez INDAMORA RECORDS avant de commander.",
    });
    return;
  }

  const seenSkus = new Set<string>();
  for (const item of input.data.items) {
    if (!isPersistentShop() && !STORE_PRODUCTS.some(p => p.sku === item.sku)) {
      res.status(400).json({ error: "Produit inconnu." }); return;
    }
    const allowedColors: readonly string[] = item.sku === "tshirt"
      ? ["rose", "noir", "blanc"] : item.sku === "bob" ? ["blanc", "noir", "orange"] : [];
    if (!isPersistentShop() && (allowedColors.length ? !item.color || !allowedColors.includes(item.color) : item.color !== undefined)) {
      res.status(400).json({ error: "La couleur du produit est invalide." });
      return;
    }
    const variantKey = `${item.sku}:${item.variantId ?? item.color ?? ""}`;
    if (seenSkus.has(variantKey)) {
      res.status(400).json({ error: "Une variante apparaît plusieurs fois dans le panier." });
      return;
    }
    seenSkus.add(variantKey);
  }

  const baseUrl = shopReturnBase();
  let reservationId: string | undefined;
  let stripeSessionCreated = false;
  if (!baseUrl) {
    res.status(503).json({ error: "Le Checkout Boutique n’est pas configuré." });
    return;
  }

  try {
    const readiness = await storeReadiness();
    const inventory = await shopTest.read();
    const message = storeMessage(
      readiness.prices.size,
      readiness.webhookReady,
      isPersistentShop() ? inventory.products.filter(p => p.status === "active" && p.visible).length : STORE_PRODUCTS.length,
    );
    if (message) {
      res.status(503).json({ error: message });
      return;
    }

    const orderReference = randomUUID();
    const inventoryItems = input.data.items.map(item => {
      const product = inventory.products.find(p => p.id === item.sku);
      const variant = product?.variants.find(v => item.variantId ? v.id === item.variantId : item.color ? v.id === item.color : v.id === "unique");
      if (!product || !variant) throw new Error("Variante Shop TEST indisponible.");
      return { productId: product.id, variantId: variant.id, quantity: item.quantity };
    });
    const reservedQuote = await shopTest.reserve(orderReference, inventoryItems, input.data.shippingCountry,
      new Map([...readiness.prices].map(([id, price]) => [id, price.unit_amount!])));
    reservationId = orderReference;
    const params = formData({
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 5,
      locale: "fr",
      customer_creation: "always",
      billing_address_collection: "auto",
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}?checkout=cancelled`,
      "shipping_address_collection[allowed_countries][0]":
        input.data.shippingCountry,
      "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
      "shipping_options[0][shipping_rate_data][fixed_amount][amount]":
        shipping.amountCents,
      "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "eur",
      "shipping_options[0][shipping_rate_data][display_name]":
        shipping.displayName,
      "metadata[kind]": "store-order",
      "metadata[storeFlow]": "indamora-play-boutique-v1",
      "metadata[orderReference]": orderReference,
      "metadata[shippingCountry]": input.data.shippingCountry,
      "metadata[shippingCents]": shipping.amountCents,
      "payment_intent_data[metadata][kind]": "store-order",
      "payment_intent_data[metadata][storeFlow]": "indamora-play-boutique-v1",
      "payment_intent_data[metadata][orderReference]": orderReference,
      "payment_intent_data[metadata][shippingCountry]":
        input.data.shippingCountry,
      "payment_intent_data[metadata][shippingCents]":
        shipping.amountCents,
    });
    if (isPersistentShop()) params.set("metadata[shopQuoteHash]", shopQuoteHash(reservedQuote));

    let expectedAmountCents: number = shipping.amountCents;
    input.data.items.forEach((item, index) => {
      const price = readiness.prices.get(item.sku);
      if (!price) {
        throw new Error("Catalogue TEST incomplet.");
      }
      expectedAmountCents += price.unit_amount! * item.quantity;
      params.set(`line_items[${index}][price]`, price.id);
      params.set(`line_items[${index}][quantity]`, String(item.quantity));
      // Stripe metadata supports 50 keys; the complete cart is bound by its
      // server-owned quote digest, not a truncated client-supplied list.
      if (isPersistentShop() && index >= 10) return;
      params.set(`metadata[item_${index + 1}_variant]`, inventoryItems[index]!.variantId);
      if (item.color) {
        params.set(`metadata[item_${index + 1}_color]`, item.color);
        params.set(`payment_intent_data[metadata][item_${index + 1}_color]`, item.color);
      }
      params.set(
        `metadata[item_${index + 1}_sku]`,
        item.sku,
      );
      params.set(
        `metadata[item_${index + 1}_quantity]`,
        String(item.quantity),
      );
      params.set(
        `payment_intent_data[metadata][item_${index + 1}_sku]`,
        item.sku,
      );
      params.set(
        `payment_intent_data[metadata][item_${index + 1}_quantity]`,
        String(item.quantity),
      );
    });

    stripeSessionCreated = true;
    const session = await stripeApi<StoreCheckoutSession>(
      "/v1/checkout/sessions",
      {
        method: "POST",
        idempotencyKey: `indamora-store-${shopMode()}-${orderReference}`,
        params,
      },
    );
    let checkoutUrl: URL | undefined;
    try {
      checkoutUrl = new URL(session.url ?? "");
    } catch {
      checkoutUrl = undefined;
    }
    if (
      !session.id?.startsWith(`cs_${shopMode()}_`) ||
      session.livemode !== (shopMode() === "live") ||
      session.mode !== "payment" ||
      session.metadata?.storeFlow !== "indamora-play-boutique-v1" ||
      session.currency !== "eur" ||
      session.amount_total !== expectedAmountCents ||
      checkoutUrl?.protocol !== "https:" ||
      checkoutUrl.hostname !== "checkout.stripe.com"
    ) {
      req.log.error("Stripe returned an unexpected INDAMORA PLAY Shop session");
      res.status(502).json({ error: "Le Checkout Stripe Boutique a été refusé." });
      return;
    }
    await shopTest.attachSession(orderReference, session.id);

    res.json(
      CreateStoreCheckoutResponse.parse({
        sessionId: session.id,
        url: checkoutUrl.toString(),
        mode: shopMode(),
      }),
    );
  } catch (error) {
    if (!stripeSessionCreated && error instanceof ShopError) {
      if (reservationId) await shopTest.release(reservationId).catch(() => {});
      const status = error.status === 409 ? 409 : error.status >= 500 ? 503 : 400;
      res.status(status).json({
        error: status === 409
          ? "Une variante du panier n’est pas disponible."
          : status === 503
            ? "Le Checkout Boutique est temporairement indisponible."
            : "Le panier n’a pas pu être réservé.",
      });
      return;
    }
    // Never release a hold after Stripe might have created a payable session.
    // An ambiguous network result is held for explicit Shop reconciliation.
    if (reservationId && !stripeSessionCreated) await shopTest.release(reservationId).catch(() => {});
    req.log.error("INDAMORA PLAY Shop Checkout creation failed");
    res.status(502).json({ error: "Le paiement Boutique est temporairement indisponible." });
  }
});

router.get("/store/checkout/status", async (req, res): Promise<void> => {
  if (!shopRoutesEnabled()) {
    res.status(404).json({ error: "Statut indisponible." });
    return;
  }

  const query = GetStoreCheckoutStatusQueryParams.safeParse(req.query);
  if (!query.success || !query.data.sessionId.startsWith(`cs_${shopMode()}_`)) {
    res.status(400).json({ error: "L’identifiant Checkout est invalide." });
    return;
  }

  try {
    const session = await stripeApi<StoreCheckoutSession>(
      `/v1/checkout/sessions/${encodeURIComponent(query.data.sessionId)}`,
    );
    if (
      session.id !== query.data.sessionId ||
      session.livemode !== (shopMode() === "live") ||
      session.mode !== "payment" ||
      session.metadata?.storeFlow !== "indamora-play-boutique-v1"
    ) {
      res.status(404).json({ error: "Session INDAMORA PLAY Boutique introuvable." });
      return;
    }

    let status: "paid" | "pending" | "unpaid" | "expired";
    if (session.payment_status === "paid") {
      status = "paid";
    } else if (session.status === "expired") {
      status = "expired";
    } else if (session.status === "complete") {
      status = "pending";
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (paymentIntentId) {
        const paymentIntent = await stripeApi<StripePaymentIntent>(
          `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
        );
        if (
          paymentIntent.livemode === (shopMode() === "live") &&
          (paymentIntent.status === "canceled" ||
            paymentIntent.status === "requires_payment_method")
        ) {
          status = "unpaid";
        }
      }
    } else {
      status = "pending";
    }

    if (!await settleVerifiedShopSession(session)) {
      res.status(404).json({ error: "Commande Boutique introuvable. Aucun paiement de cette commande n’est confirmé." });
      return;
    }
    res.json(
      GetStoreCheckoutStatusResponse.parse({
        status,
        amountTotalCents: session.amount_total ?? null,
        currency: session.currency ?? null,
      }),
    );
  } catch {
    req.log.warn("INDAMORA PLAY Shop Checkout status lookup failed");
    res.status(502).json({ error: "Le statut du paiement Boutique est indisponible." });
  }
});

export default router;
