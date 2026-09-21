---
name: Production domain behavior
description: Verified relationship between the INDAMORA PLAY custom domain and its Replit deployment URL.
---

The published deployment reports `https://indamoraplay.com` as its primary URL and `https://indamora-play.replit.app` as an additional URL. In the observed live deployment, the Replit URL serves the app with HTTP 200 instead of redirecting to the custom domain, even though Replit documentation describes automatic redirection for custom domains.

**Why:** Treating the technical URL as redirected when it is not would leave duplicate public hosts and could mislead SEO or release checks.

**How to apply:** Verify both hosts with HTTP headers before claiming canonical-host enforcement. Manage the redirect through the Publishing custom-domain settings, not through the static SPA rewrite or frontend JavaScript.