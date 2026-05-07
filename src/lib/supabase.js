import { createClient } from '@supabase/supabase-js'
import { HARDCODED_SESSIONS } from './hardcodedSessions'

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

// ---------------------------------------------------------------------------
// TEMPORARY: hardcoded credentials while env var baking issue is debugged.
// Both values are safe to expose — the anon key is the public key, designed
// for browser use. The service role key is NOT here and must stay server-only.
// TODO: revert to import.meta.env once env var pipeline is confirmed working.
// ---------------------------------------------------------------------------
const supabaseUrl     = 'https://aynyvirtzioyeshauith.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'REPLACE_WITH_ANON_KEY'

console.log('=== [Supabase] Init ===')
console.log('Supabase URL:', supabaseUrl)
console.log('Supabase Anon Key:', supabaseAnonKey === 'REPLACE_WITH_ANON_KEY' ? '⚠️ PLACEHOLDER — paste real anon key' : `set (${supabaseAnonKey.length} chars)`)

const keyInfo = inspectSupabaseKey(supabaseAnonKey)
console.log('Key role:', keyInfo.role || keyInfo.error)
if (keyInfo.role === 'service_role') {
  console.error('🚨 WRONG KEY: this is the service role key — use the anon/public key instead')
} else if (keyInfo.role === 'anon') {
  console.log('✓ Correct anon key in use')
}
console.log('=== [Supabase] End ===')

// ---------------------------------------------------------------------------
// Create client
// ---------------------------------------------------------------------------
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
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
  console.log('[Sessions] Using hard-coded sessions for testing — 4 sessions loaded')
  return HARDCODED_SESSIONS.filter(s => s.free)
}

export async function getAllSessions() {
  console.log('[Sessions] Using hard-coded sessions for testing — 4 sessions loaded')
  console.log('[Sessions] Session IDs:', HARDCODED_SESSIONS.map(s => s.id))
  return HARDCODED_SESSIONS
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
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
