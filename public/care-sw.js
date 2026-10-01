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
    tag: data.id || 'regulated-care',
    icon: '/icon-192.png',
    data: { url: `/care?${params}` },
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
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      try {
        existing.postMessage?.({ type: 'care-notification', url: target })
        await existing.navigate(target)
        return await existing.focus()
      } catch { /* The old window may have closed after the lookup. */ }
    }
    return self.clients.openWindow(target)
  })())
})
