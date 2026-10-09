import { apiUrl } from './apiUrl'
import { eventData } from './eventData.js'
export { Events } from './eventData.js'

// Filter before transport so health answers and account details stay out
// of analytics requests, including hosting request logs.
export function trackEvent(name, props = {}) {
  try {
    const data = eventData(name, props)
    if (!data) return
    fetch(apiUrl('/api/track'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => console.warn('[track] unavailable'))
  } catch {
    console.warn('[track] unavailable')
  }
}
