import { useEffect } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useLocation } from 'react-router-dom'

// Capacitor Light means dark text/icons on light paper; Dark means light content.
export default function NativeAppearance() {
  const { pathname } = useLocation()
  const player = pathname === '/reset' || pathname.startsWith('/sessions/') && pathname.endsWith('/play')
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const look = document.documentElement.dataset.look
    const dark = player || look === 'night'
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  }, [player, pathname])
  return null
}
