import { Capacitor } from '@capacitor/core'

const API_ORIGIN = 'https://regulatedapp.co'

export function apiUrl(path) {
  return Capacitor.isNativePlatform() ? `${API_ORIGIN}${path}` : path
}
