---
name: Media visibility lifecycle
description: Visibility and deletion rules for user-uploaded INDAMORA media.
---

Submission audio, video, and covers remain private while under review and become public only when the work is approved. Artist avatars become public immediately after server-side image, size, and ownership validation because they are intended for directory display.

**Why:** ADMIN needs private preview access without exposing pending works, while approved directory profiles must render their stored avatar to unauthenticated visitors.

**How to apply:** Keep ACL changes tied to these lifecycle points. Only delete rejected, unpublished submission files after checking ownership and ensuring no other submission or published work references them.