import { createHash, timingSafeEqual } from 'node:crypto'

export function scheduledDispatch(req, secret = process.env.CARE_DISPATCH_SECRET) {
  if (req.method !== 'POST' || req.body?.action !== 'dispatch' ||
      typeof secret !== 'string' || secret.length < 32) return false
  const supplied = req.headers?.authorization
  const expected = `Bearer ${secret}`
  if (typeof supplied !== 'string' || supplied.length !== expected.length) return false
  const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected)
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
}

export const subscriptionId = endpoint => createHash('sha256').update(endpoint).digest('hex')

export function validSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return false
  try {
    const url = new URL(value.endpoint)
    const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !(hosts.includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname))) return false
    const key = value.keys?.p256dh, auth = value.keys?.auth
    return typeof key === 'string' && /^[A-Za-z0-9_-]{87,88}$/.test(key) &&
      typeof auth === 'string' && /^[A-Za-z0-9_-]{22,24}$/.test(auth)
  } catch { return false }
}

export async function dispatchCarePush(db, send, actor) {
  const { data: jobs, error } = await db.rpc('claim_care_push', { actor })
  if (error) throw error
  const results = await Promise.all((jobs || []).map(async job => {
    const [{ data: link, error: linkError }, { data: sub, error: subError }] = await Promise.all([
      db.from('care_links').select('active').eq('client_id', job.client_id).eq('practitioner_id', job.practitioner_id).maybeSingle(),
      db.from('care_push_subscriptions').select('user_id,subscription').eq('id', job.subscription_id).maybeSingle(),
    ])
    if (linkError || subError) return 0
    if (!link?.active || sub?.user_id !== job.recipient_id || !validSubscription(sub.subscription)) {
      await db.from('care_push_jobs').update({ state: 'cancelled' }).eq('id', job.id)
      return 0
    }
    try {
      // No message text, names or task details leave the app in alert previews.
      await send(sub.subscription, JSON.stringify({ kind: job.kind, id: job.id }))
      const { error: markError } = await db.from('care_push_jobs').update({ state: 'sent' }).eq('id', job.id)
      if (markError) throw markError
      return 1
    } catch (failure) {
      if ([404, 410].includes(failure.statusCode)) {
        await db.from('care_push_subscriptions').delete().eq('id', job.subscription_id)
      }
      // A lease prevents overlapping dispatch. Transient failures retry later.
      return 0
    }
  }))
  return results.reduce((sum, value) => sum + value, 0)
}
