# Native practice integration implementation plan

**Goal:** Complete the approved main/store Admiralty integration with genuine listening credit and no duplicate awards.

**Architecture:** Keep one existing web/native playback owner. Native owners accumulate eligible rendered seconds with monotonic timing and seek fences, retaining qualification time while JavaScript is suspended. The local practice ledger accepts explicit native evidence and awards one event per attempt.

**Spec:** docs/handoffs/261008_Regulated_Brief_Admiralty-Handoff_v1.md; release owner's native-handoff-9oct.md preserved in task-11/evidence/native-integration.

**Constraints:** No new public copy, payment, Supabase/account/backend implementation, credentials, permissions or store submission. Canonical checkout remains untouched. Preserve the owner's existing privacy source as a separate baseline and current main's already-approved catalogue fallback option. The release owner's previously refused resume-test edit is not retried.

**Policy:** New qualified credit uses local calendar day at qualification, preserving the main ledger policy. Previously stored device days retain their original four-hour attribution as a one-time legacy minimum. Completion ids/program progress remain separate from qualification and do not also write legacy practice days. Native timestamps retain their qualification-time timezone offset. This is device-local history.

## Task 1: Evidence and qualification

- [ ] Add failing tests for native eligible totals, seek/mute/pause/buffer/error boundaries, stale/out-of-order/reset evidence, background catch-up, retained qualification date and duplicate credit.
- [ ] Add pure native ListeningEvidence implementations used by existing owners; snapshots expose evidenceSource=native-rendered, eligibleSeconds, atMs and qualifiedAtMs/offsetMinutes. Native open accepts priorCreditSeconds for the existing ten-minute retry policy.
- [ ] Add createNativeListeningAttempt with strict cumulative/source/revision/time validation and ledger support for native-rendered. Correct offset validation with timezone/date tests.
- [ ] Run JS, standalone Java and standalone Swift evidence tests. Commit with main merge once conflicts are resolved.

## Task 2: One player and one award path

- [ ] Resolve configuration and test conflicts semantically, preserving native routing, reviewed copy and main fixture safety.
- [ ] Integrate QuickReset props/error handling into the one native/web player. Feed owner snapshots directly into an attempt-scoped qualification helper, including final close evidence.
- [ ] Remove the separate completion-to-legacy-day write while preserving completion ids/program progress. Scope/token fences reject delayed prior-account callbacks.
- [ ] Add browser tests for genuine listening versus seeking, duplicate attempts, local-only completion, and account/scope cleanup. Run the suite; report unrelated or explicitly blocked tests by name.
- [ ] Reuse reviewed Admiralty appearance candidate and check Night at 390x844. Commit and preserve exact source hashes.

## Task 3: Exact build and delivery

- [ ] Build native web assets with synthetic public configuration; compile iOS and Android with existing SDKs/dependencies. Record exact source commit and asset hashes.
- [ ] Independently review the final commit; fix material findings with reproducing tests.
- [ ] Exercise actual native foreground/background/lock-screen playback where tools permit; capture Welcome, Today, Browse, detail, Player and Premium from the same final build on each available platform.
- [ ] Open an integration draft PR, save screenshots/evidence to Library and return the exact candidate to the canonical release owner for integration review. Do not merge the canonical branch or submit stores.

Review focus: paused/buffered intervals; asynchronous seeks; native-to-JS suspension; stale owner/scope cleanup; midnight/timezone and legacy attribution.
