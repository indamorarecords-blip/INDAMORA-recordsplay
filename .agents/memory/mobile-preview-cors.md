---
name: Mobile preview CORS
description: Expo web previews use a separate development origin from the shared API server.
---

The shared API must allow the Expo development origin in addition to the main Replit development origin when the mobile artifact is previewed on web.

**Why:** Native iOS and Android requests do not enforce browser CORS, but the Expo web preview does; otherwise the mobile UI renders while catalog and directory requests fail.

**How to apply:** Include the configured Expo development domain in the API CORS allowlist only when that environment variable is present; keep the public site and production origins explicitly controlled.