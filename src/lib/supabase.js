import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set — running in demo mode')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
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
