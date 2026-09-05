// A 10ms tick on primary actions. Silent where unsupported (iOS Safari, desktop).
export const haptic = () => { try { navigator.vibrate?.(10) } catch { /* nothing */ } }
