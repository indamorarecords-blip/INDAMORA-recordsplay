---
name: Gift Card privacy boundary
description: Standing TEST-only and privacy requirements for the Gift Card artifact.
---

Keep Gift Card strictly private and in TEST. Do not publish it, modify production data, use production data for Gift Card tests, or connect real payments without the user's explicit authorization.

**Why:** The user specified that Gift Card must remain isolated in private TEST development and must not affect INDAMORA PLAY production.

**How to apply:** Treat the Gift Card web artifact, API, database, test data, and payment paths as TEST-only. Before any release, verify public access and indexing; do not infer Gift Card release approval from permission to publish another feature.
