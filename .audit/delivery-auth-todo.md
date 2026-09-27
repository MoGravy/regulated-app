# Delivery admin authentication

- [ ] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
- [ ] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` command. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
- [ ] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
- [ ] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
- [ ] Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
- [ ] Run **Opening a PR**.

## Evidence
Parent reproduced locally with the real handler source in a VM and stubbed database/email dependencies. No network or actual environment secrets. With ADMIN_SECRET absent, a request containing the documented source placeholder reached the database stub and returned500 instead of401. Tests also cover empty configuration, omitted secret, wrong supplied value and valid configured value reaching400 request validation without a customer query.

Root cause is the explicit default placeholder and missing configured-value guard in api/deliver-audio.js. Only README admin-script examples call this endpoint in source. No signature change or public copy change required. Production configuration has not been inspected, so no live exposure is claimed.

Scope: remove fallback and require a configured secret before comparing supplied value. Preserve everything else. Copy/template error handling and retention are separate concerns. Failing check committed before implementation. Parent will independently rerun the same handler check and review diff. Opening a PR is deferred while local release units are prepared; no production deployment.
