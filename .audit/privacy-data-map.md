# Regulated data map for store forms and deletion

This is a source note for review, not a published privacy policy. It describes the app on the store release branch and source schema. Check production settings and service retention before making public claims.

| Data | Where the code puts it | What still needs checking |
|---|---|---|
| Sign-in email and account ID | Supabase Auth and `profiles`; a separate legacy `users` row may hold the email | Auth retention, email template and account deletion steps |
| Subscription and payment references | Stripe, `subscriptions`, and future verified `store_entitlements` | Which order and tax records must be retained; what happens to renewal after account deletion |
| Custom audio request text, email and delivered audio path | Stripe metadata, `custom_orders`, Resend confirmation and Supabase Storage | Whether source text remains in Stripe, email or backups, and when each copy can be removed |
| Session completion and optional mood score | `session_completions` has email, mood values and time; the app also keeps playback progress locally | Current production access rules and retention |
| Check-in state and other product events | `events` holds an event name and short properties; the check-in sends its selected state | Service logs and whether store privacy forms treat this as health data |
| Session waiting list | `session_waitlist` has email and session ID; Resend sends a notice | Removal after notice and unsubscribe or deletion process |
| Local app state | Browser or device storage has saved email, progress, completed sessions, program day and Supabase session | Clear on account deletion and sign-out where appropriate |

The first store release does not include the unfinished education branch. That branch has separate course, homework and message data that must be mapped if it is later released.

Apple requires an in-app path to start deleting the account and associated personal data, with clear billing guidance. Google also requires a public web path that works after the app is uninstalled. Both allow retention that the business is legally required to keep, but the public wording must explain it. A manual deletion process can take time if the user is told what to expect. Sources: [Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Google](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Next: verify production data stores and backups, choose a reviewed retention rule, then build an in-app request flow and a public web path. Do not delete customer data or publish retention promises from this source note.
