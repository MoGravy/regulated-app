# RevenueCat server reconciliation checkpoint

## Implemented

- Added a disabled-by-default RevenueCat V2 snapshot adapter in api/_revenuecat.js.
- Routed the shared hasPremiumAccess gate through it, so check-subscription and get-audio-url refresh expired snapshots.
- Added migrations/009_revenuecat_sync.sql with service-role-only claim, commit and release RPCs, account generation, lease, bounded cache and global RevenueCat subscription ownership.
- Added fixture behavior checks in tests/revenuecat-server.check.mjs.
- Moved the pre-edit access helper backup to .audit/backups/revenuecat-server-20260927/_access.js.bak_260927.

## Access rules

- Exact verified Supabase UUID is the RevenueCat customer ID and immutable database owner.
- Production subscriptions only. A grant needs the configured RevenueCat product, actual catalog app_id, type=subscription, store_identifier, store, exact project entitlement, and gives_access=true.
- Access cache is at most five minutes and capped by the paid term end. A grace period with a past term end uses the five-minute freshness window. A true access response with a null end is denied.
- A successful snapshot with no grantable subscription is cached for five seconds so a purchase or restore can converge quickly.
- Provider, page, ownership or database failures do not replace the last snapshot. After its expiry, RevenueCat access is denied. Existing Apple/Google rows and the legacy Stripe lookup remain available.
- Signed audio links still last two hours. A RevenueCat access snapshot can expire sooner than the signed link; the existing signed link cannot be recalled after issue.

## Checks

- node --test tests/revenuecat-server.check.mjs: 12 tests pass.
- Parent ran the isolated PGlite/PostgreSQL WASM migration check: pass for lease competition, cleared-lease replay rejection, ownership immutability, rollback, freshness, crash recovery and duplicate snapshots.
- Parent access-freshness check covers expiry during provider work, stale RevenueCat access denial and preserved Stripe/Apple/Google access. Deletion inventory now counts the new account-linked sync state without reading lease data.
- SQL test runtime is isolated PGlite0.5.8/PostgreSQL18.3 under `~/AgentWorkspace/regulated-device-check/postgres-check`, not a project dependency. It executes real SQL in one connection and does not establish multi-connection stress behavior. Command: `node tests/revenuecat-sql.check.mjs /Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js`. Output: `.audit/revenuecat-sql.log`.
- Review corrected URL-origin comparison, documented pagination shapes, NULL-safe lease matching, rollback after conflicting writes and timestamps after lock/sync waits. SQL NULL snapshots are rejected.

## Activation gates

Configure the V2 server key, project ID, entitlement ID, and exact allowlist JSON for each approved product's RevenueCat product ID, app ID, store identifier and store. Until all are set, the adapter makes no provider calls and writes nothing.

RevenueCat documents generated subscription IDs and current access fields, but does not state a universal renewal-stability guarantee for the generated ID in one explicit sentence. Before activation, verify one sandbox renewal keeps its subscription ID. Also verify the configured restore behavior keeps purchases with the original account. No provider key, product ID or live account was used for these checks.

No webhook ingestion or deletion fulfillment is included. No credentials, live provider calls, migration application, deployment, signing or submission occurred.
