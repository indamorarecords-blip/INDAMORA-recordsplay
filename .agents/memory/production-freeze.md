---
name: Gel d’INDAMORA PLAY
description: Version actuelle stable et gelée ; confirmation explicite avant toute action pouvant modifier ou publier la production.
---

Considérer la version actuelle d’INDAMORA PLAY comme stable et gelée. Conserver le site actuellement en ligne exactement dans son état actuel.

Sans autorisation courante explicite et limitée, ne lancer aucun Publish ni nouveau Deploy. Ne modifier aucune fonctionnalité, aucun design, aucune page, aucune route, aucune donnée de production ni le fonctionnement actuel. Ne supprimer ni désactiver aucune fonctionnalité existante. Ne modifier aucun package ou dépendance supplémentaire. Ne pas effectuer de migration ou de modification de base de données.

La correction de sécurité déjà appliquée pour proxy-addr@2.0.8 doit rester telle quelle.

**Why:** L’utilisateur a demandé de conserver la version actuelle stable et gelée.

**How to apply:** Avant toute action susceptible de modifier ou publier la production, demander explicitement confirmation à l’utilisateur. Ne pas considérer une ancienne autorisation de publication comme une autorisation actuelle.

La Boutique officielle et ses dépendances strictement nécessaires peuvent faire l’objet d’une autorisation de publication limitée, après réussite des contrôles critiques Stripe TEST, des stocks, des commandes et de la sécurité ADMIN. Cette exception ne lève pas le gel des autres espaces.

**Why:** L’utilisateur a demandé une Boutique commerciale après validation complète, tout en préservant l’authentification, ARTISTE, ABONNÉS, Premium, les dons, la PWA et Gift Card.

**How to apply:** Confirmer l’autorisation du présent travail, sans réutiliser une ancienne autorisation de publication. Utiliser des secrets Boutique dédiés et séparés TEST/LIVE, sans remplacer ceux de Premium ou des dons. Ne pas activer LIVE ni proposer Publish si un contrôle critique échoue. Examiner les migrations avant exécution ; demander accord si le risque est important ou hors Shop. Gift Card reste en attente.

L’utilisateur autorise les fichiers privés côté serveur pour ADMIN SHOP uniquement en développement / TEST, sans modifier la base, les comptes, les rôles ni l’authentification. Confirmer confidentialité et persistance avant d’y enregistrer des données. En cas de limitation, arrêter et demander son accord pour une autre solution. Les stocks initiaux inconnus doivent rester à renseigner, sans quantités inventées.

**Why:** L’utilisateur a explicitement conditionné l’autorisation de stockage à ces protections, sans frais ni impact sur les données existantes.

**How to apply:** Réutiliser l’administrateur déjà autorisé, préserver les photos et les données existantes, distinguer les tests exécutés des vérifications non réalisées. L’autorisation des fichiers privés du workspace n’est pas une preuve de persistance dans un déploiement autoscale ; expliquer toute adaptation nécessaire avant de modifier le stockage.

Pour la Boutique, utiliser exclusivement les images de produits et le QR code officiel fournis par l’utilisateur. Ne pas générer de faux modèles, de faux QR codes ou de nouvelles images à leur place.

**Why:** L’utilisateur a indiqué qu’il fournira ces visuels et a expressément interdit leur remplacement par des images générées.

**How to apply:** Tant que les fichiers ne sont pas fournis, afficher un emplacement textuel clairement identifié, sans fabriquer de photo ou de QR provisoire.
