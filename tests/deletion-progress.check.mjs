import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const source = path => readFile(new URL(path, import.meta.url), 'utf8')
const db = new PGlite()
const account = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const receipt = '00000000-0000-4000-8000-000000000011'
const otherReceipt = '00000000-0000-4000-8000-000000000012'

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
  create function auth.role() returns text language sql stable as $$select current_user::text$$;
  create table storage.buckets(id text primary key,name text,public boolean);`)
await db.exec((await source('../supabase-schema.sql')).replace('create extension if not exists "uuid-ossp";', '')
  .replaceAll('uuid_generate_v4()', 'gen_random_uuid()'))
for (const file of ['001_auth_and_program.sql', '007_courses.sql', '009_care.sql',
  '008_account_deletion_requests.sql', '011_account_deletion_workflow.sql', '019_deletion_dispatch.sql']) {
  await db.exec(await source(`../migrations/${file}`))
}
await db.query('insert into auth.users(id) values ($1),($2)', [account, other])
await db.query('insert into public.account_deletion_requests(id,account_id) values ($1,$2),($3,$4)',
  [receipt, account, otherReceipt, other])
await db.query(`insert into public.care_links(client_id,practitioner_id,client_label,practitioner_label)
  values ($1,$2,'private client','private practitioner')`, [account, other])
await db.query(`insert into public.care_messages(client_id,practitioner_id,sender_id,body)
  values ($1,$2,$1,'private clinical record')`, [account, other])
await db.exec(`insert into public.sessions(id,title,category,duration)
  values ('00000000-0000-4000-8000-000000000023','fixture','sleep',10);
  insert into public.programs(id,slug,title) values ('00000000-0000-4000-8000-000000000021','fixture','fixture');
  insert into public.program_days(id,program_id,week,day,session_id)
  values ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000021',1,1,'00000000-0000-4000-8000-000000000023');
  insert into public.courses(id,slug,title) values ('00000000-0000-4000-8000-000000000031','fixture','fixture');
  insert into public.course_lessons(id,course_id,title,position)
  values ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000031','fixture',1);`)
for (const id of [account, other]) {
  await db.query(`insert into public.user_progress(user_id,program_day_id)
    values ($1,'00000000-0000-4000-8000-000000000022')`, [id])
  await db.query(`insert into public.course_progress(user_id,lesson_id)
    values ($1,'00000000-0000-4000-8000-000000000032')`, [id])
}
const protectedBefore = (await db.query(`select
  (select jsonb_agg(to_jsonb(t)) from auth.users t) as auth,
  (select jsonb_agg(to_jsonb(t)) from public.care_links t) as links,
  (select jsonb_agg(to_jsonb(t)) from public.care_messages t) as messages`)).rows[0]
const deadlineBefore = (await db.query(`select requested_at,review_due_at,ordinary_due_at
  from public.account_deletion_requests where id=$1`, [receipt])).rows[0]

await db.exec(await source('../migrations/020_deletion_progress.sql'))
await db.exec(await source('../migrations/020_deletion_progress.sql'))
const { prepareProgressCleanup, executeProgressCleanup } = await import('../scripts/deletion-progress.mjs')
const plan = await prepareProgressCleanup(db, receipt)
assert.deepEqual(plan.counts, { user_progress: 1, course_progress: 1 })
assert.equal(plan.approved, false)
assert.equal(JSON.stringify(plan).includes('private'), false)
const claims = (await db.query('select * from public.claim_deletion_requests(10)')).rows
const claim = claims.find(row => row.request_id === receipt)
const wrongClaim = claims.find(row => row.request_id === otherReceipt)
async function refusal(run) {
  await assert.rejects(run(), { message: 'Progress cleanup needs review' })
  const counts = (await db.query(`select
    (select count(*)::int from public.user_progress where user_id=$1) as progress,
    (select count(*)::int from public.course_progress where user_id=$1) as courses`, [account])).rows[0]
  assert.deepEqual(counts, { progress: 1, courses: 1 })
  assert.equal((await db.query('select completed_at from public.deletion_progress_plans where request_id=$1', [receipt])).rows[0].completed_at, null)
}
await refusal(() => executeProgressCleanup(db, claim, plan.planHash))
await db.query(`update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator'
  where request_id=$1 and plan_hash=$2`, [receipt, plan.planHash])
await db.query(`update public.account_deletion_requests set reviewed_at=now(),reviewed_by='fixture operator'
  where id=$1`, [receipt])
await refusal(() => executeProgressCleanup(db, wrongClaim, plan.planHash))
await refusal(() => executeProgressCleanup(db, { ...claim, generation: claim.generation + 1 }, plan.planHash))
await refusal(() => executeProgressCleanup(db, { ...claim, account_id: other }, plan.planHash))
await refusal(() => executeProgressCleanup(db, { ...claim, lease_token: other }, plan.planHash))
await refusal(() => executeProgressCleanup(db, claim, 'not-approved'))
await db.query("update public.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1", [receipt])
await refusal(() => executeProgressCleanup(db, claim, plan.planHash))
await db.query("update public.account_deletion_requests set lease_until=clock_timestamp()+interval '5 minutes' where id=$1", [receipt])
await assert.rejects(db.query(`update public.deletion_progress_plans set account_id=$2 where request_id=$1`, [receipt, other]))
await db.query(`update public.user_progress set completed_at=completed_at+interval '1 minute' where user_id=$1`, [account])
await refusal(() => executeProgressCleanup(db, claim, plan.planHash))
await db.query(`update public.user_progress set completed_at=completed_at-interval '1 minute' where user_id=$1`, [account])
// xmin changed too, so revoke and obtain a fresh reviewed plan.
await db.query('update public.deletion_progress_plans set approved_at=null,approved_by=null where request_id=$1', [receipt])
const fresh = await prepareProgressCleanup(db, receipt)
await db.query(`update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator' where request_id=$1`, [receipt])
await db.exec('alter table public.courses add column unreviewed text')
await refusal(() => executeProgressCleanup(db, claim, fresh.planHash))
await db.exec('alter table public.courses drop column unreviewed')
// Dropping the added column changes the catalog, so approve another fresh plan.
await db.query('update public.deletion_progress_plans set approved_at=null,approved_by=null where request_id=$1', [receipt])
const current = await prepareProgressCleanup(db, receipt)
await db.query(`update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator' where request_id=$1`, [receipt])
const crashed = { transaction: callback => db.transaction(tx => callback({
  query: async (sql, params) => {
    if (sql.startsWith('delete from public.course_progress')) throw new Error('private simulated crash')
    return tx.query(sql, params)
  },
})) }
await refusal(() => executeProgressCleanup(crashed, claim, current.planHash))
const expiredDuringDelete = { transaction: callback => db.transaction(tx => callback({
  query: async (sql, params) => {
    if (sql.startsWith('delete from public.course_progress')) {
      await tx.query("update public.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1", [receipt])
    }
    return tx.query(sql, params)
  },
})) }
await refusal(() => executeProgressCleanup(expiredDuringDelete, claim, current.planHash))

async function reviewedPlan() {
  await db.query('update public.deletion_progress_plans set approved_at=null,approved_by=null where request_id=$1', [receipt])
  const staged = await prepareProgressCleanup(db, receipt)
  await db.query(`update public.deletion_progress_plans set approved_at=now(),approved_by='fixture operator' where request_id=$1`, [receipt])
  return staged
}
// Even an approved snapshot cannot authorize effects outside the two progress tables.
await db.exec(`create function public.fixture_effect() returns trigger language plpgsql as $$
  begin delete from public.care_messages; return new; end; $$;
  create trigger fixture_effect after update on public.deletion_progress_plans
  for each row when (new.completed_at is not null) execute function public.fixture_effect();`)
await refusal(() => reviewedPlan())
await db.exec('drop trigger fixture_effect on public.deletion_progress_plans; drop function public.fixture_effect()')
await db.exec('alter table public.user_progress disable trigger freeze_deleted_progress')
await refusal(() => reviewedPlan())
await db.exec('alter table public.user_progress enable trigger freeze_deleted_progress')
await db.exec('alter table public.deletion_progress_plans disable trigger guard_progress_plan')
await refusal(() => reviewedPlan())
await db.exec('alter table public.deletion_progress_plans enable trigger guard_progress_plan')
await db.exec(`create or replace function public.freeze_deleted_progress()
  returns trigger language plpgsql security definer set search_path='' as $$begin return new; end;$$;`)
await refusal(() => reviewedPlan())
await db.exec(await source('../migrations/020_deletion_progress.sql'))
await db.exec(`create function public.fixture_check(timestamptz) returns boolean language plpgsql as $$
  begin if $1 is not null then delete from public.care_messages; end if; return true; end; $$;
  alter table public.deletion_progress_plans add constraint fixture_effect check (public.fixture_check(completed_at));`)
await refusal(() => reviewedPlan())
await db.exec('alter table public.deletion_progress_plans drop constraint fixture_effect; drop function public.fixture_check(timestamptz)')
await db.exec('create index fixture_expression on public.deletion_progress_plans ((coalesce(approved_by,\'\')))')
await refusal(() => reviewedPlan())
await db.exec('drop index public.fixture_expression')
await db.exec('grant select on public.deletion_progress_plans to authenticated')
await refusal(() => reviewedPlan())
await db.exec('revoke select on public.deletion_progress_plans from authenticated')
await db.exec(`create table public.fixture_child (
  progress_id uuid references public.user_progress(id) on delete cascade);
  insert into public.fixture_child select id from public.user_progress where user_id='00000000-0000-4000-8000-000000000001';`)
const withChild = await reviewedPlan()
await refusal(() => executeProgressCleanup(db, claim, withChild.planHash))
assert.equal((await db.query('select count(*)::int as n from public.fixture_child')).rows[0].n, 1)
await db.exec('drop table public.fixture_child')
const finalPlan = await reviewedPlan()
await db.exec('set session_replication_role=replica')
await refusal(() => executeProgressCleanup(db, claim, finalPlan.planHash))
await db.exec('set session_replication_role=origin')
const result = await executeProgressCleanup(db, claim, finalPlan.planHash)
assert.deepEqual(result, { progressCleaned: true, alreadyCleaned: false, accountDeleted: false })
const retry = await executeProgressCleanup(db, claim, finalPlan.planHash)
assert.deepEqual(retry, { progressCleaned: true, alreadyCleaned: true, accountDeleted: false })
assert.equal((await db.query('select count(*)::int as n from public.user_progress where user_id=$1', [account])).rows[0].n, 0)
assert.equal((await db.query('select count(*)::int as n from public.course_progress where user_id=$1', [account])).rows[0].n, 0)
assert.equal((await db.query('select count(*)::int as n from public.user_progress where user_id=$1', [other])).rows[0].n, 1)
await assert.rejects(db.query(`insert into public.user_progress(user_id,program_day_id)
  values ($1,'00000000-0000-4000-8000-000000000022')`, [account]), /Progress is unavailable/)
await assert.rejects(db.query('update public.course_progress set user_id=$1 where user_id=$2', [account, other]), /Progress is unavailable/)
await assert.rejects(db.query('update public.deletion_progress_plans set completed_at=null where request_id=$1', [receipt]))
await db.query('update public.course_progress set completed_at=now() where user_id=$1', [other])
await assert.rejects(db.transaction(async tx => {
  await tx.query('set transaction isolation level repeatable read')
  await tx.query('update public.course_progress set completed_at=now() where user_id=$1', [other])
}), /Progress is unavailable/)
const protectedAfter = (await db.query(`select
  (select jsonb_agg(to_jsonb(t)) from auth.users t) as auth,
  (select jsonb_agg(to_jsonb(t)) from public.care_links t) as links,
  (select jsonb_agg(to_jsonb(t)) from public.care_messages t) as messages`)).rows[0]
assert.deepEqual(protectedAfter, protectedBefore)
assert.deepEqual((await db.query(`select requested_at,review_due_at,ordinary_due_at
  from public.account_deletion_requests where id=$1`, [receipt])).rows[0], deadlineBefore)
const state = (await db.query('select ordinary_state,held_state from public.account_deletion_requests where id=$1', [receipt])).rows[0]
assert.notEqual(state.ordinary_state, 'done')
assert.notEqual(state.held_state, 'done')
const permissions = (await db.query(`select
  has_table_privilege('anon','public.deletion_progress_plans','SELECT') as anon,
  has_table_privilege('authenticated','public.deletion_progress_plans','INSERT') as client,
  has_function_privilege('authenticated','public.freeze_deleted_progress()','EXECUTE') as trigger,
  has_table_privilege('service_role','public.deletion_progress_plans','SELECT,INSERT,UPDATE') as server`)).rows[0]
assert.deepEqual(permissions, { anon: false, client: false, trigger: false, server: true })
await db.close()
console.log('PASS: real progress cleanup, explicit approval, immutable plan, identity/lease/row/schema checks, crash rollback, durable retry, write freeze, private access and protected records/deadlines.')
