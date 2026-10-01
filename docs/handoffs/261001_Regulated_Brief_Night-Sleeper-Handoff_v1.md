# Night Sleeper look and day streaks: handoff for the software factory

1 October 2026. From Claude, for Sol and the agents working on Regulated. Matthew approved this work and its merge.

## What happened

Matthew chose a new look for the app, called Night Sleeper: midnight navy, gold, Bodoni Moda headings and Jost text, an arched carriage window on Welcome, session detail and the player, and a crescent and star mark beside the wordmark. He also asked for day streaks. Both are on `main` (PR "Add the Night Sleeper look behind a switch, with day streaks").

The public site does not change yet. The new look sits behind a switch that is off by default. The classic look is pixel-identical to before, apart from one bug fix: the check-in no longer shows an empty chip for the `_note` entry in `state-map.json`.

## How it works

- `src/theme/night.css` holds the whole look. Every rule is scoped to `:root[data-look='night']`. It overrides the tokens in `src/tokens.css` and restyles a short list of existing class hooks, listed at the top of the file.
- An inline script near the top of `index.html` sets `data-look` before first paint. `VITE_LOOK=night` makes night the build default; unset means classic. `?look=night` or `?look=classic` overrides it on one device and is remembered in `localStorage` (`regulated_look`). The night fonts load only in the night look.
- `categoryOf` in `src/lib/categories.js` returns one gold ink for every category in the night look.
- Streaks: `src/lib/streak.js`. Finishing a session saves the night (`regulated_practice_days`, device only, last 400 nights). A night runs to 4am. The run counts nights in a row ending tonight or last night; a missed night restarts it with no message. `src/components/Streak.jsx` shows it in the night look only: a pill on Today and a line at session end. Saving happens in both looks.

## Preview

Open any page with `?look=night` on the end, for example `https://regulatedapp.co/?look=night`. Use `?look=classic` to go back. On a Vercel preview the same works.

## Rules for new screens, including the education platform

1. Colours, type, radius and shadows come from the tokens in `src/tokens.css` (`var(--surface)`, `var(--ink)`, `var(--accent)` and so on). A hard-coded colour will not change in the night look.
2. Reuse the existing classes (`.card`, `.row`, `.chip`, `.btn-primary`, `.btn-ghost`, `.form-input`, `.t-section`). They already have night styles.
3. Category colours come from `categoryOf`, never a literal.
4. Before opening a PR that changes a screen, check it at 390x844 with `?look=night` as well as classic.
5. If you rename or restructure a hook listed at the top of `night.css`, check both looks.
6. Do not edit `src/theme/night.css` to restyle a single screen; add a token or a class instead and say so in the PR.

In-flight PRs need nothing unless they touch `index.html`, `src/hooks/useApp.jsx` (`markSessionComplete`), `src/lib/categories.js`, `src/components/CheckIn.jsx`, `src/pages/Home.jsx`, `src/pages/Onboarding.jsx` or `src/pages/SessionPlayer.jsx`. Each of those has one or two added lines; rebase on `main` and keep them.

## Store release (`feat/store-release`, local worktree)

The edits were placed so they add no merge conflicts with that branch. A three-way merge of every touched file against the worktree as of 1 October gives no new conflicts. `src/hooks/useApp.jsx` already has 5 conflicts between `main` and the store branch, unrelated to this work.

When the store branch next takes `main` (or cherry-picks the two commits from this PR):

1. Keep both sides of `markSessionComplete`; the new line is `recordPracticeDay()`.
2. Status bar: the night look needs light status bar text. Set `UIStatusBarStyle` to `UIStatusBarStyleLightContent` with `UIViewControllerBasedStatusBarAppearance` false in `Info.plist`, or use `@capacitor/status-bar`. Android: light icons on a `#0B1124` bar.
3. App icon and splash: the new icon is in `design/icons/night/` (`icon-1024.png` for the Apple asset catalog, SVG source for Android adaptive layers). Splash background `#0B1124`. Back up the current icon first, as you did for the R icon.
4. Build the store app with `VITE_LOOK=night` once Matthew approves the look for release.
5. Take the App Store and Google Play screenshots in the night look.
6. Fonts come from Google Fonts. Offline, the app falls back to Didot and Avenir Next on iOS. Bundling Bodoni Moda and Jost (both SIL Open Font License) would remove that difference.
7. `index.html` must keep allowing the inline look script. If the store build adds a Content Security Policy, allow that script (hash or `'unsafe-inline'`), or night cannot turn on.

## Before the night look goes public

- Streak wording in `src/config/streakCopy.js` ("N days in a row") has not been through the GLM copy step. Run it through the usual copy route.
- At go-live, also switch the web icons in `public/` to `design/icons/night/`, set `manifest.json` `theme_color` and `background_color` to `#0B1124`, and set `apple-mobile-web-app-status-bar-style` to `black-translucent`.
- Go-live itself is Matthew's call: set `VITE_LOOK=night` in Vercel and redeploy.

## Later

- Streaks are device-only. To follow people across devices, store nights on the account and merge with the device list.
