---
name: Local artifact validation
description: Avoid false failures caused by stale development bundles and missing service environment in terminal builds.
---

When validating this project's artifacts, remember that manual shell builds do not inherit the artifact service environment; take required non-secret settings from the artifact manifest rather than changing application configuration. The API development process bundles once at startup rather than hot-reloading server routes, so restart its managed workflow after backend source changes before interpreting a missing route.

**Why:** A route present in current source returned 404 from an older running API bundle, and a direct web build failed on missing service variables even though the managed service supplied them.

**How to apply:** Before concluding an API route is absent, compare the running bundle with source and restart the existing API workflow if stale. For terminal-only web build checks, supply the manifest's PORT and BASE_PATH values.

Browser-side forwarding to an alternate API port can distort authenticated Checkout tests; a pending mutation is not necessarily a failing backend.

**Why:** Forwarded Checkout POSTs were aborted even though Stripe had created a real session. Plans and status queries were already successful. Both flows passed when the same compiled API was tested directly on its registered port without browser forwarding.

**How to apply:** Inspect whether loading belongs to a query or a mutation before diagnosing the application. Prefer the registered API path for end-to-end financial verification, restore the ordinary managed workflow after temporary production-equivalent checks, and expire isolated test sessions even when browser navigation fails.