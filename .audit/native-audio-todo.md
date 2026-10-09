# Native playback unit

- [x] Ground
- [x] Sketch
- [x] Agree
- [x] Implement
- [x] Scrap. No candidate package was installed.

## Arena

- [x] Frame
- [x] Fan out
- [x] Cross-judge
- [x] Pick
- [x] Graft
- [ ] Verify

Data shape: one active session source and a native snapshot with status, position, duration and a retained completion serial. Only natural end may advance the session. A paused, stopped, buffering or failed player is never complete. Signed URLs remain short-lived and never logged or persisted.

Grounding: SessionPlayer owns HTML audio today. Completion triggers its checkout flow, which separately records completion after the user answers. Closing unmounts the player and saves progress. Preview audio belongs to SessionRow. The free mediagrid and Capgo candidates have native error/retained-end gaps. See audio grounding agent findings in current chat; neither is installed.

Rubric: truthful natural-end completion; errors and interruptions recover safely; background controls work without JavaScript; minimal maintained ownership; verifiable Android and iOS compilation and device tests.

Throughput checkpoint: compare two read-only native ownership designs while Google registration and Android emulator setup continue. Parent is the sole implementation owner. No production changes.

## Implementation throughput checkpoint

- Blocking first steps. Grounding, two candidate designs and independent judge complete. B selected. Android SDK and emulator work; iOS compile waits for Xcode domain permission.
- Independent workstreams. One code owner holds the isolated store branch. Parent continues account setup and tests the already-installed baseline APK outside the worktree.
- Shared mutable state. Exclusive branch ownership until implementation handback. Parent does not edit or run builds in the delegated worktree.
- Smallest safe decomposition. One owner for the hook and both native implementations because they share one token/revision/outcome contract.

## Earlier partial checkpoint, 2026-09-27

The guard blocks in this section were resolved by explicit owner approval and narrow, tested exceptions. The completed implementation checkpoint below is current.

- [x] One playback hook and route identity boundary.
- [x] Token and revision filtering, serialized setup/cleanup, retained outcome reconciliation.
- [x] Android Media3 service, local Capacitor bridge, registration and media permissions.
- [x] Exact Android HTTPS localhost origin added to the shared native CORS allowlist.
- [x] Browser failure and seek-to-end cannot complete. Short preview path is unchanged.
- [x] Capacitor and Media3 logging disabled because bridge arguments can contain signed URLs.
- [x] Five runnable lifecycle checks and existing local checks pass. Production web build passes.
- [ ] Swift owner source and startup registration. Local secret-shaped identifier guard rejected source and Xcode project writes before execution. Parent is resolving exact permission. No bypass attempted.
- [ ] Android instrumentation source. Same guard rejected a long ordinary identifier before execution. Test source was not written. Parent has exact proposed path and identifier in chat.
- [ ] Real background, lock-screen and interruption behavior. Android baseline guest audio request fails at the live server CORS policy. Local CORS changes are not deployed. No device audio success claimed.
- [ ] iOS compilation and device verification. Xcode is unavailable and source write is blocked.

Only Android has a native implementation on disk. The hook selects native on both platforms, so this partial tree must not be released for iOS until its bridge is implemented. Terminal state remains in process memory only. No signed URL is persisted. Config backups are in .audit/backups/native-audio.

Official references checked during implementation:

- https://developer.android.com/jetpack/androidx/releases/media3
- https://developer.android.com/media/media3/session/background-playback
- https://developer.android.com/reference/androidx/media3/common/audio/AudioManagerCompat
- https://developer.android.com/reference/androidx/media3/common/audio/AudioFocusRequestCompat.Builder
- https://capacitorjs.com/docs/ios/custom-code
- https://developer.apple.com/documentation/avfoundation/avplayeritem/didplaytoendtimenotification

Media3 exoplayer and session are pinned to 1.9.3. The official release notes list it as a stable release. A newer stable release exists. This unit does not claim latest-version coverage.

Final local verification at handback. Android assembleDebug and lintDebug passed after replacing platform-only audio focus with Media3 compatibility APIs and adding the required unstable API opt-in. Lint has no errors; existing resource/dependency warnings remain. The debug APK includes the final web bundle and logging configuration. Diff whitespace check passed. Deslop pass removed avoidable comment noise and simplified snapshot status handling. No local commit or push was made. Parent owns independent review and the MEMORY/vault milestone.

Runnable checks:

- node --test src/lib/*.test.mjs src/config/*.test.mjs api/_native-cors.test.mjs
- npm run build
- npx cap sync android
- JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/matthew/Library/Android/sdk ./android/gradlew -p android :app:assembleDebug :app:lintDebug --console=plain

Android APK is android/app/build/outputs/apk/debug/app-debug.apk. Build log is /private/tmp/regulated-native-audio-build.log. Gradle requires approved execution outside the filesystem sandbox because its lock service uses a local socket.

Parent review correction. The playback toggle treats buffering as active play intent, so the user can pause while audio loads. Saved progress is sampled on close, but playback does not restore a saved start position. Do not advertise resume recovery.

Handback is ready. Parent review buffering correction and two comment removals are applied. The final web bundle, Android sync and debug APK build pass. Android lint passed before these JavaScript-only corrections. No source, build or test process remains running in this checkout. Code ownership returns to the parent with changes uncommitted.


## Completed implementation checkpoint, 2026-09-27

- [x] Swift AVPlayer owner and Capacitor bridge written after the owner approved exact ordinary source identifier exceptions. Both the scene and storyboard startup paths now use SessionBridgeViewController. The Swift source is included in the Xcode target, and background audio is enabled.
- [x] Swift remote commands run synchronously on main. They cannot remain queued asynchronously across an app-driven replacement. Native item callbacks verify the attempt token and current item.
- [x] Android forwarding controls now also verify their player/token ownership before acting.
- [x] Android instrumentation source written through the approved path. It uses a generated four-second silent WAV in app cache and the existing Android test dependencies. HTTPS validation on the production plugin is unchanged.
- [x] Actual emulator test passed in 8.881 seconds. It exercised replacement and stale close, pause, seek-to-end, explicit resume, audio-focus interruption with no automatic resume, natural end while the activity is backgrounded, retained completion, increasing revision, native remote pause/resume in the background, remote seek-to-end and stop, close sampling, and safe retained playback failure.
- [x] Android assembleDebug, assembleDebugAndroidTest and lintDebug passed. Native test output is saved in .audit/native-audio-instrumentation.txt.
- [x] Swift syntax parse, plist and Xcode project structure checks passed. The iOS web assets and disabled logging configuration were copied with Capacitor.
- [ ] iOS app compilation and device test remain unverified because Xcode is unavailable. Syntax parsing is not a type check or an iOS build.
- [ ] Real locked-screen, headset removal, physical interruption and long network streaming tests remain outstanding. The instrumentation proves background native behavior with a local fixture, not those hardware cases.
- [ ] Live signed-audio flow remains blocked by the server CORS policy until approved deployment or staging. This unit makes no deployment.

Backups remain under .audit/backups/native-audio, including the prior generated iOS Capacitor config. No further guard refusal occurred after the approved exact exceptions. No commits or pushes were made. The earlier five JS lifecycle tests and CORS test still cover the unchanged hook contract. Resume from a saved start position and process-death recovery remain outside this implementation.

The Model the Domain principle shaped one token/revision/outcome snapshot shared by the hook and native owners. Deslop review found no new abstraction to remove. The parent owns independent review and durable MEMORY/vault records.

The completed Android test was run with the following command after installing the debug app and debug test APKs on emulator-5554:

```sh
/Users/matthew/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am instrument -w -r -e class co.regulatedapp.app.SessionAudioTest co.regulatedapp.app.test/androidx.test.runner.AndroidJUnitRunner
```

Its complete output is .audit/native-audio-instrumentation.txt. Build output is /private/tmp/regulated-native-test-build.log. Android lint report is android/app/build/reports/lint-results-debug.html. All processes completed before handback. Checkout ownership returns to the parent, with the complete unit uncommitted.
