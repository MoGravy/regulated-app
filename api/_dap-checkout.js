import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { callerUser } from './_identity.js'
import { DAP_ID, DAP_AMOUNT, dapCheckoutMatches, reconcileDap } from './_dap-payment.js'

const APP_URL = 'https://regulatedapp.co'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') return res.status(200).json({ enabled: process.env.DAP_SALES_ENABLED === 'true' })
  if (req.method !== 'POST') return res.status(405).end()
  // Sale stays off until the schema, signed-in checkout and refund gates are verified.
  if (req.body?.action !== 'status' && process.env.DAP_SALES_ENABLED !== 'true') return res.status(503).json({ error: 'Unavailable' })
  try {
    const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const user = await callerUser(req, db)
    if (!user?.email || !user.email_confirmed_at) return res.status(401).json({ error: 'Unauthorized' })
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    if (req.body?.action === 'status') {
      const sessionId = req.body.sessionId
      if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)) {
        return res.status(400).json({ error: 'Unavailable' })
      }
      const { data: owned, error } = await db.from('dap_purchases').select('id')
        .eq('checkout_session_id', sessionId).eq('user_id', user.id).maybeSingle()
      if (error) throw error
      if (!owned) return res.status(404).json({ error: 'Unavailable' })
      await reconcileDap(sessionId, db, stripe)
      const { data: grant, error: grantError } = await db.from('course_grants').select('course_id')
        .eq('user_id', user.id).eq('course_id', DAP_ID).is('revoked_at', null).maybeSingle()
      if (grantError) throw grantError
      return res.status(200).json({ ready: !!grant })
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: purchase, error } = await db.rpc('reserve_dap_checkout', { account: user.id })
      if (error) throw error
      if (!purchase?.id) return res.status(409).json({ error: 'Unavailable' })
      if (purchase.checkout_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(purchase.checkout_session_id)
        if (existing.status === 'open' && existing.url && dapCheckoutMatches(existing, purchase)) {
          return res.status(200).json({ url: existing.url })
        }
        if (existing.status !== 'expired') return res.status(409).json({ error: 'Unavailable' })
        const { error: expireError } = await db.from('dap_purchases').update({ status: 'expired' })
          .eq('id', purchase.id).eq('status', 'pending')
        if (expireError) throw expireError
        continue
      }
      const metadata = { type: 'dap', purchase_id: purchase.id, user_id: user.id }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], customer_email: user.email,
        client_reference_id: user.id, metadata, payment_intent_data: { metadata },
        line_items: [{ price_data: { currency: 'aud', unit_amount: DAP_AMOUNT,
          product_data: { name: 'Dissolve Anxiety Program' } }, quantity: 1 }],
        success_url: `${APP_URL}/dap?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/dap`,
      }, { idempotencyKey: `dap:${purchase.id}` })
      if (session.status === 'expired') {
        const { error: expireError } = await db.from('dap_purchases').update({ status: 'expired' })
          .eq('id', purchase.id).eq('status', 'pending')
        if (expireError) throw expireError
        continue
      }
      if (!session.url || session.livemode !== true || session.status !== 'open') {
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id)
        throw new Error('Checkout unavailable')
      }
      const { error: saveError } = await db.from('dap_purchases').update({ checkout_session_id: session.id })
        .eq('id', purchase.id).eq('user_id', user.id).eq('course_id', DAP_ID).eq('status', 'pending')
        .select('checkout_session_id').single()
      if (saveError) {
        await stripe.checkout.sessions.expire(session.id)
        throw saveError
      }
      return res.status(200).json({ url: session.url })
    }
    return res.status(409).json({ error: 'Unavailable' })
  } catch {
    return res.status(500).json({ error: 'Unavailable' })
  }
}
