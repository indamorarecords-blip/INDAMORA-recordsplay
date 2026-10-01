import { eq, sql } from "drizzle-orm";
import {
  billingAccountsTable,
  db,
  stripeEventsTable,
} from "@workspace/db";
import {
  getRecognizedPremiumPriceId,
  matchesStripeMode,
  selectCurrentPremiumSubscription,
  type PremiumSubscription,
  type StripeMode,
} from "./billingLogic";
import { verifyStripeSignature } from "./stripeSignature";
import { stripeApi, type StripePrice } from "./stripeClient";

type StripeEventPayload = {
  id?: string;
  type?: string;
  livemode?: boolean;
  created?: number;
  data?: { object?: Record<string, unknown> };
};

type StripeSubscription = PremiumSubscription & {
  customer?: string | { id: string };
  metadata?: Record<string, unknown>;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: StripePrice;
    }>;
  };
};
type StripeCustomer = { id: string; livemode?: boolean };
type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value) {
    return stringValue(value.id);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function invoiceSubscriptionId(invoice: Record<string, unknown>): string | undefined {
  const parent = invoice.parent;
  if (parent && typeof parent === "object" && "subscription_details" in parent) {
    const details = parent.subscription_details;
    if (details && typeof details === "object" && "subscription" in details) {
      const id = stringValue(details.subscription);
      if (id) return id;
    }
  }
  return stringValue(invoice.subscription);
}

function invoicePaymentAmount(invoice: Record<string, unknown>): number | undefined {
  return numberValue(invoice.amount_paid) ?? numberValue(invoice.amount_due);
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Webhook Stripe non configuré.");
    if (!verifyStripeSignature(payload, signature, secret)) {
      throw new Error("Signature Stripe invalide ou expirée.");
    }

    const event = JSON.parse(payload.toString("utf8")) as StripeEventPayload;
    if (
      !event.id ||
      !event.type ||
      typeof event.livemode !== "boolean" ||
      !event.data?.object
    ) {
      throw new Error("Événement Stripe incomplet.");
    }
    if (event.livemode !== (process.env.NODE_ENV === "production")) {
      throw new Error("Mode de webhook Stripe incorrect.");
    }
    await this.persistEvent(event);
  }

  private static async persistEvent(event: StripeEventPayload): Promise<void> {
    const object = event.data!.object!;
    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : {};
    const isInvoice =
      event.type === "invoice.paid" || event.type === "invoice.payment_failed";
    const isSubscriptionEvent = event.type?.startsWith("customer.subscription.");
    const isCheckoutEvent =
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded";
    const shouldReconcile =
      Boolean(isInvoice || isSubscriptionEvent) ||
      Boolean(isCheckoutEvent && metadata.kind === "subscription");
    const customerId = stringValue(object.customer);
    const initialSubscriptionId =
      (isSubscriptionEvent ? stringValue(object.id) : undefined) ??
      (isInvoice ? invoiceSubscriptionId(object) : undefined) ??
      stringValue(object.subscription);
    const paymentStatus = isInvoice
      ? event.type === "invoice.paid"
        ? "paid"
        : "failed"
      : stringValue(object.payment_status) ?? stringValue(object.status);

    await db.transaction(async (tx) => {
      const existingAccount = customerId
        ? (
            await tx
              .select({ clerkUserId: billingAccountsTable.clerkUserId })
              .from(billingAccountsTable)
              .where(eq(billingAccountsTable.stripeCustomerId, customerId))
              .limit(1)
          )[0]
        : undefined;
      const eventUserId =
        stringValue(metadata.clerkUserId) ??
        stringValue(object.client_reference_id) ??
        undefined;
      const clerkUserId = existingAccount?.clerkUserId ?? eventUserId;
      const identityMismatch = Boolean(
        existingAccount &&
          eventUserId &&
          existingAccount.clerkUserId !== eventUserId,
      );
      if (clerkUserId) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${clerkUserId}, 0))`,
        );
      }

      const inserted = await tx
        .insert(stripeEventsTable)
        .values({
          stripeEventId: event.id!,
          eventType: event.type!,
          kind: stringValue(metadata.kind),
          clerkUserId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: initialSubscriptionId,
          amountCents: numberValue(object.amount_total) ?? invoicePaymentAmount(object),
          currency: stringValue(object.currency),
          paymentStatus,
          occurredAt: event.created ? new Date(event.created * 1000) : new Date(),
        })
        .onConflictDoNothing({ target: stripeEventsTable.stripeEventId })
        .returning({ id: stripeEventsTable.id });

      if (
        inserted.length === 0 ||
        !shouldReconcile ||
        !clerkUserId ||
        !customerId ||
        identityMismatch
      ) {
        return;
      }

      const [existingUserAccount] = await tx
        .select({
          stripeCustomerId: billingAccountsTable.stripeCustomerId,
        })
        .from(billingAccountsTable)
        .where(eq(billingAccountsTable.clerkUserId, clerkUserId))
        .limit(1);
      if (
        existingUserAccount?.stripeCustomerId &&
        existingUserAccount.stripeCustomerId !== customerId
      ) {
        return;
      }

      const stripeMode: StripeMode = event.livemode ? "live" : "test";
      const customer = await stripeApi<StripeCustomer>(
        `/v1/customers/${encodeURIComponent(customerId)}`,
      );
      if (!matchesStripeMode(customer.livemode, stripeMode)) return;

      const subscriptionsForCustomer: StripeSubscription[] = [];
      let startingAfter: string | undefined;
      for (;;) {
        const params = new URLSearchParams({
          customer: customerId,
          status: "all",
          limit: "100",
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        params.append("expand[]", "data.items.data.price");
        const page = await stripeApi<{
          data: StripeSubscription[];
          has_more?: boolean;
        }>(`/v1/subscriptions?${params}`);
        subscriptionsForCustomer.push(...page.data);
        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1]!.id;
      }
      const currentPremium = selectCurrentPremiumSubscription(
        subscriptionsForCustomer,
        stripeMode,
        {
          africa: process.env.STRIPE_PRICE_AFRICA_MONTHLY,
          international: process.env.STRIPE_PRICE_INTERNATIONAL_MONTHLY,
        },
      );
      const premiumPriceId = currentPremium
        ? getRecognizedPremiumPriceId(currentPremium, stripeMode, {
            africa: process.env.STRIPE_PRICE_AFRICA_MONTHLY,
            international: process.env.STRIPE_PRICE_INTERNATIONAL_MONTHLY,
          })
        : null;
      const currentPeriodEnd =
        currentPremium?.current_period_end ??
        currentPremium?.items?.data?.[0]?.current_period_end;
      const accountValues = {
        clerkUserId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: premiumPriceId ? currentPremium!.id : null,
        premiumStatus: premiumPriceId ? currentPremium!.status : "none",
        premiumCurrentPeriodEnd:
          premiumPriceId && currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000)
            : null,
        updatedAt: new Date(),
      };
      await tx
        .insert(billingAccountsTable)
        .values(accountValues)
        .onConflictDoUpdate({
          target: billingAccountsTable.clerkUserId,
          set: {
            stripeCustomerId: accountValues.stripeCustomerId,
            stripeSubscriptionId: accountValues.stripeSubscriptionId,
            premiumStatus: accountValues.premiumStatus,
            premiumCurrentPeriodEnd: accountValues.premiumCurrentPeriodEnd,
            updatedAt: accountValues.updatedAt,
          },
        });
    });
  }
}