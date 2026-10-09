import { reviewedSession } from '../content/reviewedCopy.js'
import { createClient } from '@supabase/supabase-js'
import { HARDCODED_SESSIONS } from './hardcodedSessions'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/credentials'
import { apiUrl } from './apiUrl'
import { Capacitor } from '@capacitor/core'
import { NATIVE_AUTH_REDIRECT } from './nativeAuthUrl'
import { emailReturnUrl } from './signInFlow'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: Capacitor.isNativePlatform() ? 'pkce' : 'implicit',
    },
  }
)

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

// Safe column list for client reads — audio_url deliberately excluded.
// Premium audio is served via /api/get-audio-url (subscription-checked,
// 2h signed URL). has_audio is a generated column standing in for the old
// "!audio_url = coming soon" check.
export const SESSION_COLUMNS = 'id, title, description, category, duration, free, created_at, preview_url, has_audio, tags'

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
  allSessionsCache = data.map(reviewedSession)
  return allSessionsCache
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

export async function checkSubscription(expectedAccountId) {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const session = data?.session
  if (!expectedAccountId || session?.user?.id !== expectedAccountId || !session.access_token) {
    throw new Error('Subscription account does not match the signed-in session')
  }

  const res = await fetch(apiUrl('/api/check-subscription'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ email: session.user.email }),
  })
  if (!res.ok) throw new Error(`check-subscription responded ${res.status}`)
  const result = await res.json()
  if (typeof result?.active !== 'boolean') throw new Error('Invalid subscription response')
  return result.active
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

export async function sendMagicLink(email, next = '') {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: Capacitor.isNativePlatform() ? NATIVE_AUTH_REDIRECT : emailReturnUrl(window.location.origin, next) },
  })
  if (error) throw error
}

export async function confirmEmailLink(confirmation) {
  const { data, error } = await supabase.auth.verifyOtp(confirmation)
  if (error) throw error
  if (!data.session) throw new Error('No authenticated session')
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUpWithPassword(email, password, next = '') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: Capacitor.isNativePlatform() ? NATIVE_AUTH_REDIRECT : emailReturnUrl(window.location.origin, next) },
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
