// Lightweight analytics — sends events to Supabase and mirrors them to GA4
import { supabase } from './supabase'
import { gaEvent } from './ga'

export async function trackEvent(name, properties = {}) {
  gaEvent(name, properties)
  try {
    await supabase.from('analytics_events').insert({
      event_name: name,
      properties,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Non-critical — fail silently
  }
}

export const Events = {
  SESSION_STARTED: 'session_started',
  SESSION_COMPLETED: 'session_completed',
  SESSION_ABANDONED: 'session_abandoned',
  CUSTOM_AUDIO_ORDER_STARTED: 'custom_audio_order_started',
  CUSTOM_AUDIO_ORDER_COMPLETED: 'custom_audio_order_completed',
  PREMIUM_UPGRADE_STARTED: 'premium_upgrade_started',
  PREMIUM_UPGRADE_COMPLETED: 'premium_upgrade_completed',
  MOOD_TRACKED: 'mood_tracked',
  ONBOARDING_COMPLETED: 'onboarding_completed',
}
