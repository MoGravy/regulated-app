# Regulated store release plan

## Done means

1. Apple's public listing offers an approved Regulated build to iPhone and iPad users.
2. The same tested build is available in the Mac App Store on Apple silicon Macs.
3. Google Play's public production listing offers an approved Android build.
4. A store purchase, a restored purchase, and an existing Stripe subscription each unlock only the right signed-in account. Cancellation or expiry removes access at the right time.
5. Store privacy and health declarations match the released app. Users can reach a working privacy policy and request account deletion from the app.

Store review decisions belong to Apple and Google. A submitted build is progress, not completion.

## Current scope

Build from live `main` at `98a65b8` in this worktree. Keep the unfinished education branch out of the first store release. The first Apple build will support iPhone and iPad. Apple can offer a compatible iPad build to Apple silicon Mac users without another macOS binary. Intel Mac support is a separate release.

## Work in checked pieces

1. Confirm Apple developer membership and the business that owns both store accounts. Finish account setup with Matthew for identity checks, legal agreements and payments.
2. Record the current app's login, data, purchase and audio paths. Compare each path with current store rules. Capture the live baseline before editing.
3. Add a working privacy route and account deletion path. Draft website wording through exact OpenCode Go GLM 5.3 and the installed humanizer passes. Have a legal reviewer check the privacy and health claims before publication.
4. Package the app for iOS and Android. Test API calls, sign-in links and background audio with lock screen controls on real devices. Test the iPad build on an Apple silicon Mac.
5. Offer store billing for digital subscriptions inside the store apps. Verify purchases on the server before granting access. Keep existing Stripe subscribers working. Remove Stripe purchase paths from store builds where store rules require it.
6. Prepare icons, screenshots, listing text, support details, age ratings, privacy and health forms, and reviewer test access. Test all store flows with fake users.
7. Run TestFlight and Google closed testing if required. Submit both apps. Resolve review findings and verify the public listings and installations.

## Human actions

Matthew handles account sign-in, identity checks, legal agreements, developer fees and payment details. He confirms which legal entity owns Regulated. He approves final privacy and health claims after legal review, and helps recruit any Google test users. The rest stays in this worktree until verified.

## Verified progress, 27 September 2026

- Apple organization documents were submitted by Matthew. Enrollment is still under review.
- Google developer account is created and paid. Website verification passed. Google rejected the existing ASIC certificate; the approved support request was submitted. Identity and subsequent phone verification remain open.
- Xcode is installed and its licence accepted. The iPad simulator runs the app. The wider tablet layout passed eight responsive checks and native portrait/landscape inspection.
- Android release bundle and physical-iOS release archive both build successfully. Both are unsigned. These are compilation checks, not submission-ready builds.
- Account access, native audio ownership and delivery authorization have local checks. Android and iOS have controlled audio runtime evidence. The isolated iOS test passed 23 assertions, including natural completion while backgrounded. Physical-device playback and full native integration remain unverified.
- Account deletion has a request receipt and a tested read-only inventory. It does not yet fulfill deletion. The private privacy draft retains unresolved facts and is not ready to publish.

## Remaining work and gates

1. Finish native store purchases, restoration and server verification, then test the real store flows. RevenueCat SDK13.6.1 is installed and both native debug builds pass, but purchases are not configured. Store products and signing depend on account access. See revenuecat-sdk-todo.md for the verified dependency checkpoint.
2. Finish deletion fulfillment, record ownership, provider handling and retention decisions. Migrations remain unapplied. Do not activate the request flow as a completed deletion service.
3. Complete privacy/support/deletion pages and declarations from verified facts. The live privacy route remains unresolved. The private draft is outside this public repository.
4. Verify hosted native authentication and CORS, real-device audio, and the iPad app on Apple silicon Mac. The separate iOS audio test passed after the owner-approved narrow safety-hook exception. Its report and limitations are in `~/AgentWorkspace/regulated-device-check/ios-audio-harness`.
5. Finish app icons, store screenshots, review access, listing forms and signing. Icon drafts are prepared outside the repository but are not installed.
6. Submit only after the full verification path passes, then resolve store review findings and verify public listings.

Evidence and exact account state live in `~/quill/MEMORY.md` and the linked vault note `Regulated store submission 2026-09-26`. Build and screenshot evidence is under `~/AgentWorkspace/regulated-device-check`. No production deployment or store submission has occurred.

Preserve earlier refusals. The old DOCX filename and a generated icon-copy path were rejected by the local secret-read guard. Use existing reviewed records and do not retry those paths without the required permission.
