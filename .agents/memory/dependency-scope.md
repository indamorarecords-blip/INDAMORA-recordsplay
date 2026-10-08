---
name: Dependency scope
description: Package-tool behavior and strict preservation of unrelated dependency versions.
---

Managed installs can re-resolve unrelated transitives even with `pnpm --filter ... --lockfile-only`; package-manager wrappers may also reject filter flags.

**Why:** A filtered lockfile-only install changed an existing transitive resolution while adding a new artifact importer.

**How to apply:** Declare runtime dependencies in the owning artifact. Inspect all package and snapshot deletions or edits, not just importer sections, when unrelated dependency changes are prohibited. Restore unrelated baseline versions and remove unneeded template dependencies.