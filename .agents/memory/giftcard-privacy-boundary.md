---
name: Gift Card privacy boundary
description: Standing TEST-only and privacy requirements for the Gift Card artifact.
---

Keep Gift Card strictly private and in TEST. Do not publish it, modify production data, use production data for Gift Card tests, or connect real payments without the user's explicit authorization.

Mettre complètement Gift Card de côté pour le moment : ne pas modifier son fonctionnement actuel, ne pas l’intégrer au site de production, ne pas ajouter de partenaires, de paiements ou de transactions réelles. Son développement sera repris ultérieurement.

**Why:** The user specified that Gift Card must remain isolated in private TEST development and must not affect INDAMORA PLAY production.

**How to apply:** Treat the Gift Card web artifact, API, database, test data, and payment paths as TEST-only. Before any release, verify public access and indexing; do not infer Gift Card release approval from permission to publish another feature.

Toute demande future concernant Gift Card doit être réalisée uniquement dans son environnement de développement / TEST. Ne jamais toucher à la production sans autorisation explicite ; demander confirmation avant toute action susceptible de la modifier ou de la publier.
