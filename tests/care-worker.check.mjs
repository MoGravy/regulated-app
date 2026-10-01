import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { careAlertTarget } from '../src/lib/careAlertTarget.js'

const handlers = {}, notifications = [], opened = []
let windows = []
const stored = new Map()
const caches = { open: async () => ({ put: async (key, response) => stored.set(key, await response.text()),
  match: async key => stored.has(key) ? new Response(stored.get(key)) : undefined, delete: async key => stored.delete(key) }) }
const self = {
  location: { origin: 'https://regulatedapp.co' },
  addEventListener: (name, handler) => { handlers[name] = handler },
  registration: { showNotification: async (title, options) => { notifications.push({ title, ...options }) } },
  clients: { matchAll: async () => windows, openWindow: async path => { opened.push(path) } },
}
vm.runInNewContext(fs.readFileSync(new URL('../public/care-sw.js', import.meta.url), 'utf8'), { self, URL, URLSearchParams, caches, Response })
async function event(name, fields) {
  let pending
  handlers[name]({ ...fields, waitUntil: value => { pending = value } })
  await pending
}
for (const kind of ['task', 'message']) {
  await event('push', { data: { json: () => ({ kind, id: 'fixture', eventId: '11111111-1111-4111-8111-111111111111',
    recipientId: '22222222-2222-4222-8222-222222222222', clientId: '22222222-2222-4222-8222-222222222222', practitionerId: '33333333-3333-4333-8333-333333333333',
    body: 'Private fixture text', name: 'Private name' }) } })
}
assert.deepEqual(notifications.map(n => n.body), ['Tasks', 'Messages'])
assert.ok(!JSON.stringify(notifications).includes('Private'))
let navigated, focused = 0, closed = 0
const notification = { data: notifications[0].data, close: () => { closed++ } }
const target = notification.data.url
assert.deepEqual(careAlertTarget(new URL(target, self.location.origin).search), {
  section: 'tasks', item: '11111111-1111-4111-8111-111111111111',
  pair: '22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333',
})
assert.equal(careAlertTarget(new URL(notifications[1].data.url, self.location.origin).search).section, 'messages')
assert.deepEqual(careAlertTarget('?tab=evil&item=../../admin&client=bad&practitioner=bad'), { section: null, item: null, pair: null })
let posted
windows = [{ url: 'https://regulatedapp.co/sessions', postMessage: message => { posted = message },
  navigate: async path => { navigated = path }, focus: async () => { focused++ } }]
await event('notificationclick', { notification })
assert.equal(navigated, target); assert.equal(focused, 1); assert.equal(opened.length, 0)
assert.equal(posted.type, 'care-notification'); assert.equal(posted.url, target)
assert.equal(notifications[0].icon, '/icon-192.png?v=night-2')
// Restart the worker while retaining cache storage, as iOS may terminate it between events.
vm.runInNewContext(fs.readFileSync(new URL('../public/care-sw.js', import.meta.url), 'utf8'), { self, URL, URLSearchParams, caches, Response })
const recipientId = notifications[0].data.recipientId
let resumed
const source = { url: 'https://regulatedapp.co/sessions', postMessage: data => { resumed = data } }
await event('message', { source, data: { type: 'care-notification-pending', recipientId: '33333333-3333-4333-8333-333333333333' } })
assert.equal(resumed, undefined, 'Different account must not receive the pending route')
await event('message', { source, data: { type: 'care-notification-pending', recipientId } })
assert.equal(resumed.url, target, 'Suspended Browse page receives the clicked destination on resume')
await event('message', { source, data: { type: 'care-notification-ack', recipientId, url: '/care?wrong' } })
assert.equal(stored.size, 1, 'Stale acknowledgements cannot discard a newer click')
await event('message', { source, data: { type: 'care-notification-ack', recipientId, url: target } })
assert.equal(stored.size, 0)
resumed = undefined
await event('message', { source, data: { type: 'care-notification-pending', recipientId } })
assert.equal(resumed, undefined, 'Acknowledged clicks must not reopen on later visits')
windows = [{ url: 'https://another.example/', navigate: async () => { throw new Error('Wrong origin') } }]
await event('notificationclick', { notification })
assert.deepEqual(opened, [target])
windows = [{ url: 'https://regulatedapp.co/', focus: async () => {}, navigate: async () => { throw new Error('Window closed') } }]
await event('notificationclick', { notification })
assert.deepEqual(opened, [target, target])
assert.equal(closed, 3)
notification.data = { url: 'https://evil.example/care' }
windows = []
await event('notificationclick', { notification })
assert.equal(opened.at(-1), '/care')
console.log('Notification privacy, click routing and closed-window recovery PASS; device delivery remains unverified')
