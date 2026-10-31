export const NATIVE_AUTH_REDIRECT = 'co.regulatedapp.app://auth'

export function nativeAuthCode(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'co.regulatedapp.app:' || url.hostname !== 'auth') return null
    return url.searchParams.get('code') || null
  } catch {
    return null
  }
}
