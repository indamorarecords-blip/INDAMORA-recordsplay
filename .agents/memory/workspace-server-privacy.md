---
name: Confidentialité des fichiers du workspace TEST
description: Un serveur Expo/Metro d’un autre artefact peut exposer des fichiers privés via la compilation de modules.
---

Un fichier hors des dossiers publics n’est pas automatiquement privé dans ce workspace multi-artefacts. Vérifier tous les serveurs de développement, pas seulement les routes API et le serveur web principal.

**Why:** Une sonde contenant uniquement des produits synthétiques a été exposée par Metro comme module JSON depuis la racine du workspace. Le refus des fichiers `.env.*` par Vite ne protège pas contre Metro.

**How to apply:** Garder les données Shop dans des fichiers non reconnus comme modules ou images par Metro, avec noms bloqués par Vite, permissions privées et accès API administrateur. Vérifier les URL de modules et d’assets sur les serveurs déjà actifs. Ne pas modifier le mobile pour corriger le Shop sans accord.

La suppression ou le déplacement d’un fichier déjà compilé ne garantit pas la disparition de sa copie dans le cache Metro. Un redémarrage du Preview peut être nécessaire ; demander l’accord avant d’intervenir sur le Preview mobile.

**Why:** L’ancienne URL d’une sonde JSON synthétique continuait à retourner son module compilé après déplacement, alors que les nouvelles URL des fichiers de stockage étaient refusées.

**How to apply:** Ne jamais utiliser de vraies données pour les sondes de confidentialité. Ne pas déclarer la vérification terminée tant que les anciennes URL peuvent encore retourner des données en cache.
