# Regulated

Personalized nervous system regulation app by Matthew Tweedie.

**Live:** https://regulatedapp.co  
**Stack:** React + Vite → Vercel · Supabase · Stripe · Resend

---

## Three Revenue Streams

| Stream | Price | Notes |
|--------|-------|-------|
| Free sessions | $0 | No login required — 4 foundational sessions |
| Custom audio | $99 | One-time, 7-day turnaround, any user |
| Premium subscription | $149/yr founding rate or $19/mo | Full session library (13 and growing) |

---

## First-Time Setup

### 1. Clone and install

```bash
git clone https://github.com/yourhandle/regulated
cd regulated
npm install
```

### 2. Create a `.env.local` file

```bash
cp .env.example .env.local
```

Then fill in every value (see `.env.example` for descriptions).

### 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste contents of `supabase-schema.sql` → Run
3. Go to **Storage** → create a bucket called `audio`
   - Public: **off** (use signed URLs)
   - Allowed MIME: `audio/mpeg, audio/mp4, audio/wav`
4. Copy your **Project URL** and **anon key** into `.env.local`
5. Copy your **service role key** into `.env.local` (server-side only)

### 4. Set up Stripe

1. Create an account at [stripe.com](https://stripe.com)
2. In **Products**, create:
   - **Custom Audio** — one-time $99 (no price ID needed; checkout uses inline price)
   - **Premium Monthly** — recurring $19/month → copy price ID → `STRIPE_PRICE_MONTHLY`
   - **Premium Annual** — recurring $149/year (founding rate) → copy price ID → `STRIPE_PRICE_ANNUAL`
3. In **Developers → Webhooks**, add endpoint:
   - URL: `https://regulatedapp.co/api/stripe-webhook`
   - Events to listen: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
   - Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`

### 5. Set up Resend

1. Create an account at [resend.com](https://resend.com)
2. Add and verify your domain (`regulatedapp.co`)
3. Create an API key → `RESEND_API_KEY`
4. Set `VITE_FROM_EMAIL=hello@regulatedapp.co`

### 6. Run locally

```bash
npm run dev
```

App runs at `http://localhost:3000`.

To test API functions locally, use [Vercel CLI](https://vercel.com/docs/cli):
```bash
npm i -g vercel
vercel dev
```

---

## Deploying to Vercel

The Vercel project is linked to the GitHub repo. A push to `main` deploys production; every other branch gets a preview URL on its pull request. Do not run `vercel --prod` by hand.

In **Vercel Dashboard → Project → Settings → Environment Variables**, add every variable from `.env.example`.

Key ones needed in Vercel (not prefixed with VITE_):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_SECRET` (choose a strong random string)

---

## How to Add New Sessions

Fastest way: `node scripts/add-session.mjs ./anxiety-release.mp3 --title "Anxiety Release" --category Anxiety --duration 20 --description "Brief description"`. It uploads the file, writes the row with the right `audio_url`, and `--dry-run` shows what it would do first. Add `--free true` for a free session.

By hand:

1. Record your MP3 audio file.
2. Upload to Supabase Storage: **Storage → sessions → Upload file**. The bucket is `sessions` and the file sits at the root of it, not inside a folder.
3. Copy the file's URL (click the file, then **Copy URL**). It looks like `https://<project>.supabase.co/storage/v1/object/public/sessions/anxiety-release.mp3`.
4. In **Supabase → Table Editor → sessions**, click Insert Row:

| Field | Value |
|-------|-------|
| title | Anxiety Release |
| description | Brief description |
| category | Anxiety |
| tags | Optional extra categories, comma separated, e.g. `Sleep, Stress` |
| duration | 20 (whole minutes, just the number) |
| free | false |
| audio_url | the full URL from step 3 |

Things that break it:

- `audio_url` must be the full URL. A bare path like `sessions/anxiety-release.mp3` is rejected by the audio endpoint and the player shows "Audio misconfigured".
- `duration` is an integer of minutes, not `20:00` or `20 min`.
- Signed URL expiry does not matter. `api/get-audio-url.js` signs a fresh two hour URL on every play.

Sessions are listed in the order they were created. The app serves the new session to premium users as soon as the row is saved.

---

## How Matthew Processes Custom Orders

### Daily queue check

1. Open **Supabase → Table Editor → custom_orders**
2. Filter by `status = confirmed` — these are paid, waiting for recording
3. Review the `pattern`, `trigger`, `desired_state`, `affirmations` fields

### After recording

1. Upload MP3 to Supabase Storage: **Storage → audio → custom-audios → Upload**
   - Naming convention: `custom-audios/order-{id}-{email}.mp3`
2. Note the file path
3. Call the delivery API (automates the email):

```bash
curl -X POST https://regulatedapp.co/api/deliver-audio \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID_FROM_SUPABASE",
    "audioPath": "custom-audios/order-abc-user@email.com.mp3",
    "secret": "YOUR_ADMIN_SECRET"
  }'
```

This will:
- Update order status to `delivered` in Supabase
- Send the customer an email with a 30-day signed download link

---

## Analytics & Monitoring

### Key metrics to track (Supabase)

**Session engagement:**
```sql
select s.title, count(*) as completions, avg(sc.mood_after - sc.mood_before) as avg_mood_lift
from session_completions sc
join sessions s on s.id = sc.session_id
group by s.title
order by completions desc;
```

**Custom order volume:**
```sql
select date_trunc('week', created_at) as week, count(*), sum(75) as revenue
from custom_orders
where status != 'cancelled'
group by week
order by week desc;
```

**Premium conversion:**
```sql
select date_trunc('month', created_at) as month, count(*)
from subscriptions
where status = 'active'
group by month
order by month desc;
```

**Mood shift effectiveness:**
```sql
select avg(mood_after - mood_before) as avg_shift,
       count(*) as sessions
from session_completions
where mood_before is not null and mood_after is not null;
```

---

## Audio File Guidelines

- Format: MP3 (320kbps recommended, 128kbps minimum)
- Sessions: 10–30 minutes
- Custom audios: 20–30 minutes
- Start with ~2s silence to prevent clipping
- End with ~3s fade out
- Keep file size under 50MB (Supabase free tier limit per file)

---

## iOS App Store Submission

The app is a PWA-ready React app. To wrap it for iOS App Store:

1. Install [Capacitor](https://capacitorjs.com):
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Regulated co.regulatedapp.app
npm run build
npx cap add ios
npx cap sync
npx cap open ios
```

2. In Xcode: set bundle ID to `co.regulatedapp.app`, set version, add signing certificate
3. Add to `capacitor.config.ts`:
```ts
import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'co.regulatedapp.app',
  appName: 'Regulated',
  webDir: 'dist',
  server: { androidScheme: 'https' }
};
export default config;
```
4. Required assets (add to `public/`):
   - `apple-touch-icon.png` (180×180)
   - `icon-192.png`, `icon-512.png`
   - Privacy policy URL: `https://regulatedapp.co/privacy`
   - App Store screenshots: 6.7" (1290×2796), 6.1" (1179×2556), iPad 12.9" (2048×2732)

---

## Environment Variables Reference

| Variable | Where used | Required |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | Frontend + API | ✓ |
| `VITE_SUPABASE_ANON_KEY` | Frontend | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | ✓ |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Frontend | ✓ |
| `STRIPE_SECRET_KEY` | API only | ✓ |
| `STRIPE_WEBHOOK_SECRET` | Webhook handler | ✓ |
| `STRIPE_PRICE_MONTHLY` | API only | ✓ |
| `STRIPE_PRICE_ANNUAL` | API only | ✓ |
| `RESEND_API_KEY` | API only | ✓ |
| `VITE_FROM_EMAIL` | API | ✓ |
| `VITE_APP_URL` | API (Stripe redirects) | ✓ |
| `ADMIN_SECRET` | deliver-audio endpoint | ✓ |

---

## Project Structure

```
regulated/
├── src/
│   ├── pages/
│   │   ├── Home.jsx          ← Free sessions + progress + upsells
│   │   ├── Sessions.jsx      ← Full library with category filter
│   │   ├── SessionPlayer.jsx ← Audio player + mood tracking
│   │   ├── CustomAudio.jsx   ← Order form + Stripe checkout
│   │   ├── Premium.jsx       ← Pricing + subscription
│   │   ├── Success.jsx       ← Post-payment confirmation
│   │   └── Onboarding.jsx    ← First-launch flow
│   ├── components/
│   │   ├── Navigation.jsx    ← Bottom tab bar
│   │   ├── SessionCard.jsx   ← Reusable session tile
│   │   ├── MoodTracker.jsx   ← Pre/post session mood input
│   │   └── Toast.jsx         ← Notification system
│   ├── hooks/
│   │   ├── useApp.js         ← Global state (email, premium, completions)
│   │   └── useLocalStorage.js
│   ├── lib/
│   │   ├── supabase.js       ← DB + storage helpers
│   │   └── analytics.js      ← Event tracking
│   ├── App.jsx               ← Router
│   └── index.css             ← Design tokens + global styles
├── api/
│   ├── create-checkout.js    ← Stripe checkout session creator
│   ├── stripe-webhook.js     ← Payment events handler
│   ├── verify-session.js     ← Post-payment verification
│   └── deliver-audio.js      ← Custom audio delivery trigger
├── supabase-schema.sql       ← Full DB schema + seed data
├── vercel.json               ← Routing + CORS headers
└── .env.example              ← All required env vars documented
```
