let nativeQueue = Promise.resolve()

export function nativeAttempt(bridge, source, onSnapshot, onFailure, onClose) {
  let disposed = false
  let revision = -1
  let listener
  const accept = state => {
    if (disposed || state?.token !== source.token || state.revision <= revision) return
    revision = state.revision
    onSnapshot(state)
  }
  const enqueue = work => {
    const result = nativeQueue.then(work)
    nativeQueue = result.catch(() => {})
    return result
  }
  const run = work => enqueue(async () => {
    if (disposed) return
    try { accept(await work()) } catch { if (!disposed) onFailure() }
  })
  const ready = run(async () => {
    listener = await bridge.addListener('playback', accept)
    if (disposed) return
    return bridge.open(source)
  })
  return {
    ready,
    command: (action, position) => run(() => bridge.command({ token: source.token, action, position })),
    refresh: () => run(() => bridge.snapshot({ token: source.token })),
    close: () => {
      if (disposed) return nativeQueue
      disposed = true
      return enqueue(async () => {
        try {
          const state = await bridge.close({ token: source.token })
          if (state?.token === source.token) onClose(state)
        } finally { await listener?.remove() }
      }).catch(() => {})
    },
  }
}

export function webAttempt(audio, source, onSnapshot, onFailure, onClose) {
  let revision = 0
  let outcome = null
  let disposed = false
  let seekAtEnd = false
  const snapshot = () => {
    let status = audio.paused ? 'paused' : audio.readyState < 3 ? 'buffering' : 'playing'
    if (outcome) status = outcome.kind === 'ended' ? 'ended' : 'error'
    return {
      token: source.token, sessionId: source.sessionId, revision: ++revision,
      status,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      played: Array.from({ length: audio.played.length }, (_, i) => [audio.played.start(i), audio.played.end(i)]),
      seeking: audio.seeking, muted: audio.muted, volume: audio.volume,
      rate: audio.playbackRate, atMs: performance.now(),
      outcome,
    }
  }
  const publish = () => { if (!disposed) onSnapshot(snapshot()) }
  const ended = () => {
    if (seekAtEnd || disposed || outcome) return
    outcome = { kind: 'ended', serial: 1 }
    publish()
  }
  const failed = () => {
    if (disposed || outcome) return
    outcome = { kind: 'error', code: 'playback_failed' }
    audio.pause()
    publish()
    onFailure()
  }
  const listeners = { timeupdate: publish, loadedmetadata: publish, play: publish, pause: publish, waiting: publish, playing: publish, seeking: publish, seeked: publish, volumechange: publish, ratechange: publish, ended, error: failed }
  for (const [name, fn] of Object.entries(listeners)) audio.addEventListener(name, fn)
  audio.preload = 'auto'
  audio.src = source.url
  return {
    command(action, position) {
      if (disposed || outcome) return
      if (action === 'play' && !seekAtEnd) audio.play().catch(failed)
      if (action === 'pause') audio.pause()
      if (action === 'seek' && Number.isFinite(position) && Number.isFinite(audio.duration)) {
        seekAtEnd = position >= audio.duration
        if (seekAtEnd) audio.pause()
        audio.currentTime = Math.max(0, Math.min(position, audio.duration))
        publish()
      }
    },
    refresh: publish,
    close() {
      if (disposed) return
      const state = snapshot()
      disposed = true
      for (const [name, fn] of Object.entries(listeners)) audio.removeEventListener(name, fn)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      onClose(state)
    },
  }
}
