# RevenueCat native dependency check

- [x] Read existing billing grounding and official Capacitor installation instructions.
- [x] Back up package, lock and native generated config before mutation.
- [x] Install exact purchases-capacitor 13.6.1.
- [x] Build production web bundle and synchronize native projects.
- [x] Check custom audio plugin registration and unchanged native minimum targets.
- [x] Compile iOS simulator and Android debug targets.
- [x] Review generated diff and return ownership for parent review.

One exclusive writer owns the checkout. This unit installs and compiles the dependency only. No SDK configuration, credentials, product catalog, purchase UI, provider operation, signing, deployment or billing completion claim.

Backups: .audit/backups/revenuecat-sdk-20260927, preserving relative paths. Existing iOS minimum is15.0 and Swift5.0. Android minSdk24, compile/targetSdk36. Custom iOS SessionBridgeViewController registers SessionAudioPlugin; Android MainActivity registers SessionAudioPlugin. Android launchMode remains singleTask pending an explicitly reviewed singleTop change and native auth/audio checks.

Official installation reference: https://www.revenuecat.com/docs/getting-started/installation/capacitor

The docs prescribe npm install and cap sync. They also require Swift5+, In-App Purchase capability, and standard/singleTop Android launch mode for external payment verification. Capability and launch behavior are recorded for the billing activation unit, not changed here.

## Completed commands

All commands ran from the release checkout except the Gradle command, which ran in android. Network package resolution used approved escalated execution. No existing xcodebuild process was present before compilation.

```sh
npm install --save-exact @revenuecat/purchases-capacitor@13.6.1
npm run build
npx cap sync
DEVELOPER_DIR=/Users/matthew/Applications/Xcode.app/Contents/Developer /Users/matthew/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /Users/matthew/AgentWorkspace/regulated-device-check/ios-derived CODE_SIGNING_ALLOWED=NO build
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/matthew/Library/Android/sdk ./gradlew --no-daemon :app:assembleDebug
npm audit --omit=dev --json
git diff --check
```

Install, web build, cap sync, unsigned iOS simulator build, Android debug assemble and diff check passed. iOS log ends BUILD SUCCEEDED. Android log reports BUILD SUCCESSFUL in1m10s, 110 actionable tasks. No rebuild was needed. Npm audit exits1 because it reports two moderate production findings, react-router and react-router-dom. Both are present in the backed-up original lockfile; neither new RevenueCat package is listed. No fixes were installed.

## Evidence and artifacts

- .audit/revenuecat-install.log
- .audit/revenuecat-web-build.log
- .audit/revenuecat-cap-sync.log
- .audit/revenuecat-ios-build.log
- .audit/revenuecat-android-build.log
- .audit/revenuecat-npm-audit.json
- iOS app: /Users/matthew/AgentWorkspace/regulated-device-check/ios-derived/Build/Products/Debug-iphonesimulator/App.app
- Android APK: android/app/build/outputs/apk/debug/app-debug.apk

Tracked source/config changes are package.json, package-lock.json, android/capacitor.settings.gradle, android/app/capacitor.build.gradle, ios/App/CapApp-SPM/Package.swift and ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved. Generated ignored registration changes are ios/App/App/capacitor.config.json and android/app/src/main/assets/capacitor.plugins.json. Native public web assets and native build artifacts were regenerated. Other backed-up config files compare byte-for-byte unchanged, including capacitor.config.json, Android variables, both config.xml files and the Xcode project file.

The iOS graph resolved Capacitor8.5.2, purchases-hybrid-common19.3.1 and purchases-ios-spm5.90.2. Both generated platforms register PurchasesPlugin. Existing SessionAudio.swift still registers SessionAudioPlugin through SessionBridgeViewController, and Main.storyboard still names that controller. Android MainActivity still registers SessionAudioPlugin. Their source files were not modified.

A newly generated android/.kotlin cache was moved aside, not deleted, to .audit/backups/revenuecat-sdk-20260927/generated-build-cache/kotlin. Fourteen original config/package files were backed up before installation/sync, preserving relative paths.

## Warnings and limits

The web build retains its bundle-size warning. Android reports third-party Amazon SDK D8 stack-map warnings and a RevenueCat deprecated Amazon sync method warning; compilation completed. iOS reports skipped AppIntents metadata extraction because no AppIntents dependency exists. These do not establish runtime purchase behavior.

No SDK configure call, app identity binding, offerings, purchase/restore UI, server entitlements, payment flow or product catalog was added. No RevenueCat credentials, live service action, migration, production signing, push or deployment occurred. The Android artifact is the requested ordinary debug build; iOS signing was explicitly disabled. No app was installed/launched or store purchase attempted.

Android launchMode remains singleTask. RevenueCat's standard/singleTop requirement and the iOS In-App Purchase capability remain activation reviews. Native minimum targets and Swift version are unchanged.

All install/build/audit sessions completed. The single-use Gradle build daemon exited. Existing Gradle daemon PID59924 predates this unit, starting09:04:16, and was left untouched. No task-started build process remains. Changes are uncommitted for parent review.
