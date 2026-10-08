---
name: Publish CHECK serialization
description: Distinguish valid development constraints from malformed generated Publish SQL.
---

Publish's schema diff can double-wrap a valid bare boolean CHECK predicate, producing invalid nested CHECK SQL.

**Why:** PostgreSQL catalog reads showed a valid bare boolean predicate, while the recomputed Publish diff included the entire CHECK clause inside another CHECK. An equivalent explicit `IS TRUE` predicate generated valid SQL.

**How to apply:** Inspect the actual development constraint and recompute the diff before diagnosing. Preserve the invariant in the schema source and development database, then validate the regenerated statements. Never patch generated production SQL, add deployment-time DDL, or bypass Publish.
