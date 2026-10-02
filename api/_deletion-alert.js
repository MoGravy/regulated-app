import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export function authorized(header, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false
  const received = Buffer.from(header || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function count(query) {
  const { count: total, error } = await query
  if (error || !Number.isSafeInteger(total) || total < 0) throw new Error('deletion-alert-read')
  return total
}

export async function handleDeletionAlert(req, res, {
  env = process.env,
  now = () => new Date(),
  database = () => createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  send = async message => {
    const { Resend } = await import('resend')
    return new Resend(env.RESEND_API_KEY).emails.send(message)
  },
} = {}) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!authorized(req.headers?.authorization, env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (env.DELETION_MONITOR_ENABLED !== 'true' || !env.DELETION_ALERT_EMAIL || !env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Deletion monitoring is not configured' })
  }

  try {
    const db = database()
    const horizon = new Date(now().getTime() + 48 * 60 * 60 * 1000).toISOString()
    const [waiting, reviewSoon, cleanupSoon, failed, heldDue] = await Promise.all([
      count(db.from('account_deletion_requests').select('id', { count: 'exact', head: true }).is('reviewed_at', null)),
      count(db.from('account_deletion_requests').select('id', { count: 'exact', head: true }).is('reviewed_at', null).lte('review_due_at', horizon)),
      count(db.from('account_deletion_requests').select('id', { count: 'exact', head: true }).neq('ordinary_state', 'done').lte('ordinary_due_at', horizon)),
      count(db.from('account_deletion_requests').select('id', { count: 'exact', head: true }).not('last_error_code', 'is', null)),
      count(db.from('account_deletion_requests').select('id', { count: 'exact', head: true }).eq('held_state', 'held').lte('next_run_at', horizon)),
    ])
    if (waiting + reviewSoon + cleanupSoon + failed + heldDue === 0) {
      return res.status(200).json({ ok: true, attention: false })
    }
    const { error } = await send({
      from: `Regulated <${env.FROM_EMAIL || 'hello@regulatedapp.co'}>`,
      to: env.DELETION_ALERT_EMAIL,
      subject: 'Regulated deletion requests need attention',
      text: `Please check the account deletion requests in Supabase.\n\nAwaiting review: ${waiting}\nReview due within two days: ${reviewSoon}\nOrdinary cleanup due within two days: ${cleanupSoon}\nProcessing failures: ${failed}\nHeld records due for a check within two days: ${heldDue}\n\nThis email does not mean any account has been deleted.`,
    })
    if (error) throw new Error('deletion-alert-send')
    return res.status(200).json({ ok: true, attention: true })
  } catch {
    return res.status(500).json({ error: 'Could not check deletion requests' })
  }
}

export default function handler(req, res) {
  return handleDeletionAlert(req, res)
}
