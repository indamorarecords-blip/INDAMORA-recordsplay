---
name: SEO sitemap generation
description: Public sitemap strategy for the static web artifact and database-backed directory content.
---

The web artifact serves `/sitemap.xml` as a static asset, so the sitemap must be regenerated during each frontend build from the database’s public rows rather than maintained as a hand-edited list.

**Why:** Moving the root sitemap to a runtime API route would require changing the static deployment architecture, while a build-time generator keeps the existing product and automatically includes newly published profiles and works at the next publication.

**How to apply:** Keep the generator restricted to approved/published artists and public works. Never include private profiles, submissions, rejected content, administrative routes, or private media. Keep `https://indamoraplay.com` as the canonical sitemap domain.