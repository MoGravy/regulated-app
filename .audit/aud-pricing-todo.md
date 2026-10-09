# AUD pricing correction

- [x] Ground pricing, custom checkout, coupons, subscription IDs and visible support contacts.
- [x] Compare configured price IDs with a shared currency guard against inline recurring price data.
- [x] Implement the selected small correction with one exclusive writer.
- [x] Independently verify checkout behavior with mocked providers and review visible labels.
- [x] Save a local checkpoint. Public PR/deployment waits for the broader release package and verified AUD provider prices.

## Throughput checkpoint

- Blocking first steps. Owner approved AUD amounts; trace currency sources and provider price behavior before edits.
- Independent workstreams. Parent updates private business/privacy notes outside the checkout while the code owner works.
- Shared mutable state. One exclusive code owner holds the release branch until handback. Parent does not edit or run tests there meanwhile.
- Smallest safe decomposition. Currency and checkout must agree, so one writer owns them and the focused checks.

## Data and design

Reuse pricing.js as the source of the lowercase payment currency string. Preserve server-configured recurring price IDs. Reject a price with another currency before creating coupons or checkout sessions. Inline subscription price data would introduce new provider products/prices and alter catalog management, so is outside this correction.

Displayed purchase prices use A$ to remove ambiguity. Native store-localized catalog strings replace these when native billing is implemented. Do not rewrite historical receipts or customer subscriptions. Customer support text may change to the confirmed inbox; sender configuration stays unchanged. No new marketing or policy prose.

## Limits

Live Stripe prices have not been inspected or changed. The guard requires verified AUD price IDs before any deployment. Existing subscriptions are not migrated. Minimum audience age and retention policy remain unresolved.

## Accepted reviewer correction

The configured subscription price must agree with current advertised source amounts as well as currency. Before coupon or checkout creation, reject invalid plan names and require active true, currency aud, type recurring, unit_amount 14900 annual or 1900 monthly, year/month interval respectively, and interval_count 1. Preserve the configured price ID. Annual 19900 is a future transition requiring an explicit source and provider update; it is not the currently advertised founding price.

## Implementation and checks

Backed up pricing.js at .audit/backups/pricing-before-aud-20260927.js before editing. Added CURRENCY to the existing pricing module. Custom checkout and fixed-value coupons use it. Subscription validation runs before coupon lookup or any Stripe mutation. Current purchase labels mechanically use A$ in Premium, CustomAudio, SessionPlayer and the future-purchase offer in Success. Confirmed support contact replaces only Success text and two webhook footers; FROM_EMAIL and historical webhook amounts are unchanged.

`node tests/checkout-currency.check.mjs` passes using the real handler in a VM with mocked providers and environment. It verifies custom AUD9900, fixed coupon AUD, unchanged percentage discounts, preserved annual/monthly price IDs, client price/currency ignored, missing/invalid currency, lookup failure, missing configuration, inactive/nonrecurring prices, wrong amount/interval/count, and invalid plans. Rejected configuration causes no coupon, checkout or database access.

`npx playwright test tests/offer.spec.js --grep 'AUD purchase labels' --reporter=list` passed, 1 test in 7.9 seconds. It starts the production build, mocks account/payment data, checks Premium and CustomAudio purchase amounts and the confirmed support contact on Success. The build passed with the existing bundle-size warning. Fresh shots/after/aud-premium.png and aud-custom.png were inspected. Existing label-sensitive test expectations were updated. `git diff --check` passed. Deslop/comment review found no new abstraction, dependency or explanatory boilerplate.

## Remaining release limits

- No live Stripe prices were inspected or changed. Deployment still requires matching active AUD149 annual and AUD19 monthly price IDs. Existing subscriptions are not migrated.
- A$ labels are fixed current purchase labels. Native store billing and localized catalog prices remain unfinished.
- Customer contact text does not establish Reply-To routing. Verify replies reach the confirmed inbox before release. No sender or provider setting was changed and no message was sent.
- Historical receipts/webhook amounts were not relabeled. New marketing/policy prose was not authored.
- Age policy and retention decisions remain unresolved outside this unit.

Changes remain uncommitted for parent independent verification. No push, deployment, native rebuild or provider action occurred. Playwright-managed preview/browser processes exited with the completed test.

Parent independently read the entire checkout/config/UI/contact diff and test assertions, reran the real-handler fixture check successfully, inspected both currency screenshots, and confirmed whitespace checks. Model the Domain kept currency with the existing amount constants. Existing product IDs are preserved to avoid catalog churn. No extra production behavior was added.
