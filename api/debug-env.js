// ---------------------------------------------------------------------------
// GET /api/debug-env
// Server-side env var diagnostic — shows which vars are set, never their values.
// DELETE THIS FILE before going fully public in production.
// ---------------------------------------------------------------------------

export default function handler(req, res) {
  const check = (key) => {
    const val = process.env[key]
    if (!val) return '✗ NOT SET'
    if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
      return `✓ set (${val.length} chars, prefix: ${val.slice(0, 10)}…)`
    }
    return `✓ ${val}`
  }

  const report = {
    timestamp: new Date().toISOString(),
    vercel: {
      VERCEL: process.env.VERCEL || '(not set)',
      VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    },
    frontend_vars_need_to_be_set_at_build_time: {
      note: 'These must be set in Vercel before deploying — they get baked into the JS bundle',
      SUPABASE_URL:        check('SUPABASE_URL'),
      SUPABASE_ANON_KEY:   check('SUPABASE_ANON_KEY'),
      STRIPE_PUBLIC_KEY:   check('STRIPE_PUBLIC_KEY'),
      STRIPE_PRICE_MONTHLY: check('STRIPE_PRICE_MONTHLY'),
      STRIPE_PRICE_ANNUAL:  check('STRIPE_PRICE_ANNUAL'),
      APP_URL:             check('APP_URL'),
    },
    serverside_vars_for_api_functions: {
      note: 'These are read at runtime by serverless functions — do not need VITE_ prefix',
      STRIPE_SECRET_KEY:         check('STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET:     check('STRIPE_WEBHOOK_SECRET'),
      SUPABASE_SERVICE_ROLE_KEY: check('SUPABASE_SERVICE_ROLE_KEY'),
      RESEND_API_KEY:            check('RESEND_API_KEY'),
      FROM_EMAIL:                check('FROM_EMAIL'),
    },
  }

  return res.status(200).json(report)
}
