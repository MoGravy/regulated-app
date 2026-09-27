# Reviewed app copy and checkout receipts

Local release unit, 28 September 2026. No production data, account changes, native sync or deployment.

## Copy source

`src/content/reviewed-copy.json` is the parent's reviewed exact GLM 5.3/OpenCode Go output, unchanged. Author receipt and source materials remain outside this repository at `/Users/matthew/AgentWorkspace/regulated-device-check/app-copy-20260928`. It covers eleven session IDs and 36 UI keys. Parent applied Matthew, Hermes and unslop editing passes.

The pure ID map overrides title and description only. It covers fallback metadata, remote library before caching, direct detail/player loads and waitlist confirmation. Unknown IDs retain their source values. `node scripts/check-session-copy.mjs <local-catalogue.json>` lists IDs requiring editorial review and exits nonzero if any exist. It does not fetch the live catalogue.

UI uses subjective check-ins and available-content language. Removed unverified testimonials, program refund and release-cadence promises, permanent custom library/revision promises and unsafe symptom examples. Safe listening and general wellbeing text appear on session detail. Player playback failures use existing neutral error wording. Checkout description and delivery/subscription emails reuse reviewed text. Monthly emails do not include the annual custom benefit.

Faithful edits outside the immutable JSON include the custom receipt's `Purchase verified` and `Your purchase has been verified.` These derive from the authored payment receipt text, without claiming that the order is persisted or fulfillment has begun. Waitlist says registration is recorded, with no readiness-notification promise. Existing field instructions were shortened without adding claims.

## Receipt behavior

One keyed receipt state resets on checkout session change and ignores old responses. Pending, failed, malformed and unpaid receipts cannot show success or ANNUALFREE. Only server metadata selects purchase type and annual eligibility. Receipt verification does not grant subscription access. Account access comes from the existing independent check.

The shared server receipt guard accepts paid supported types. It also preserves a completed, zero-total custom checkout when Stripe confirms payment mode, AUD, the full A$99 subtotal and matching full discount. That supports server-validated ANNUALFREE and existing Stripe-hosted 100% promotions. The client cannot supply these trusted Stripe fields. Invalid zero-total subscriptions, incomplete sessions, currency/subtotal/discount mismatches and nonzero totals remain unconfirmed. The receipt API no longer returns customer email.

Unpaid `checkout.session.completed` does not create an order, subscription or confirmation email. `checkout.session.async_payment_succeeded` handles delayed settlement. Official Stripe source for payment versus checkout status: https://docs.stripe.com/api/checkout/sessions/object.

## Verification

- Reproduced baseline bug in a real React browser fixture. A pending receipt displayed `Welcome to Regulated Premium.`
- Final Playwright receipt/copy/offer/waitlist batch passed 12 tests in 12.5 seconds. One deployed API test intentionally skipped because this unit makes no live requests.
- Responsive phone/iPad batch passed eight layout, account and form checks at widths 390, 540, 768, 1024 and 1280, including short landscape. Combined earlier receipt/layout batch passed 12 tests in 29.8 seconds.
- Catalogue browser checks cover remote/cache, fallback, direct detail/player and waitlist registration. Provider responses are local fixtures. Reviewed title preserves the original session ID and access/audio fields.
- `node tests/copy.check.mjs` passed metadata nonmutation, unknown/prototype-like IDs, waitlist title, plan-specific emails, delivery safety, receipt response privacy, unpaid/delayed payment and programmatic/hosted full-discount cases.
- `node tests/checkout-currency.check.mjs` passed approved AUD prices and checkout copy, configured recurring-price agreement and invalid-plan rejection.
- Production build passed. Existing bundle-size and Capacitor static/dynamic import warnings remain.
- A first fallback browser fixture used retried HTTP503 and timed out. Changed the fixture to immediate HTTP400 to check fallback behavior independently of retry timing, then passed. The local safety hook blocked a generated long error-context path. It was not retried or read by another route.
- Six touched narrative comment lines removed after independent review. No suppressions added. Model the Domain shaped the keyed receipt state and ID registry.

## Remaining release checks

- Parent verified the public library has fourteen records, including ten premium titles unlike the seven local fallback placeholders. Exact live premium IDs and descriptions remain unreviewed and need a separately authored supplement. This map is not certification of those records or actual audio.
- Verify the live Stripe webhook endpoint subscribes to delayed settlement events before enabling payment. No endpoint configuration was changed here.
- Real paid/free/declined/delayed transactions, native billing, account/device tests and provider fulfillment still need environment verification.
- Existing webhook retry/coupon usage and delivery completion/error handling are separate operational risks, unchanged by this copy unit. A receipt does not certify fulfillment.
- Account deletion implementation, public policy/routes, production backend migrations/configuration, signing and store verification remain separate gates.
