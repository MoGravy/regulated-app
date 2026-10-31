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

const names = new Set(Object.values(Events))

export function eventData(name, props) {
  if (!names.has(name)) return null
  const plan = props?.plan
  return {
    name,
    props: name === Events.PREMIUM_UPGRADE_STARTED && ['monthly', 'annual'].includes(plan)
      ? { plan } : {},
  }
}
