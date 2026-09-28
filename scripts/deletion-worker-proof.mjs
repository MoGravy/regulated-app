import { assessClinicalRetention } from './deletion-retention.mjs'

// ponytail: disposable proof tables only; production needs reviewed ownership and clinical fact sources.
export async function recordRequest(db, id, accountId) {
  await db.query(`insert into proof_requests
    (id,account_id,requested_at,review_due_at,ordinary_due_at,next_run_at)
    select $1,$2,instant,instant+interval '7 days',instant+interval '30 days',instant
    from proof_clock on conflict (account_id) do nothing`, [id, accountId])
  const { rows: [receipt] } = await db.query(`select id,requested_at,review_due_at,ordinary_due_at
    from proof_requests where account_id=$1`, [accountId])
  return receipt
}

export async function overdueRequests(db) {
  const { rows } = await db.query(`select id,
    reviewed_at is null and review_due_at < (select instant from proof_clock) as review_overdue,
    ordinary_state <> 'done' and ordinary_due_at < (select instant from proof_clock) as ordinary_overdue,
    last_error is not null as failed
    from proof_requests where
    (reviewed_at is null and review_due_at < (select instant from proof_clock)) or
    (ordinary_state <> 'done' and ordinary_due_at < (select instant from proof_clock)) or last_error is not null
    order by id`)
  return rows
}

export async function claimDue(db, requestId, worker) {
  const { rows } = await db.query(`update proof_requests r set
    generation=generation+1, lease_owner=$2,
    lease_until=(select instant + interval '5 minutes' from proof_clock)
    where r.id=$1 and r.next_run_at <= (select instant from proof_clock)
      and (r.lease_until is null or r.lease_until <= (select instant from proof_clock))
    returning id, generation, lease_owner`, [requestId, worker])
  return rows[0] ?? null
}

export async function processClaim(db, claim, crashAfterDelete = false) {
  try {
    return await db.transaction(async tx => {
      const { rows: [clock] } = await tx.query(`select instant,
        (instant at time zone 'Australia/Adelaide')::date::text as today from proof_clock`)
      const { rows: [request] } = await tx.query(`select * from proof_requests where id=$1
        and generation=$2 and lease_owner=$3 and lease_until>$4 for update`,
      [claim.id, claim.generation, claim.lease_owner, clock.instant])
      if (!request) throw new Error('stale_claim')

      const { rows: operations } = await tx.query(`select * from proof_operations
        where request_id=$1 order by id for update`, [claim.id])
      if (!operations.length) throw new Error('empty_manifest')
      let nextRun = null
      for (const operation of operations) {
        if (!operation.approved || operation.owner_id !== request.account_id) throw new Error('unapproved_operation')
        if (operation.kind !== 'ordinary' && operation.kind !== 'clinical') throw new Error('unknown_resource')
        if (operation.state === 'done') continue
        if (operation.kind === 'ordinary') {
          const { rows } = await tx.query(`delete from proof_ordinary where id=$1
            and owner_id=$2 and version=$3 returning id`,
          [operation.resource_id, request.account_id, operation.expected_version])
          if (rows.length !== 1) throw new Error('ordinary_evidence_changed')
          if (crashAfterDelete) throw new Error('simulated_crash')
        } else if (operation.kind === 'clinical') {
          const { rows: [row] } = await tx.query(`select * from proof_clinical
            where id=$1 and owner_id=$2 and version=$3 for update`,
          [operation.resource_id, request.account_id, operation.expected_version])
          if (!row || row.fact_version !== operation.fact_version || !row.verified || !row.source || !row.all_holds_verified) {
            throw new Error('clinical_evidence_changed')
          }
          const assessment = assessClinicalRetention({
            lastContactDate: row.last_contact_date?.toISOString().slice(0, 10),
            dateOfBirth: row.date_of_birth?.toISOString().slice(0, 10),
            everSeenAsMinor: row.ever_seen_as_minor,
          }, clock.today)
          if (assessment.status === 'review_required') throw new Error('clinical_facts_need_review')
          const holdThrough = row.other_hold_through?.toISOString().slice(0, 10) > assessment.holdThroughDate
            ? row.other_hold_through.toISOString().slice(0, 10) : assessment.holdThroughDate
          if (clock.today <= holdThrough) {
            const { rows: [due] } = await tx.query(`select (($1::date + 1)::timestamp
              at time zone 'Australia/Adelaide') as due`, [holdThrough])
            await tx.query(`update proof_operations set state='held', hold_through=$2 where id=$1`,
              [operation.id, holdThrough])
            if (!nextRun || due.due < nextRun) nextRun = due.due
            continue
          }
          const { rows } = await tx.query(`delete from proof_clinical where id=$1
            and owner_id=$2 and version=$3 and fact_version=$4 returning id`,
          [operation.resource_id, request.account_id, operation.expected_version, operation.fact_version])
          if (rows.length !== 1) throw new Error('clinical_evidence_changed')
          if (crashAfterDelete) throw new Error('simulated_crash')
        }
        await tx.query(`update proof_operations set state='done', hold_through=null where id=$1`, [operation.id])
      }

      await tx.query(`update proof_requests set
        reviewed_at=coalesce(reviewed_at,$2),
        ordinary_state='done', held_state=$3, next_run_at=$4,
        lease_owner=null, lease_until=null, last_error=null
        where id=$1 and generation=$5`, [claim.id, clock.instant,
        nextRun ? 'held' : 'done', nextRun, claim.generation])
      return { ordinaryState: 'done', heldState: nextRun ? 'held' : 'done' }
    })
  } catch (error) {
    if (error.message === 'simulated_crash' || error.message === 'stale_claim') throw error
    await db.query(`update proof_requests set failures=failures+1, last_error=$4,
      next_run_at=(select instant + interval '1 hour' from proof_clock),
      lease_owner=null, lease_until=null where id=$1 and generation=$2 and lease_owner=$3`,
    [claim.id, claim.generation, claim.lease_owner, 'review_required'])
    throw error
  }
}
