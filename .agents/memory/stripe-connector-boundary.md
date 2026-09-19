---
name: Stripe connector boundary
description: The Replit-managed Stripe connection provides proxy access without exposing a Stripe API key; webhook verification is configured separately.
---

Use `@replit/connectors-sdk` server-side for Stripe REST calls instead of reading a secret from connector settings. Keep Checkout and catalog operations behind that proxy, and require `STRIPE_WEBHOOK_SECRET` for raw webhook signature verification.

**Why:** The attached Stripe connection is healthy but intentionally withholds the API key; expecting `secret_key` from its connection payload makes scripts fail even though proxy calls work.

**How to apply:** When adding Stripe operations, use the connector proxy and form-encoded Stripe REST requests. Configure the webhook endpoint in Stripe test mode and store only its signing secret in Replit Secrets.