# Deletion inventory preparation

- [x] Ground existing schema, receipt API and privacy inventory.
- [x] Sketch minimal read-only contract and compare RPC/export alternatives.
- [x] Parent review and agree. Independent extra panel unavailable at the agent thread limit.
- [x] Throughput checkpoint. Receipt/Auth identity and report privacy are shared invariants, so one exclusive checkout owner implements the function and fixture check. Parent works outside checkout until handback.
- [x] Implement.
- [ ] Parent independent fixture verification and diff review.
- [ ] Local checkpoint.
- [ ] Opening a PR. Deferred with the other release units.

Accepted sketch is /private/tmp/regulated-deletion-inventory.md. No client creation, env reads, CLI/API route, live queries, provider call, mutation, public prose, new dependency or readiness/success flag. Identity is stored receipt then matching Auth UUID. Ordinary counts use exact head requests; only minimal custom-order metadata is paged. Any failed/missing count or inconsistent page is unavailable, never zero. Current-email matches and all media references remain unverified candidates. Report contains no email, private text, paths, signed URLs or provider IDs.

The parent specifically reviewed server row-limit handling, unverified email, explicit legacy/historical mapping limits and FK/provider/retention obligations. This is inventory preparation, not completed deletion fulfillment.

## Implementation evidence

Added scripts/deletion-inventory.mjs and tests/deletion-inventory.check.mjs. The exported function accepts only an existing client and receipt ID, verifies the stored receipt and Auth identity, and returns private counts plus minimal unverified media references. It creates no client and has no environment access, command-line entry point, stdout output or mutation method.

`node tests/deletion-inventory.check.mjs` passes. Fixtures cover receipt/Auth mismatches and errors, missing/unconfirmed email, literal escaped ILIKE metacharacters, exact head counts above the server limit, 1,003 custom orders across 28 pages with a simulated 37-row cap, duplicate IDs, changing counts, empty/inconsistent pages, query failures and unavailable counts. Serialized reports exclude fixture email, private text, storage paths, signed URLs and provider identifiers. Repeated inventory gives the same result without mutating the fixture. `git diff --check` passes. Deslop/comment review found no extra comments, new dependency or execution framework.

## Limits retained

- Counts and pages are separate reads, not a transaction. Changed counts, duplicate IDs and premature empty pages fail closed. Same-count replacements between reads cannot be excluded; non_atomic_snapshot remains a blocker.
- Case-insensitive current verified Auth email matches are legacy candidates. They do not prove historical ownership or cover old, reassigned, whitespace-variant or unmapped email records.
- Missing/unapplied migration and read failures throw a sanitized table-specific error. No partial report is returned and unavailable never becomes zero.
- Missing/unconfirmed Auth email still permits account-ID counts but returns legacyCandidateCounts null and empty mediaReferences with current_email_unverified_or_missing. Empty media in that report is not proof of no media.
- Every order media reference remains ownership-unverified. No raw path leaves the function. Orphans, shared objects, outstanding links, remote billing/email obligations, receipt/entitlement foreign keys, offline data and retention decisions remain unresolved blockers.

No live query or provider call ran. No process remains running. Changes are uncommitted for parent independent review and local checkpoint. This inventory does not authorize or perform deletion.

## Parent review correction

PostgREST documents `*` as an ILIKE wildcard alias. A verified Auth email containing a literal asterisk now returns account counts but leaves legacyCandidateCounts null, with unsupported_email_pattern. It performs no legacy query. A fixture for a*b@example.test verifies that behavior and confirms the email is absent from output. No unverified escaping was introduced. The focused fixture check and diff check still pass.

Reference: https://docs.postgrest.org/en/stable/references/api/tables_views.html#operators
