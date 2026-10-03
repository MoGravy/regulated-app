export const reset = { id: '7a875d14-f77e-47e9-8ff3-16d5db08d2e6', title: 'Daily Nervous System Reset', free: true, has_audio: true, duration: 11, category: 'Daily' }
export async function setup(page) {
  await page.addInitScript(() => localStorage.setItem('regulated_onboarding', 'true'))
  await page.route('**/*', r => {
    if (!new URL(r.request().url()).hostname.endsWith('localhost')) return r.abort()
    return r.fallback()
  })
  await page.route('**/rest/v1/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/sessions?*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([reset]) }))
  const samples = 800000
  const wav = Buffer.alloc(44 + samples, 128)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34)
  wav.write('data', 36); wav.writeUInt32LE(samples, 40)
  await page.route('**/fake-audio.wav', r => r.fulfill({ contentType: 'audio/wav', body: wav }))
  await page.route('**/api/get-audio-url', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: '/fake-audio.wav' }) }))
}
