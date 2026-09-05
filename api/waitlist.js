import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Code handoff item 8. "Notify me when this session is ready" on a session
// with no audio yet. One row per (session, email); the confirmation is tagged
// by session so Resend can answer "who is waiting on what".
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.VITE_FROM_EMAIL || 'hello@regulatedapp.co'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { session_id, email } = req.body || {}
  const to = String(email || '').toLowerCase().trim()
  if (!session_id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'A session and a valid email are required' })
  }

  try {
    const { data: session, error: lookupError } = await supabase
      .from('sessions')
      .select('id, title')
      .eq('id', session_id)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!session) return res.status(404).json({ error: 'Unknown session' })

    const { error } = await supabase.from('session_waitlist').insert({ session_id, email: to })
    // 23505: already on the list. Say yes again, send nothing again.
    if (error && error.code !== '23505') throw error
    if (!error) {
      await resend.emails.send({
        from: `Matthew at Regulated <${FROM_EMAIL}>`,
        to,
        subject: `You are on the list for ${session.title}`,
        html: `<p>Thanks. When <strong>${session.title}</strong> is recorded and in the app, this address gets one email saying so.</p><p>Matthew</p>`,
        tags: [{ name: 'type', value: 'waitlist' }, { name: 'session', value: session.id }],
      })
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[waitlist] error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return res.status(500).json({ error: 'Internal error' })
  }
}
