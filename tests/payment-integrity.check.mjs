import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { callerEmail, activeSubscriptions, sameEmail, normalEmail } from '../api/_identity.js'
import { receiptStatus } from '../api/_checkout-receipt.js'
import { ui } from '../src/content/reviewedCopy.js'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
const source = path => readFile(new URL(path, import.meta.url), 'utf8')
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.role() returns text language sql stable as $$select current_user::text$$;`)
await db.exec((await source('../supabase-schema.sql')).replace('create extension if not exists "uuid-ossp";', '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()'))
await db.exec('create unique index custom_orders_stripe_session_id_key on public.custom_orders(stripe_session_id)')
for (const name of ['010_payment_integrity.sql']) {
  try { await db.exec(await source(`../migrations/${name}`)) } catch (error) { if (error.code !== 'ENOENT') throw error }
}

function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture', email: 'jane@example.test' } } }) },
    async rpc(name, args) {
      try { return { data: (await db.query(`select public.${name}($1)`, [args.p_code])).rows } }
      catch (error) { return { error } }
    },
    from(table) {
      assert.match(table, /^[a-z_]+$/)
      const filters = [], values = []
      let columns = '*'
      const query = {
        select(value) { columns = value; return this },
        eq(key, value) { return filter(key, '=', value) },
        ilike(key, value) { return filter(key, 'ilike', value) },
        gt(key, value) { return filter(key, '>', value) },
        async insert(row) {
          const keys = Object.keys(row)
          try { await db.query(`insert into public.${table}(${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row)); return {} }
          catch (error) { return { error } }
        },
        async upsert() { return {} },
        then(resolve, reject) { return db.query(`select ${columns} from public.${table} where ${filters.join(' and ')}`, values).then(result => ({ data: result.rows })).then(resolve, reject) },
      }
      function filter(key, operator, value) {
        assert.match(key, /^[a-z_]+$/)
        values.push(value); filters.push(`${key} ${operator} $${values.length}`)
        return query
      }
      return query
    },
  }
}
const supabase = client()

if (process.argv[2] !== 'coupon') {
  await db.exec(`insert into subscriptions(user_email,stripe_subscription_id,current_period_end)
    values ('  Jane@Example.Test  ','sub_fixture','2099-01-01');`)
  assert.equal((await activeSubscriptions(supabase, 'jane@example.test')).length, 1, 'Padded legacy subscription remains accessible')
  await db.exec(`insert into custom_orders(user_email,pattern,trigger,desired_state,coupon_code_used)
    values ('  Jane@Example.Test  ','','','','ANNUALFREE')`)
  const annualSource = (await source('../api/_annualfree.js')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const context = vm.createContext({ process: { env: {} }, callerEmail, activeSubscriptions, sameEmail, normalEmail,
    createClient: () => supabase, Stripe: class { constructor() { return { subscriptions: { retrieve: async () => ({ items: { data: [{ price: { recurring: { interval: 'year' } } }] } }) } } } } })
  vm.runInContext(annualSource + '\nglobalThis.check = annualFreeCheck', context)
  assert.equal((await context.check({ headers: { authorization: 'Bearer fixture' } })).error, 'ANNUALFREE has already been used on this account')
  assert.equal((await activeSubscriptions(supabase, 'j_ne@example.test')).length, 0)
  console.log('PASS padded subscription, ANNUALFREE prior use and literal email matching')
}

if (process.argv[2] !== 'email') {
  await db.exec(`insert into coupons(code,discount_type,discount_amount,used_count) values ('FIXTURE','fixed',10,0);
    create function reject_fixture_count() returns trigger language plpgsql as $$begin raise exception 'fixture count outage'; end$$;
    create trigger fixture_outage before update on coupons for each row execute function reject_fixture_count();`)
  let event
  const webhookSource = (await source('../api/stripe-webhook.js')).replace(/^import .*$/gm, '').replace('export default async function handler', 'async function handler').replaceAll('export ', '')
  const context = vm.createContext({ process: { env: {} }, Buffer, receiptStatus, ui, normalEmail,
    createClient: () => supabase,
    Stripe: class { constructor() { return { webhooks: { constructEvent: () => event }, subscriptions: { retrieve: async id => ({ id, current_period_end: 4102444800 }) } } } },
    Resend: class { constructor() { return { emails: { send: async () => ({}) } } } }, console: { error() {}, log() {} } })
  vm.runInContext(webhookSource + '\nglobalThis.handler = handler', context)
  async function deliver(type = 'custom_audio', id = 'fixture_session') {
    event = { type: 'checkout.session.completed', data: { object: { id, subscription: id, payment_status: 'paid', metadata: { type, user_email: 'jane@example.test', coupon_code: 'FIXTURE' } } } }
    const req = Readable.from([Buffer.from('{}')]); req.method = 'POST'; req.headers = { 'stripe-signature': 'fixture' }
    let status
    const res = { status(value) { status = value; return this }, json() {}, end() {} }
    await context.handler(req, res)
    return status
  }
  assert.equal(await deliver(), 500, 'Count failure must request a Stripe retry')
  await db.exec('drop trigger fixture_outage on coupons')
  assert.equal(await deliver(), 200)
  assert.equal(await deliver(), 200)
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 1, 'Retry counts exactly once')
  assert.equal(await deliver('subscription', 'fixture_subscription'), 200)
  assert.equal(await deliver('subscription', 'fixture_subscription'), 200)
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 2)
  console.log('PASS coupon failure recovery and exactly-once custom/subscription retries')
}
await db.close()
