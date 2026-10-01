import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  classifyPremiumCheckoutOffer,
  createCheckoutIdempotencyKey,
  createCheckoutParams,
  createCustomerIdempotencyKey,
  isPremiumSubscription,
  isRecognizedPremiumPrice,
  matchesStripeMode,
  selectCurrentPremiumSubscription,
  selectReusableSubscriptionCheckout,
} from "./billingLogic.ts";
import { verifyStripeSignature } from "./stripeSignature.ts";

function price(overrides = {}) {
  return {
    id: "price-live-premium",
    active: false,
    livemode: true,
    type: "recurring",
    currency: "eur",
    unit_amount: 500,
    recurring: { interval: "month" },
    metadata: { indamoraPlan: "premium_international_monthly" },
    ...overrides,
  };
}

function subscription(id, status, created, currentPrice = price()) {
  return {
    id,
    status,
    created,
    livemode: true,
    items: { data: [{ price: currentPrice }] },
  };
}

test("Premium requires matching mode but preserves historical prices after checkout configuration changes", () => {
  assert.equal(matchesStripeMode(true, "live"), true);
  assert.equal(matchesStripeMode(false, "live"), false);
  assert.equal(matchesStripeMode(undefined, "test"), false);
  assert.equal(
    isRecognizedPremiumPrice(price(), "live", {
      international: "price-live-premium",
    }),
    true,
  );
  assert.equal(
    isRecognizedPremiumPrice(price(), "live", {
      international: "price-configured-different",
    }),
    true,
  );
  assert.equal(
    isRecognizedPremiumPrice(
      price({ livemode: false, id: "price-test-premium" }),
      "live",
    ),
    false,
  );
  assert.equal(
    isRecognizedPremiumPrice(
      price({ livemode: false, id: "price-test-premium" }),
      "test",
    ),
    true,
  );
  assert.equal(
    isRecognizedPremiumPrice(
      price({ metadata: { indamoraPlan: "unrelated" } }),
      "live",
    ),
    false,
  );
  assert.equal(isRecognizedPremiumPrice(price({ currency: "usd" }), "live"), false);
  assert.equal(isRecognizedPremiumPrice(price({ unit_amount: 100 }), "live"), false);
  assert.equal(
    isRecognizedPremiumPrice(
      price({ recurring: { interval: "year" } }),
      "live",
    ),
    false,
  );
  assert.equal(isRecognizedPremiumPrice(price(), "test"), false);
});

test("an older cancelled subscription cannot displace a newer active Premium subscription", () => {
  const olderCancelled = subscription("sub-old", "canceled", 10);
  const newerActive = subscription("sub-current", "active", 20);
  const unrelatedActive = subscription(
    "sub-other",
    "active",
    30,
    price({ metadata: { indamoraPlan: "unrelated" } }),
  );

  const current = selectCurrentPremiumSubscription(
    [olderCancelled, unrelatedActive, newerActive],
    "live",
  );
  assert.equal(current?.id, "sub-current");
  assert.equal(isPremiumSubscription(current, "live"), true);
  assert.equal(isPremiumSubscription(unrelatedActive, "live"), false);
});

test("donation checkout params never include subscription metadata", () => {
  const params = createCheckoutParams({
    kind: "donation",
    amountEur: 10,
    priceId: "price-donation",
    clientReferenceId: "user-1",
    baseUrl: "https://indamoraplay.com",
  });
  assert.equal(params.get("mode"), "payment");
  assert.equal(params.get("client_reference_id"), "user-1");
  assert.equal(params.has("subscription_data[metadata][clerkUserId]"), false);

  const subscriptionParams = createCheckoutParams({
    kind: "subscription",
    plan: "africa",
    priceId: "price-premium",
    customerId: "cus-1",
    clientReferenceId: "user-1",
    baseUrl: "https://indamoraplay.com",
  });
  assert.equal(subscriptionParams.get("mode"), "subscription");
  assert.equal(
    subscriptionParams.get("subscription_data[metadata][clerkUserId]"),
    "user-1",
  );
});

test("an open subscription Checkout is reused for its owner across plan clicks", () => {
  const openSession = {
    id: "cs-open",
    url: "https://checkout.stripe.com/session",
    mode: "subscription",
    status: "open",
    livemode: true,
    created: 20,
    expires_at: 500,
    client_reference_id: null,
    customer: "cus-1",
  };
  assert.equal(
    selectReusableSubscriptionCheckout(
      [openSession],
      "user-1",
      "cus-1",
      "live",
      100,
    )?.id,
    "cs-open",
  );
  assert.equal(
    selectReusableSubscriptionCheckout(
      [openSession],
      "user-2",
      "cus-other",
      "live",
      100,
    ),
    undefined,
  );
  assert.equal(
    selectReusableSubscriptionCheckout(
      [{ ...openSession, livemode: false }],
      "user-1",
      "cus-1",
      "live",
      100,
    ),
    undefined,
  );
  assert.equal(
    selectReusableSubscriptionCheckout(
      [{ ...openSession, client_reference_id: "user-2" }],
      "user-1",
      "cus-1",
      "live",
      100,
    ),
    undefined,
  );
  assert.equal(
    selectReusableSubscriptionCheckout(
      [{ ...openSession, expires_at: 100 }],
      "user-1",
      "cus-1",
      "live",
      100,
    ),
    undefined,
  );
  assert.equal(
    selectReusableSubscriptionCheckout(
      [openSession],
      "user-1",
      "cus-other",
      "live",
      100,
    ),
    undefined,
  );
});

test("customer and checkout idempotency keys are stable across retries", () => {
  assert.equal(
    createCustomerIdempotencyKey("user-1"),
    createCustomerIdempotencyKey("user-1"),
  );
  assert.equal(
    createCheckoutIdempotencyKey("user-1", "africa", 600_000),
    createCheckoutIdempotencyKey("user-1", "africa", 600_001),
  );
  assert.notEqual(
    createCheckoutIdempotencyKey("user-1", "africa", 600_000),
    createCheckoutIdempotencyKey("user-1", "international", 600_000),
  );
});

test("Checkout reuse requires the actual selected Premium price and matching offer attribution", () => {
  const session = { metadata: { kind: "subscription", plan: "international" } };
  const lines = [{ price: price(), quantity: 1 }];
  assert.equal(classifyPremiumCheckoutOffer(session, lines, "international", "price-live-premium", "live"), "reuse");
  assert.equal(classifyPremiumCheckoutOffer(session, lines, "africa", "price-africa", "live"), "conflict");
  assert.equal(classifyPremiumCheckoutOffer(session, lines, "international", "price-new", "live"), "conflict");
  assert.equal(classifyPremiumCheckoutOffer({}, lines, "international", "price-live-premium", "live"), "conflict");
  assert.equal(classifyPremiumCheckoutOffer(session, [{ price: price({ metadata: {} }), quantity: 1 }], "international", "price-live-premium", "live"), "unrelated");
});

test("failed renewals and cancellations never grant Premium, while a pending cancellation remains active", () => {
  for (const status of ["past_due", "unpaid", "incomplete", "canceled"]) {
    assert.equal(isPremiumSubscription(subscription("sub-1", status, 20), "live"), false);
  }
  assert.equal(isPremiumSubscription({ ...subscription("sub-1", "active", 20), cancel_at_period_end: true }, "live"), true);
});

test("Stripe signature helper verifies HMAC and rejects stale timestamps", () => {
  const payload = Buffer.from('{"id":"evt_test"}');
  const secret = "unit-test-secret";
  const timestamp = 1_700_000_000;
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const signature = `t=${timestamp},v1=${digest}`;

  assert.equal(verifyStripeSignature(payload, signature, secret, timestamp), true);
  assert.equal(verifyStripeSignature(payload, signature, "wrong-secret", timestamp), false);
  assert.equal(
    verifyStripeSignature(payload, signature, secret, timestamp + 301),
    false,
  );
  assert.throws(() => verifyStripeSignature(payload, "not-a-signature", secret, timestamp));
});