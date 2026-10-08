---
name: Gel d’INDAMORA PLAY
description: Version actuelle stable et gelée ; confirmation explicite avant toute action pouvant modifier ou publier la production.
---

Considérer la version actuelle d’INDAMORA PLAY comme stable et gelée. Conserver le site actuellement en ligne exactement dans son état actuel.

Ne lancer aucun Publish ni nouveau Deploy. Ne modifier aucune fonctionnalité, aucun design, aucune page, aucune route, aucune donnée de production ni le fonctionnement actuel. Ne supprimer ni désactiver aucune fonctionnalité existante. Ne modifier aucun package ou dépendance supplémentaire. Ne pas effectuer de migration ou de modification de base de données. Aucun autre changement ne doit être effectué.

La correction de sécurité déjà appliquée pour proxy-addr@2.0.8 doit rester telle quelle.

**Why:** L’utilisateur a demandé de conserver la version actuelle stable et gelée.

**How to apply:** Avant toute action susceptible de modifier ou publier la production, demander explicitement confirmation à l’utilisateur. Ne pas considérer une ancienne autorisation de publication comme une autorisation actuelle.

La préparation de la Boutique INDAMORA PLAY est autorisée uniquement en développement / Stripe TEST. Cette demande ne lève pas le gel de production et n’autorise ni paiement réel, ni Publish, ni Deploy, ni migration.

**Why:** L’utilisateur a expressément séparé la nouvelle Boutique en TEST des parties stables du site, de Gift Card, de la PWA et d’Expo / React Native.

**How to apply:** Isoler les ajouts Boutique et utiliser exclusivement des identifiants Stripe TEST dédiés stockés dans les Secrets Replit, sans modifier, remplacer ou supprimer les clés de Premium et des dons. Toute activation LIVE, publication ou modification du schéma exige une nouvelle autorisation explicite.

Pour la Boutique, utiliser exclusivement les images de produits et le QR code officiel fournis par l’utilisateur. Ne pas générer de faux modèles, de faux QR codes ou de nouvelles images à leur place.

**Why:** L’utilisateur a indiqué qu’il fournira ces visuels et a expressément interdit leur remplacement par des images générées.

**How to apply:** Tant que les fichiers ne sont pas fournis, afficher un emplacement textuel clairement identifié, sans fabriquer de photo ou de QR provisoire.
