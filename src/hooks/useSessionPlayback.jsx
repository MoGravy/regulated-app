import { useEffect, useRef, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { nativeAttempt, webAttempt } from '../lib/sessionPlayback'

const NativeAudio = registerPlugin('SessionAudio')
const native = Capacitor.isNativePlatform()

export function useSessionPlayback({ session, url, enabled, autoplay = true, createPractice, onEnded, onError, onClose }) {
  const [snapshot, setSnapshot] = useState(null)
  const attempt = useRef(null)
  const callbacks = useRef({ createPractice, onEnded, onError, onClose })
  callbacks.current = { createPractice, onEnded, onError, onClose }

  useEffect(() => {
    if (!url || !session?.id || !enabled) return
    let ended = false
    let active = true
    let appListener
    // Capture this owner's callbacks. A delayed close must not checkpoint a
    // replacement attempt or write into a replacement account's ledger.
    const ownerCallbacks = callbacks.current
    const practice = ownerCallbacks.createPractice?.()
    const source = { token: crypto.randomUUID(), sessionId: String(session.id), title: session.title, url, priorCreditSeconds: practice?.priorCreditSeconds || 0 }
    const receive = state => {
      practice?.receive(state)
      setSnapshot(state)
      if (state.outcome?.kind === 'error') ownerCallbacks.onError()
      if (state.outcome?.kind === 'ended' && !ended) {
        ended = true
        ownerCallbacks.onEnded()
      }
    }
    const args = [source, receive, () => ownerCallbacks.onError(), state => { practice?.close(state); ownerCallbacks.onClose(state) }]
    const owner = native ? nativeAttempt(NativeAudio, ...args) : webAttempt(new Audio(), ...args)
    attempt.current = owner
    if (autoplay) owner.command('play')
    else owner.refresh()
    const refresh = () => owner.refresh()
    const timer = native ? setInterval(refresh, 1000) : null
    if (native) App.addListener('appStateChange', state => {
      if (state.isActive) refresh()
    }).then(handle => { if (active) appListener = handle; else handle.remove() }).catch(() => {})
    return () => {
      active = false
      clearInterval(timer)
      appListener?.remove()
      owner.close()
      if (attempt.current === owner) attempt.current = null
    }
  }, [session?.id, url, enabled, autoplay])

  return {
    snapshot,
    isPlaying: snapshot?.status === 'playing' || snapshot?.status === 'buffering',
    currentTime: snapshot?.position || 0,
    duration: snapshot?.duration || (session?.duration || 20) * 60,
    play: () => attempt.current?.command('play'),
    pause: () => attempt.current?.command('pause'),
    seek: position => attempt.current?.command('seek', position),
    native,
  }
}
