---
name: Clerk provider settings
description: Where login providers and development labels are controlled for Replit-managed Clerk.
---

Replit-managed Clerk social login providers are configured in the workspace authentication settings for each environment, not by the React application.

**Why:** The Clerk components receive the enabled providers from the managed Clerk instance. Hiding one with application CSS or replacing the authentication UI would be brittle and would not change the provider configuration.

**How to apply:** For provider changes, use the workspace Users & Auth / SSO provider settings for both Development and Production. Keep application code focused on routing, branding, and the shared navigation.