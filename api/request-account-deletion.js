import { createClient } from '@supabase/supabase-js'
import { callerUser } from './_identity.js'
import { setNativeCors } from './_native-cors.js'

export async function handleRequest(req, res, supabase) {
  setNativeCors(req, res)
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await callerUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'Sign in required' })

    const { error: writeError } = await supabase
      .from('account_deletion_requests')
      .upsert({ account_id: user.id }, { onConflict: 'account_id', ignoreDuplicates: true })
    if (writeError) throw writeError

    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, requested_at')
      .eq('account_id', user.id)
      .single()
    if (error || !data) throw error || new Error('Missing receipt')

    return res.status(200).json({
      requestId: data.id,
      status: 'requested',
      requestedAt: data.requested_at,
    })
  } catch {
    return res.status(500).json({ error: 'Could not record the request' })
  }
}

export default function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  return handleRequest(req, res, supabase)
}
