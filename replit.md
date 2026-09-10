# INDAMORA PLAY

Plateforme culturelle centrafricaine pour découvrir et partager la musique, l’humour, le cinéma et les podcasts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/indamora-play/src/App.tsx` — parcours publics, recherche, catégories, lecteur de démonstration, comptes de démonstration, espace artiste, tableau de bord et modération.
- `artifacts/indamora-play/src/index.css` — tokens visuels et responsive mobile-first.
- `lib/api-spec/openapi.yaml` — contrat API source de vérité.
- `artifacts/api-server/src/routes/indamora.ts` — catalogue, artistes et validation INDAMORA RECORDS.
- `lib/db/src/schema/indamora.ts` — tables artistes, œuvres et soumissions.

## Architecture decisions

- L’expérience publique est en français, avec les catégories affichées en français pour la RCA et la diaspora.
- Les œuvres gratuites et premium partagent le même catalogue afin de rendre la valeur de l’offre premium lisible dès la découverte.
- Les soumissions passent par une file de modération dédiée à INDAMORA RECORDS avant publication ; une validation crée l’entrée publique dans le catalogue.
- Les fichiers audio/vidéo ne sont pas encore stockés dans PostgreSQL ; la première version persiste le catalogue et prépare les métadonnées pour un stockage objet.

## Product

- Découvrir les œuvres mises en avant, rechercher dans le catalogue et parcourir les catégories musique, humour, cinéma et vidéos, podcasts ou autres créations.
- Consulter les profils artistes et leurs œuvres.
- Proposer une œuvre et créer son profil artiste en même temps.
- Examiner, approuver ou refuser les propositions depuis l’espace INDAMORA RECORDS.
- Comparer l’accès gratuit et l’offre Premium prévue à 500 FCFA par mois, sans paiement réel dans cette V1.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
