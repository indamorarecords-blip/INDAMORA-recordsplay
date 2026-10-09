---
name: Contraintes d’inventaire du Shop TEST
description: Réservations, validation du panier et limites des prix Checkout TEST.
---

Les changements de quantité du panier doivent être validés côté serveur avant d’être enregistrés. Ne pas publier les quantités internes simplement pour obtenir une limite côté navigateur.

**Why:** Un contrôle au moment du devis bloquait bien le paiement mais permettait encore au navigateur de conserver une quantité supérieure au stock.

**How to apply:** Vérifier la proposition avant de modifier le panier, empêcher les opérations simultanées et conserver la quantité précédente en cas de refus. Ne pas supprimer silencieusement les anciennes lignes devenues indisponibles.

Les réservations de stock ne sont libérées ou consommées que sur confirmation Stripe TEST faisant autorité ; une expiration locale ou une erreur réseau n’est pas une preuve d’absence de paiement.

**Why:** Une session peut avoir été créée malgré une réponse réseau perdue, et un paiement peut arriver après une notification retardée. Libérer automatiquement son stock risque une double vente.

**How to apply:** Conserver les réservations ambiguës pour rapprochement, garantir l’idempotence des confirmations et ne jamais utiliser une URL de retour comme preuve de paiement.

La gestion des produits et prix locaux ne modifie pas automatiquement le catalogue Stripe TEST. Checkout reste bloqué si ses références ou prix ne correspondent pas aux produits gérés.

**Why:** La gestion privée TEST n’autorisait pas la modification de Stripe. Une demande de Boutique commerciale peut autoriser sa configuration dédiée, mais jamais celle de Premium ou des dons ; un prix local divergent ne constitue pas un prix Checkout validé.

**How to apply:** Vérifier la portée de l’autorisation courante avant de configurer les références Boutique Stripe. Séparer strictement TEST et LIVE ; garder Checkout bloqué en cas de divergence. Aucun passage LIVE ni publication implicite.
