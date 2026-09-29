// Read-only operator queue. The production executor is intentionally separate.
export async function deletionDeadlines(db, asOf = new Date()) {
  const { rows } = await db.query(`select id,
    reviewed_at is null and review_due_at <= $1 as review_due,
    ordinary_state <> 'done' and ordinary_due_at <= $1 as ordinary_due,
    last_error_code is not null as failed
    from public.account_deletion_requests
    where (reviewed_at is null and review_due_at <= $1)
       or (ordinary_state <> 'done' and ordinary_due_at <= $1)
       or last_error_code is not null
    order by requested_at, id`, [asOf])
  return rows
}
