---
name: Admin authorization and privacy-safe analytics
description: Durable security and privacy decisions for the INDAMORA administration area and internal traffic metrics.
---

The server is the authority for administration: accept a verified Clerk `publicMetadata.role === "admin"` or the existing verified owner email as a compatibility fallback. The frontend may hide links, but every sensitive API route must still use the server-side admin guard.

**Why:** The existing production account must keep working while email-only frontend checks are not sufficient protection.

**How to apply:** Preserve the verified-email fallback until the Clerk admin role is confirmed in production; use the same rule in UI visibility and server authorization.

Internal traffic metrics should store only a one-way hash of a client-generated session identifier, the path, referrer hostname, device category, and timestamp. Do not store raw IP addresses or unnecessary user identity data.

**Why:** The audit requires real visit counts while keeping analytics proportionate and avoiding individual surveillance.

**How to apply:** Add aggregate queries and honest empty states; never populate missing metrics with synthetic values.