---
name: Dependency scope
description: Package-tool behavior and strict preservation of unrelated dependency versions.
---

Managed package installation may target the workspace root and re-resolve unrelated transitive dependency versions. Its package-token interface does not accept pnpm filter flags.

**Why:** Scoped installation attempts were rejected by the tool interface, and an otherwise successful installation changed an unrelated transitive version in the lockfile.

**How to apply:** Declare runtime dependencies in the owning artifact. Inspect the final package importers and lockfile diff, especially when the user prohibits unrelated dependency changes. Preserve existing versions and remove any temporary root configuration or root dependency that is not needed by the project.