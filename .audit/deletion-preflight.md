# Read-only account deletion preflight

28 September 2026. Source commit 755144c, integrated as f333256.

The preflight gathers evidence for an operator to review. It cannot approve or execute deletion. There is no live connection, deletion executor or provider action.

It reuses the receipt-derived inventory. A separate read-only PostgreSQL transaction checks schema coverage and collects candidate primary keys, row versions and content fingerprints. Both sides of a care relationship and related task entries are included. The normal summary contains counts, blockers and a plan hash. The internal manifest contains private identifiers and inventory evidence, so it must stay out of public logs and the vault.

## Verified

- Independent read-only review approved the bounded unit.
- Parent reran `node tests/deletion-preflight.check.mjs` and `node tests/deletion-inventory.check.mjs`. Both passed in the isolated worktree.
- Disposable PostgreSQL fixtures inspect 273 schema objects and check both care roles, preservation of shared records, row and schema invalidation, unexpected dependencies, read-only enforcement and sanitized failures.
- The fixed coverage is explicitly source-fixture-only. It is not a live Supabase baseline and cannot authorize cleanup.

## Remaining work

The existing REST inventory is outside the SQL snapshot. Historical email ownership, historical analytics, private media sharing, active paid work, provider cleanup, purchase-ownership retention, retention periods and a write freeze still require resolution. No result can set approval or execution true, including a caller asking to force it.

The education schema fixture is included because shared care records exist in the same backend. This does not publish or change the separate education project.

A narrow owner-approved safety-hook exception allowed the runtime source to be written. Its original guard backup and tests are recorded in MEMORY.md. This note contains no rejected source-code fragment.
