# Catalogue identity correction

28 September 2026. Parent read the actual fourteen-record catalogue into the private `live-catalogue.json` source. No audio URLs or customer records were included. The local fallback and first copy draft had inherited stale associations.

## Reproduction and cause

Committed the independent fixture and failing test first as `827e80f`. Running `node tests/catalogue.check.mjs` reproduced `7a875d14-f77e-47e9-8ff3-16d5db08d2e6 category: 'Sleep' !== 'Daily'`.

Three free IDs had the wrong topic in the fallback. `7a875d14` is Daily, `ca65ecd1` is Sleep, and `e184e81c` is Gut Health. Durations were stale and seven premium placeholders did not exist in the actual catalogue. The first reviewed-copy registry inherited those associations, so it could replace a correct remote title with a different topic. No version of this work was deployed.

An existing regression-test comment already acknowledged the old fallback title mismatch and selected only the unaffected Stress record. Removed that obsolete exception. The new test compares all fourteen IDs against an independent, fixed metadata fixture.

## Fix

Fallback contains exactly the fourteen verified IDs with their authoritative category, duration, free and audio-availability flags. It contains no audio URLs. Removed the seven nonexistent placeholder records and copy entries because no other callers use them.

The parent supplied exact GLM 5.3/OpenCode Go wording for the fourteen live IDs. `src/content/reviewed-copy.json` now uses those titles and descriptions verbatim. All 36 existing UI fields are unchanged. Authoring provenance stays in `/Users/matthew/AgentWorkspace/regulated-device-check/app-copy-20260928/live-authoring-receipt.json`; original metadata and source claims stay private outside the shipping copy.

The shared reviewedSession function still changes title and description only. Remote flags, categories, durations and other metadata remain authoritative. Unknown records are unchanged and the private editorial checker flags their IDs.

State-map and programme already use the correct IDs. Today resolves actual catalogue metadata and DayDots uses day IDs. No sequencing, state-map or programme approval changes were needed. Programme remains unapproved. Updated incidental legacy test labels to reviewed wording without changing their behavior assertions.

## Verification

- Original Node repro passes for every one of fourteen records. It also checks exact ID coverage, no audio URLs, no unreviewed IDs, four free records, state-map identity and programme ID coverage/gate.
- Browser catalogue suite passed six scenarios. All fourteen library cards match the independent metadata fixture in remote and fallback modes. Direct detail/player checks cover all four free IDs and one premium ID, including reviewed title, category, duration and requested audio ID. Cache and Sleep/Daily check-in routing also pass.
- Four previous copy browser checks and eight phone/iPad layout checks passed with the corrected catalogue.
- Legacy check-in test initially selected both identical Daily rows on Home. Scoped its assertion to the actual check-in region and reran only that test. It passed in 6.8 seconds. Total nineteen selected browser checks passed across the batch and focused rerun.
- Node copy/provider checks and programme progress self-check passed. Private catalogue review returns an empty unreviewed-ID list.
- Exact comparison confirms all fourteen authored title/description pairs match the parent-reviewed source and all 36 UI fields are unchanged.
- Vite production build ran successfully in both Playwright web-server starts after correction. Existing bundle-size and Capacitor import warnings remain.
- Independent read-only review confirmed all metadata, copy and caller mappings. No implementation blocker remained.

## Remaining limits

This verifies the metadata snapshot and local presentation, not the actual spoken recordings or future catalogue edits. Public database descriptions remain unchanged until an authorized content migration or release. No live database write, deployment, native asset sync or physical-device test occurred in this unit. Parent owns native refresh and remaining release gates after handback.
