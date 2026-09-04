import { createClient } from '@supabase/supabase-js'
import { HARDCODED_SESSIONS } from './hardcodedSessions'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/credentials'

// ---------------------------------------------------------------------------
// Key inspection helper
// Supabase JWTs are base64url-encoded. Decoding the payload reveals the `role`
// claim. If it says "service_role" the wrong key is in use.
// ---------------------------------------------------------------------------
function inspectSupabaseKey(key) {
  if (!key) return { role: null, error: 'key is empty' }
  try {
    const parts = key.split('.')
    if (parts.length !== 3) return { role: null, error: 'not a JWT' }
    // base64url → base64 → JSON
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
      parts[1].length + (4 - parts[1].length % 4) % 4, '='
    )
    const payload = JSON.parse(atob(padded))
    return { role: payload.role, iss: payload.iss, payload }
  } catch (e) {
    return { role: null, error: e.message }
  }
}

// Credentials imported from src/config/credentials.js (hardcoded, no env vars)
console.log('[supabase.js] URL:', SUPABASE_URL)
console.log('[supabase.js] Anon key role:', inspectSupabaseKey(SUPABASE_ANON_KEY).role)

// ---------------------------------------------------------------------------
// Create client
// ---------------------------------------------------------------------------
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

console.log('[Supabase] Client initialized:', !!supabase)

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function trackSessionCompletion(sessionId, userEmail, moodBefore, moodAfter) {
  const payload = {
    session_id: sessionId,
    user_email: userEmail || null,
    mood_before: moodBefore,
    mood_after: moodAfter,
    completed_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('session_completions').insert(payload)
  if (error) console.error('[Supabase] trackSessionCompletion error:', error)

  if (userEmail) {
    await supabase.rpc('increment_completed_sessions', { p_email: userEmail })
  }
}

// Safe column list for client reads — audio_url deliberately excluded.
// Premium audio is served via /api/get-audio-url (subscription-checked,
// 2h signed URL). has_audio is a generated column standing in for the old
// "!audio_url = coming soon" check.
export const SESSION_COLUMNS = 'id, title, description, category, duration, free, created_at, preview_url, has_audio'

// Module-level cache: the library is fetched once per page load, not on every
// tab switch. Cleared by a full reload; fallback results are never cached.
let allSessionsCache = null

export async function getAllSessions() {
  if (allSessionsCache) return allSessionsCache
  console.log('[Sessions] Fetching all sessions from Supabase...')
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[Sessions] getAllSessions() failed — full error:', JSON.stringify(error))
    return HARDCODED_SESSIONS
  }
  if (!data?.length) {
    console.warn('[Sessions] getAllSessions() returned 0 rows — using hardcoded fallback')
    return HARDCODED_SESSIONS
  }
  console.log('[Sessions] ✓', data.length, 'sessions from Supabase')
  allSessionsCache = data
  return data
}

export async function getSessions() {
  const all = await getAllSessions()
  const free = all.filter(s => s.free)
  return free.length ? free : HARDCODED_SESSIONS.filter(s => s.free)
}

// Synchronous cache lookup for the player — avoids a refetch when the user
// navigated here from a list that already loaded the library.
export function getCachedSession(id) {
  return allSessionsCache?.find(s => String(s.id) === String(id)) || null
}

// ---------------------------------------------------------------------------
// Custom order helpers
// ---------------------------------------------------------------------------

export async function createCustomOrder(orderData) {
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7)

  const { data, error } = await supabase
    .from('custom_orders')
    .insert({
      ...orderData,
      status: 'pending_payment',
      due_date: dueDate.toISOString(),
      turnaround_days: 7,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getCustomOrder(orderId) {
  const { data, error } = await supabase
    .from('custom_orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Subscription helpers
// ---------------------------------------------------------------------------

// Bearer header for the signed-in user, or nothing. The API keys premium on
// this when it is present, so a typed email cannot stand in for an account.
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

export async function checkSubscription(email) {
  if (!email) return false

  // Server-side: the subscriptions table is RLS-locked, so the public key
  // used here always saw zero rows and every subscriber looked unpaid.
  const res = await fetch('/api/check-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`check-subscription responded ${res.status}`)
  const { active } = await res.json()
  return !!active
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export async function upsertUser(email) {
  if (!email) return
  const { error } = await supabase
    .from('users')
    .upsert({ email, updated_at: new Date().toISOString() }, { onConflict: 'email' })
  if (error) console.error('[Supabase] upsertUser error:', error)
}

export async function getAudioSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Auth — brief phase 3
// Implicit flow, the supabase-js default: the magic link comes back as a hash
// fragment and detectSessionInUrl consumes it on load. No callback route.
// ---------------------------------------------------------------------------

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  // A null session means the project is set to confirm the address first.
  return { user: data.user, needsConfirmation: !data.session }
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut()
  if (error) console.error('[Supabase] signOut error:', error)
}

// The on_auth_user_created trigger writes this row at signup. This is the belt
// to that braces, for any account predating the trigger. Owner-only RLS means
// it can never reach another user's row.
export async function ensureProfile(user) {
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
    .select()
    .single()
  if (error) {
    console.error('[Supabase] ensureProfile error:', JSON.stringify(error))
    return null
  }
  return data
}
