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

export async function getSessions() {
  console.log('[Sessions] Fetching free sessions from Supabase...')
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('free', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    if (data?.length) {
      console.log('[Sessions] ✓', data.length, 'free sessions from Supabase')
      return data
    }
  } catch (err) {
    console.warn('[Sessions] Supabase free session query failed:', err.message)
  }
  // Fallback to hardcoded
  return HARDCODED_SESSIONS.filter(s => s.free)
}

export async function getAllSessions() {
  console.log('[Sessions] Fetching all sessions from Supabase...')
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    if (data?.length) {
      console.log('[Sessions] ✓', data.length, 'sessions from Supabase')
      return data
    }
  } catch (err) {
    console.warn('[Sessions] Supabase all sessions query failed:', err.message)
  }
  // Fallback: use hardcoded sessions so free sessions are always available offline
  const hardcoded = HARDCODED_SESSIONS
  const free = hardcoded.filter(s => s.free)
  const premium = hardcoded.filter(s => !s.free)
  const result = [...free, ...premium]
  console.log('[Sessions] Fallback: using', free.length, 'free +', premium.length, 'hardcoded premium')
  return result
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

export async function checkSubscription(email) {
  if (!email) return false

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_email', email)
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .maybeSingle()

  if (error) return false
  return !!data
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
  const normalizedPath = path.replace(/^\/+/, '').replace(/^sessions\//, '')
  const { data, error } = await supabase.storage
    .from('sessions')
    .createSignedUrl(normalizedPath, 3600)
  if (error) throw error
  return data.signedUrl
}
