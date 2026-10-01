import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { billingAccountsTable, db } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  classifyPremiumCheckoutOffer,
  createCheckoutIdempotencyKey,
  createCheckoutParams,
  createCustomerIdempotencyKey,
  getRecognizedPremiumPriceId,
  isPremiumSubscription,
  isRecognizedPremiumPrice,
  isSecureSubscriptionCheckout,
  matchesStripeMode,
  PREMIUM_PLAN_CONFIG,
  selectCurrentPremiumSubscription,
  selectReusableSubscriptionCheckout,
  type PremiumPlan,
  type PremiumSubscription,
  type SubscriptionCheckoutSession,
  type StripeMode,
} from "../billingLogic";
import { formData, stripeApi, type StripePrice } from "../stripeClient";

const router: IRouter = Router();

const donationAmounts = new Set([1, 5, 10, 20, 50, 100]);
const inProduction = process.env.NODE_ENV === "production";
const stripeMode: StripeMode = inProduction ? "live" : "test";
const PRODUCTION_HOSTS = new Set([
  "indamoraplay.com",
  "indamora-play.replit.app",
]);
type Plan = PremiumPlan;
type BillingRequest = Request & { clerkUserId?: string };
type StripeSubscription = PremiumSubscription & {
  cancel_at_period_end: boolean;
  customer?: string | { id: string };
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: StripePrice;
    }>;
  };
};
type StripeCustomer = { id: string; livemode?: boolean };
type StripeWebhookEndpoint = {
  id: string;
  url: string;
  status: string;
  livemode: boolean;
  enabled_events: string[];
};

const REQUIRED_WEBHOOK_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

function resolveAuthenticatedUser(req: BillingRequest): string | undefined {
  const { userId } = getAuth(req);
  if (!userId) return undefined;
  req.clerkUserId = userId;
  return userId;
}

function isAllowedReturnHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (inProduction) return PRODUCTION_HOSTS.has(normalized);

  const configuredDomains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  return (
    PRODUCTION_HOSTS.has(normalized) ||
    configuredDomains.includes(normalized) ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".replit.dev") ||
    normalized.endsWith(".repl.co")
  );
}

function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("PUBLIC_APP_URL n’est pas une URL publique valide.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (inProduction && url.pathname !== "/" && url.pathname !== "") ||
      !isAllowedReturnHost(url.hostname)
    ) {
      throw new Error("PUBLIC_APP_URL ne correspond pas à un domaine autorisé.");
    }
    return url.toString().replace(/\/+$/, "");
  }

  if (inProduction) return "https://indamoraplay.com";

  const replitDomains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  const publicDomain = replitDomains.find(isAllowedReturnHost);
  if (publicDomain) return `https://${publicDomain}`;

  if (!inProduction) {
    const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim().toLowerCase();
    if (devDomain && isAllowedReturnHost(devDomain)) return `https://${devDomain}`;
  }

  throw new Error("Aucun domaine public autorisé n’est configuré pour Stripe.");
}

function isRecurringPlanPrice(price: StripePrice, plan: Plan): boolean {
  return Boolean(
    price.active &&
      (!configuredPriceIds()[plan] || price.id === configuredPriceIds()[plan]) &&
      isRecognizedPremiumPrice(price, stripeMode, configuredPriceIds()) &&
      PREMIUM_PLAN_CONFIG[plan].metadataValue ===
        price.metadata.indamoraPlan,
  );
}

function configuredPriceIds(): Partial<Record<Plan, string | undefined>> {
  return {
    africa: process.env[PREMIUM_PLAN_CONFIG.africa.priceEnvironmentKey],
    international:
      process.env[PREMIUM_PLAN_CONFIG.international.priceEnvironmentKey],
  };
}

async function findPlanPrice(plan: Plan): Promise<StripePrice | undefined> {
  const configuredId = process.env[PREMIUM_PLAN_CONFIG[plan].priceEnvironmentKey];
  if (configuredId) {
    const price = await stripeApi<StripePrice>(
      `/v1/prices/${encodeURIComponent(configuredId)}`,
    );
    return isRecurringPlanPrice(price, plan) ? price : undefined;
  }

  const prices = await stripeApi<{ data: StripePrice[] }>(
    "/v1/prices?active=true&type=recurring&limit=100",
  );
  return prices.data.find((price) => isRecurringPlanPrice(price, plan));
}

async function getPlanPrice(plan: Plan): Promise<StripePrice> {
  const price = await findPlanPrice(plan);
  if (price) return price;
  throw new Error("Le prix Stripe de cette offre n’est pas configuré pour cet environnement.");
}

async function getDonationPrice(amountEur: number): Promise<StripePrice> {
  if (!donationAmounts.has(amountEur)) {
    throw new Error("Le montant du don n’est pas disponible.");
  }

  const prices = await stripeApi<{ data: StripePrice[] }>(
    "/v1/prices?active=true&type=one_time&limit=100",
  );
  const price = prices.data.find(
    (candidate) =>
      candidate.livemode === inProduction &&
      candidate.currency === "eur" &&
      candidate.unit_amount === amountEur * 100 &&
      candidate.metadata.indamoraDonationEur === String(amountEur),
  );
  if (!price) {
    throw new Error("Le prix Stripe de ce don n’est pas configuré pour cet environnement.");
  }
  return price;
}

async function getWebhookReadiness(): Promise<{ ready: boolean; reason?: string }> {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return {
      ready: false,
      reason: "Le secret du webhook Stripe de production n’est pas configuré.",
    };
  }

  let expectedUrls: URL[];
  try {
    const baseUrl = publicBaseUrl();
    expectedUrls = inProduction
      ? Array.from(PRODUCTION_HOSTS, (host) =>
          new URL(`https://${host}/api/stripe/webhook`),
        )
      : [new URL(`${baseUrl}/api/stripe/webhook`)];
  } catch {
    return {
      ready: false,
      reason: "Le domaine public requis pour vérifier le webhook n’est pas configuré.",
    };
  }

  try {
    const endpoints = await stripeApi<{ data: StripeWebhookEndpoint[] }>(
      "/v1/webhook_endpoints?limit=100",
    );
    const isConfigured = endpoints.data.some((endpoint) => {
      if (
        endpoint.status !== "enabled" ||
        endpoint.livemode !== true ||
        !Array.isArray(endpoint.enabled_events)
      ) {
        return false;
      }

      let actualUrl: URL;
      try {
        actualUrl = new URL(endpoint.url);
      } catch {
        return false;
      }
      const correctTarget =
        actualUrl.protocol === "https:" &&
        !actualUrl.username &&
        !actualUrl.password &&
        expectedUrls.some(
          (expectedUrl) =>
            actualUrl.origin === expectedUrl.origin &&
            actualUrl.pathname === expectedUrl.pathname,
        ) &&
        !actualUrl.search &&
        !actualUrl.hash;
      const enabledEvents = new Set(endpoint.enabled_events);
      const hasAllEvents =
        enabledEvents.has("*") ||
        (enabledEvents.has("customer.subscription.*") &&
          enabledEvents.has("invoice.paid") &&
          enabledEvents.has("invoice.payment_failed")) ||
        REQUIRED_WEBHOOK_EVENTS.every((event) => enabledEvents.has(event));
      return correctTarget && hasAllEvents;
    });

    return isConfigured
      ? { ready: true }
      : {
          ready: false,
          reason:
            "Aucun webhook Stripe LIVE actif n’est configuré sur l’URL publique avec les événements d’abonnement requis.",
        };
  } catch {
    return {
      ready: false,
      reason: "La configuration du webhook Stripe LIVE n’a pas pu être vérifiée.",
    };
  }
}

async function getBillingReadiness(): Promise<{
  available: boolean;
  mode: "test" | "live" | "unavailable";
  webhookReady: boolean;
  plans: { africa: { available: boolean }; international: { available: boolean } };
  reason?: string;
}> {
  try {
    const [africa, international] = await Promise.all([
      findPlanPrice("africa"),
      findPlanPrice("international"),
    ]);
    const anyPriceAvailable = Boolean(africa || international);
    const webhook = inProduction
      ? await getWebhookReadiness()
      : { ready: false };
    // Endpoint registration is a synchronization diagnostic, not a prerequisite
    // for opening Checkout. Payment confirmation still comes from Stripe, never
    // from the browser return URL; signed webhook validation remains unchanged.
    const available = anyPriceAvailable;

    const reasons: string[] = [];
    if (!anyPriceAvailable) {
      reasons.push(
        `Aucun prix Stripe ${inProduction ? "LIVE" : "TEST"} actif ne correspond aux offres Premium.`,
      );
    }
    if (inProduction && !webhook.ready && webhook.reason) {
      reasons.push(webhook.reason);
    } else if (!inProduction && !webhook.ready) {
      reasons.push(
        "Mode TEST : un abonnement de test ne sera pas synchronisé sans webhook TEST.",
      );
    }

    return {
      available,
      mode: anyPriceAvailable ? (inProduction ? "live" : "test") : "unavailable",
      webhookReady: webhook.ready,
      plans: {
        africa: { available: Boolean(africa) },
        international: {
          available: Boolean(international),
        },
      },
      ...(reasons.length ? { reason: reasons.join(" ") } : {}),
    };
  } catch {
    return {
      available: false,
      mode: "unavailable",
      webhookReady: false,
      plans: { africa: { available: false }, international: { available: false } },
      reason: "La configuration des offres Stripe n’a pas pu être vérifiée.",
    };
  }
}

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockBillingUser(
  tx: BillingTransaction,
  userId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
  );
}

async function getStripeCustomer(customerId: string): Promise<StripeCustomer> {
  const customer = await stripeApi<StripeCustomer>(
    `/v1/customers/${encodeURIComponent(customerId)}`,
  );
  if (!matchesStripeMode(customer.livemode, stripeMode)) {
    throw new Error(
      "Le compte client Stripe enregistré ne correspond pas au mode de paiement actif.",
    );
  }
  return customer;
}

async function getOrCreateCustomer(
  tx: BillingTransaction,
  userId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ stripeCustomerId: billingAccountsTable.stripeCustomerId })
    .from(billingAccountsTable)
    .where(eq(billingAccountsTable.clerkUserId, userId))
    .limit(1);
  if (existing?.stripeCustomerId) {
    await getStripeCustomer(existing.stripeCustomerId);
    return existing.stripeCustomerId;
  }

  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  )?.emailAddress;
  if (!email) {
    throw new Error("Une adresse e-mail est nécessaire pour démarrer un abonnement.");
  }

  const matchingCustomers = await stripeApi<{
    data: Array<StripeCustomer>;
  }>(
    `/v1/customers/search?${formData({
      query: `metadata['clerkUserId']:'${userId}'`,
      limit: 1,
    })}`,
  );
  const matchingCustomer = matchingCustomers.data[0];
  const customer = matchingCustomer
    ? await getStripeCustomer(matchingCustomer.id)
    : await stripeApi<StripeCustomer>("/v1/customers", {
      method: "POST",
      idempotencyKey: createCustomerIdempotencyKey(userId),
      params: formData({
        email,
        "metadata[clerkUserId]": userId,
      }),
    });
  if (!matchesStripeMode(customer.livemode, stripeMode)) {
    throw new Error(
      "Le compte client Stripe ne correspond pas au mode de paiement actif.",
    );
  }

  if (existing) {
    const updated = await tx
      .update(billingAccountsTable)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(
        and(
          eq(billingAccountsTable.clerkUserId, userId),
          isNull(billingAccountsTable.stripeCustomerId),
        ),
      )
      .returning({ stripeCustomerId: billingAccountsTable.stripeCustomerId });
    if (updated[0]?.stripeCustomerId) return updated[0].stripeCustomerId;
  } else {
    const inserted = await tx
      .insert(billingAccountsTable)
      .values({ clerkUserId: userId, stripeCustomerId: customer.id })
      .onConflictDoNothing()
      .returning({ stripeCustomerId: billingAccountsTable.stripeCustomerId });
    if (inserted[0]?.stripeCustomerId) return inserted[0].stripeCustomerId;
  }

  const [winningMapping] = await tx
    .select({ stripeCustomerId: billingAccountsTable.stripeCustomerId })
    .from(billingAccountsTable)
    .where(eq(billingAccountsTable.clerkUserId, userId))
    .limit(1);
  if (!winningMapping?.stripeCustomerId) {
    throw new Error("Le compte client Stripe n’a pas pu être associé à l’utilisateur.");
  }
  await getStripeCustomer(winningMapping.stripeCustomerId);
  return winningMapping.stripeCustomerId;
}

async function listCustomerSubscriptions(
  customerId: string,
): Promise<StripeSubscription[]> {
  const subscriptions: StripeSubscription[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const params = formData({
      customer: customerId,
      status: "all",
      limit: 100,
      starting_after: startingAfter,
    });
    params.append("expand[]", "data.items.data.price");
    const result = await stripeApi<{
      data: StripeSubscription[];
      has_more?: boolean;
    }>(`/v1/subscriptions?${params}`);
    subscriptions.push(...result.data);
    if (!result.has_more || result.data.length === 0) return subscriptions;
    startingAfter = result.data[result.data.length - 1]!.id;
  }
}

async function findOpenSubscriptionCheckout(
  customerId: string,
  userId: string,
  requestedPlan: Plan,
  requestedPriceId: string,
): Promise<{ url: string } | { offerConflict: true } | undefined> {
  const params = formData({
    customer: customerId,
    status: "open",
    limit: 100,
  });
  const sessions: SubscriptionCheckoutSession[] = [];
  for (;;) {
    const result = await stripeApi<{
      data: SubscriptionCheckoutSession[];
      has_more?: boolean;
    }>(`/v1/checkout/sessions?${params}`);
    sessions.push(...result.data);
    if (!result.has_more || result.data.length === 0) break;
    params.set("starting_after", result.data[result.data.length - 1]!.id);
  }
  let candidate = selectReusableSubscriptionCheckout(sessions, userId, customerId, stripeMode);
  while (candidate) {
    const lineItems = await stripeApi<{
      data: Array<{ price?: StripePrice; quantity?: number | null }>;
    }>(
      `/v1/checkout/sessions/${encodeURIComponent(candidate.id)}/line_items?limit=100&expand%5B%5D=data.price`,
    );
    const offer = classifyPremiumCheckoutOffer(
      candidate, lineItems.data, requestedPlan, requestedPriceId, stripeMode,
    );
    if (offer === "conflict") return { offerConflict: true };
    if (offer === "reuse" && isSecureSubscriptionCheckout(candidate, stripeMode)) {
      return { url: candidate.url };
    }
    sessions.splice(sessions.indexOf(candidate), 1);
    candidate = selectReusableSubscriptionCheckout(sessions, userId, customerId, stripeMode);
  }
  return undefined;
}

function hasBlockingSubscription(subscriptions: StripeSubscription[]): boolean {
  const premium = selectCurrentPremiumSubscription(
    subscriptions,
    stripeMode,
    configuredPriceIds(),
  );
  return Boolean(
    premium &&
      ["active", "trialing", "past_due", "unpaid"].includes(premium.status),
  );
}

function hasIncompletePremiumSubscription(
  subscriptions: StripeSubscription[],
): boolean {
  const premium = selectCurrentPremiumSubscription(
    subscriptions,
    stripeMode,
    configuredPriceIds(),
  );
  return premium?.status === "incomplete";
}

router.get("/billing/plans", async (_req, res): Promise<void> => {
  res.json(await getBillingReadiness());
});

router.get(
  "/billing/status",
  requireAuth,
  async (req: BillingRequest, res): Promise<void> => {
    try {
      const [account] = await db
        .select({
          stripeCustomerId: billingAccountsTable.stripeCustomerId,
        })
        .from(billingAccountsTable)
        .where(eq(billingAccountsTable.clerkUserId, req.clerkUserId!))
        .limit(1);
      if (!account?.stripeCustomerId) {
        res.json({ status: "none", subscription: null, isPremium: false });
        return;
      }

      await getStripeCustomer(account.stripeCustomerId);
      const subscriptions = await listCustomerSubscriptions(account.stripeCustomerId);
      const subscription = selectCurrentPremiumSubscription(
        subscriptions,
        stripeMode,
        configuredPriceIds(),
      );

      if (!subscription) {
        res.json({ status: "none", subscription: null, isPremium: false });
        return;
      }

      const currentPeriodEnd =
        subscription.current_period_end ??
        subscription.items?.data?.[0]?.current_period_end ??
        null;
      res.json({
        status: subscription.status,
        isPremium: isPremiumSubscription(
          subscription,
          stripeMode,
          configuredPriceIds(),
        ),
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          priceId:
            getRecognizedPremiumPriceId(
              subscription,
              stripeMode,
              configuredPriceIds(),
            ) ?? null,
        },
      });
    } catch {
      req.log.error("Stripe subscription status lookup failed");
      res.status(502).json({ error: "Impossible de lire le statut Premium." });
    }
  },
);

router.post(
  "/billing/checkout",
  async (req: BillingRequest, res): Promise<void> => {
    const kind = req.body?.kind;
    const plan = req.body?.plan;
    const amountEur = Number(req.body?.amountEur);
    const userId = resolveAuthenticatedUser(req);

    if (kind !== "subscription" && kind !== "donation") {
      res.status(400).json({ error: "Type de paiement invalide." });
      return;
    }
    if (kind === "subscription" && !userId) {
      res.status(401).json({ error: "Une connexion est nécessaire pour Premium." });
      return;
    }
    if (kind === "subscription" && plan !== "africa" && plan !== "international") {
      res.status(400).json({ error: "Offre Premium invalide." });
      return;
    }
    if (kind === "donation" && !Number.isInteger(amountEur)) {
      res.status(400).json({ error: "Montant de don invalide." });
      return;
    }

    try {
      let selectedPrice: StripePrice | undefined;
      if (kind === "subscription") {
        const readiness = await getBillingReadiness();
        const selectedPlan = plan as Plan;
        if (!readiness.plans[selectedPlan].available) {
          res.status(503).json({
            error:
              readiness.reason ??
              "Le prix Stripe de cette offre n’est pas configuré pour cet environnement.",
          });
          return;
        }
        selectedPrice = await getPlanPrice(selectedPlan);
      }

      const baseUrl = publicBaseUrl();
      const price =
        kind === "subscription" && selectedPrice
          ? selectedPrice
          : await getDonationPrice(amountEur);
      if (kind === "subscription") {
        const userId = req.clerkUserId!;
        const result = await db.transaction(async (tx) => {
          await lockBillingUser(tx, userId);
          const customerId = await getOrCreateCustomer(tx, userId);
          const subscriptions = await listCustomerSubscriptions(customerId);

          if (hasBlockingSubscription(subscriptions)) {
            return { conflict: true as const };
          }

          const openSession = await findOpenSubscriptionCheckout(
            customerId,
            userId,
            plan as Plan,
            price.id,
          );
          if (openSession && "offerConflict" in openSession) {
            return { conflict: true as const, offerConflict: true as const };
          }
          if (openSession && "url" in openSession) {
            return { conflict: false as const, url: openSession.url };
          }

          if (hasIncompletePremiumSubscription(subscriptions)) {
            return { conflict: true as const };
          }

          const session = await stripeApi<SubscriptionCheckoutSession>(
            "/v1/checkout/sessions",
            {
              method: "POST",
              idempotencyKey: createCheckoutIdempotencyKey(userId, plan as Plan),
              params: createCheckoutParams({
                kind: "subscription",
                plan: plan as Plan,
                priceId: price.id,
                customerId,
                clientReferenceId: userId,
                baseUrl,
              }),
            },
          );
          if (!isSecureSubscriptionCheckout(session, stripeMode)) {
            throw new Error("Checkout Stripe ne correspond pas au mode de paiement actif ou à une adresse sécurisée.");
          }
          return { conflict: false as const, url: session.url };
        });
        if (result.conflict) {
          res.status(409).json({
            error: "offerConflict" in result
              ? "Un Checkout Premium pour une autre offre est déjà ouvert. Reprenez l’offre correspondante ou attendez son expiration avant de choisir une autre offre."
              : "Un abonnement existe déjà ou attend un paiement. Gérez-le depuis votre portail Premium.",
          });
          return;
        }
        res.json({ url: result.url });
        return;
      }

      const session = await stripeApi<{ url?: string }>(
        "/v1/checkout/sessions",
        {
          method: "POST",
          params: createCheckoutParams({
            kind: "donation",
            amountEur,
            priceId: price.id,
            clientReferenceId: userId,
            baseUrl,
          }),
        },
      );
      if (!session.url) throw new Error("Checkout Stripe n’a pas fourni de lien.");
      res.json({ url: session.url });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Le prix Stripe de cette offre n’est pas configuré pour cet environnement." ||
          error.message === "Le prix Stripe de ce don n’est pas configuré pour cet environnement.")
      ) {
        res.status(503).json({ error: error.message });
        return;
      }
      req.log.error("Stripe checkout session creation failed");
      res.status(502).json({ error: "Le paiement est temporairement indisponible." });
    }
  },
);

router.post(
  "/billing/portal",
  requireAuth,
  async (req: BillingRequest, res): Promise<void> => {
    try {
      const [account] = await db
        .select({
          stripeCustomerId: billingAccountsTable.stripeCustomerId,
        })
        .from(billingAccountsTable)
        .where(eq(billingAccountsTable.clerkUserId, req.clerkUserId!))
        .limit(1);
      if (!account?.stripeCustomerId) {
        res.status(404).json({ error: "Aucun abonnement à gérer." });
        return;
      }
      await getStripeCustomer(account.stripeCustomerId);
      const subscriptions = await listCustomerSubscriptions(
        account.stripeCustomerId,
      );
      const subscription = selectCurrentPremiumSubscription(
        subscriptions,
        stripeMode,
        configuredPriceIds(),
      );
      if (!subscription) {
        res.status(404).json({ error: "Aucun abonnement à gérer." });
        return;
      }
      const session = await stripeApi<{ url?: string }>(
        "/v1/billing_portal/sessions",
        {
          method: "POST",
          params: formData({
            customer: account.stripeCustomerId,
            return_url: `${publicBaseUrl()}/pricing`,
          }),
        },
      );
      if (!session.url) throw new Error("Portail Stripe sans URL.");
      res.json({ url: session.url });
    } catch {
      req.log.error("Stripe billing portal session creation failed");
      res.status(502).json({ error: "La gestion de l’abonnement est indisponible." });
    }
  },
);

export default router;