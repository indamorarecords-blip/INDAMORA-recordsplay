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