---
name: Migrations Shop ciblées
description: Éviter qu'une préparation Shop touche des tables gérées par un autre artifact.
---

Ne pas lancer une synchronisation globale du schéma ORM pour une modification limitée au Shop sans comparer d'abord le schéma réellement présent.

**Why:** Des tables Gift Card existent dans la base partagée mais sont gérées en dehors du schéma Drizzle commun. Une synchronisation globale pourrait proposer leur suppression alors que le Shop n'autorise aucune intervention sur cette fonctionnalité.

**How to apply:** Générer les ajouts Shop isolément, vérifier qu'ils ne touchent aucune table existante hors périmètre, puis examiner le diff développement-vers-production complet. Toute application en production reste soumise au processus Publish et à l'autorisation courante de l'utilisateur.
