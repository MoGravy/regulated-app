import { createClient } from '@supabase/supabase-js'
import { setNativeCors } from './_native-cors.js'
import { eventData } from '../src/lib/eventData.js'

// Direct API callers receive the same strict payload filter as the app.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  setNativeCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { name, props } = req.body || {}
  const data = eventData(name, props)
  if (!data) return res.status(400).json({ error: 'Unknown event' })
  const { error } = await supabase.from('events').insert(data)
  if (error) {
    console.error('[track] insert failed')
    return res.status(500).json({ error: 'Could not record event' })
  }
  return res.status(204).end()
}
