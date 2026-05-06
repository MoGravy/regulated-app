import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug: log resolved values on startup so we can verify env vars are injected correctly.
// These will appear in the browser console.
console.log('[Regulated] SUPABASE_URL:', supabaseUrl || '(not set)')
console.log('[Regulated] SUPABASE_ANON_KEY:', supabaseAnonKey ? supabaseAnonKey.slice(0, 20) + '…' : '(not set)')

if (!supabaseUrl) {
  console.error(
    '[Regulated] SUPABASE_URL is not set. ' +
    'Add SUPABASE_URL (or VITE_SUPABASE_URL) to your Vercel environment variables.'
  )
}
if (!supabaseAnonKey) {
  console.error(
    '[Regulated] SUPABASE_ANON_KEY is not set. ' +
    'Add SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) to your Vercel environment variables.'
  )
}

// createClient requires non-empty strings — guard so the app loads even if
// env vars are missing (all DB calls will fail gracefully and fall back to demo data)
export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// --- Session helpers ---

export async function trackSessionCompletion(sessionId, userEmail, moodBefore, moodAfter) {
  const payload = {
    session_id: sessionId,
    user_email: userEmail || null,
    mood_before: moodBefore,
    mood_after: moodAfter,
    completed_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('session_completions').insert(payload)
  if (error) console.error('trackSessionCompletion error:', error)

  // Update user's completed_sessions count if email known
  if (userEmail) {
    await supabase.rpc('increment_completed_sessions', { p_email: userEmail })
  }
}

export async function getSessions(includeAllForPremium = false) {
  let query = supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: true })

  if (!includeAllForPremium) {
    query = query.eq('free', true)
  }

  const { data, error } = await query
  if (error) console.error('getSessions error:', error)
  return data || []
}

export async function getAllSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) console.error('getAllSessions error:', error)
  return data || []
}

// --- Custom order helpers ---

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

// --- Subscription helpers ---

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

// --- User helpers ---

export async function upsertUser(email) {
  if (!email) return
  const { error } = await supabase
    .from('users')
    .upsert({ email, updated_at: new Date().toISOString() }, { onConflict: 'email' })
  if (error) console.error('upsertUser error:', error)
}

export async function getAudioSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(path, 3600) // 1 hour
  if (error) throw error
  return data.signedUrl
}
