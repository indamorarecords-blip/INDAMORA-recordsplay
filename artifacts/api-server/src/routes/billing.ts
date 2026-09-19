import { clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { billingAccountsTable, db } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { formData, stripeApi, type StripePrice } from "../stripeClient";

const router: IRouter = Router();

const planConfig = {
  africa: {
    priceEnvironmentKey: "STRIPE_PRICE_AFRICA_MONTHLY",
    metadataValue: "premium_africa_monthly",
    currency: "xaf",
    amount: 500,
  },
  international: {
    priceEnvironmentKey: "STRIPE_PRICE_INTERNATIONAL_MONTHLY",
    metadataValue: "premium_international_monthly",
    currency: "eur",
    amount: 500,
  },
} as const;

const donationAmounts = new Set([1, 5, 10, 20, 50, 100]);

type BillingRequest = Request & { clerkUserId?: string };
type StripeSubscription = {
  id: string;
  created: number;
  status: string;
  cancel_at_period_end: boolean;
  items?: {
    data: Array<{ current_period_end?: number; price?: { id?: string } }>;
  };
};

function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const protocol = req.get("x-forwarded-proto")?.split(",")[0] || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0] || req.get("host");
  if (!host) throw new Error("Impossible de déterminer l’URL publique de l’application.");
  return `${protocol}://${host}${process.env.BASE_PATH || ""}`;
}

async function getOrCreateCustomer(req: BillingRequest): Promise<string> {
  const userId = req.clerkUserId;
  if (!userId) throw new Error("Authentification requise.");

  const [existing] = await db
    .select()
    .from(billingAccountsTable)
    .where(eq(billingAccountsTable.clerkUserId, userId))
    .limit(1);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  )?.emailAddress;
  if (!email) throw new Error("Une adresse email est nécessaire pour démarrer un abonnement.");

  const matchingCustomers = await stripeApi<{ data: Array<{ id: string }> }>(
    `/v1/customers/search?query=${encodeURIComponent(`metadata['clerkUserId']:'${userId}'`)}&limit=1`,
  );
  const customer =
    matchingCustomers.data[0] ??
    (await stripeApi<{ id: string }>("/v1/customers", {
      method: "POST",
      params: formData({
        email,
        "metadata[clerkUserId]": userId,
      }),
    }));

  await db
    .insert(billingAccountsTable)
    .values({ clerkUserId: userId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: billingAccountsTable.clerkUserId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });

  return customer.id;
}

function isRecurringPlanPrice(
  price: StripePrice,
  plan: keyof typeof planConfig,
): boolean {
  const expected = planConfig[plan];
  return Boolean(
    price.active &&
      price.type === "recurring" &&
      price.recurring?.interval === "month" &&
      price.currency === expected.currency &&
      price.unit_amount === expected.amount &&
      price.metadata.indamoraPlan === expected.metadataValue,
  );
}

async function getPlanPrice(plan: keyof typeof planConfig): Promise<StripePrice> {
  const expected = planConfig[plan];
  const configuredId = process.env[expected.priceEnvironmentKey];
  if (configuredId) {
    const price = await stripeApi<StripePrice>(`/v1/prices/${configuredId}`);
    if (!isRecurringPlanPrice(price, plan)) {
      throw new Error("Le prix Stripe configuré ne correspond pas à l’offre demandée.");
    }
    return price;
  }

  const prices = await stripeApi<{ data: StripePrice[] }>(
    "/v1/prices?active=true&type=recurring&limit=100",
  );
  const price = prices.data.find((candidate) => isRecurringPlanPrice(candidate, plan));
  if (!price) {
    throw new Error("Le prix Stripe de cette offre n’est pas encore configuré.");
  }
  return price;
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
      candidate.currency === "eur" &&
      candidate.unit_amount === amountEur * 100 &&
      candidate.metadata.indamoraDonationEur === String(amountEur),
  );
  if (!price) throw new Error("Le prix Stripe de ce don n’est pas encore configuré.");
  return price;
}

router.get("/billing/status", requireAuth, async (req: BillingRequest, res) => {
  try {
    const [account] = await db
      .select()
      .from(billingAccountsTable)
      .where(eq(billingAccountsTable.clerkUserId, req.clerkUserId!))
      .limit(1);
    if (!account?.stripeCustomerId) {
      res.json({ status: "none", subscription: null });
      return;
    }

    const subscriptions = await stripeApi<{ data: StripeSubscription[] }>(
      `/v1/subscriptions?customer=${encodeURIComponent(account.stripeCustomerId)}&status=all&limit=20`,
    );
    const subscription = subscriptions.data
      .sort((left, right) => right.created - left.created)
      .find((item) => item.status !== "incomplete_expired");

    if (!subscription) {
      res.json({ status: "none", subscription: null });
      return;
    }

    res.json({
      status: subscription.status,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.items?.data[0]?.current_period_end ?? null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        priceId: subscription.items?.data[0]?.price?.id ?? null,
      },
    });
  } catch (error) {
    req.log.error({ error }, "Unable to read Stripe subscription status");
    res.status(502).json({ error: "Impossible de lire le statut Premium." });
  }
});

router.post("/billing/checkout", async (req: BillingRequest, res) => {
  const kind = req.body?.kind;
  const plan = req.body?.plan;
  const amountEur = Number(req.body?.amountEur);

  if (kind !== "subscription" && kind !== "donation") {
    res.status(400).json({ error: "Type de paiement invalide." });
    return;
  }
  if (kind === "subscription" && !req.clerkUserId) {
    res.status(401).json({ error: "Une connexion est nécessaire pour Premium." });
    return;
  }
  if (kind === "subscription" && (plan !== "africa" && plan !== "international")) {
    res.status(400).json({ error: "Offre Premium invalide." });
    return;
  }
  if (kind === "donation" && !Number.isInteger(amountEur)) {
    res.status(400).json({ error: "Montant de don invalide." });
    return;
  }

  try {
    const customerId = req.clerkUserId ? await getOrCreateCustomer(req) : undefined;
    const baseUrl = publicBaseUrl(req);
    const price =
      kind === "subscription"
        ? await getPlanPrice(plan as keyof typeof planConfig)
        : await getDonationPrice(amountEur);
    const session = await stripeApi<{ url?: string }>("/v1/checkout/sessions", {
      method: "POST",
      params: formData({
        ...(customerId ? { customer: customerId } : { customer_creation: "always" }),
        ...(req.clerkUserId ? { client_reference_id: req.clerkUserId } : {}),
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": 1,
        mode: kind === "subscription" ? "subscription" : "payment",
        success_url: `${baseUrl}/${kind === "subscription" ? "pricing" : "soutenir"}?checkout=success`,
        cancel_url: `${baseUrl}/${kind === "subscription" ? "pricing" : "soutenir"}?checkout=cancelled`,
        "metadata[kind]": kind,
        "metadata[plan]": kind === "subscription" ? String(plan) : String(amountEur),
        ...(kind === "subscription"
          ? { "subscription_data[metadata][clerkUserId]": req.clerkUserId! }
          : {}),
      }),
    });

    if (!session.url) throw new Error("Stripe n’a pas fourni d’URL Checkout.");
    res.json({ url: session.url });
  } catch (error) {
    req.log.error({ error }, "Unable to create Stripe Checkout session");
    res.status(502).json({ error: error instanceof Error ? error.message : "Checkout indisponible." });
  }
});

router.post("/billing/portal", requireAuth, async (req: BillingRequest, res) => {
  try {
    const customerId = await getOrCreateCustomer(req);
    const session = await stripeApi<{ url?: string }>("/v1/billing_portal/sessions", {
      method: "POST",
      params: formData({
        customer: customerId,
        return_url: `${publicBaseUrl(req)}/profil`,
      }),
    });
    res.json({ url: session.url });
  } catch (error) {
    req.log.error({ error }, "Unable to create Stripe billing portal session");
    res.status(502).json({ error: "La gestion de l’abonnement est indisponible." });
  }
});

export default router;