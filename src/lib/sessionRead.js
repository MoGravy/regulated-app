// Bound catalogue reads only. Billing, auth and signed audio keep their own rules.
export async function readSessionCatalogue(query) {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      Promise.resolve(query.abortSignal(controller.signal)),
      new Promise(resolve => {
        timer = setTimeout(() => {
          resolve({ data: null, error: { message: 'Session catalogue read timed out' } })
          controller.abort()
        }, 8_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
