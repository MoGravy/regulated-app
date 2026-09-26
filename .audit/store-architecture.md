# Store release architecture

Use a locally bundled Capacitor app for iPhone, iPad and Android. Offer the compatible iPad build on Apple silicon Macs. Keep the current React screens. Native code handles store purchases, restore, app links and background audio. All APIs use an explicit HTTPS server origin.

The signed-in Supabase user UUID owns premium access. The server verifies each Apple or Google transaction before storing it. Store records are unique by provider, environment and external subscription ID. Provider events are deduplicated before reconciling renewals, refunds and expiry. One valid source of access is enough; cancellation of one source must not remove access from another. The client only displays the server's answer.

Keep the caller interface small: `accountAccess.refresh()`, `billing.products()`, `billing.buy(productId)` and `billing.restore()`. The audio signing API checks the same server-owned access. Existing Stripe rows continue to work while they are mapped to account UUIDs. Never claim an email-only match is a verified account migration.

Before release, test a real purchase, restore, expiry, refund, sign-in link and background audio on iOS and Android, plus playback of the iPad build on an Apple silicon Mac. Account deletion needs a retryable server flow and a reviewed retention policy. Do not apply a database migration or offer a store product until its verification path is tested.

Decision: use candidate A's transaction identity and migration safety; take candidate B's small client interface and shared audio access check. Hosted WebView and Android Trusted Web Activity do not solve billing and audio for all three listings.
