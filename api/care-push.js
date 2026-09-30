import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { callerUser } from './_identity.js'
import { dispatchCarePush, scheduledDispatch, subscriptionId, validSubscription } from './_care-push.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()
  const configured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  try {
    const scheduled = scheduledDispatch(req)
    const user = scheduled ? null : await callerUser(req, db)
    if (!scheduled && !user) return res.status(401).json({ error: 'Unauthorized' })
    if (req.method === 'GET') return res.status(200).json({ configured, publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null })
    const action = req.body?.action
    if (action === 'subscribe') {
      if (!configured) return res.status(503).json({ error: 'Unavailable' })
      const subscription = req.body.subscription
      if (!validSubscription(subscription)) return res.status(400).json({ error: 'Invalid subscription' })
      const id = subscriptionId(subscription.endpoint)
      const { count, error: countError } = await db.from('care_push_subscriptions')
        .select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('id', id)
      if (countError) throw countError
      if (count >= 10) return res.status(409).json({ error: 'Device limit reached' })
      const { error } = await db.from('care_push_subscriptions').upsert({
        id, user_id: user.id,
        subscription: { endpoint: subscription.endpoint, keys: subscription.keys }, updated_at: new Date().toISOString(),
      })
      if (error) throw error
      return res.status(200).json({ saved: true })
    }
    if (action === 'unsubscribe') {
      const endpoint = req.body.endpoint
      if (typeof endpoint !== 'string' || endpoint.length > 2048) return res.status(400).end()
      const { error } = await db.from('care_push_subscriptions').delete().eq('id', subscriptionId(endpoint)).eq('user_id', user.id)
      if (error) throw error
      return res.status(200).json({ saved: true })
    }
    if (action !== 'dispatch') return res.status(400).end()
    if (!configured) return res.status(200).json({ configured: false })
    const sent = await dispatchCarePush(db, (subscription, payload) => webpush.sendNotification(subscription, payload, {
      vapidDetails: { subject: 'mailto:info@matthewtweediehypnosis.com.au', publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY },
      TTL: 3600, timeout: 5000,
    }), scheduled ? null : user.id)
    return res.status(200).json({ sent })
  } catch {
    // Never log subscription endpoints, keys, message text or client identity.
    return res.status(500).json({ error: 'Unavailable' })
  }
}
