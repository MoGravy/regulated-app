# Quick Reset local preview

Owner instructed implementation on 2 October.

- Branch: codex/quick-reset-preview
- Base: main 7d19c3e, PR48
- Scope: Quick Reset and local practice preview only
- Restrictions: no deployment or migration; preserve parked Supabase/sales work
- Baseline: streak self-check, build and lint PASS; existing bundle-size warning
- Source access: owner installed exact read exception; all three sources read on 3 October.
- Task 1 checkpoint: sole writer, HEAD 7d19c3e; only this ledger and dependency symlink were untracked. Care, sales, native and parked audio branches are untouched.
- Live source proof: current Library shows Daily Nervous System Reset, free, 11 minutes, ID 7a875d14-f77e-47e9-8ff3-16d5db08d2e6. Anonymous production resolver and media HEAD both returned200, audio/mpeg,26643886bytes. Signed URL never printed or stored.
- Task 1 Ruling: the brief's five-minute candidate ID now points at another audio. Select the verified current Daily Reset instead; display current row duration and qualify against media metadata. Cost if wrong: a different free fallback, never paid access.
- Task 1 Ruling: current main has the web audio owner, not Store's native owner. Adapt that existing element using played ranges and seek fences; do not port native files or infer audibility from status alone. Native acceptance remains separate.
- Pre-flight: Task2 emits account-scoped qualified events; Task3 consumes those through AppProvider. Legacy key remains intact and imports only into guest provenance once. Checkout and completion buttons cannot award new preview practice.
- File plan: qualifiedListening.js and practiceLedger.js plus deterministic tests; quickReset.js resolver and tests; useApp.jsx and existing SessionPlayer.jsx adapters; App.jsx, Home.jsx, QuickReset.jsx, PracticeSummary.jsx, copy module and token-only CSS; local browser tests and evidence.
- Current: owner accepted the local preview on 3 October and approved a review PR plus Vercel test preview on 4 October. Production merge and migrations remain excluded.

## Task outcomes, 3 October

Task 1 complete: isolated source checkpoint and live current free-row mapping proved.
Task 2 complete: 16 domain/retained-streak checks pass. Rendered audio progress supplies qualification, and the existing checkout recordPracticeDay call remains intact.
Task 3 complete: reset selection, explicit Play, home summary, milestones, recovery and identity switching implemented. Both looks checked at390x844. The ordinary Night player window overlapped the extra selector; scoped reset-only styling removes that decoration and keeps controls visible.
Task 4 complete: browser checks, real free media loopback preview and saved evidence verified. Feature saved in local commit e44c3a3.

Ruling: imported legacy dates belong only to the signed-out device namespace because the old global key carries no account identity. Authenticated accounts start their own ledger. Wrong cost: retained history is visible as guest, rather than falsely assigned to another person.
Ruling: use a real played-range adapter on main's HTMLaudio owner. Store/native playback remains separate acceptance, with no native port or second audio owner.
Ruling: no remote PR push because it would create a Vercel preview deployment. Keep a local commit and runnable loopback-only preview.
Initial ruling: the full npm test collection failure came from Node importing Vite-only public configuration. The later owner qqq continuation authorised repairing the local harness; outcome below supersedes this gate.

## Independent review

Reviewer /root/quick_reset_review, read-only fresh context. No remaining Critical or Important findings after reread.

- Fixed malformed stored retry entries that could throw instead of falling back to memory. RED ledger test, then GREEN.
- Fixed retry age extension from pause/teardown; lastHeardAt changes only when rendered credit increases. Read-only reviewer repro confirmed old bug; real browser long-pause regression added.
- Fixed browser storage getter refusal outside the guarded boundary. Exact deferred adapter checked with throwing getter; browser reset still plays when storage is refused.
- Also reject short-media events at the ledger boundary, matching the accumulator.
- No Minor findings retained.

Declined-to-judge rulings:
1. Production/deployment/migration/native playback: intentionally excluded by owner. No claims of physical-device acceptance.
2. Browser acceptance: reviewer did not run browsers in read-only review; executor runs WebKit and Chromium locally with actual media rendering and synthetic catalog/auth.
3. Full suite: the initial review excluded the old Node import.meta.env collection failure. The later harness review and full run below now cover it.
4. Authoring usage: actual metadata verifies provider opencode-go/model glm-5.3, humanizer pass recorded. No billing entitlement claim beyond the actual invoked route.
5. Long brief stat rejected in review: no bypass. Executor already read the three exact authorised sources successfully. Reviewer read the playback contract and this ledger.

No product dependencies or schema changes added. Playwright WebKit is a local QA browser install only.

Task 4 complete:22of22 final browser checks PASS (Chromium and iPhone WebKit,390x844),16domain/legacy checks PASS,lint/build/diffcheckPASS. Fresh screenshots from both looks inspected and saved in docs/qa/quick-reset. Loopback guest preview4382 uses the current free audio; built-in browser proved actual666second metadata/readyState4 and10.335second playback progress after explicit Play, then paused. Physical audibility, whole-real-track qualification and native/background acceptance remain separate. Old full-suite collection limitation documented. No push, deployment or migration.
Ruling: the safety hook rejected writing literal64character checksums as possible credentials. Omit those values; document the Vite asset filenames and sizes instead. No bypass or guard change.

## Test harness follow-up, 3 October

The old collection failure is fixed in test code. Node reads public test configuration through tests/runtime.js, while browser application configuration stays unchanged. Local runs use synthetic auth/catalog data, reject external browser requests and block service workers. Six real API/database checks remain explicitly skipped locally.

Shared fixtures now match the bundled session catalogue and the single-row session lookup. Stale AUD labels, scoped check-in assertions and the selected course border check were updated to match the current UI. Recovery allows the installed SDK's retry window. Resume waits for real playback progress and verifies the saved position. No assertion was removed to hide a product failure.

Config backups: .tmp/harness-backup/playwright.config.js and .tmp/harness-backup/playwright.reset.config.js. Test builds use separate .tmp/test-build and .tmp/reset-build output directories, preserving the user's dist preview.

- Full local Playwright suite: 81 passed, 6 remote-only checks skipped, 0 failed (1.4 minutes).
- Separate iPhone WebKit Quick Reset suite: 11 passed (49.1 seconds), at 390x844 with both looks covered.
- Domain and retained streak checks: 16 passed. Lint, build and diff check passed.
- Restored local preview build and boundary check passed: page, free-only catalogue and mutation rejection.
- Fresh read-only review by /root/test_harness_review: no Critical or Important findings.

This follow-up changes tests, configuration and evidence only. No product code, dependency, migration or deployment change. Physical iPhone and remote-service acceptance remain separate. Next: owner review of the local preview; any push or deployment needs fresh release authorisation.

## Preview approval, 4 October

Owner confirmed the local test worked; the supplied screenshot shows one practice day, current run 1 and personal best 1. Owner then explicitly approved pushing the branch, opening its review PR and creating the Vercel test preview. Production remains excluded and PR48's checklist stays parked.

Fresh main is still 7d19c3e, so no rebase was needed. Rechecking after test builds exposed generated bundles being scanned by ESLint. Add .tmp to the existing build-output exclusions; source rules remain unchanged. Backup: .tmp/harness-backup/eslint.config.js.before-preview-20261004. Lint then passed with both test builds present.

Fresh verification: full local suite 81 passed, 6 remote-only skipped, 0 failed (1.3 minutes); separate iPhone WebKit feature suite 11 passed (43.8 seconds); domain/streak 16 passed; lint and diff checks passed. Build outputs remain isolated from the owner's local preview.
