import { dapCheckoutMatches } from './_dap-payment.js'

// Local-only preparation for a trusted, authenticated coordinator. It does not create or refund a purchase.
// The caller must supply a server-read pending purchase and must separately fence new checkout creation.
export async function closeOpenDapCheckout({ account, purchase, stripe, db }) {
  if (!account || purchase?.user_id !== account || purchase.status !== 'pending' ||
      typeof purchase.checkout_session_id !== 'string' || !/^cs_[A-Za-z0-9_]{1,250}$/.test(purchase.checkout_session_id)) return 'review'
  const id = purchase.checkout_session_id
  try {
    const before = await stripe.checkout.sessions.retrieve(id)
    if (!dapCheckoutMatches(before, purchase) || before.status !== 'open' || before.payment_status !== 'unpaid' || before.payment_intent != null) return 'review'
    await stripe.checkout.sessions.expire(id)
    const after = await stripe.checkout.sessions.retrieve(id)
    if (!dapCheckoutMatches(after, purchase) || after.status !== 'expired' || after.payment_status !== 'unpaid' || after.payment_intent != null) return 'review'
    const { data, error } = await db.from('dap_purchases').update({ status: 'expired' })
      .eq('id', purchase.id).eq('user_id', account).eq('status', 'pending').eq('checkout_session_id', id)
      .select('id').maybeSingle()
    if (error || data?.id !== purchase.id) return 'review'
    return 'expired'
  } catch { return 'review' }
}
