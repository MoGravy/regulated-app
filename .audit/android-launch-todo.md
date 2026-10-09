# Android launch mode

## Throughput checkpoint
- Blocking first steps: source trace and official RevenueCat docs.
- Independent stream: parent private-policy work outside checkout.
- Shared state: exclusive checkout ownership.
- Smallest decomposition: single worker because manifest and runtime test are coupled.

## Initial grounding
- RevenueCat requires standard or singleTop for bank-app purchase verification return. Official installation docs checked on 28 September 2026.
- MainActivity inherits intent forwarding from Capacitor. Bridge forwards intents to plugins; AppPlugin emits appUrlOpen. Native auth ignores a URL without a code.
- Choose singleTop to keep top-activity reuse. Existing manifest still singleTask.
- Backup saved unchanged under .audit/backups/android-launch-20260928/AndroidManifest.xml.
- Existing native auth URL node test passed.
- Existing emulator is emulator-5554, Regulated_API_36. No runtime changes made. Wifi and mobile data settings both reported 1.

## Initial blocker, resolved
- The safety hook rejected the test source write before any mutation.
- Parent received narrow owner approval for the test path and method name, then adjusted the guard. The exact original command still failed on retry, reporting the same 47-character secret-shaped string.
- No alternate tool, encoding, name or path used to bypass refusal. Parent informed to check the exception.
- No build or real bank/store/auth transaction performed.

## Completed
- Owner-approved exact absolute test-file write succeeded after parent clarified the file-specific exception. Separately refused skill path was not retried.
- Test shape is an installed ActivityInfo launch mode plus a test-only Capacitor plugin probe registered at CREATED. MainActivity is sent to background, then receives a dummy auth VIEW intent with no code/token. Probe confirms the same activity receives the URL through inherited Capacitor forwarding.
- Initial probe registered at RESUMED and failed because Capacitor registers activity-result launchers before STARTED. Moved test registration to CREATED; no production Java changes.
- Corrected baseline had 2 tests with 1 expected failure: installed launch mode was 2 (singleTask), expected 1 (singleTop). Background return behavior passed. Evidence: android-launch-before-test.log.
- Changed one production manifest attribute to singleTop.
- Debug and instrumentation build passed. Evidence: android-launch-after-build.log.
- Post-change lifecycle tests and existing SessionAudioTest passed, 3 tests total. Evidence: android-launch-after-test.log.
- Existing native auth URL check passed: `node --test src/lib/nativeAuthUrl.test.mjs`.
- `git diff --check` passed. Test/comment review found no new production abstraction or comments to remove.

## Commands and environment
- Build from checkout: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/matthew/Library/Android/sdk ./android/gradlew -p android --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest`.
- Build logs: android-launch-before-build.log, android-launch-fixture-build.log, android-launch-after-build.log.
- Installed both debug APKs with `adb -s emulator-5554 install -r`. No uninstall or data reset.
- Baseline: `adb -s emulator-5554 shell am instrument -w -e class co.regulatedapp.app.BillingReturnTest co.regulatedapp.app.test/androidx.test.runner.AndroidJUnitRunner`.
- Final: same instrumentation command with `-e class co.regulatedapp.app.BillingReturnTest,co.regulatedapp.app.SessionAudioTest`.
- adb executable: /Users/matthew/Library/Android/sdk/platform-tools/adb.
- Existing Regulated_API_36 emulator used. Wifi/mobile data disabled for all instrumentation and restored to original enabled values (both 1). App force-stopped before network restoration. No physical device commands, emulator wipe or new runtime.

## Limits and handback
- Tests verify merged launchMode, same-activity background return and native bridge forwarding. They do not execute a banking app, Google Play purchase, RevenueCat transaction or real auth exchange.
- JavaScript appUrlOpen/auth handling was traced in source and URL parser tested separately; the instrumentation probe observes native plugin delivery, not a completed JS auth exchange.
- Before/after evidence detects manifest compliance and preserves return/audio behavior. It does not reproduce a real bank purchase cancellation.
- No live settings, credentials, dependency, native target or billing enablement changed. No commit/push/deploy.
- All task build/instrumentation processes finished. Existing emulator and adb server remain available; test app stopped.
- Preexisting audit TSV, deletion todo and previous backup contents preserved. Parent owns MEMORY/vault updates.
