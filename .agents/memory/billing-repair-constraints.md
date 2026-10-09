---
name: Billing repair constraints
description: Owner constraints on restoring Stripe and interpreting environment-specific verification.
---

Repair the existing connector-based Stripe flow rather than replacing it with a different synchronization architecture or recreating prices, products, or webhook configuration.

**Why:** The owner explicitly required restoration of the previously existing payment implementation, preservation of Stripe configuration and existing data, and changes restricted to payments and Premium subscriptions.

**How to apply:** Compare repairs against recoverable prior implementation. Do not modify registration, public content, media, storage, or other unrelated features while fixing billing.

A workspace Stripe connection and a successful TEST Checkout are not evidence that the published app has a working LIVE subscription, webhook, or Premium activation.

**Why:** The workspace exposes an environment-specific connection; production has its own configuration. A hosted Checkout can open successfully without any payment or webhook having occurred.

**How to apply:** Report environment and actual verification separately. Confirm LIVE resources and authenticated account synchronization before declaring production billing operational. Do not publish automatically or complete a real payment without explicit authorization.

Do not infer Stripe mode from `NODE_ENV`, connection environment labels, or an Agent-side query alone. The generic application SDK proxy can return LIVE prices in development even when an environment-specific Agent connection resolves the expected TEST prices. Both the SDK's CLI identity path and its environment-identity fallback exhibited this mismatch.

**Why:** Agent-side connector calls and the app's runtime proxy can use different Replit routing contexts. A read-only price collection confirmed LIVE responses from the application SDK path; a missing resource error alone would not have established the mode.

**How to apply:** Verify `livemode` through the same application transport before checkout. Do not silently compensate for a development routing mismatch with LIVE IDs, disconnect production, or invent undocumented connection-selection headers. Without explicit authorization for unpaid LIVE session testing, stop Checkout tests when development unexpectedly resolves LIVE resources.

The owner explicitly authorized testing the opening of real LIVE Checkout sessions without submitting payment. Keep such checks isolated from the normal development configuration.

**Why:** The requested acceptance criterion is a real LIVE hosted Checkout for each existing offer, while prices, products, Clerk, donations and other functionality must remain unchanged. A TEST session or a mocked response does not satisfy it.

**How to apply:** Use a temporary production-equivalent validation process and isolated test identities rather than changing persistent development settings. Confirm actual session and price `livemode`, stop before payment, and distinguish these checks from a published-build verification.

For the existing Premium flow, keep webhook registration readiness as a diagnostic rather than an additional authorization requirement for opening Checkout.

**Why:** The owner specifically requested correcting the webhook-related opening blocker without weakening security. Registration discovery is not signature verification; opening an unpaid Checkout does not grant Premium, whose status is verified directly with Stripe.

**How to apply:** Preserve authentication, price/mode and ownership checks, duplicate-subscription prevention, signed webhook validation and server-side Premium confirmation. Do not interpret successful Checkout opening as proof of working webhook synchronization.

For the isolated Boutique TEST flow, keep payments blocked after a failed test until the server has accepted a genuine signed Stripe event. Reactivation must remain TEST-only; reblock and report precisely if the authorized verification fails.

**Why:** The owner explicitly requires a successful official-card TEST journey, signed event reception and secure server-side order confirmation before declaring Boutique TEST operational. The Premium-specific readiness rule above does not override this Shop requirement.

**How to apply:** A correctly shaped signing secret or a Stripe-backed paid status GET is insufficient evidence of webhook validation. Each Dashboard webhook and Stripe CLI listener has its own signing secret even though both use the same prefix. Confirm an actual Stripe delivery and server response, distinguish webhook settlement from browser-return reconciliation, and verify that replay does not debit inventory twice. Never infer LIVE readiness from this TEST proof.