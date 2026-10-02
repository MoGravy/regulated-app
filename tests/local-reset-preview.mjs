import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { reset } from './reset-fixture.js'

const root = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

// Local catalog only. The sole upstream request resolves this known free audio.
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:4382')
    if (url.pathname === '/api/get-audio-url' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 1024) return json(res, 413, {})
      }
      if (JSON.parse(body).sessionId !== reset.id) return json(res, 403, {})
      const upstream = await fetch('https://regulatedapp.co/api/get-audio-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: reset.id }), signal: AbortSignal.timeout(20000),
      })
      if (!upstream.ok) return json(res, 503, {})
      const result = await upstream.json()
      if (typeof result.url !== 'string' || !result.url.startsWith('https://')) return json(res, 503, {})
      return json(res, 200, { url: result.url })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {})
    if (url.pathname.startsWith('/auth/')) return json(res, 403, {})
    if (url.pathname.startsWith('/rest/')) return json(res, 200, url.pathname === '/rest/v1/sessions' ? [reset] : [])
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`)
    if (!path.startsWith(`${root}/`) && path !== root) return json(res, 403, {})
    const target = extname(path) ? path : resolve(root, 'index.html')
    const bytes = await readFile(target)
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : bytes)
  } catch { json(res, 503, {}) }
}).listen(4382, '127.0.0.1', () => console.log('Local guest preview: http://localhost:4382/reset?look=night'))
