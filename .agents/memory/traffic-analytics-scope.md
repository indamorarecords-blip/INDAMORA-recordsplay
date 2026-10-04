---
name: Traffic analytics scope
description: User-approved scope and privacy requirements for INDAMORA PLAY traffic statistics.
---

For website traffic analytics, the user chose a dashboard inside the existing ADMIN space, not Replit Growth, and a local GeoIP database. No visitor IP may be sent to a third-party geolocation service.

**Why:** These were explicit user choices after the distinction between Growth and an in-app collector was explained.

**How to apply:** Keep country lookups local. Downloading a licensed country database must not include visitor information. Do not use locale or timezone as a substitute for country.

The analytics request is strictly additive: do not change public-page design, OAuth / Users & Auth, Stripe, artist or ordinary-user functionality, content, the player, existing data, or roles. Statistics and every read API must remain limited to the already authorized administrator. An anonymous write-only pageview collector was explained and approved as necessary.

**Why:** The user explicitly prohibited unrelated modifications, role changes and public statistical access.

**How to apply:** Reuse existing authorization without weakening it. Keep traffic data isolated. Do not create test accounts or change authentication merely to verify analytics without separate authorization. Do not publish until scope and regressions are checked.