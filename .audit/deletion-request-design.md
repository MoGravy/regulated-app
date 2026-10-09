# Deletion request receipt

This local unit records a signed-in account's deletion request. It does not delete the account, contact anyone or cancel a subscription. Do not activate the endpoint before an operator can receive and fulfil requests and the public wording has been reviewed.

## Request contract

`POST /api/request-account-deletion` takes the existing bearer session and no identity fields. Supabase verifies the caller through `callerUser`. The response is `{ requestId, status: 'requested', requestedAt }` after the database confirms the saved row. Retrying returns the original receipt. A failed write or read returns a generic error. Responses are not cached.

The service-only `account_deletion_requests` table contains a generated ID, the verified account UUID and the first server timestamp. Its unique account constraint handles concurrent repeats. Direct anon and authenticated role access is revoked and RLS is enabled. There is no public lookup, email snapshot, reason field or speculative processing state.

## Design decision

Model the Domain shaped this unit as one pending receipt per account. Candidate A's separate table avoids changing existing profile access rules. Candidate B placed a timestamp in profiles, which would need a new guard and RPC because users can update their own profiles. The independent judge selected A on identity, privacy, semantics and impact. Both candidates agreed on verified identity and stable retries. No profile field or RPC was grafted.

The foreign key intentionally uses the default NO ACTION rule. The eventual deletion process must reconcile this receipt and the existing store entitlement dependency before deleting Auth. This is not a retention policy. Processing, billing handling and retention remain release work.

## Request screen

The local `/delete-account` route is reachable without onboarding, including from a browser after the app is uninstalled. Signed-out visitors use the existing sign-in screen, then the account page links back to the deletion request. Signed-in users confirm their account before submission. The form checks that the active session still belongs to the displayed account. An account change remounts the form with fresh state. A failure offers retry; only a valid saved receipt shows success.

UI wording was authored by verified OpenCode Go `opencode-go/glm-5.3` session `ses_f229d693effehwZGdP7eCqgkyP`, then edited with Matthew, Hermes and unslop guidance. It makes no processing-time or retention promise. The earlier email-based copy draft is superseded by this signed-in web path. No unverified support inbox is used.

## Verification

`node --test tests/deletion-request.check.mjs` checks missing or invalid sessions, forged body identity, separate accounts, repeated requests, database failures, preflight and unsupported methods.

`sh tests/deletion-rls.check.sh` uses a disposable Postgres 16 container with no network. It applies the migration twice and checks client privileges, RLS, the original timestamp on retry and the Auth foreign key. The container is removed after the check. Neither check connects to production.

`npx playwright test tests/deletion.spec.js --reporter=list` checks public access, the account-page link, required confirmation, failed submission and successful retry. All account and request traffic is intercepted with fake data. The phone-width receipt screenshot was visually inspected.
