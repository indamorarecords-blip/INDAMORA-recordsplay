import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const billingAccountsTable = pgTable(
  "billing_accounts",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    premiumStatus: text("premium_status").notNull().default("none"),
    premiumCurrentPeriodEnd: timestamp("premium_current_period_end", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_accounts_clerk_user_id_idx").on(table.clerkUserId),
    uniqueIndex("billing_accounts_stripe_customer_id_idx").on(table.stripeCustomerId),
    uniqueIndex("billing_accounts_stripe_subscription_id_idx").on(
      table.stripeSubscriptionId,
    ),
  ],
);

export const stripeEventsTable = pgTable(
  "stripe_events",
  {
    id: serial("id").primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    kind: text("kind"),
    clerkUserId: text("clerk_user_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    paymentStatus: text("payment_status"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stripe_events_event_id_idx").on(table.stripeEventId),
  ],
);

export type BillingAccount = typeof billingAccountsTable.$inferSelect;
export type StripeEvent = typeof stripeEventsTable.$inferSelect;