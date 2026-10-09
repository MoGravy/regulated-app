# Progress cleanup installation packet

Prepared from server commit `1b3374b` and PostgreSQL compatibility commit `0fcaaae`.

This installs the reviewed progress stage only. It does not activate the dispatcher, approve a deletion, run cleanup, close an Auth account or change protected Care records.

## Evidence

- The live catalog captured at19:47:26UTC on3October matches all260objects in the verified post-tracking snapshot. Evidence: `regulated-local-access-check/catalog-comparison-4oct.json`.
- Actual PostgreSQL17.6 concurrency and Supabase/PostgREST timeout rollback checks pass. Evidence: `deletion-rpc-pg17-native-4oct.json` and `deletion-rpc-pg17-rest-4oct.json` in the same folder.
- All14fixed control fingerprints match without changing the manifest. The fresh server review has no remaining Critical or Important finding.

## Installation boundary

1. Verify the current live catalog again at installation time, and confirm the progress ledger and new function names remain absent. Preserve the hash-only before snapshot.
2. Install the exact committed [migration020](../../migrations/020_deletion_progress.sql). Its transaction creates the private plan ledger and guards. There must be no prepared or approved plan at this point.
3. Read back the14controls. Supabase's default function grants gave service_role execution on the two trigger-only helpers. Install [migration022](../../migrations/022_deletion_trigger_access.sql) to remove only those grants, then require the original14fingerprints to match. Do not change the trusted manifest or rerun020.
4. Install the exact generated [migration021](../../migrations/021_deletion_progress_rpc.sql). Its transaction creates the bounded preparation and execution RPCs. Keep the original source files unchanged.
5. Read back the catalog and access metadata. Expect the14new ledger/guard controls plus3RPC functions, with all prior260objects unchanged. Verify client denial, service-only outer RPC access and no service access to the snapshot helper. Verify function ownership and configuration against the tested source.
6. Verify the hosted REST schema cache and timeout behavior before permitting any execution. The local REST proof does not certify the hosted PostgREST configuration.

Each committed migration has its own transaction. If either fails, inspect actual saved state before retrying. Do not drop an installed ledger or discard any receipt to recover. A successful first migration alone does not authorize cleanup.

Normal Mac Copy now verifies the complete selected query before execution. The fresh pre-install read-only catalog still matched all260objects. Migration020 is installed and its14controls were inspected; the two function ACL differences are explained by the server grant above. No hidden browser state, alternate credential route or permission bypass is permitted.

## Gates that stay closed

`DELETION_PROGRESS_ENABLED`, deletion dispatch and email/cron activation remain off. Plans and receipt review are separate approvals. This stage still cannot report ordinary account deletion complete. Provider/Auth closure, other account resources, retained-record identity handling and hold release remain unfinished. The combined Android build also needs verified runtime settings and server access; do not enable native purchases just to obtain a successful build.
