import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// Vercel sets env vars WITHOUT the VITE_ prefix (SUPABASE_URL, STRIPE_PUBLIC_KEY, etc.)
// but Vite's env plugin only exposes VITE_-prefixed vars to the browser via import.meta.env.
//
// Fix: Before Vite's env plugin runs, copy the Vercel-style names into VITE_-prefixed
// process.env entries. Vite then picks them up natively.
// ---------------------------------------------------------------------------

console.log('=== [vite.config] BUILD-TIME env diagnostics ===')
console.log('NODE_ENV:                 ', process.env.NODE_ENV)
console.log('VERCEL:                   ', process.env.VERCEL || '(not set — local build)')
console.log('VERCEL_ENV:               ', process.env.VERCEL_ENV || '(not set)')
console.log('--- Checking source env vars ---')
console.log('SUPABASE_URL:             ', process.env.SUPABASE_URL        || '(NOT SET)')
console.log('SUPABASE_ANON_KEY:        ', process.env.SUPABASE_ANON_KEY   ? `set (${process.env.SUPABASE_ANON_KEY.length} chars, prefix: ${process.env.SUPABASE_ANON_KEY.slice(0, 20)}…)` : '(NOT SET)')
console.log('STRIPE_PUBLIC_KEY:        ', process.env.STRIPE_PUBLIC_KEY   ? `set (prefix: ${process.env.STRIPE_PUBLIC_KEY.slice(0, 12)}…)` : '(NOT SET)')
console.log('STRIPE_PRICE_MONTHLY:     ', process.env.STRIPE_PRICE_MONTHLY || '(NOT SET)')
console.log('STRIPE_PRICE_ANNUAL:      ', process.env.STRIPE_PRICE_ANNUAL  || '(NOT SET)')
console.log('APP_URL:                  ', process.env.APP_URL              || '(NOT SET)')
console.log('GA_MEASUREMENT_ID:        ', process.env.GA_MEASUREMENT_ID    || '(NOT SET)')
console.log('STRIPE_SECRET_KEY:        ', process.env.STRIPE_SECRET_KEY    ? `set (${process.env.STRIPE_SECRET_KEY.length} chars)` : '(NOT SET)')
console.log('STRIPE_WEBHOOK_SECRET:    ', process.env.STRIPE_WEBHOOK_SECRET ? `set (${process.env.STRIPE_WEBHOOK_SECRET.length} chars)` : '(NOT SET)')
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? `set (${process.env.SUPABASE_SERVICE_ROLE_KEY.length} chars)` : '(NOT SET)')
console.log('RESEND_API_KEY:           ', process.env.RESEND_API_KEY       ? `set (${process.env.RESEND_API_KEY.length} chars)` : '(NOT SET)')
console.log('--- Mapping to VITE_ prefix ---')

if (!process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL
  console.log('  ✓ Mapped SUPABASE_URL → VITE_SUPABASE_URL')
} else if (process.env.VITE_SUPABASE_URL) {
  console.log('  ✓ VITE_SUPABASE_URL already set directly')
} else {
  console.log('  ✗ SUPABASE_URL missing — VITE_SUPABASE_URL will be empty')
}

if (!process.env.VITE_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  console.log('  ✓ Mapped SUPABASE_ANON_KEY → VITE_SUPABASE_ANON_KEY')
} else if (process.env.VITE_SUPABASE_ANON_KEY) {
  console.log('  ✓ VITE_SUPABASE_ANON_KEY already set directly')
} else {
  console.log('  ✗ SUPABASE_ANON_KEY missing — VITE_SUPABASE_ANON_KEY will be empty')
}

if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_PUBLIC_KEY) {
  process.env.VITE_STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY
  console.log('  ✓ Mapped STRIPE_PUBLIC_KEY → VITE_STRIPE_PUBLISHABLE_KEY')
} else if (process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  console.log('  ✓ VITE_STRIPE_PUBLISHABLE_KEY already set directly')
} else {
  console.log('  ✗ STRIPE_PUBLIC_KEY missing — VITE_STRIPE_PUBLISHABLE_KEY will be empty')
}

if (!process.env.VITE_STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_MONTHLY) {
  process.env.VITE_STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY
  console.log('  ✓ Mapped STRIPE_PRICE_MONTHLY → VITE_STRIPE_PRICE_MONTHLY')
}
if (!process.env.VITE_STRIPE_PRICE_ANNUAL && process.env.STRIPE_PRICE_ANNUAL) {
  process.env.VITE_STRIPE_PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL
  console.log('  ✓ Mapped STRIPE_PRICE_ANNUAL → VITE_STRIPE_PRICE_ANNUAL')
}
if (!process.env.VITE_APP_URL && process.env.APP_URL) {
  process.env.VITE_APP_URL = process.env.APP_URL
  console.log('  ✓ Mapped APP_URL → VITE_APP_URL')
}
if (!process.env.VITE_GA_MEASUREMENT_ID && process.env.GA_MEASUREMENT_ID) {
  process.env.VITE_GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID
  console.log('  ✓ Mapped GA_MEASUREMENT_ID → VITE_GA_MEASUREMENT_ID')
}

console.log('--- Final VITE_ values that will be baked into bundle ---')
console.log('VITE_SUPABASE_URL:           ', process.env.VITE_SUPABASE_URL          || '(EMPTY — sessions will fail)')
console.log('VITE_SUPABASE_ANON_KEY:      ', process.env.VITE_SUPABASE_ANON_KEY     ? `set (${process.env.VITE_SUPABASE_ANON_KEY.length} chars)` : '(EMPTY — sessions will fail)')
console.log('VITE_STRIPE_PUBLISHABLE_KEY: ', process.env.VITE_STRIPE_PUBLISHABLE_KEY ? `set (prefix: ${process.env.VITE_STRIPE_PUBLISHABLE_KEY.slice(0, 12)}…)` : '(EMPTY — payments will fail)')
console.log('VITE_STRIPE_PRICE_MONTHLY:   ', process.env.VITE_STRIPE_PRICE_MONTHLY  || '(EMPTY)')
console.log('VITE_STRIPE_PRICE_ANNUAL:    ', process.env.VITE_STRIPE_PRICE_ANNUAL   || '(EMPTY)')
console.log('VITE_GA_MEASUREMENT_ID:      ', process.env.VITE_GA_MEASUREMENT_ID     || '(EMPTY — Google Analytics will not track)')
console.log('=== [vite.config] End diagnostics ===')

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 3000, // PORT set by preview harness; 3000 locally
  },
  // Strip console noise from production builds only. Deliberately `pure`, not
  // drop:['console'] — drop would also erase console.error, which is the
  // error-logging standard (see stripe-webhook.js).
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug', 'console.warn'] }
    : {},
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
