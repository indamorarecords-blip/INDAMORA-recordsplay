---
name: Dependency scope
description: Package-tool behavior and strict preservation of unrelated dependency versions.
---

Filtered installs and recursive lockfile-only updates can re-resolve unrelated transitive versions; package-manager wrappers may also reject filter flags.

**Why:** A scoped transitive update also shifted unrelated workspace peer resolutions.

**How to apply:** Declare runtime dependencies in the owning artifact. Inspect every lockfile hunk, including importer versions and peer snapshots. Restore unrelated changes before applying a narrowly scoped lockfile fix.