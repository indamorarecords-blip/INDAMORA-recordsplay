import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateStoreCheckoutBody,
  CreateStoreCheckoutResponse,
  GetStoreCatalogResponse,
  GetStoreCheckoutStatusQueryParams,
  GetStoreCheckoutStatusResponse,
} from "@workspace/api-zod";
import { formData, stripeApi } from "../stripeClient";

const router: IRouter = Router();

const STORE_PRODUCTS = [
  { sku: "tshirt", name: "T-shirt INDAMORA PLAY" },
  { sku: "cap", name: "Casquette INDAMORA PLAY" },
  { sku: "bob", name: "Bob INDAMORA PLAY" },
  { sku: "tote-bag", name: "Tote bag INDAMORA PLAY" },
  { sku: "phone-case", name: "Coque téléphone INDAMORA PLAY" },
] as const;

const EUROPEAN_UNION_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI",
  "ES", "SE",
] as const;

const REQUIRED_STORE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
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

function isDevelopmentTestMode(): boolean {
  return process.env.NODE_ENV === "development";
}

function developmentHosts(): Set<string> {
  const candidates = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ];
  const hosts = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const value = candidate.trim();
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      const hostname = url.hostname.toLowerCase();
      if (hostname.endsWith(".replit.dev") || hostname.endsWith(".repl.co")) {
        hosts.add(hostname);
      }
    } catch {
      // Ignore malformed, unrelated, and non-development domains.
    }
  }

  return hosts;
}

function hasRequiredEvents(events: string[] | undefined): boolean {
  const enabled = new Set(events ?? []);
  return (
    enabled.has("*") ||
    REQUIRED_STORE_WEBHOOK_EVENTS.every((event) => enabled.has(event))
  );
}

function isConfiguredTestWebhook(endpoint: StripeWebhookEndpoint): boolean {
  if (
    endpoint.livemode !== false ||
    endpoint.status !== "enabled" ||
    !hasRequiredEvents(endpoint.enabled_events)
  ) {
    return false;
  }

  try {
    const url = new URL(endpoint.url ?? "");
    return (
      url.protocol === "https:" &&
      developmentHosts().has(url.hostname.toLowerCase()) &&
      url.pathname === "/api/stripe/webhook"
    );
  } catch {
    return false;
  }
}

async function hasConfiguredTestWebhook(): Promise<boolean> {
  if (!process.env.STRIPE_WEBHOOK_SECRET || developmentHosts().size === 0) {
    return false;
  }

  const endpoints = await stripeApi<StripeWebhookEndpointPage>(
    "/v1/webhook_endpoints?limit=100",
  );
  return endpoints.data.some(isConfiguredTestWebhook);
}

async function readStorePrices(): Promise<Map<string, StripePrice>> {
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
        price.livemode === false &&
        price.type === "one_time" &&
        price.currency === "eur" &&
        price.unit_amount === 1500 &&
        price.metadata?.indamoraStoreSku === product.sku &&
        stripeProduct?.active === true &&
        stripeProduct.livemode === false &&
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
  if (!isDevelopmentTestMode()) {
    return { prices: new Map(), webhookReady: false };
  }
  const [prices, webhookReady] = await Promise.all([
    readStorePrices(),
    hasConfiguredTestWebhook(),
  ]);
  return { prices, webhookReady };
}

function storeMessage(
  priceCount: number,
  webhookReady: boolean,
): string | null {
  if (priceCount !== STORE_PRODUCTS.length) {
    return "Le catalogue Stripe TEST des cinq produits n’est pas encore complet.";
  }
  if (!webhookReady) {
    return "Le webhook Stripe TEST signé n’est pas prêt. Le paiement reste désactivé.";
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

function developmentReturnBase(): string | null {
  const host = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (!host) return null;

  try {
    const url = new URL(host.includes("://") ? host : `https://${host}`);
    if (
      url.protocol !== "https:" ||
      !(url.hostname.endsWith(".replit.dev") || url.hostname.endsWith(".repl.co")) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return `https://${url.hostname}/indamora-play/boutique`;
  } catch {
    return null;
  }
}

router.get("/store/catalog", async (req, res): Promise<void> => {
  if (!isDevelopmentTestMode()) {
    res.status(404).json({ error: "Catalogue indisponible." });
    return;
  }

  try {
    const readiness = await storeReadiness();
    const message = storeMessage(
      readiness.prices.size,
      readiness.webhookReady,
    );
    res.json(
      GetStoreCatalogResponse.parse({
        mode: "test",
        checkoutAvailable: message === null,
        message,
        products: STORE_PRODUCTS.map((product) => ({
          ...product,
          priceCents: 1500,
          available: readiness.prices.has(product.sku),
        })),
      }),
    );
  } catch {
    req.log.warn("INDAMORA PLAY TEST store catalog could not be verified");
    res.json(
      GetStoreCatalogResponse.parse({
        mode: "test",
        checkoutAvailable: false,
        message: "Le paiement TEST est temporairement indisponible.",
        products: STORE_PRODUCTS.map((product) => ({
          ...product,
          priceCents: 1500,
          available: false,
        })),
      }),
    );
  }
});

router.post("/store/checkout", async (req, res): Promise<void> => {
  if (!isDevelopmentTestMode()) {
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
    if (seenSkus.has(item.sku)) {
      res.status(400).json({ error: "Un produit apparaît plusieurs fois dans le panier." });
      return;
    }
    seenSkus.add(item.sku);
  }

  const baseUrl = developmentReturnBase();
  if (!baseUrl) {
    res.status(503).json({ error: "Le Checkout TEST n’est pas configuré." });
    return;
  }

  try {
    const readiness = await storeReadiness();
    const message = storeMessage(
      readiness.prices.size,
      readiness.webhookReady,
    );
    if (message) {
      res.status(503).json({ error: message });
      return;
    }

    const orderReference = randomUUID();
    const params = formData({
      mode: "payment",
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

    let expectedAmountCents = shipping.amountCents;
    input.data.items.forEach((item, index) => {
      const price = readiness.prices.get(item.sku);
      if (!price) {
        throw new Error("Catalogue TEST incomplet.");
      }
      expectedAmountCents += 1500 * item.quantity;
      params.set(`line_items[${index}][price]`, price.id);
      params.set(`line_items[${index}][quantity]`, String(item.quantity));
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

    const session = await stripeApi<StoreCheckoutSession>(
      "/v1/checkout/sessions",
      {
        method: "POST",
        idempotencyKey: `indamora-store-test-${orderReference}`,
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
      !session.id?.startsWith("cs_test_") ||
      session.livemode !== false ||
      session.mode !== "payment" ||
      session.metadata?.storeFlow !== "indamora-play-boutique-v1" ||
      session.currency !== "eur" ||
      session.amount_total !== expectedAmountCents ||
      checkoutUrl?.protocol !== "https:" ||
      checkoutUrl.hostname !== "checkout.stripe.com"
    ) {
      req.log.error("Stripe returned an unexpected INDAMORA PLAY TEST session");
      res.status(502).json({ error: "Le Checkout Stripe TEST a été refusé." });
      return;
    }

    res.json(
      CreateStoreCheckoutResponse.parse({
        sessionId: session.id,
        url: checkoutUrl.toString(),
        mode: "test",
      }),
    );
  } catch {
    req.log.error("INDAMORA PLAY TEST Checkout creation failed");
    res.status(502).json({ error: "Le paiement TEST est temporairement indisponible." });
  }
});

router.get("/store/checkout/status", async (req, res): Promise<void> => {
  if (!isDevelopmentTestMode()) {
    res.status(404).json({ error: "Statut indisponible." });
    return;
  }

  const query = GetStoreCheckoutStatusQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "L’identifiant Checkout est invalide." });
    return;
  }

  try {
    const session = await stripeApi<StoreCheckoutSession>(
      `/v1/checkout/sessions/${encodeURIComponent(query.data.sessionId)}`,
    );
    if (
      session.id !== query.data.sessionId ||
      session.livemode !== false ||
      session.mode !== "payment" ||
      session.metadata?.storeFlow !== "indamora-play-boutique-v1"
    ) {
      res.status(404).json({ error: "Session INDAMORA PLAY TEST introuvable." });
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
          paymentIntent.livemode === false &&
          (paymentIntent.status === "canceled" ||
            paymentIntent.status === "requires_payment_method")
        ) {
          status = "unpaid";
        }
      }
    } else {
      status = "pending";
    }

    res.json(
      GetStoreCheckoutStatusResponse.parse({
        status,
        amountTotalCents: session.amount_total ?? null,
        currency: session.currency ?? null,
      }),
    );
  } catch {
    req.log.warn("INDAMORA PLAY TEST Checkout status lookup failed");
    res.status(502).json({ error: "Le statut du paiement TEST est indisponible." });
  }
});

export default router;
