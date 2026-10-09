import { createClient } from '@supabase/supabase-js'
import { callerUser, normalEmail } from './_identity.js'
import requestDeletion from './_request-account-deletion.js'
import deletionAlert from './_deletion-alert.js'
import deletionDispatch from './_deletion-dispatch.js'

export const canManageCare = (user, email) => !!(email && user?.email_confirmed_at && normalEmail(user.email) === normalEmail(email))

export default async function handler(req, res) {
  // ponytail: share this entry point to stay within the twelve-function plan.
  if (req.query?.operation === 'deletion-request') return requestDeletion(req, res)
  if (req.query?.operation === 'deletion-alert') return deletionAlert(req, res)
  if (req.query?.operation === 'deletion-dispatch') return deletionDispatch(req, res)
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()
  try {
    const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const user = await callerUser(req, db)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const allowed = canManageCare(user, process.env.CARE_PRACTITIONER_EMAIL)
    if (req.method === 'GET') return res.status(200).json({ canConnect: allowed })
    if (!allowed) return res.status(403).json({ error: 'Forbidden' })
    const email = req.body?.email, label = req.body?.label
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof label !== 'string' || label.trim().length < 1 || label.trim().length > 100) return res.status(400).end()
    const { data, error } = await db.rpc('connect_care_account', {
      target_email: normalEmail(email), practitioner: user.id, display_name: label.trim(),
    })
    if (error) throw error
    return res.status(data ? 200 : 409).json({ connected: !!data })
  } catch {
    return res.status(500).json({ error: 'Unavailable' })
  }
}
