const refuse = () => { throw new Error('Progress cleanup needs review') }

async function call(client, name, args, valid) {
  try {
    const { data, error } = await client.rpc(name, args)
    if (error || !valid(data)) refuse()
    return data
  } catch { refuse() }
}

export function prepareProgressCleanup(client, requestId) {
  return call(client, 'prepare_progress_cleanup', { p_request_id: requestId }, data =>
    data?.approved === false && /^[a-f0-9]{64}$/.test(data.planHash)
    && ['user_progress', 'course_progress'].every(table => Number.isInteger(data.counts?.[table]) && data.counts[table] >= 0))
}

export function executeProgressCleanup(client, claim, planHash) {
  return call(client, 'execute_progress_cleanup', {
    p_request_id: claim?.request_id, p_account_id: claim?.account_id,
    p_generation: claim?.generation, p_lease_token: claim?.lease_token, p_plan_hash: planHash,
  }, data => data?.progressCleaned === true && typeof data.alreadyCleaned === 'boolean' && data.accountDeleted === false)
}
