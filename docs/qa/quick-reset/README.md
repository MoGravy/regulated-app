# Quick Reset local preview

Branch: `codex/quick-reset-preview`. Base: main7d19c3e, PR48.

This change is local only. PR48's launch checklist stays parked.

## Open the preview

Night: http://localhost:4382/reset?look=night

Classic: http://localhost:4382/reset?look=classic

Restart from this worktree:

```sh
VITE_SUPABASE_URL=http://localhost:4382 VITE_SUPABASE_ANON_KEY=preview-public-only VITE_STRIPE_PUBLISHABLE_KEY=pk_test_local npm run build
node tests/local-reset-preview.mjs
```

The server binds only to 127.0.0.1. Its local catalog contains the verified free Daily Nervous System Reset. Its sole upstream request resolves that public free audio through the existing endpoint. Login, email sending and database writes are unavailable here. Audio URLs stay in memory and are never logged or saved in the ledger. Preview history belongs to this local browser origin, separate from the live app.

Real media check in the built-in browser: duration 666 seconds, readyState 4, position advanced to 10.335 seconds after explicit Play, then paused. This proves browser decode and playback progress. Physical speaker audibility and full qualification of this real recording remain unverified.

## Fresh verification

- 16 domain and retained-streak checks PASS.
- Full local suite: 81 passed, 6 remote-only checks skipped, 0 failed. Includes 11 Chromium Quick Reset checks.
- Separate iPhone WebKit suite: 11 Quick Reset checks PASS. Feature coverage remains 22 browser checks at 390x844.
- Both looks checked visually. Selector, title and Play controls fit; milestone explanations remain readable.
- Build, lint and git diff check PASS.
- Independent feature and test harness reviews complete; no Critical or Important findings remain.
- Local preview boundary check PASS: page, free-only catalogue and mutation rejection.

Browser tests render a real 100-second local PCM sample. Playback at 4x requires 80 seconds of rendered media while shortening the test to about 20 seconds. Coverage includes no autoplay, seek rejection, decoder failure and free fallback, persisted qualification, account changes, refused storage and expired retry credit.

```sh
node --test src/lib/qualifiedListening.test.mjs src/lib/practiceLedger.test.mjs src/lib/quickReset.test.mjs src/lib/streak.test.mjs
npx playwright test --config playwright.reset.config.js
npx playwright test --workers=4
npm run lint
git diff --check
node tests/check-reset-preview.mjs
```

## Remaining boundary

The old Node/Vite test collection failure is fixed. Local tests use synthetic public configuration and fixtures, block external browser requests and build into separate temporary folders. App code and the user's preview build are unchanged by this harness fix. Config backups are in `.tmp/harness-backup`.

Six checks require a deployed API or real database and are skipped locally: real free audio, invalid session API response, checkout, unknown-event rejection, waitlist/annual-offer endpoint and database access isolation. They are not claimed as passed. No merge or deployment was attempted.

Actual iPhone/native background playback, locked-phone alerts, purchase/refund checks and the parked launch checklist are separate. Practice history is device-local. Clearing browser data removes it; it does not follow someone to another device.

## Preview build fingerprint

- CSS: index-yclWoeF4.css
- JS: index-ziSFl28-.js
- JS size: 560.67kB, gzip 160.42kB.
- Existing greater-than-500kB bundle warning remains.

The safety hook rejected literal 64-character checksum strings as possible credentials, so those values were omitted. These asset filenames identify the local preview build, not a production release.

See LOCAL-WORK.md for decisions and review findings.

The preview runs in a managed local terminal session. An interrupted turn can stop it; use the restart commands above if needed.
