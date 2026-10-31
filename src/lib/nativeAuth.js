import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'
import { nativeAuthCode } from './nativeAuthUrl'

export async function startNativeAuth() {
  if (!Capacitor.isNativePlatform()) return
  let lastCode = null

  async function accept(url) {
    const code = nativeAuthCode(url)
    if (!code || code === lastCode) return
    lastCode = code
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[native auth] code exchange failed')
      sessionStorage.setItem('regulated_auth_error', '1')
      window.dispatchEvent(new Event('regulated-auth-link-error'))
    }
  }

  await App.addListener('appUrlOpen', ({ url }) => { void accept(url) })
  const launch = await App.getLaunchUrl()
  if (launch?.url) await accept(launch.url)
}
