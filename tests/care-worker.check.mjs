import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const handlers = {}, notifications = [], opened = []
let windows = []
const self = {
  location: { origin: 'https://regulatedapp.co' },
  addEventListener: (name, handler) => { handlers[name] = handler },
  registration: { showNotification: async (title, options) => { notifications.push({ title, ...options }) } },
  clients: { matchAll: async () => windows, openWindow: async path => { opened.push(path) } },
}
vm.runInNewContext(fs.readFileSync(new URL('../public/care-sw.js', import.meta.url), 'utf8'), { self, URL })
async function event(name, fields) {
  let pending
  handlers[name]({ ...fields, waitUntil: value => { pending = value } })
  await pending
}
for (const kind of ['task', 'message']) {
  await event('push', { data: { json: () => ({ kind, id: 'fixture', body: 'Private fixture text', name: 'Private name' }) } })
}
assert.deepEqual(notifications.map(n => n.body), ['Tasks', 'Messages'])
assert.ok(!JSON.stringify(notifications).includes('Private'))
let navigated, focused = 0, closed = 0
const notification = { close: () => { closed++ } }
windows = [{ url: 'https://regulatedapp.co/', navigate: async path => { navigated = path }, focus: async () => { focused++ } }]
await event('notificationclick', { notification })
assert.equal(navigated, '/care'); assert.equal(focused, 1); assert.equal(opened.length, 0)
windows = [{ url: 'https://another.example/', navigate: async () => { throw new Error('Wrong origin') } }]
await event('notificationclick', { notification })
assert.deepEqual(opened, ['/care'])
windows = [{ url: 'https://regulatedapp.co/', navigate: async () => { throw new Error('Window closed') } }]
await event('notificationclick', { notification })
assert.deepEqual(opened, ['/care', '/care'])
assert.equal(closed, 3)
console.log('Notification privacy, click routing and closed-window recovery PASS; device delivery remains unverified')
