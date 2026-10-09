# Admiralty look: handoff for the software factory

8 October 2026. From Claude, for Sol and the agents working on Regulated. Matthew approved this work and its merge.

## What happened

Matthew looked at five calmer concepts and chose **Admiralty**: quiet paper and navy in the Matthew Tweedie Hypnosis colours. He chose it so Regulated sits comfortably beside the MTH site, The Performance Anxiety Room and the new niche sites, because every one of those sends people to the app.

It is on `main` as PR #53, "Add the Admiralty look (paper and navy in MTH colours) behind the look switch". It is a third look alongside `classic` and `night`. **Night Sleeper is still the production default.** Nothing changes for users until the switch is flipped (see "Going live").

What the look is:

- MTH cream paper (`#EFEFF7`), paper cards (`#FAFAFE`), navy text and headings (`#1C1E33`, `#272941`)
- Navy for anything selected: the Browse switch, the chosen check-in chip, the current tab
- MTH gold (`#D4A537`, with `#141521` text) only on play and the main button. In lists, play circles stay quiet navy; only a session in progress turns gold
- The player is the one dark surface: deep navy `#141521`, a soft gold glow behind the title, gold controls
- No textures, no tinted category tiles, one navy ink for every category
- The same readable type as night: Literata headings and Atkinson Hyperlegible Next text, body at 17px and small text at 15px
- Every text colour is 6.5:1 or better on its ground (body text 14.3:1, second text 7.7:1)
- The crescent and star mark, recoloured: gold crescent, navy star (`src/theme/admiralty-mark.svg`)

## How it works

- `src/theme/admiralty.css` holds the look. Every rule is scoped to `:root[data-look='admiralty']`. Like night, it overrides the tokens in `src/tokens.css` and restyles the same short list of class hooks named at the top of `night.css`.
- Shared with night, so both looks stay in step: the tab icons in the bottom menu, the readable sizes block, and the streak pill and note (`.night-only`). Those rules in `night.css` now use `:root:is([data-look='night'], [data-look='admiralty'])`. The carriage window (`.night-arch`) stays night only.
- `index.html`: the look script accepts `classic`, `night` and `admiralty` from `VITE_LOOK` or `?look=`, remembered in `localStorage` (`regulated_look`). For admiralty it sets `theme-color` to `#EFEFF7` and the Apple web status bar to `default` (dark text). The readable fonts load for any look except classic.
- `categoryOf` in `src/lib/categories.js` returns navy `#272941` for every family in this look, and gold in night.
- `tokens.css`: the Support role colour follows the accent in both night and admiralty.

## Preview

Open `https://regulatedapp.co/?look=admiralty`. Use `?look=night` to go back. Vercel previews work the same way.

Checked by screenshot at 390x844 and 375x667: Welcome, Today, Browse, Session detail, Player (before, playing, complete), Premium, My courses, Support, Sign in, Custom, Success. Night and classic were checked before and after and are unchanged.

## Rules for new screens, including the education platform

Same as the night handoff, now for three looks:

1. Colours, type, radius and shadows come from the tokens (`var(--surface)`, `var(--ink)`, `var(--accent)`, `var(--control)`). A hard-coded colour will not change between looks.
2. Reuse the existing classes (`.card`, `.row`, `.chip`, `.btn-primary`, `.btn-ghost`, `.form-input`, `.t-section`). They have styles in every look.
3. Category colours come from `categoryOf`, never a literal.
4. Gold is for play and the single main action on a screen. Do not use `var(--control)` for decoration, badges or secondary buttons.
5. Before opening a PR that changes a screen, check it at 390x844 with `?look=admiralty` and `?look=night`.
6. Do not edit `admiralty.css` or `night.css` to restyle one screen. Add a token or a class and say so in the PR.

In-flight PRs need nothing unless they touch `index.html` (look script), `src/lib/categories.js`, `src/tokens.css` or `src/theme/night.css`. Rebase on `main` and keep the new lines.

Note from the screenshots: the Quick Reset work (PR #50) took `StreakPill` off Today in favour of the practice summary card. That is fine in both looks. If the pill is wanted back on Today, it already has admiralty styles.

## Going live (Matthew's call)

1. In `package.json`, change the build script from `VITE_LOOK=night vite build` to `VITE_LOOK=admiralty vite build`. If `VITE_LOOK` is also set in Vercel, change it there too. Redeploy.
2. Web: set `manifest.json` `theme_color` and `background_color` to `#EFEFF7`, and set `apple-mobile-web-app-status-bar-style` in `index.html` to `default`. The `index.html` `<body>` fallback background can be `#EFEFF7`.
3. Icons: the night icon (gold crescent and star on navy) already fits the MTH rule of a gold mark on a navy square, so no new icon is needed. If you want it to match the player exactly, recolour its background to `#141521` and back up the current icon first.
4. People who have opened `?look=night` or `?look=classic` on a device keep that look, because it is remembered. That is expected.

## Store release (`feat/store-release`, local worktree)

I could not reach the worktree from this session, so I have not run the three-way merge check this time. The change only touches `index.html` (the look script and one stylesheet link), `src/tokens.css`, `src/lib/categories.js`, `src/theme/night.css`, and two new files. Please merge `main` into the store branch and check those files.

When the store build moves to admiralty:

1. Build with `VITE_LOOK=admiralty`.
2. Status bar: this look needs **dark** status bar text, the opposite of night. On iOS use `UIStatusBarStyleDarkContent`, or set `Style.Light` with `@capacitor/status-bar` (Capacitor's `Light` means dark text). On Android, use dark icons on a `#EFEFF7` bar. The player is navy, so if the status bar is set per screen, use light text on the player only.
3. Splash background `#EFEFF7`, with the mark centred.
4. Take the App Store and Google Play screenshots in the admiralty look.
5. Fonts: same as night. Literata and Atkinson Hyperlegible Next come from Google Fonts. Bundling both (SIL Open Font License) removes the offline fallback.
6. If the store build adds a Content Security Policy, keep allowing the inline look script in `index.html`.

## Not changed

- No copy changed. Streak wording is still `src/config/streakCopy.js`.
- No payment, Supabase or account code was touched.
