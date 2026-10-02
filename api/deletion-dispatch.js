import { createClient } from '@supabase/supabase-js'
import { inventoryDeletion } from '../scripts/deletion-inventory.mjs'
import { handleDeletionAlert, authorized } from './deletion-alert.js'

export async function handleDeletionDispatch(req, res, {
  env = process.env,
  database = () => createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  inventory = inventoryDeletion,
  alert = handleDeletionAlert,
} = {}) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!authorized(req.headers?.authorization, env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (env.DELETION_DISPATCH_ENABLED !== 'true' || env.DELETION_MONITOR_ENABLED !== 'true' ||
      !env.DELETION_ALERT_EMAIL || !env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Deletion dispatch is not configured' })
  }

  try {
    const db = database()
    const { data: claims, error } = await db.rpc('claim_deletion_requests', { batch_size: 10 })
    if (error || !Array.isArray(claims) || claims.length > 10) throw new Error('claim_failed')
    let reviewed = 0
    let failed = 0
    for (const claim of claims) {
      let readFailed = false
      try {
        const result = await inventory(db, claim.request_id)
        if (result.accountId !== claim.account_id) throw new Error('wrong_account')
      } catch {
        readFailed = true
      }
      const { data: settled, error: settleError } = await db.rpc('settle_deletion_dispatch', {
        request_id: claim.request_id, claim_generation: claim.generation,
        claim_token: claim.lease_token, failed: readFailed,
      })
      if (settleError || settled !== true) throw new Error('settle_failed')
      if (readFailed) failed++
      else reviewed++
    }
    // Delivery failure stays visible as a failed cron response; it never means cleanup succeeded.
    let alertStatus
    const alertResponse = {
      setHeader() {},
      status(code) { alertStatus = code; return this },
      json() { return this },
    }
    await alert(req, alertResponse, { env, database: () => db })
    if (alertStatus !== 200) throw new Error('alert_failed')
    return res.status(200).json({ ok: true, inventoried: reviewed, failed, completed: 0 })
  } catch {
    return res.status(500).json({ error: 'Deletion dispatch needs attention' })
  }
}

export default function handler(req, res) {
  return handleDeletionDispatch(req, res)
}
