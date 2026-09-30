export function signInDestination(value) {
  if (['/dap', '/care', '/courses'].includes(value)) return value
  if (/^\/courses\/[a-f0-9-]{36}$/i.test(value || '')) return value
  return '/premium'
}

export function signInError(error, callback = false) {
  const code = error?.code || error?.details?.code
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) {
    return 'We cannot send another email right now.'
  }
  if (code === 'otp_expired') {
    return 'This link has expired or was already used. Sign in again to get a new email, then use the newest link once.'
  }
  if (callback) return 'This sign-in link did not work. Please try signing in again.'
  return 'We could not complete your request. Please try again.'
}
