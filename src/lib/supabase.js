import { createClient } from '@supabase/supabase-js'

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
// Read env vars (injected at build time by vite.config.js)
// ---------------------------------------------------------------------------
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ---------------------------------------------------------------------------
// Comprehensive startup logging
// ---------------------------------------------------------------------------
console.log('=== [Supabase] Init diagnostics ===')
console.log('Supabase URL:',            supabaseUrl    || '(not set)')
console.log('Supabase Anon Key exists:', !!supabaseAnonKey)
console.log('Supabase Anon Key prefix:', supabaseAnonKey ? supabaseAnonKey.slice(0, 30) + '…' : '(not set)')

const keyInfo = inspectSupabaseKey(supabaseAnonKey)
console.log('Supabase key role (JWT):', keyInfo.role || keyInfo.error)

if (keyInfo.role === 'service_role') {
  console.error(
    '🚨 [Supabase] WRONG KEY: SUPABASE_ANON_KEY is set to the SERVICE ROLE KEY.\n' +
    'This is why you see "Forbidden use of secret API key in browser".\n' +
    'Fix: In your Vercel dashboard, set SUPABASE_ANON_KEY to the ANON/PUBLIC key\n' +
    '(found in Supabase → Project Settings → API → "anon public").\n' +
    'The service role key must NEVER be sent to the browser.'
  )
} else if (keyInfo.role === 'anon') {
  console.log('[Supabase] ✓ Key role is "anon" — correct key in use')
} else if (!supabaseAnonKey) {
  console.error('[Supabase] SUPABASE_ANON_KEY is not set in Vercel env vars')
} else {
  console.warn('[Supabase] Key role:', keyInfo.role, '— expected "anon"', keyInfo)
}

console.log('=== [Supabase] End diagnostics ===')

// ---------------------------------------------------------------------------
// Create client — guard against empty strings (createClient requires non-empty)
// ---------------------------------------------------------------------------
export const supabase = createClient(
  supabaseUrl    || 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
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

export async function getSessions(includeAllForPremium = false) {
  console.log('[Supabase] getSessions — fetching (includeAll:', includeAllForPremium, ')')
  let query = supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: true })

  if (!includeAllForPremium) {
    query = query.eq('free', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('[Supabase] getSessions ERROR:', error.message, error.code)
    throw error
  }
  console.log('[Supabase] getSessions — returned', data?.length ?? 0, 'rows')
  return data || []
}

export async function getAllSessions() {
  console.log('[Supabase] getAllSessions — fetching...')
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[Supabase] getAllSessions ERROR — full error object:', error)
    console.error('[Supabase] getAllSessions error message:', error.message)
    console.error('[Supabase] getAllSessions error code:', error.code)
    // Re-throw so callers know this failed rather than silently returning []
    throw error
  }

  console.log('[Supabase] getAllSessions — returned', data?.length ?? 0, 'rows')
  if (data?.length) {
    console.log('[Supabase] getAllSessions — first session id:', data[0].id, '| title:', data[0].title)
    console.log('[Supabase] getAllSessions — all ids:', data.map(s => s.id))
  }
  return data || []
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
