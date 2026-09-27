import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const path = new URL('../api/deliver-audio.js', import.meta.url)
const source = fs.readFileSync(path, 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default async function handler', 'async function handler')

async function call(configured, body) {
  let databaseCalls = 0
  const context = vm.createContext({
    process: { env: { ADMIN_SECRET: configured } },
    createClient: () => ({ from() { databaseCalls++; throw new Error('Unexpected database access') } }),
    Resend: class { constructor() { this.emails = { send() { throw new Error('Unexpected email') } } } },
    console: { error() {} },
  })
  vm.runInContext(source + '\nglobalThis.handler = handler', context)
  let status, payload
  const res = { status(value) { status = value; return this }, json(value) { payload = value; return this }, end() { return this } }
  await context.handler({ method: 'POST', body }, res)
  return { status, payload, databaseCalls }
}

const blocked = [
  [undefined, 'change-this-secret'],
  [undefined, undefined],
  ['', ''],
  ['test-only-configured-value', 'wrong-value'],
]
for (const [configured, supplied] of blocked) {
  const result = await call(configured, { orderId: 'fixture-order', audioPath: 'fixture.wav', secret: supplied })
  assert.equal(result.status, 401, 'Unconfigured or invalid admin access must fail closed')
  assert.equal(result.databaseCalls, 0, 'Rejected requests must not query customer orders')
}
const valid = await call('test-only-configured-value', { secret: 'test-only-configured-value' })
assert.equal(valid.status, 400, 'Configured valid admin reaches request validation')
assert.equal(valid.databaseCalls, 0)
console.log('PASS: missing, empty, placeholder and invalid auth blocked before customer access; configured auth reaches validation.')
