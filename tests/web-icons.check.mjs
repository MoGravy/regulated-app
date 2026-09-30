import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../public/', import.meta.url)
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root)))
const icons = new Map()
for (const icon of manifest.icons) {
  const png = fs.readFileSync(new URL(icon.src.slice(1), root))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
  assert.equal(size, icon.sizes)
  icons.set(icon.src, size)
}
assert.ok([...icons.values()].includes('192x192'))
assert.ok([...icons.values()].includes('512x512'))
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
for (const path of html.matchAll(/<link[^>]+(?:rel="icon"|rel="apple-touch-icon")[^>]+href="([^"]+)"/g)) {
  assert.ok(fs.existsSync(new URL(path[1].slice(1), root)))
}
const worker = fs.readFileSync(new URL('care-sw.js', root), 'utf8')
assert.ok(icons.has(worker.match(/icon: '([^']+)'/)[1]))
console.log('Home Screen, favicon and notification icon references and PNG dimensions PASS')
