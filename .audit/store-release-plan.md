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

## Present blockers

Apple Developer requests sign-in. Google Play Console is at signup. Xcode is absent. The live `/privacy` route redirects to `/welcome`. The repo is public. A local secret-read guard rejected the old DOCX filename, so use the recovered Claude chat and other records without trying another path to that file.
