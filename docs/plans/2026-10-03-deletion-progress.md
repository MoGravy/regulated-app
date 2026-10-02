# Reviewed progress cleanup implementation plan

Goal: implement the first real database cleanup stage for user_progress and course_progress without claiming whole-account deletion.

Architecture: a private snapshot plan binds the receipt account, complete catalog fingerprint and exact progress rows. Approval is a separate operator action. A leased worker checks that approval and snapshot inside one transaction, deletes only the two approved account-owned progress sets, records durable completion and prevents those rows being recreated. Care, billing, media, grants and Auth remain untouched.

Spec: existing .audit/deletion-request-design.md, .audit/deletion-preflight.md and Matthew's seven-day review/thirty-day ordinary-cleanup instruction. This stage cannot mark ordinary_state or held_state done. No live connection, activation, deployment or public wording change.

Execution: native in this chat under Matthew's standing autonomous instruction. No extra plan-review gate. Use existing PostgreSQL/PGlite and schemaInspectionSql; add no dependencies.

Files:
- migrations/020_deletion_progress.sql: private plan ledger, approval immutability and two progress write-freeze triggers.
- scripts/deletion-progress.mjs: prepareProgressCleanup(db,requestId), executeProgressCleanup(db,claim,planHash).
- scripts/deletion-progress-schema.json: fixed safety-control fingerprints from migration020 in disposable PostgreSQL. This is not approval of a live schema.
- tests/deletion-progress.check.mjs: actual app schema and disposable PostgreSQL behavior.

Review focus:
- A different account or stale lease must never delete rows.
- Changed rows, schema, approval or deletion side effects must refuse before deletion.
- Crash or trigger failure must roll back both tables and the ledger.
- Completed retries must be idempotent; recreated progress must be blocked.
- Shared Care, provider ledgers, Auth and immutable seven/thirty-day deadlines must remain intact.

Task:
- [x] Write and run the failing real-database check.
- [x] Implement the migration and bounded worker with generic errors, fixed table allowlist and no approval shortcut.
- [x] Prove wrong-account, stale-row/schema/lease, absent approval, crash rollback, duplicate retry, frozen writes, client denial and shared-record preservation.
- [x] Run existing preflight/inventory/workflow/retention checks and lint/build. Existing full browser-suite collection error is outside this change; do not rerun it unchanged.
- [x] Review the diff and commit only this unit. Record the final commit in MEMORY, then Infra. No push or live installation in this unit.

Remaining release work: other ordinary resources, provider/Auth closure, reviewed clinical fact sources and hold release, final device checks, monitoring configuration and action-time production approvals.

## Execution and review record

Base: 62aeb8c. Initial actual-schema check failed because implementation was absent, then passed with the migration and worker. A fresh read-only reviewer found two further issues: lease expiry during execution and executable changes to the ledger or freeze controls. Regression checks reproduced both before the fix.

The final completion write checks the current lease again and must return one completed row. A failed final check rolls both deletions back. Fixed control fingerprints cover the ledger's columns, access, constraints, guard and freeze function bodies, and both enabled freeze triggers. Extra executable indexes, rules, inbound progress references and table inheritance are refused. Replication mode that skips triggers is refused. Native PostgreSQL 18 NOT NULL catalog entries are excluded from the control comparison because column metadata already checks them.

Ruling: only the two progress tables are within this stage. Receipt approval is separate from plan approval; the worker cannot approve either. The ledger survives Auth removal and cannot be deleted or changed after completion. Progress writes require read committed isolation so an old transaction snapshot cannot bypass a new freeze. Other accounts' ordinary progress writes still work.

Validation: 19 focused Node checks passed on 3 October, including actual-schema PostgreSQL cleanup, workflow, preflight, inventory, retention, dispatch, receipt, alert, routing and Care checks. Lint and Night build passed. The final log is in regulated-local-access-check/deletion-final-3oct.log. Existing browser-suite collection failure remains outside this unit.

The native PostgreSQL 16 check now proves concurrent database behavior with separate sessions. Two writers wait on the cleanup backend's relation locks, then the freeze rejects them. Two repeatable-read snapshots created before the plan cannot recreate progress. Other-account writes and Care/Auth/deadline preservation pass. The temporary database has no network, ports or host volumes and is stopped after the check.

Compatibility ruling: PostgreSQL 18.3 adds the owner's MAINTAIN privilege to the ledger's catalog ACL. Comparing all relation metadata proved this is the only difference from the native PostgreSQL 16 fixture. The manifest pins one exact alternate relation fingerprint, with all other13 controls unchanged. Additional authenticated access still fails a regression check. This is source-fixture compatibility, not approval of any live schema. The locking behavior is documented in [PostgreSQL's locking reference](https://www.postgresql.org/docs/16/explicit-locking.html).

Native check: `python3 tests/deletion-progress-concurrency.check.py --evidence <local-output-path>`. Result: PASS; all14 controls, two blocked/rejected late writers, two rejected old snapshots, other-account writes and protected records, temporary container stopped. Evidence is in regulated-local-access-check/deletion-progress-native-3oct.json. The combined19 Node checks and lint also passed again after the compatibility change.

Review exclusions carried forward: the JavaScript worker currently accepts a PGlite-compatible transactional adapter and has no production connection; the native check proves database locks/triggers/schema, not a full production adapter. Remaining account resources and full release readiness are unfinished. No live data, credentials, deployment or schema was changed.
