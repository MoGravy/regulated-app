import { createClient } from '@supabase/supabase-js'

// Code handoff item 6. One anonymous row per event. The name has to be one
// the app defines, and props keep only short plain values, so nothing
// personal can ride along even by accident.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const NAMES = new Set([
  'session_started', 'session_completed', 'session_abandoned',
  'custom_audio_order_started', 'custom_audio_order_completed',
  'premium_upgrade_started', 'premium_upgrade_completed',
  'mood_tracked', 'checkin_tap', 'session_checkout', 'onboarding_completed',
])

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { name, props } = req.body || {}
  if (!NAMES.has(name)) return res.status(400).json({ error: 'Unknown event' })
  const clean = {}
  for (const [k, v] of Object.entries(props || {}).slice(0, 8)) {
    if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v
    else if (typeof v === 'string' && !v.includes('@')) clean[k] = v.slice(0, 120)
  }
  const { error } = await supabase.from('events').insert({ name, props: clean })
  if (error) {
    console.error('[track] insert failed:', JSON.stringify(error))
    return res.status(500).json({ error: 'Could not record event' })
  }
  return res.status(204).end()
}
