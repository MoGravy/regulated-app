import { createClient } from '@supabase/supabase-js'

// The subscriptions table is RLS-locked, so the browser's public key can never
// see a row. This answers the one question the app asks, with the same key the
// webhook wrote the row with. Same query as get-audio-url's premium gate.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const email = String(req.body?.email || '').toLowerCase().trim()
  if (!email) return res.status(400).json({ error: 'email required' })

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_email', email)
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .limit(1)
      .maybeSingle()
    if (error) throw error
    // ponytail: email is the app's only identity, same as get-audio-url. Real
    // sign-in is the next phase; this endpoint then keys on the session user.
    return res.status(200).json({ active: !!data })
  } catch (err) {
    console.error('[check-subscription] error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return res.status(500).json({ error: 'Internal error' })
  }
}
