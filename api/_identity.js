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
  return user?.email?.toLowerCase().trim() || null
}
