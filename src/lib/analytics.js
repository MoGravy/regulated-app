// Code handoff item 6. Fire and forget to api/track, which writes one
// anonymous row per event. Never awaited by callers; a failure is logged
// and the screen carries on.
export function trackEvent(name, props = {}) {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(err => console.warn('[track]', name, err?.message))
  } catch (err) {
    console.warn('[track]', name, err?.message)
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
  CHECKIN_TAP: 'checkin_tap',
  SESSION_CHECKOUT: 'session_checkout',
  ONBOARDING_COMPLETED: 'onboarding_completed',
}
