// Who is calling. A signed-in session wins: the bearer token is verified with
// Supabase and its email is used, whatever the body says. A bad token is
// refused, never downgraded to the body email.
// ponytail: with no token the body email is still honoured, so customers who
// bought before sign-in existed keep working. Drop the fallback once they have
// each signed in once; then a typed email can unlock nothing.
export async function callerEmail(req, supabase) {
  const auth = req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) {
    const { data, error } = await supabase.auth.getUser(auth.slice(7))
    if (error || !data?.user?.email) return null
    return data.user.email.toLowerCase().trim()
  }
  return String(req.body?.email || '').toLowerCase().trim() || null
}
