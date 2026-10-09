import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { Events, eventData } from '../src/lib/eventData.js'

const supplied = {
  email: 'fixture@example.test', name: 'Fixture Person',
  account_id: '11111111-1111-4111-8111-111111111111',
  session_title: 'Health fixture', answer: 'private health answer',
  state: 'wired', value: 7, nested: { health: 'private' }, plan: 'annual',
}
for (const name of Object.values(Events)) {
  assert.deepEqual(eventData(name, supplied), {
    name, props: name === Events.PREMIUM_UPGRADE_STARTED ? { plan: 'annual' } : {},
  })
}
for (const plan of ['private text', 'ANNUAL', {}, ['annual'], true, null]) {
  assert.deepEqual(eventData(Events.PREMIUM_UPGRADE_STARTED, { plan }).props, {})
}
assert.equal(eventData('private health answer', supplied), null)

const calls = []
const warnings = []
const client = (await readFile(new URL('../src/lib/analytics.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '').replace(/^export \{.*\n/gm, '').replace('export function', 'function')
const context = vm.createContext({
  eventData, apiUrl: value => value,
  fetch: async (url, options) => { calls.push(JSON.parse(options.body)) },
  console: { warn: (...args) => warnings.push(args) },
})
vm.runInContext(client + '\nglobalThis.trackEvent = trackEvent', context)
context.trackEvent(Events.MOOD_TRACKED, supplied)
context.trackEvent(Events.PREMIUM_UPGRADE_STARTED, supplied)
context.trackEvent('private health answer', supplied)
assert.deepEqual(calls, [
  { name: Events.MOOD_TRACKED, props: {} },
  { name: Events.PREMIUM_UPGRADE_STARTED, props: { plan: 'annual' } },
])
assert.equal(warnings.length, 0)

const inserts = []
const server = (await readFile(new URL('../api/track.js', import.meta.url), 'utf8'))
  .replace(/^import .*\n/gm, '').replace('export default async function', 'async function')
const api = vm.createContext({
  eventData, process: { env: {} }, setNativeCors() {},
  createClient: () => ({ from(table) { assert.equal(table, 'events'); return {
    async insert(data) { inserts.push(data); return { error: null } },
  } } }),
})
vm.runInContext(server + '\nglobalThis.handler = handler', api)
let status
const res = { status(n) { status = n; return this }, json() { return this }, end() { return this } }
await api.handler({ method: 'POST', body: { name: Events.SESSION_CHECKOUT, props: supplied } }, res)
assert.equal(status, 204)
assert.deepEqual(inserts, [{ name: Events.SESSION_CHECKOUT, props: {} }])
await api.handler({ method: 'POST', body: { name: 'private health answer', props: supplied } }, res)
assert.equal(status, 400)
assert.equal(inserts.length, 1)
console.log('PASS: app requests and direct API calls exclude identity, free text and health answers; only exact subscription plans survive.')
