# Wording, deletion and device verification

User instruction, 28 September 2026: finish in-app wording, account deletion and device testing. Work starts at 0f363a0 in the isolated release checkout. No live customer deletion or publication is part of fixture testing.

## Feature steps

- [x] 1. `how` over the affected subsystem. Prior audits and current callers rechecked.
- [x] 2. `architect` for parallel design exploration. Copy alternatives compared before pause; deletion synthesis remains separate.
- [x] 3. Write the throughput checkpoint as four todo items.
- [x] 4. Delegate code-writing to a subagent. copy_release_owner exclusively owns this checkout for wording and receipt verification.
- [ ] 5. Verify on the matching surface.
- [ ] 6. Rebase into small, ordered commits. Stack follow-ups.
- [ ] 7. If the design is contested, `interrogate` before shipping.
- [ ] 8. Run Opening a PR. Keep local until the release checks and repository publication scope are established.

## Throughput checkpoint

- Blocking first steps: source inventory, ownership design and available-device check.
- Independent workstreams: two read-only deletion designs and copy inventory run together; parent checks hardware and authors copy privately.
- Shared mutable state: one delegate at a time owns the entire release checkout for implementation and tests. Parent edits only private preparation outside it during that ownership.
- Smallest safe decomposition: wording first, deletion second, then integrated builds and device tests. One commit and durable milestone per verified unit.

## Acceptance

- Copy matches available functionality and avoids unsupported treatment or mechanism claims. Same standard applies to database and fallback metadata.
- Account deletion has an executable, tested fulfillment path. Ownership, media, billing and retries have explicit behavior. No completed status for unfinished cleanup.
- Device report distinguishes real hardware, emulator/simulator, browser layout and untested behavior. Real purchases and physical interruptions cannot be inferred from local fixture passes.
- Record genuine deployment, account, policy and hardware blockers as exact actions, without repeating settled permissions.

## Accepted wording and receipt unit

- Data shape: authored JSON has an ID-keyed sessions map and UI strings. A pure reviewedSession function replaces only title and description. It preserves unknown records and all access/audio metadata. A private editorial check lists unknown IDs.
- Map fallback before its ID index, remote rows before the cache, direct detail/player results and waitlist email titles. No new loader or database mutation.
- Receipt state is one object tied to the current checkout session ID. Only a paid receipt with an allowed server type reaches confirmed. URL type and plan never determine success. Subscription access remains the signed-in account's independently checked state.
- Blocking first steps: await parent-reviewed exact GLM copy. Receipt tests and noncopy behavior can proceed first.
- Independent workstreams: parent authors outside checkout; this delegate owns all checkout edits and tests.
- Shared mutable state: exclusive checkout ownership. No parent tests or writes during this unit.
- Smallest safe decomposition: one copy map and one receipt state, using existing components and test dependencies. No new runtime package.
- PR opening skipped for this unit at the parent's explicit instruction. No deployment, live catalogue reads or customer changes.

## Wording and receipt result

The copy owner completed the local wording and truthful receipt unit. Evidence and remaining gates are in `.audit/copy-receipts.md`. Twelve final browser checks and eight responsive layout checks passed, plus Node provider/currency checks. One deployed API check remains intentionally skipped. No native sync or live deployment. Deletion and hardware work remain open for the parent.
