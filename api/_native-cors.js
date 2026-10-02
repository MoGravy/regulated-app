const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost'])

export function setNativeCors(req, res) {
  const origin = req.headers?.origin
  if (!NATIVE_ORIGINS.has(origin)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Vary', 'Origin')
}
