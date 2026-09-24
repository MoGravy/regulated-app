// Who is calling. Only a signed-in session counts: the bearer token is
// verified with Supabase and its email is used, whatever the body says. No
// token, or a bad one, is null. A typed email unlocks nothing. (The body-email
// fallback was removed 2026-09-05 once every subscriber had signed in.)
export async function callerEmail(req, supabase) {
  const auth = req.headers?.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(auth.slice(7))
  if (error || !data?.user?.email) return null
  return normalEmail(data.user.email)
}

export const normalEmail = e => String(e || '').trim().toLowerCase()

// Rows whose user_email is this address, ignoring case and stray spaces.
// Checkout used to store the email exactly as typed, so "Jane@x.com" paid and
// an exact match on "jane@x.com" never found her. ilike narrows in the
// database; its wildcards (_ % *) can only widen the set, and the exact
// comparison here takes it back to one address.
export function sameEmail(rows, email) {
  const want = normalEmail(email)
  return (rows || []).filter(r => normalEmail(r.user_email) === want)
}

// Active, unexpired subscription rows for an address. Every premium gate uses
// this, so they cannot disagree about who is a subscriber.
export async function activeSubscriptions(supabase, email, columns = 'id') {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`${columns}, user_email`)
    .ilike('user_email', normalEmail(email))
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
  if (error) throw error
  return sameEmail(data, email)
}
