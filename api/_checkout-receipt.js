import { CUSTOM_AUDIO_PRICE_CENTS, CURRENCY } from '../src/config/pricing.js'

export function receiptStatus(session) {
  if (!['subscription', 'custom_audio'].includes(session.metadata?.type)) return null
  if (session.payment_status === 'paid') return 'paid'
  if (session.payment_status === 'no_payment_required' && session.status === 'complete' &&
      session.mode === 'payment' && session.metadata.type === 'custom_audio' &&
      session.currency === CURRENCY && session.amount_total === 0 &&
      session.amount_subtotal === CUSTOM_AUDIO_PRICE_CENTS &&
      session.total_details?.amount_discount === CUSTOM_AUDIO_PRICE_CENTS) {
    return 'no_payment_required'
  }
  return null
}
