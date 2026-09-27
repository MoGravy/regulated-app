# Premium refresh correctness unit

- [x] Ground
- [x] Sketch
- [x] Agree
- [x] Implement
- [x] Scrap

Parent reproduced a paid checkout return while signed out showing You have premium. Local mocked browser test expected zero premium headings and found one. No real payment or customer write occurred.

Candidate A uses a stable imperative refreshPremium promise inside AppProvider. Candidate B uses an effect keyed by account and refresh version, plus a ticket completion effect in Premium. Independent billing_ground judge chose A because callers already await restore completion. Keep identity and token in one captured Supabase session; do not change the server response contract.

Public shape: refreshPremium(): Promise<boolean | null>. Boolean means a current result committed. Null means superseded, account changed or provider unmounted. Current errors clear access and reject; obsolete errors are ignored. Remove the raw setIsPremium context setter. checkSubscription(expectedAccountId) reads one session, checks its user ID, sends that session's token, and accepts only a boolean active result.

Auth adoption synchronously invalidates old work. A late initial session read cannot replace a newer auth event. New refreshes, sign-out and unmount invalidate earlier responses. Payment receipt confirmation remains separate from access. Preserve guest checkout and signed-out magic-link restore. No new customer copy, provider, products, migration or deployment.

## Throughput checkpoint

- Blocking first steps. Read-only grounding, distinct design candidates and independent judge complete. Parent browser reproduction fails for the intended access assertion.
- Independent workstreams. One code owner implements the coupled access state. Parent continues account verification and Xcode setup outside the checkout.
- Shared mutable state. Exclusive release branch ownership during implementation; parent does not edit or run suites there until handback.
- Smallest safe decomposition. One owner for provider, helper, consumers and regression cases because they share one identity and revision contract.

Required checks cover signed-out or wrong-account checkout, current false/error clearing access, old responses after account change or sign-out, newer refresh winning, stale error silence, delayed initial auth, mismatched session rejection and malformed response rejection. Reuse existing test tools and preserve server audio authority.

## Outcome

The failing checkout reproduction is preserved in local commit 20d0118. AppProvider now owns refreshPremium with account, request revision, auth revision and mounted lifetime checks. Auth adoption and sign-out invalidate pending checks synchronously. A delayed initial session cannot undo a newer auth event or sign-out. Current false/error results revoke access; obsolete results return null without changing access or reporting an error.

checkSubscription captures one Supabase session, matches the expected account, and sends that session's token and email. Non-boolean active responses reject. Success confirms the payment separately and asks the provider to refresh access. Premium restore uses the same refresh and ignores obsolete results. The raw access setter and redundant restore email write are removed.

Verification: eight local mocked Playwright checks passed, including the original signed-out paid-return reproduction, wrong-account paid return, guest magic-link and checkout preservation, and provider lifetime/auth/request races. All payment/auth/profile traffic in these checks is mocked. The provider tests bundle the actual React provider and subscription helper with a fixture Supabase client; they do not duplicate the state algorithm. Production build passed with the existing bundle-size warning. git diff --check passed.

Limits: no live billing, provider setup, products, migration, API contract change, push or deployment. Existing Success page welcome/access wording was left unchanged under the no-new-copy scope and still needs separate review for signed-out receipt confirmations. No new dependency or production abstraction was added.
