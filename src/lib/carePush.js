import { supabase } from './supabase'

export async function carePushRequest(action, fields = {}) {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Signed out')
  const request = session => fetch('/api/care-push', {
    method: action ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.access_token}`, ...(action && { 'Content-Type': 'application/json' }) },
    ...(action && { body: JSON.stringify({ action, ...fields }) }),
  })
  let response = await request(data.session)
  // A resumed phone can send its previous token before automatic refresh finishes.
  // Only retry an authentication rejection, which happens before any action runs.
  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession()
    const session = refreshed.data?.session
    if (refreshed.error || !session?.access_token || !data.session.user?.id || session.user?.id !== data.session.user.id) {
      throw new Error('Signed out')
    }
    response = await request(session)
  }
  if (!response.ok) throw new Error('Alert request failed')
  return response.json()
}

export function supportsCarePush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function disableCarePush() {
  if (!supportsCarePush()) return
  const registration = await navigator.serviceWorker.getRegistration('/care-sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  try {
    await carePushRequest('unsubscribe', { endpoint: subscription.endpoint })
  } finally {
    // The device stops receiving alerts even if the app server is offline.
    await subscription.unsubscribe()
  }
}

export async function enableCarePush(publicKey) {
  const registration = await navigator.serviceWorker.register('/care-sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  try {
    await carePushRequest('subscribe', { subscription: subscription.toJSON() })
  } catch (error) {
    if (!existing) await subscription.unsubscribe()
    throw error
  }
}
