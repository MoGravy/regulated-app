# Native audio design candidates

## Grounding

SessionPlayer currently owns HTML audio. Only ended enters COMPLETE, then CHECKOUT, and checkout records completion. Native playback must preserve that order. React StrictMode is active. Route parameter changes can reuse the player. iOS SceneDelegate directly creates CAPBridgeViewController, so a custom plugin must be registered in both the scene and storyboard entry paths. Existing signed audio API remains the authority. No URL may be persisted or logged.

Two free dependencies were audited without installation. Mediagrid lacks a retained ended snapshot and adequate error reporting, and resumes iOS interruptions unconditionally. Capgo lacks an Android foreground playback service, has no retained ended/error snapshot, and can emit completion from stop. Neither is selected unmodified. A final source reread using a hash was refused by the local secret-shaped command guard; that resource was not retried.

## Candidate A: cross-platform audio adapter

One audio abstraction for web and native, exposing start/play/pause/seek/stop/snapshot/acknowledgeEnd. Native owns AVPlayer or Media3 service, while the web adapter owns Audio. Snapshot has playbackId, sessionId, state, positionSeconds, durationSeconds, endToken and errorCode. End token is produced only by actual natural end, retained until checkout acknowledgment. Persist IDs, position and outcome but never URL; process recovery fetches a fresh source URL. SessionPlayer reconciles on mount/resume. Android has service plus thin plugin; iOS singleton coordinator plus thin plugin.

Benefits: consistent interface; recoverable process-level progress; explicit end acknowledgment. Costs: broader migration of web path, persistent terminal-state protocol and more files; program-day increment idempotence would need repair because repeated checkout can advance twice.

## Candidate B: native session owner plus React hook

One useSessionPlayback hook selects native or existing browser Audio behavior. Native owns a session snapshot: token, sessionId, revision, status, position, duration and outcome (ended serial or safe failure code). open returns promptly before network preparation; command(play/pause/seek), snapshot and close require the token. Every callback verifies token and current item. Each result/event has an increasing revision. JS accepts only its token and newer revisions, reads on foreground and never estimates background time. Events are hints; retained state is truth.

One Android MediaSessionService owns ExoPlayer and media controls. A thin Capacitor bridge communicates with it. One Swift file can contain the plugin and process-owned AVPlayer owner. A custom bridge controller is used by SceneDelegate and storyboard. Hook serializes lifecycle calls, registers listeners before open, and closes only its own token. Preparation does not block the command chain. Close samples native position before teardown. Old close cannot stop a replacement. StrictMode creates separate tokens. Source URL remains memory only.

The first version retains terminal state in memory across JS suspension, not across process death. Do not advertise process-death recovery. Pause after interruptions/headphone removal; user explicitly resumes. Disable remote replay once ended, since replay creates a new attempt from the app. Web completion behavior remains equivalent. A route identity boundary resets mood/source/workflow state so old media cannot attach to a new route.

Benefits: smaller domain contract, no synchronous HTMLAudio emulation, no new persistent acknowledgment protocol. Costs: two native playback implementations and lifecycle tests. Native compile and locked-device tests still mandatory.

## Rubric

1. Only genuine end may trigger completion.
2. Failure and interruptions cannot appear complete or still playing.
3. Background media controls and retained state work without JS.
4. Minimal owned code and clear lifecycle.
5. Verifiable on Android and iOS, with limits stated.

Parent and independent judge select B. Use native token and revision matching, retained natural-end or safe failure outcome, and conservative pause after interruption. Do not add process-death persistence. Implementation is the next unit. Seek-to-end, stop, failure and replacement must never count as a completed listen.
