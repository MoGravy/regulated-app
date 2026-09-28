// Who is calling. Only a signed-in session counts: Supabase verifies the
// bearer token. A typed email or account ID unlocks nothing.
export async function callerUser(req, supabase) {
  const auth = req.headers?.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(auth.slice(7))
  if (error || !data?.user?.id) return null
  return data.user
}

export async function callerEmail(req, supabase) {
  const user = await callerUser(req, supabase)
  return normalEmail(user?.email) || null
}

export const normalEmail = e => String(e || '').trim().toLowerCase()

export function sameEmail(rows, email) {
  const want = normalEmail(email)
  return (rows || []).filter(r => normalEmail(r.user_email) === want)
}

export async function activeSubscriptions(supabase, email, columns = 'id') {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`${columns}, user_email`)
    .eq('user_email_normalized', normalEmail(email))
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
  if (error) throw error
  return sameEmail(data, email)
}
