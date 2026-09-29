self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch { /* Generic alert if payload is unreadable. */ }
  event.waitUntil(self.registration.showNotification('Regulated', {
    body: data.kind === 'task' ? 'Tasks' : 'Messages',
    tag: data.id || 'regulated-care',
    icon: '/icon-192.png',
    data: { url: '/care' },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate('/care')
      return existing.focus()
    }
    return self.clients.openWindow('/care')
  })())
})
