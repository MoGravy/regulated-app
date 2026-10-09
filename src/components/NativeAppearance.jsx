import { useEffect } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core'
import { useLocation } from 'react-router-dom'

const AndroidAppearance = registerPlugin('NativeAppearance')

// Capacitor Light means dark text/icons on light paper; Dark means light content.
export default function NativeAppearance() {
  const { pathname } = useLocation()
  const player = pathname === '/reset' || pathname.startsWith('/sessions/') && pathname.endsWith('/play')
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const look = document.documentElement.dataset.look
    const dark = player || look === 'night'
    if (Capacitor.getPlatform() === 'android') {
      const tokens = getComputedStyle(document.documentElement)
      const color = player ? tokens.getPropertyValue('--player-bg').trim()
        : look === 'night' ? '#0B1124' : tokens.getPropertyValue('--bg').trim()
      AndroidAppearance.setAppearance({ color, dark }).catch(() => {})
      return
    }
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  }, [player, pathname])
  return null
}
