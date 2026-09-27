# Wording, deletion and device verification

User instruction, 28 September 2026: finish in-app wording, account deletion and device testing. Work starts at 0f363a0 in the isolated release checkout. No live customer deletion or publication is part of fixture testing.

## Feature steps

- [ ] 1. `how` over the affected subsystem.
- [ ] 2. `architect` for parallel design exploration.
- [x] 3. Write the throughput checkpoint as four todo items.
- [ ] 4. Delegate code-writing to a subagent.
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
