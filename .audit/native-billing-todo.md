# Native billing client

## Contract
- One SDK queue, synchronous account revision invalidation, private SDK package cache.
- Explicit VITE_BILLING_BACKEND_READY=true plus per-platform VITE_BILLING_IOS_ / VITE_BILLING_ANDROID_ PUBLIC_KEY, OFFERING, MONTHLY_PRODUCT and ANNUAL_PRODUCT required. No values or activation added. Production platform key prefixes only; test-store keys rejected in all builds.
- SDK purchase and restore results never grant access. Existing refreshPremium remains server authority.
- Native custom and success routes redirect to Premium. Web Stripe imports happen only inside web checkout handlers.
- Approved GLM copy copied from device-check/billing-copy/strings.json without new public wording.

## Verification contract
- Installed types confirm subscriptionPeriod is ISO8601 and PAYMENT_PENDING_ERROR is "20" in purchases-typescript-internal-esm/dist/generated/error-codes.d.ts.

## Remaining release gates
- Backend ingestion/ownership/replay protection and catalog not implemented in this unit. Billing stays disabled absent explicit config.
- Native custom A$99 purchase and included annual custom benefit parity remain required launch work. Hidden routes are temporary protection.
- Store-localized terms, published privacy/terms links, store setup, sandbox purchase/refund/restore checks remain activation gates.
- Existing Android singleTask launch mode still needs review before bank verification payment testing.
- App store subscription management uses standard platform account subscription URLs.

## Completed checks
- `node tests/native-billing.check.mjs`: passed. Configuration absence/test key rejection, configure once, account changes during login/purchase, sign-out during purchase, queue recovery after rejected login, stale packages, overlapping charge prevention, cancellation, session reread after SDK identity work, restore without offerings and payment pending. Log: native-billing-controller.log.
- `npx playwright test tests/native-billing.spec.js tests/premium-refresh.spec.js --reporter=list`: 9 passed. Log: native-billing-browser.log.
- Final screen-only rerun after adding cancellation assertion: 4 passed. Log: native-billing-screen-final.log. Native routes never initialize Stripe; existing web checkout does; localized title/price/month interval shown; restore without offerings stays server-pending; canceled purchase causes no access refresh.
- `npm run build`: passed. Log: native-billing-web-build.log. Existing large chunk warning and Capacitor App mixed static/dynamic import warning remain.
- `npx cap sync`: passed. Log: native-billing-cap-sync.log. No tracked native config difference produced.
- `DEVELOPER_DIR=/Users/matthew/Applications/Xcode.app/Contents/Developer /Users/matthew/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /Users/matthew/AgentWorkspace/regulated-device-check/ios-derived CODE_SIGNING_ALLOWED=NO build`: BUILD SUCCEEDED. Log: native-billing-ios-build.log.
- Android directory: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/matthew/Library/Android/sdk ./gradlew --no-daemon :app:assembleDebug`: BUILD SUCCESSFUL. Log: native-billing-android-build.log.
- `git diff --check`: passed. New diff/comment review removed the obsolete optional-sign-in claim.
- SessionAudio manual registration and Main.storyboard SessionBridgeViewController remain. Generated PurchasesPlugin registration remains. iOS15.0/Swift5.0 and Android24/36/36 targets unchanged.

## Backup and handback
- Package/native configuration backed up before sync under `.audit/backups/native-billing-client-20260927/`, preserving relative paths. Existing source config was not edited.
- Source: src/lib/nativeBilling.js, src/content/billing.json, src/hooks/useApp.jsx, src/pages/Premium.jsx, src/pages/CustomAudio.jsx, src/pages/SessionPlayer.jsx, src/App.jsx.
- Checks: tests/native-billing.check.mjs, tests/native-billing.spec.js. Evidence: this file and named logs.
- No live purchase, credentials, provider setup, backend changes, app install, signing or deployment. Builds prove compilation, not billing correctness against stores.
- First restricted Playwright run could not bind localhost (EPERM); rerun with explicit escalation succeeded. Initial fixture export omissions were fixed before final pass.
- All task build and test processes finished. Existing unrelated .audit/regulated-stores.tsv, .audit/deletion-todo.md and prior backup content preserved.
