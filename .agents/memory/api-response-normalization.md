---
name: API response normalization
description: Keep database-native values aligned with the public API contract at route boundaries.
---

Database drivers return native values such as `Date`, while generated API schemas may require serialized strings. Normalize those values before parsing response schemas.

**Why:** Parsing raw Drizzle rows against generated response schemas exposed a runtime mismatch on submission timestamps.

**How to apply:** Treat route-level response mapping as part of the API contract, especially for timestamps, booleans stored as text, and enum-like database fields.