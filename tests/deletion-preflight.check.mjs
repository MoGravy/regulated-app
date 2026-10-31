import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const runtime = process.env.PGLITE_MODULE || '/Users/matthew/AgentWorkspace/regulated-device-check/postgres-check/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(runtime))
const db = new PGlite()
const source = path => readFile(new URL(path, import.meta.url), 'utf8')
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
  create function auth.role() returns text language sql stable as $$select current_user::text$$;
  create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
  create table storage.buckets(id text primary key, name text, public boolean);
`)
const base = (await source('../supabase-schema.sql'))
  .replace('create extension if not exists "uuid-ossp";', '')
  .replaceAll('uuid_generate_v4()', 'gen_random_uuid()')
await db.exec(base)
for (const file of [
  '001_auth_and_program.sql', '002_session_tags.sql', '003_program_tracks.sql',
  '004_session_waitlist.sql', '005_rls.sql', '006_events.sql',
  '007_lock_down_rpc_and_subscriptions.sql', '007_store_entitlements.sql', '008_account_deletion_requests.sql', '009_revenuecat_sync.sql', '010_payment_integrity.sql', '011_account_deletion_workflow.sql', '012_annual_free_reservations.sql',
]) await db.exec(await source(`../migrations/${file}`))
const { rows: [permissions] } = await db.query(`select
  has_function_privilege('anon','public.increment_coupon_usage(text)','execute') as anon_coupon,
  has_function_privilege('authenticated','public.increment_coupon_usage(text)','execute') as account_coupon,
  has_function_privilege('service_role','public.increment_coupon_usage(text)','execute') as server_coupon,
  has_function_privilege('anon','public.increment_completed_sessions(text)','execute') as anon_counter,
  has_function_privilege('authenticated','public.increment_completed_sessions(text)','execute') as account_counter`)
assert.deepEqual(permissions, { anon_coupon: false, account_coupon: false, server_coupon: true, anon_counter: false, account_counter: false })
await db.exec(await source('./fixtures/deletion-education.sql'))

const ids = {
  client: '00000000-0000-4000-8000-000000000001',
  practitioner: '00000000-0000-4000-8000-000000000002',
  unrelated: '00000000-0000-4000-8000-000000000003',
  clientReceipt: '00000000-0000-4000-8000-000000000011',
  practitionerReceipt: '00000000-0000-4000-8000-000000000012',
  task: '00000000-0000-4000-8000-000000000021',
  order: '00000000-0000-4000-8000-000000000022',
}
await db.query(`insert into auth.users values ($1,'client@example.test',now()),
  ($2,'practitioner@example.test',now()),($3,'unrelated@example.test',now())`, [ids.client, ids.practitioner, ids.unrelated])
await db.query('insert into public.account_deletion_requests(id,account_id) values ($1,$2),($3,$4)',
  [ids.clientReceipt, ids.client, ids.practitionerReceipt, ids.practitioner])
await db.query(`insert into public.annual_free_reservations(account_id,user_email,reservation_id)
  values ($1,'client@example.test',$2)`, [ids.client, ids.order])
await db.query(`insert into public.care_links(client_id,practitioner_id,client_label,practitioner_label)
  values ($1,$2,'private client label','private practitioner label')`, [ids.client, ids.practitioner])
await db.query(`insert into public.care_tasks(id,client_id,practitioner_id,title)
  values ($1,$2,$3,'private task')`, [ids.task, ids.client, ids.practitioner])
await db.query(`insert into public.care_task_entries(task_id,entry_type,body)
  values ($1,'note','private clinical text')`, [ids.task])
await db.query(`insert into public.care_messages(client_id,practitioner_id,sender_id,body)
  values ($1,$2,$2,'private message')`, [ids.client, ids.practitioner])
await db.query(`insert into public.custom_orders(id,user_email,pattern,trigger,desired_state,audio_url)
  values ($1,'client@example.test','private intake','private trigger','private desired state','custom-audios/shared.wav')`, [ids.order])
await db.exec(`insert into public.custom_orders(user_email,pattern,trigger,desired_state,audio_url)
  values ('unrelated@example.test','other intake','other trigger','other state','custom-audios/shared.wav');
  insert into public.custom_orders(user_email,pattern,trigger,desired_state)
  values ('  client@example.test  ','padded intake','padded trigger','padded desired state');
  insert into public.subscriptions(user_email,stripe_subscription_id)
  values ('  client@example.test  ','padded_subscription_fixture');
  insert into public.analytics_events(event_name,properties) values ('old_event','{"private":"historical private text"}');`)

function restClient(database, { historicalCompatibility = false } = {}) {
  return {
    auth: { admin: { async getUserById(id) {
      const result = await database.query('select id,email,email_confirmed_at from auth.users where id=$1', [id])
      return { data: { user: result.rows[0] } }
    } } },
    from(table) {
      assert.match(table, /^[a-z_]+$/)
      let columns, head, single = false, start = 0, end = 999999
      const filters = []
      const builder = {
        select(selected, options = {}) { columns = selected; head = options.head; return this },
        eq(column, value) { filters.push({ column, value, method: '=' }); return this },
        ilike(column, value) { filters.push({ column, value, method: 'ilike' }); return this },
        or(value, { referencedTable } = {}) { filters.push({ value, referencedTable, method: 'or' }); return this },
        order() { return this },
        range(first,last) { start = first; end = last; return this },
        single() { single = true; return this },
        then(resolve,reject) { return run().then(resolve,reject) },
      }
      async function run() {
        // Compatibility counts keep the historical approved-schema regression checks.
        // Only allowlisted relations proven absent can be faked; current-schema checks use SQL throughout.
        const historicalInventoryTables = ['dap_purchases', 'care_links', 'care_tasks', 'care_messages',
          'care_task_entries', 'care_message_reactions', 'care_push_subscriptions', 'care_push_jobs']
        if (historicalCompatibility && historicalInventoryTables.includes(table)) {
          const { rows: [relation] } = await database.query('select to_regclass($1) is null as absent', [`public.${table}`])
          if (relation.absent) {
            assert.equal(head, true)
            return { data: null, count: 0 }
          }
        }
        const embedded = columns.match(/,(\w+)(!inner)?\(\)$/)
        const values = []
        let relatedExists
        function predicate({ column, value, method }, alias) {
          if (method === 'or') return `(${value.split(',').map(term => {
            const [name, operator, ...rest] = term.split('.')
            if (operator === 'not') {
              assert.deepEqual(rest, ['is', 'null'])
              assert.equal(name, embedded?.[1])
              assert.ok(relatedExists)
              return relatedExists
            }
            assert.equal(operator, 'eq')
            return predicate({ column: name, value: rest.join('.'), method: '=' }, alias)
          }).join(' or ')})`
          assert.match(column, /^[a-z_]+$/)
          assert.ok(['=', 'ilike'].includes(method))
          values.push(value)
          return `${alias}.${column} ${method} $${values.length}`
        }
        const where = []
        if (embedded) {
          const relations = { care_task_entries: ['care_tasks', 'task_id'], care_message_reactions: ['care_messages', 'message_id'], care_push_jobs: ['care_push_subscriptions', 'subscription_id'] }
          const [relation, foreignKey] = relations[table]
          assert.equal(embedded[1], relation)
          const conditions = filters.filter(filter => filter.referencedTable === relation || filter.column?.startsWith(`${relation}.`))
            .map(filter => predicate({ ...filter, column: filter.column?.replace(`${relation}.`, '') }, 'related'))
          relatedExists = `exists(select 1 from public.${relation} related where related.id=t.${foreignKey} and ${conditions.join(' and ')})`
          if (embedded[2]) where.push(relatedExists)
        }
        where.push(...filters.filter(filter => !filter.referencedTable && !filter.column?.includes('.')).map(filter => predicate(filter, 't')))
        const selected = embedded ? columns.slice(0, embedded.index) : columns
        assert.match(selected, /^[a-z_,]+$/)
        const filtered = await database.query(`select ${selected.split(',').map(column => `t.${column}`).join(',')} from public.${table} t where ${where.join(' and ')}`, values)
        const data = filtered.rows.sort((a,b) => String(a.id).localeCompare(String(b.id)))
        return { data: head ? null : single ? data[0] : data.slice(start,end+1), count: data.length }
      }
      return builder
    },
  }
}

const { preflightDeletion, schemaInspectionSql } = await import('../scripts/deletion-preflight.mjs')
const client = restClient(db, { historicalCompatibility: true })
const snapshot = async () => {
  const { rows } = await db.query(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth') and c.relkind='r' order by 1,2`)
  const result = {}
  for (const { nspname, relname } of rows) {
    result[`${nspname}.${relname}`] = (await db.query(`select to_jsonb(t) as row from ${nspname}.${relname} t order by to_jsonb(t)::text`)).rows
  }
  return result
}
const before = await snapshot()
const first = await preflightDeletion(client, db, ids.clientReceipt)
if (first.summary.schemaDifferenceCount) {
  const coverage = JSON.parse(await source('../scripts/deletion-coverage.json')).objects
  const observed = Object.fromEntries(first.manifest.schema.map(row => [row.object, row.fingerprint]))
  console.error('Schema differences:', JSON.stringify(Object.fromEntries([...new Set([...Object.keys(coverage), ...Object.keys(observed)])].filter(key => coverage[key] !== observed[key]).map(key => [key, { before: coverage[key], after: observed[key] }]))))
}
assert.equal(first.summary.schemaDifferenceCount, 0, 'Reviewed source fixture must match explicit coverage')
assert.ok(first.manifest, 'Preflight must return internal evidence')
assert.equal(first.summary.candidateCounts.care_links, 1)
assert.equal(first.summary.candidateCounts.care_tasks, 1)
assert.equal(first.summary.candidateCounts.care_task_entries, 1)
assert.equal(first.summary.candidateCounts.care_messages, 1)
assert.equal(first.summary.candidateCounts.custom_orders, 2)
assert.equal(first.summary.candidateCounts.subscriptions, 1)
assert.equal(first.summary.candidateCounts.annual_free_reservations, 1)
assert.equal(Object.hasOwn(first.manifest.inventory.legacyCandidateCounts, 'session_completions'), false)
assert.ok(first.summary.blockers.includes('candidate_inventory_mismatch'))
for (const code of ['shared_care_records','legacy_ownership_review','historical_analytics_review',
  'provider_dispositions_unreviewed','paid_work_review','private_media_ownership','retention_decision','purchase_ownership_retention']) {
  assert.ok(first.summary.blockers.includes(code), code)
}
assert.equal(first.summary.canApprove, false)
assert.equal(first.summary.canExecute, false)
assert.equal((await preflightDeletion(client, db, ids.clientReceipt, { force: true, dispositions: 'delete' })).summary.canExecute, false)
const practitioner = await preflightDeletion(client, db, ids.practitionerReceipt)
assert.ok(practitioner.summary.blockers.includes('shared_care_records'))
assert.equal(practitioner.summary.candidateCounts.care_task_entries, 1)
assert.deepEqual(await snapshot(), before, 'All accounts and shared records remain untouched')
assert.equal((await preflightDeletion(client, db, ids.clientReceipt)).summary.planHash, first.summary.planHash)
for (const privateValue of ['@example.test','private intake','private clinical text','custom-audios/shared.wav', ids.client, ids.order]) {
  assert.equal(JSON.stringify(first.summary).includes(privateValue), false)
}
assert.equal(JSON.stringify(first.manifest).includes('private clinical text'), false)
await db.query('update public.custom_orders set pattern=$1 where id=$2', ['changed private intake',ids.order])
assert.notEqual((await preflightDeletion(client, db, ids.clientReceipt)).summary.planHash, first.summary.planHash)

for (const [add, remove] of [
  ['create table public.unreviewed(id int)', 'drop table public.unreviewed'],
  ['alter table public.events add constraint unexpected_fk foreign key (id) references public.events(id)', 'alter table public.events drop constraint unexpected_fk'],
  [`create trigger unexpected_trigger after insert on public.events for each row execute function public.handle_new_user()`, 'drop trigger unexpected_trigger on public.events'],
  ['create policy unexpected_write on public.events for insert with check (true)', 'drop policy unexpected_write on public.events'],
  ['create schema unseen; create table unseen.related(id uuid references auth.users(id))', 'drop table unseen.related; drop schema unseen'],
  ['alter table public.events add column extra_private text', 'alter table public.events drop column extra_private'],
  ['alter table public.custom_orders drop constraint custom_orders_stripe_session_id_key',
    'alter table public.custom_orders add constraint custom_orders_stripe_session_id_key unique(stripe_session_id)'],
]) {
  const previous = (await preflightDeletion(client, db, ids.clientReceipt)).summary.planHash
  await db.exec(add)
  const changed = await preflightDeletion(client, db, ids.clientReceipt)
  assert.ok(changed.summary.blockers.includes('schema_coverage_mismatch'), add)
  assert.notEqual(changed.summary.planHash, previous)
  assert.equal(changed.summary.canExecute, false)
  await db.exec(remove)
}
const brokenDatabase = { transaction: async () => { throw new Error('private provider identifier and clinical text') } }
const failed = await preflightDeletion(client, brokenDatabase, ids.clientReceipt)
assert.deepEqual(failed.summary.blockers, ['read_failed'])
assert.equal(failed.summary.planHash, null)
assert.equal(failed.manifest, null)
assert.equal(JSON.stringify(failed).includes('clinical'), false)
assert.equal((await preflightDeletion(client, db, 'invalid')).summary.canApprove, false)
await assert.rejects(db.transaction(async tx => {
  await tx.query('SET TRANSACTION READ ONLY')
  await tx.query('delete from public.care_messages')
}), /read-only/)
assert.ok((await db.query(schemaInspectionSql)).rows.length > 100)
await db.exec('drop table public.care_messages, public.care_task_entries, public.care_tasks, public.care_links cascade')
const currentApp = await preflightDeletion(client, db, ids.clientReceipt)
assert.equal(currentApp.summary.schemaDifferenceCount, 0, 'Current app without care tables matches reviewed source')
assert.equal(Object.keys(currentApp.summary.candidateCounts).some(table => table.startsWith('care_')), false)
assert.equal(currentApp.summary.blockers.includes('shared_care_records'), false)
assert.equal(currentApp.summary.canExecute, false)
await db.exec('create table public.care_links(id uuid primary key)')
const partialCare = await preflightDeletion(client, db, ids.clientReceipt)
assert.deepEqual(partialCare.summary.blockers, ['read_failed'], 'An existing table with missing required columns cannot use compatibility counts')
assert.equal(partialCare.summary.canExecute, false)
await db.exec('drop table public.care_links')
await db.exec(await source('./fixtures/deletion-education.sql'))
for (const file of ['013_care_push.sql', '014_care_connect.sql', '015_dap_purchases.sql', '016_care_reactions.sql', '018_care_log_push.sql']) {
  await db.exec(await source(`../migrations/${file}`))
}
await db.exec('drop table public.session_completions, public.analytics_events')
const expandedBefore = await snapshot()
const currentClient = restClient(db)
const expanded = await preflightDeletion(currentClient, db, ids.clientReceipt)
assert.ok(expanded.summary.blockers.includes('schema_coverage_mismatch'), 'New main data must require reviewed deletion coverage')
assert.equal(expanded.summary.blockers.includes('read_failed'), false, 'Actual current tables must reach schema review')
assert.ok(expanded.summary.schemaDifferenceCount > 0)
assert.deepEqual(expanded.manifest.rows, {}, 'Unreviewed schema cannot produce deletion candidates')
assert.equal(expanded.summary.canApprove, false)
assert.equal(expanded.summary.canExecute, false)
assert.deepEqual(await snapshot(), expandedBefore, 'Unreviewed main data must remain untouched')
await db.exec('drop table public.care_message_reactions')
assert.deepEqual((await preflightDeletion(currentClient, db, ids.clientReceipt)).summary.blockers, ['read_failed'],
  'The current-schema adapter must never fake a missing required table')
console.log('PASS: current main push, DAP and reaction migrations fail closed until deletion coverage is reviewed.')
await db.close()
console.log('PASS: actual PostgreSQL schema inspection, both care roles, row and schema invalidation, refusal, non-mutation and private failure output.')
