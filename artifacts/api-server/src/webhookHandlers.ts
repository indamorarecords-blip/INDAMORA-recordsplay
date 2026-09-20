import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  billingAccountsTable,
  db,
  stripeEventsTable,
} from "@workspace/db";

const SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeEventPayload = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
};

function readSignature(signature: string): { timestamp: number; signatures: string[] } {
  const values = new Map<string, string[]>();
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const timestamp = Number(values.get("t")?.[0]);
  const signatures = values.get("v1") ?? [];
  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new Error("Signature Stripe malformée.");
  }
  return { timestamp, signatures };
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET n’est pas configuré.");
    }

    const { timestamp, signatures } = readSignature(signature);
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      throw new Error("La signature Stripe est expirée.");
    }

    const signedPayload = `${timestamp}.${payload.toString("utf8")}`;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const isValid = signatures.some((candidate) => {
      const candidateBuffer = Buffer.from(candidate, "utf8");
      return (
        candidateBuffer.length === expectedBuffer.length &&
        timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    });
    if (!isValid) throw new Error("La signature Stripe est invalide.");

    const event = JSON.parse(payload.toString("utf8")) as StripeEventPayload;
    if (!event.id || !event.type) throw new Error("Événement Stripe incomplet.");
    await this.persistEvent(event);
  }

  private static async persistEvent(event: StripeEventPayload): Promise<void> {
    const object = event.data?.object ?? {};
    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : {};
    const customerId = stringValue(object.customer);
    const subscriptionId =
      stringValue(object.subscription) ??
      (event.type?.startsWith("customer.subscription.") ? stringValue(object.id) : undefined);
    const kind = stringValue(metadata.kind);
    const clerkUserId =
      stringValue(metadata.clerkUserId) ??
      stringValue(object.client_reference_id) ??
      (customerId
        ? (
            await db
              .select({ clerkUserId: billingAccountsTable.clerkUserId })
              .from(billingAccountsTable)
              .where(eq(billingAccountsTable.stripeCustomerId, customerId))
              .limit(1)
          )[0]?.clerkUserId
        : undefined);
    const inserted = await db
      .insert(stripeEventsTable)
      .values({
        stripeEventId: event.id!,
        eventType: event.type!,
        kind,
        clerkUserId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        amountCents: numberValue(object.amount_total) ?? numberValue(object.amount_paid),
        currency: stringValue(object.currency),
        paymentStatus: stringValue(object.payment_status) ?? stringValue(object.status),
        occurredAt: event.created ? new Date(event.created * 1000) : new Date(),
      })
      .onConflictDoNothing({ target: stripeEventsTable.stripeEventId })
      .returning({ id: stripeEventsTable.id });

    if (inserted.length === 0) return;

    if (event.type === "checkout.session.completed" && kind === "subscription" && clerkUserId) {
      await db
        .insert(billingAccountsTable)
        .values({
          clerkUserId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          premiumStatus: "active",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: billingAccountsTable.clerkUserId,
          set: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            premiumStatus: "active",
            updatedAt: new Date(),
          },
        });
      return;
    }

    if (
      (event.type?.startsWith("customer.subscription.") ||
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.paid") &&
      (customerId || subscriptionId)
    ) {
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : event.type === "invoice.payment_failed"
            ? "past_due"
            : stringValue(object.status) ?? "active";
      const periodEnd = numberValue(object.current_period_end);
      await db
        .update(billingAccountsTable)
        .set({
          stripeSubscriptionId: subscriptionId,
          premiumStatus: status,
          premiumCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          updatedAt: new Date(),
        })
        .where(
          customerId
            ? eq(billingAccountsTable.stripeCustomerId, customerId)
            : eq(billingAccountsTable.stripeSubscriptionId, subscriptionId!),
        );
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}