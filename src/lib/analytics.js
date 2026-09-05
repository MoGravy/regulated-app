// ponytail: analytics went nowhere. The insert targeted an analytics_events
// table that was never created in production, so every session start and
// every checkout click produced a 404 in the console. Stripe already records
// purchases. Call sites stay; give this a real destination if the data is
// ever wanted.
export async function trackEvent() {}

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
