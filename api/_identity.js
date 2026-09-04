// Who is calling. Only a signed-in session counts: the bearer token is
// verified with Supabase and its email is used, whatever the body says. No
// token, or a bad one, is null. A typed email unlocks nothing. (The body-email
// fallback was removed 2026-09-05 once every subscriber had signed in.)
export async function callerEmail(req, supabase) {
  const auth = req.headers?.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(auth.slice(7))
  if (error || !data?.user?.email) return null
  return data.user.email.toLowerCase().trim()
}
