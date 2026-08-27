# Cutover analytics collapse — investigation and recovery

**Date of investigation:** 2026-08-27
**Symptom:** Google Analytics active users collapsed across the cutover:
Aug 24 = 19 (−74.67%), Aug 25 = 4 (−91.49%), Aug 26 = 3 (−99.13%).
Realtime shows essentially zero active users.

## Diagnosis: the new site has no Google Analytics tag

This is a **measurement loss, not (necessarily) a traffic loss**. The evidence:

1. **This codebase contains no GA tag at all.** No `gtag.js`, no
   `googletagmanager.com` script, no `G-XXXXXXXX` or `GTM-XXXXX` ID anywhere in
   `index.html` or `src/`. The only thing called "analytics" here
   (`src/lib/analytics.js`) writes events to the Supabase `analytics_events`
   table — it never talks to Google. Whatever site GA was previously measuring
   carried the tag; the site serving traffic after the cutover does not.

2. **The decay curve is a DNS-propagation signature, not an audience
   signature.** Day one of the cutover shows a partial drop (19 users — some
   visitors' resolvers still pointed at the old, tagged site), then near-zero
   on days two and three once propagation completed. Real audience loss (ads
   paused, SEO decay) doesn't step down over exactly 24–48 h like that.

3. **Realtime is flat.** A site with visitors but no tag shows exactly this:
   overview cards near zero, Realtime empty. If traffic itself had died you'd
   also expect it — which is why step 1 below cross-checks against a data
   source that didn't move.

Note the headline percentages are slightly exaggerated by a traffic spike in
the comparison week (Aug 19 ≈ 346 active users vs a typical 45–75). The real
collapse is ~50–75/day → 3–4/day — still a cliff, just not literally 99% of a
normal day.

## Recovery steps

### 1. Confirm real traffic survived the cutover (5 min)

The Supabase event log kept recording through the cutover because it lives in
the app, not in GA. In Supabase → SQL Editor:

```sql
select date_trunc('day', created_at) as day, count(*) as events,
       count(distinct properties->>'email') as approx_users
from analytics_events
where created_at > now() - interval '21 days'
group by day order by day;
```

- **Events continue at normal rates after Aug 24** → pure measurement loss;
  the fix below is the whole job.
- **Events also cratered** → the cutover broke the site itself for real
  visitors (DNS record missing, SSL mode redirect loop, Cloudflare challenge
  page). Check the domain in an incognito browser and from a phone on mobile
  data, and check Cloudflare → SSL/TLS mode (should be **Full (strict)** for
  Vercel origins) and **Security → Bots → Bot Fight Mode** (already flagged in
  `docs/hermes-mcp-cloudflare-tunnel.md` as a known breaker on these zones).

Vercel → project → **Analytics/Observability** gives a second independent
read of request volume if enabled.

### 2. Get the Measurement ID from the existing GA property

GA Admin → **Data streams** → your web stream → copy the **Measurement ID**
(`G-XXXXXXXXXX`).

- **Reuse the existing property and stream** so history stays in one place —
  do not create a new property.
- While there, update the stream's **URL** to the domain now serving traffic,
  and make sure **Enhanced measurement** stays on.

### 3. Deploy the tag (now built into this repo)

The fix in this branch adds a proper GA4 integration:

- `src/lib/ga.js` — injects gtag.js, keyed off `VITE_GA_MEASUREMENT_ID`;
  no-ops if unset.
- `RouteTracker` in `src/App.jsx` — sends `page_view` on every route change.
  This app is a SPA; a static `<head>` snippet would count only the first
  page load per visit.
- `src/lib/analytics.js` — every existing custom event (`session_started`,
  `premium_upgrade_completed`, …) is now mirrored to GA4, so conversions are
  visible in GA too.

To activate: Vercel → project → **Settings → Environment Variables** → add
`GA_MEASUREMENT_ID = G-XXXXXXXXXX` (production) → **redeploy** (the ID is baked
in at build time; setting the variable alone does nothing).

### 4. Verify (2 min)

1. Open the live site, view source: a
   `googletagmanager.com/gtag/js?id=G-…` script should be present.
2. GA → Reports → **Realtime**: your own visit appears within ~30 s. Navigate
   between tabs — each route change registers.
3. Next morning: daily active users back at pre-cutover levels.

### 5. If the tag deploys but Realtime stays empty

All three are Cloudflare-proxy issues, in likelihood order:

- **Rocket Loader** (Speed → Optimization): defers/rewrites scripts and is a
  known gtag breaker. Turn it off, or add a page rule excluding gtag.
- **Bot Fight Mode / Super Bot Fight Mode**: can challenge or block
  `googletagmanager.com` fetches for some visitors.
- **Zaraz** (if ever enabled): intercepts third-party scripts including GA —
  either manage GA *through* Zaraz or disable it.

## Things to know

- **The gap cannot be backfilled.** GA only records what the tag sends at the
  time. Aug 24 → deploy day is permanently missing from GA (the Supabase
  event log covers those days for engagement metrics). This is why the deploy
  shouldn't wait on anything else.
- **If the cutover changed the public domain or URL structure**, also check
  Google Search Console: old URLs need 301s to their new equivalents, and a
  domain change needs the Change of Address tool — otherwise a *real* organic
  traffic decline follows over the coming weeks, separate from this
  measurement outage.
- **If the old site ran GA through a website builder** (Wix/Squarespace/
  WordPress plugin field), that's why the tag vanished at cutover: it lived in
  platform settings, not in anything that migrated. The env-var approach here
  keeps it in the codebase from now on.
