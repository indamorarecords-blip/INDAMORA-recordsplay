---
name: React Query context ownership
description: Shared React hook clients must reuse the consuming app's React Query context.
---

Shared packages that export hooks built on `@tanstack/react-query` should declare React Query as a peer dependency, not bundle their own dependency. In a pnpm workspace, different React peer versions can otherwise produce separate package instances and a production-only `No QueryClient set` failure.

**Why:** The web and mobile artifacts use different React versions; the shared API client previously resolved a separate React Query variant, while development resolution masked the mismatch.

**How to apply:** When adding or maintaining a workspace package that exports React Query hooks, require the consuming app to provide `@tanstack/react-query` and keep the app bundler's React Query deduplication enabled. With Expo/Metro, an `extraNodeModules` alias may not cover imports from workspace packages; use an explicit resolver alias to the app's entry when a second context appears.