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
await db.exec(`insert into coupons(code,discount_type,discount_amount,used_count) values ('HISTORY','fixed',10,4);
  insert into custom_orders(user_email,pattern,trigger,desired_state,status,stripe_session_id,coupon_code_used)
  values ('historic@example.test','','','','confirmed','historic_session','HISTORY');`)
for (const name of ['010_payment_integrity.sql', '010_payment_integrity.sql']) {
  await db.exec(await source(`../migrations/${name}`))
}
assert.equal((await db.query("select indisunique from pg_index where indexrelid='public.custom_orders_stripe_session_id_key'::regclass")).rows[0].indisunique, true)
assert.equal((await db.query("select contype from pg_constraint where conrelid='public.custom_orders'::regclass and conname='custom_orders_stripe_session_id_key'")).rows[0].contype, 'u')

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
        not(key, operator, value) {
          assert.match(key, /^[a-z_]+$/)
          assert.equal(operator, 'is'); assert.equal(value, null)
          filters.push(`${key} is not null`)
          return this
        },
        in(key, value) { return filter(key, '= any', value, true) },
        limit() { return this },
        async insert(row) {
          const keys = Object.keys(row)
          try { await db.query(`insert into public.${table}(${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row)); return {} }
          catch (error) { return { error } }
        },
        async upsert() { return {} },
        async maybeSingle() { const result = await query; return { data: result.data[0] || null } },
        then(resolve, reject) { return db.query(`select ${columns} from public.${table} where ${filters.join(' and ')}`, values).then(result => ({ data: result.rows })).then(resolve, reject) },
      }
      function filter(key, operator, value, array = false) {
        assert.match(key, /^[a-z_]+$/)
        values.push(value); filters.push(`${key} ${operator} ${array ? `($${values.length})` : `$${values.length}`}`)
        return query
      }
      return query
    },
  }
}
const supabase = client()
await db.exec('grant usage on schema public to service_role; grant select,insert,update on custom_orders,subscriptions to service_role')
assert.equal((await db.query("select used_count from coupons where code='HISTORY'")).rows[0].used_count, 4, 'Historical baseline is unchanged')

if (process.argv[2] !== 'coupon') {
  await db.exec(`insert into subscriptions(user_email,stripe_subscription_id,current_period_end)
    values ('  Jane@Example.Test  ','sub_fixture','2099-01-01');`)
  assert.equal((await activeSubscriptions(supabase, 'jane@example.test')).length, 1, 'Padded legacy subscription remains accessible')
  await db.exec(`grant usage on schema public to anon;
    grant insert on custom_orders to anon;
    set role anon;
    insert into custom_orders(user_email,pattern,trigger,desired_state,coupon_code_used)
      values ('  Jane@Example.Test  ','','','','ANNUALFREE');
    reset role;`)
  const annualSource = (await source('../api/_annualfree.js')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const context = vm.createContext({ process: { env: {} }, callerEmail, activeSubscriptions, sameEmail, normalEmail,
    createClient: () => supabase, Stripe: class { constructor() { return { subscriptions: { retrieve: async () => ({ items: { data: [{ price: { recurring: { interval: 'year' } } }] } }) } } } } })
  vm.runInContext(annualSource + '\nglobalThis.check = annualFreeCheck', context)
  assert.equal((await context.check({ headers: { authorization: 'Bearer fixture' } })).email, 'jane@example.test', 'Anonymous unpaid order cannot consume ANNUALFREE')
  await db.exec(`insert into coupons(code,discount_type,discount_amount,used_count) values ('ANNUALFREE','percentage',100,0);
    insert into custom_orders(user_email,pattern,trigger,desired_state,status,stripe_session_id,coupon_code_used)
      values ('  Jane@Example.Test  ','','','','confirmed','annual_paid_fixture','ANNUALFREE');`)
  for (const status of ['confirmed', 'in_progress', 'delivered', 'cancelled']) {
    await db.query("update custom_orders set status=$1 where stripe_session_id='annual_paid_fixture'", [status])
    assert.equal((await context.check({ headers: { authorization: 'Bearer fixture' } })).error, 'ANNUALFREE has already been used on this account', `Paid padded-email order consumes ANNUALFREE in ${status} state`)
  }
  assert.equal((await activeSubscriptions(supabase, 'j_ne@example.test')).length, 0)
  await db.exec('create table store_entitlements(id text,account_id text,environment text,provider text,status text,expires_at timestamptz)')
  const accessSource = (await source('../api/_access.js')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const accessContext = vm.createContext({ normalEmail, sameEmail, syncRevenueCatSnapshot: async () => ({ enabled: false, fresh: false }) })
  vm.runInContext(accessSource + '\nglobalThis.access = hasPremiumAccess', accessContext)
  assert.equal(await accessContext.access(supabase, { id: 'fixture', email: 'jane@example.test' }), true)
  assert.equal(await accessContext.access(supabase, { id: 'fixture', email: 'j_ne@example.test' }), false)
  for (const space of ['\t', '\n', '\u00a0', '\ufeff', '\u2003']) {
    await db.query('update subscriptions set user_email=$1', [space + 'Jane@Example.Test' + space])
    assert.equal((await activeSubscriptions(supabase, 'jane@example.test')).length, 1)
  }
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
    await db.exec('set role service_role')
    try { await context.handler(req, res) } finally { await db.exec('reset role') }
    return status
  }
  assert.equal(await deliver(), 500, 'Count failure must request a Stripe retry')
  assert.equal((await db.query("select count(*)::int as n from custom_orders where stripe_session_id='fixture_session'")).rows[0].n, 0, 'Count failure rolls back paid order')
  await db.exec('drop trigger fixture_outage on coupons')
  assert.equal(await deliver(), 200)
  assert.equal(await deliver(), 200)
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 1, 'Retry counts exactly once')
  assert.equal(await deliver('subscription', 'fixture_subscription'), 200)
  assert.equal(await deliver('subscription', 'fixture_subscription'), 200)
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 2)
  await db.exec("select public.increment_coupon_usage('FIXTURE')")
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 2, 'Old webhook overlap cannot double count')
  await db.exec('create unique index fixture_unique_email on subscriptions(user_email)')
  assert.equal(await deliver('subscription', 'different_subscription'), 500, 'Unrelated unique failure is not acknowledged')
  await db.exec('drop index fixture_unique_email')
  await db.exec("update coupons set used_count=null where code='FIXTURE'")
  assert.equal(await deliver('custom_audio', 'null_count'), 500)
  await db.exec("delete from coupons where code='FIXTURE'")
  assert.equal(await deliver('custom_audio', 'missing_coupon'), 500)
  await db.exec("insert into coupons(code,discount_type,discount_amount,used_count,active,max_uses,expires_at) values ('FIXTURE','fixed',10,10,false,1,'2000-01-01')")
  assert.equal(await deliver('custom_audio', 'paid_after_expiry'), 200, 'Paid event must not be rejected when coupon is now expired or exhausted')
  await db.exec(`grant usage on schema public to anon, authenticated;
    grant select,insert,update on custom_orders,coupons to anon,authenticated;`)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    for (const [status, payment, coupon] of [['confirmed', 'fake_session', 'FIXTURE'], ['confirmed', null, null], ['pending_payment', 'poison_session', null]]) {
      await assert.rejects(db.query("insert into custom_orders(user_email,pattern,trigger,desired_state,status,stripe_session_id,coupon_code_used) values ('fake@example.test','','','',$1,$2,$3)", [status, payment, coupon]), /row-level security/)
    }
    await db.query("insert into custom_orders(user_email,pattern,trigger,desired_state,status,coupon_code_used) values ($1,'','','','pending_payment','FIXTURE')", [role + '@example.test'])
    await db.query("update custom_orders set status='confirmed',stripe_session_id='fake_update' where user_email=$1", [role + '@example.test'])
    await assert.rejects(db.exec("select public.increment_coupon_usage('FIXTURE')"), /permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select status from custom_orders where user_email=$1', [role + '@example.test'])).rows[0].status, 'pending_payment', 'Client update cannot forge a paid row')
  }
  assert.equal((await db.query("select used_count from coupons where code='FIXTURE'")).rows[0].used_count, 11)
  console.log('PASS coupon failure recovery and exactly-once custom/subscription retries')
}
await db.close()

const duplicates = new PGlite()
await duplicates.exec(`create role anon; create role authenticated; create role service_role;
  create table subscriptions(user_email text);
  create table custom_orders(user_email text,stripe_session_id text);
  insert into custom_orders values ('fixture@example.test','same_session'),('fixture@example.test','same_session');`)
await assert.rejects(duplicates.exec(await source('../migrations/010_payment_integrity.sql')), /could not create unique index/)
await duplicates.exec('rollback')
assert.equal((await duplicates.query("select count(*)::int as n from information_schema.columns where column_name='user_email_normalized'")).rows[0].n, 0, 'Duplicate history rolls back the whole migration')
assert.equal((await duplicates.query('select count(*)::int as n from custom_orders')).rows[0].n, 2, 'Historical duplicates remain untouched')
await duplicates.close()
console.log('PASS repeatable migration, unique payment key and duplicate-history rollback')
