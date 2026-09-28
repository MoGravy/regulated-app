import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')

// Only the migration's dependencies, using the types and existing unique keys
// observed in production on 29 September 2026. The legacy coupon RPC is absent.
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create table public.coupons(code varchar unique not null, used_count integer);
  create table public.custom_orders(id uuid primary key default gen_random_uuid(),
    user_email varchar, status varchar, stripe_session_id text unique,
    coupon_code_used varchar);
  create table public.subscriptions(id uuid primary key default gen_random_uuid(),
    user_email varchar, status varchar, stripe_subscription_id varchar unique,
    coupon_code_used varchar);`)
await db.exec(`insert into public.coupons values ('ANNUALFREE',0);
  insert into public.custom_orders(user_email,status,stripe_session_id,coupon_code_used)
  values ('owner@example.test','test','test_1','ANNUALFREE'),
    ('owner@example.test','test','test_2','ANNUALFREE'),
    ('owner@example.test','test','test_3','ANNUALFREE'),
    ('owner@example.test','test','test_4','ANNUALFREE');`)
assert.equal((await db.query("select to_regprocedure('public.increment_coupon_usage(text)') as old_rpc")).rows[0].old_rpc, null)
for (let i = 0; i < 2; i++) {
  await db.exec(await migration('010_payment_integrity.sql'))
  await db.exec(await migration('012_annual_free_reservations.sql'))
}
assert.equal((await db.query("select used_count from public.coupons where code='ANNUALFREE'")).rows[0].used_count, 0)
assert.equal((await db.query("select count(*)::int as n from public.custom_orders where status='test' and user_email_normalized='owner@example.test'")).rows[0].n, 4)
await db.exec("insert into public.custom_orders(user_email,status,stripe_session_id,coupon_code_used) values ('paid@example.test','confirmed','paid_1','ANNUALFREE')")
assert.equal((await db.query("select used_count from public.coupons where code='ANNUALFREE'")).rows[0].used_count, 1)
await assert.rejects(db.exec("insert into public.custom_orders(user_email,status,stripe_session_id,coupon_code_used) values ('paid@example.test','confirmed','paid_1','ANNUALFREE')"), /unique constraint/)
assert.equal((await db.query("select used_count from public.coupons where code='ANNUALFREE'")).rows[0].used_count, 1)
assert.equal((await db.query("select to_regclass('public.annual_free_reservations') as table_name")).rows[0].table_name, 'annual_free_reservations')
await db.close()
console.log('PASS live-shape migration repeat, missing RPC, existing unique key and test history')
