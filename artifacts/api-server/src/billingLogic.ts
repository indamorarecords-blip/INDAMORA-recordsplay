import { createHash } from "node:crypto";

export const PREMIUM_PLAN_CONFIG = {
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

export type PremiumPlan = keyof typeof PREMIUM_PLAN_CONFIG;
export type StripeMode = "test" | "live";

export type PremiumPrice = {
  id: string;
  livemode: boolean;
  type?: string;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type PremiumSubscription = {
  id: string;
  status: string;
  created: number;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  livemode?: boolean;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: PremiumPrice;
    }>;
  };
};

export type SubscriptionCheckoutSession = {
  id: string;
  url?: string | null;
  mode?: string;
  status?: string;
  livemode?: boolean;
  created?: number;
  expires_at?: number;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export function matchesStripeMode(livemode: unknown, mode: StripeMode): boolean {
  return typeof livemode === "boolean" && livemode === (mode === "live");
}

export function isRecognizedPremiumPrice(
  price: PremiumPrice | undefined,
  mode: StripeMode,
  _configuredPriceIds: Partial<Record<PremiumPlan, string | undefined>> = {},
): price is PremiumPrice {
  if (!price || !matchesStripeMode(price.livemode, mode)) return false;

  // Current Checkout price IDs must not invalidate existing, archived Premium prices.
  return (Object.keys(PREMIUM_PLAN_CONFIG) as PremiumPlan[]).some((plan) => {
    const expected = PREMIUM_PLAN_CONFIG[plan];
    return (
      price.type === "recurring" &&
      price.recurring?.interval === "month" &&
      price.currency === expected.currency &&
      price.unit_amount === expected.amount &&
      price.metadata?.indamoraPlan === expected.metadataValue
    );
  });
}

export function getRecognizedPremiumPriceId(
  subscription: PremiumSubscription,
  mode: StripeMode,
  configuredPriceIds: Partial<Record<PremiumPlan, string | undefined>> = {},
): string | null {
  return (
    subscription.items?.data?.find((item) =>
      isRecognizedPremiumPrice(item.price, mode, configuredPriceIds),
    )?.price?.id ?? null
  );
}

function subscriptionPriority(status: string): number {
  switch (status) {
    case "active":
    case "trialing":
      return 5;
    case "past_due":
    case "unpaid":
      return 4;
    case "incomplete":
      return 3;
    case "canceled":
      return 1;
    default:
      return 0;
  }
}

export function selectCurrentPremiumSubscription<T extends PremiumSubscription>(
  subscriptions: T[],
  mode: StripeMode,
  configuredPriceIds: Partial<Record<PremiumPlan, string | undefined>> = {},
): T | undefined {
  return subscriptions
    .filter(
      (subscription) =>
        subscriptionPriority(subscription.status) > 0 &&
        getRecognizedPremiumPriceId(subscription, mode, configuredPriceIds) !== null,
    )
    .sort(
      (left, right) =>
        subscriptionPriority(right.status) - subscriptionPriority(left.status) ||
        right.created - left.created,
    )[0];
}

export function isPremiumSubscription(
  subscription: PremiumSubscription | undefined,
  mode: StripeMode,
  configuredPriceIds: Partial<Record<PremiumPlan, string | undefined>> = {},
): boolean {
  return Boolean(
    subscription &&
      (subscription.status === "active" || subscription.status === "trialing") &&
      getRecognizedPremiumPriceId(subscription, mode, configuredPriceIds),
  );
}

export function selectReusableSubscriptionCheckout(
  sessions: SubscriptionCheckoutSession[],
  userId: string,
  customerId: string,
  mode: StripeMode,
  nowSeconds = Math.floor(Date.now() / 1000),
): SubscriptionCheckoutSession | undefined {
  return sessions
    .filter(
      (session) =>
        session.mode === "subscription" &&
        session.status === "open" &&
        matchesStripeMode(session.livemode, mode) &&
        (typeof session.customer === "string"
          ? session.customer
          : session.customer?.id) === customerId &&
        (!session.client_reference_id ||
          session.client_reference_id === userId) &&
        Boolean(session.url) &&
        typeof session.expires_at === "number" &&
        session.expires_at > nowSeconds,
    )
    .sort((left, right) => (right.created ?? 0) - (left.created ?? 0))[0];
}

export function classifyPremiumCheckoutOffer(
  session: SubscriptionCheckoutSession,
  lineItems: Array<{ price?: PremiumPrice; quantity?: number | null }>,
  requestedPlan: PremiumPlan,
  requestedPriceId: string,
  mode: StripeMode,
): "unrelated" | "reuse" | "conflict" {
  if (!lineItems.some((item) => isRecognizedPremiumPrice(item.price, mode))) {
    return "unrelated";
  }
  return lineItems.length === 1 &&
    lineItems[0]?.price?.id === requestedPriceId &&
    lineItems[0]?.quantity === 1 &&
    session.metadata?.kind === "subscription" &&
    session.metadata?.plan === requestedPlan
    ? "reuse"
    : "conflict";
}

export function createCheckoutParams(input: {
  kind: "subscription" | "donation";
  plan?: PremiumPlan;
  amountEur?: number;
  priceId: string;
  customerId?: string;
  clientReferenceId?: string;
  baseUrl: string;
}): URLSearchParams {
  const route = input.kind === "subscription" ? "pricing" : "soutenir";
  const isSubscription = input.kind === "subscription";
  const params = new URLSearchParams({
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    mode: isSubscription ? "subscription" : "payment",
    success_url: `${input.baseUrl}/${route}?checkout=success`,
    cancel_url: `${input.baseUrl}/${route}?checkout=cancelled`,
    "metadata[kind]": input.kind,
    "metadata[plan]": isSubscription
      ? String(input.plan)
      : String(input.amountEur),
  });

  if (input.customerId) params.set("customer", input.customerId);
  else params.set("customer_creation", "always");
  if (input.clientReferenceId) {
    params.set("client_reference_id", input.clientReferenceId);
  }
  if (isSubscription && input.clientReferenceId) {
    params.set(
      "subscription_data[metadata][clerkUserId]",
      input.clientReferenceId,
    );
  }
  return params;
}

function stableKey(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\0")).digest("hex");
  return `indamora-${prefix}-${digest}`;
}

export function createCustomerIdempotencyKey(userId: string): string {
  return stableKey("customer", userId);
}

export function createCheckoutIdempotencyKey(
  userId: string,
  plan: PremiumPlan,
  nowMilliseconds = Date.now(),
): string {
  const tenMinuteWindow = Math.floor(nowMilliseconds / (10 * 60 * 1000));
  return stableKey("checkout", userId, plan, String(tenMinuteWindow));
}