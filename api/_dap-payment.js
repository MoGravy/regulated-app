export const DAP_ID = '0a02caf8-5050-571c-9a70-e2bcda2253a3'
export const DAP_AMOUNT = 24700

export function dapCheckoutMatches(session, purchase) {
  return !!(purchase?.id && purchase.course_id === DAP_ID &&
    session?.id === purchase.checkout_session_id &&
    session.metadata?.type === 'dap' && session.metadata.purchase_id === purchase.id &&
    session.client_reference_id === purchase.user_id && session.metadata.user_id === purchase.user_id &&
    session.mode === 'payment' && session.livemode === true && session.currency === 'aud' &&
    session.amount_subtotal === DAP_AMOUNT && session.amount_total === DAP_AMOUNT &&
    session.total_details?.amount_discount === 0)
}

// Only current Stripe objects matching a server-created reservation can grant access.
export function dapReceipt(session, purchase) {
  const intent = session?.payment_intent, charge = intent?.latest_charge
  if (!dapCheckoutMatches(session, purchase) || session.status !== 'complete' || session.payment_status !== 'paid' ||
      intent?.status !== 'succeeded' || intent.livemode !== true || intent.currency !== 'aud' ||
      intent.amount !== DAP_AMOUNT || intent.amount_received !== DAP_AMOUNT ||
      intent.metadata?.purchase_id !== purchase.id ||
      typeof intent.id !== 'string' || !/^pi_[A-Za-z0-9_]+$/.test(intent.id) ||
      charge?.payment_intent !== intent.id || charge.livemode !== true ||
      charge.paid !== true || charge.captured !== true || charge.currency !== 'aud' ||
      charge.amount !== DAP_AMOUNT || typeof charge.disputed !== 'boolean' ||
      !Number.isInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > DAP_AMOUNT ||
      (purchase.payment_intent_id && purchase.payment_intent_id !== intent.id) ||
      (charge.disputed && charge.amount_refunded !== DAP_AMOUNT)) return null
  return { intentId: intent.id, fullyRefunded: charge.amount_refunded === DAP_AMOUNT }
}

export async function reconcileDap(sessionId, db, stripe) {
  const { data: purchase, error } = await db.from('dap_purchases').select('*')
    .eq('checkout_session_id', sessionId).maybeSingle()
  if (error) throw new Error('Purchase read failed')
  if (!purchase) return false
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] })
  const receipt = dapReceipt(session, purchase)
  if (!receipt) return false
  const { data, error: writeError } = await db.rpc('reconcile_dap_purchase', {
    checkout_id: sessionId, intent_id: receipt.intentId, fully_refunded: receipt.fullyRefunded,
  })
  if (writeError || data !== true) throw new Error('Purchase reconciliation failed')
  return true
}

export async function reconcileDapRefund(intentId, db, stripe) {
  if (typeof intentId !== 'string' || !/^pi_[A-Za-z0-9_]+$/.test(intentId)) return false
  // Refund may arrive before the paid webhook, so look up the original reservation.
  const intent = await stripe.paymentIntents.retrieve(intentId)
  const purchaseId = intent.metadata?.purchase_id
  if (intent.metadata?.type !== 'dap' || typeof purchaseId !== 'string') return false
  const { data, error } = await db.from('dap_purchases').select('checkout_session_id')
    .eq('id', purchaseId).maybeSingle()
  if (error) throw new Error('Purchase read failed')
  return data?.checkout_session_id ? reconcileDap(data.checkout_session_id, db, stripe) : false
}
