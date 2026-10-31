import { createClient } from '@supabase/supabase-js'
import { callerUser } from './_identity.js'
import { hasPremiumAccess } from './_access.js'
import { setNativeCors } from './_native-cors.js'

// The browser cannot read purchase rows. This uses the same server access
// check as the premium audio gate.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  setNativeCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = await callerUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'Sign in required' })
    return res.status(200).json({ active: await hasPremiumAccess(supabase, user) })
  } catch (err) {
    console.error('[check-subscription] error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return res.status(500).json({ error: 'Internal error' })
  }
}
