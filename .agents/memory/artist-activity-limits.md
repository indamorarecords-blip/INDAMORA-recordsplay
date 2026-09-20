---
name: Artist activity limits
description: How to enforce the two-activity rule without breaking legacy artist profiles.
---

New artist profile creation and edits must reject more than two structured activities, while public response schemas must continue accepting legacy profiles that may have zero or more than two existing values.

**Why:** The product rule applies to new selections and the next profile modification, but existing data must not be deleted or become unreadable.

**How to apply:** Enforce the limit on input/update validation and in the selection UI; avoid applying the new maximum to read response validation until legacy profiles have been migrated deliberately.