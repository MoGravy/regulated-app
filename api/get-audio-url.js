import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'sessions'
const SIGNED_URL_TTL = 7200 // 2 hours

// Extract the storage object path from a stored audio_url, e.g.
// https://<proj>.supabase.co/storage/v1/object/public/sessions/Foo.mp3   → Foo.mp3
// https://<proj>.supabase.co/storage/v1/object/sign/sessions/Foo.mp3?... → Foo.mp3
function storagePath(audioUrl) {
  const m = audioUrl.match(/\/object\/(?:public|sign)\/sessions\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sessionId, email } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, free, audio_url')
      .eq('id', sessionId)
      .single()

    if (error || !session) return res.status(404).json({ error: 'Session not found' })
    if (!session.audio_url) return res.status(404).json({ error: 'Session has no audio yet' })

    // ALL sessions get a freshly signed short-lived URL — stored URLs are
    // treated as storage-path carriers only. Never trust a baked token: the
    // June 2026 outage was a rotated signing key invalidating year-old tokens.
    // Free sessions skip the subscription check; premium requires one.
    if (!session.free) {
      // Premium: require an active, unexpired subscription for this email.
      // ponytail: email is the app's only identity (no auth layer) — knowing a
      // subscriber's email unlocks audio. Upgrade path: real auth (Supabase Auth).
      if (!email) return res.status(401).json({ error: 'email required' })
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_email', String(email).toLowerCase().trim())
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
        .maybeSingle()

      if (!sub) return res.status(403).json({ error: 'Active subscription required' })
    }

    const path = storagePath(session.audio_url)
    if (!path) {
      console.error('[get-audio-url] Unrecognized audio_url format for session', sessionId)
      return res.status(500).json({ error: 'Audio misconfigured. Contact support.' })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL)

    if (signErr || !signed?.signedUrl) {
      console.error('[get-audio-url] signing failed:', JSON.stringify(signErr, Object.getOwnPropertyNames(signErr || {})))
      return res.status(500).json({ error: 'Could not generate audio link' })
    }

    return res.status(200).json({ url: signed.signedUrl })
  } catch (err) {
    console.error('[get-audio-url] error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return res.status(500).json({ error: 'Internal error' })
  }
}
