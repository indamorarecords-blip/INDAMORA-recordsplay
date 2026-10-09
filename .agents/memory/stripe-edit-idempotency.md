---
name: Idempotence des modifications Stripe
description: Distinguer une nouvelle modification récurrente d'une reprise réseau de la même opération.
---

Pour une modification de produit Stripe, la clé d'idempotence doit identifier l'opération ou sa révision, pas uniquement le contenu final.

**Why:** Un cycle Actif → Archivé → Actif peut reproduire exactement le premier contenu. Stripe retourne alors sa réponse mise en cache sans réappliquer la dernière activation, créant un faux succès côté API.

**How to apply:** Conserver la même clé pour une reprise de la même révision, mais utiliser une nouvelle clé pour une nouvelle révision. Tester les cycles aller-retour et vérifier l'état obtenu par une lecture indépendante.
