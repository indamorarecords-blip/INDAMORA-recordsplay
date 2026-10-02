---
name: Timestamp fingerprints
description: Preserve PostgreSQL timestamp precision when identifying exact records for selective cleanup.
---

Read timestamps as database text when using them as exact provenance fingerprints. Do not reconstruct an equality predicate from a timestamp serialized through a JavaScript Date.

**Why:** The SQL query output serialized timestamps to milliseconds although PostgreSQL stored microseconds. A safe cleanup initially matched no records because the displayed timestamp had lost precision.

**How to apply:** Project the timestamp with `::text` when verifying a destructive operation's exact fingerprint. Retain all its precision, combine it with identifiers and other verified attributes, and fail closed rather than broadening a predicate when it matches nothing.