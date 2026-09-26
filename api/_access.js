// Only verified, server-written purchase rows can grant access. The old
// Stripe table still uses email until those subscribers are mapped to IDs.
export async function hasPremiumAccess(supabase, user, now = new Date()) {
  const cutoff = now.toISOString()
  const { data: store, error: storeError } = await supabase
    .from('store_entitlements')
    .select('id')
    .eq('account_id', user.id)
    .in('status', ['active', 'grace'])
    .gt('expires_at', cutoff)
    .limit(1)
    .maybeSingle()
  if (storeError) throw storeError
  if (store) return true

  if (!user.email) return false
  const { data: stripe, error: stripeError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_email', user.email.toLowerCase().trim())
    .eq('status', 'active')
    .gt('current_period_end', cutoff)
    .limit(1)
    .maybeSingle()
  if (stripeError) throw stripeError
  return !!stripe
}
