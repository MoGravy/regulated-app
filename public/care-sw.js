const pendingCache = 'care-alert-clicks-v1'
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
const pendingKey = recipientId => `${self.location.origin}/care-alert-pending/${recipientId}`
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch { /* Generic alert if payload is unreadable. */ }
  const params = new URLSearchParams({ tab: data.kind === 'task' ? 'tasks' : 'messages' })
  for (const [key, value] of [['item', data.eventId], ['client', data.clientId], ['practitioner', data.practitionerId]]) {
    if (typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) params.set(key, value)
  }
  event.waitUntil(self.registration.showNotification('Regulated', {
    body: data.kind === 'task' ? 'Tasks' : 'Messages',
    navigate: new URL(`/care?${params}`, self.location.origin).href,
    tag: data.id || 'regulated-care',
    icon: '/icon-192.png?v=night-2',
    data: { url: `/care?${params}`, recipientId: validId(data.recipientId) ? data.recipientId : null },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    let target = '/care'
    try {
      const url = new URL(event.notification.data?.url || '/care', self.location.origin)
      if (url.origin === self.location.origin && url.pathname === '/care') target = url.pathname + url.search
    } catch { /* Invalid destinations fall back to Support. */ }
    const recipientId = event.notification.data?.recipientId
    if (validId(recipientId)) {
      // iOS can suspend the page before it receives the click message. Keep only the route until acknowledged.
      try {
        const cache = await caches.open(pendingCache)
        await cache.put(pendingKey(recipientId), new Response(JSON.stringify({ url: target, recipientId })))
      } catch { /* Direct navigation still works if cache storage is unavailable. */ }
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      try {
        await existing.focus()
        existing.postMessage?.({ type: 'care-notification', url: target, recipientId })
        await existing.navigate(target)
        return existing
      } catch { /* The old window may have closed after the lookup. */ }
    }
    return self.clients.openWindow(target)
  })())
})

self.addEventListener('message', event => {
  const { type, recipientId, url } = event.data || {}
  if (!['care-notification-pending', 'care-notification-ack'].includes(type) || !validId(recipientId)) return
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return
  event.waitUntil((async () => {
    const cache = await caches.open(pendingCache)
    const key = pendingKey(recipientId)
    const response = await cache.match(key)
    if (!response) return
    const pending = await response.json()
    if (type === 'care-notification-ack') {
      if (pending.url === url) await cache.delete(key)
    } else {
      event.source.postMessage({ type: 'care-notification', ...pending })
    }
  })().catch(() => {}))
})
