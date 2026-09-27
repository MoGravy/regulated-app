# iPad layout unit

## Feature
- [x] how over the affected subsystem.
- [x] architect for parallel design exploration.
- [x] Throughput checkpoint.
- [x] Delegate code-writing to an exclusive branch owner.
- [x] Verify on the matching surface.
- [ ] Preserve small ordered local commits.
- [ ] Interrogate if design contested.
- [ ] Opening a PR. Deferred until local release units are ready for review; no live deployment.

## Architecture
- [x] Ground
- [x] Sketch
- [x] Agree
- [x] Implement
- [ ] Scrap

## Arena
- [x] Frame
- [x] Fan out
- [ ] Cross-judge
- [x] Pick
- [x] Graft
- [x] Verify

User wants iPad space used purposefully. Preserve phone layout and all existing copy and payment/auth/audio behavior. Data shape is viewport-driven CSS layout, not JavaScript device state. Shared narrow reading/form widths remain intentional where needed. Wider browsing and content grouping should adapt to portrait, landscape and split view.

Rubric: useful tablet density, phone parity, complete route coverage, native safe-area/accessibility support, smallest maintainable CSS/markup change, visual/runtime verification.

## Throughput checkpoint
- Blocking first steps. Trace layout constraints and compare distinct designs before editing.
- Independent workstreams. Parent can audit release blockers read-only and write source notes outside this checkout while delegate implements.
- Shared mutable state. One exclusive release-checkout writer; no parent edits or suites during ownership.
- Smallest safe decomposition. Shared CSS and inline markup are coupled, so one implementation owner covers them.

## Accepted design
Use candidate A with its corrected Home source order. At 768px, widen the browsing shell to about 960px with tablet gutters. Keep bottom navigation, bounded listening/forms/player content, and categories below CheckIn in four columns where space permits. Library cards use two columns. Remove tablet-only excessive bottom-pushed form spacing. No new copy, navigation rail, device JavaScript, dependency or business logic.

Candidate B's navigation rail consumes portrait space and expands the app-shell change without solving a demonstrated navigation problem. Parent read both sketches and selected A for smaller scope and stronger phone parity. Independent third sketch and cross-judge could not start because the agent tool reached its thread limit. This limitation is recorded rather than represented as a completed review. Parent will independently inspect the final diff and actual simulator.

Implementation owner: ipad_design_a, exclusive release checkout ownership after handoff. Parent may write evidence outside this checkout only. Verify real element bounds and reachable actions at phone, split view, tablet portrait/landscape and short height; mock all account/payment/customer writes.

Local implementation and eight browser checks complete. See ipad-layout-result.md. Native simulator verification remains with parent. No local commit made because parent requested an uncommitted reviewable diff.
