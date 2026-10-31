import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const html = readFileSync('index.html', 'utf8')
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, 'font loading must work without external requests')
assert.match(html, /href="\/fonts\/fonts\.css"/, 'local stylesheet must load')
const css = readFileSync('public/fonts/fonts.css', 'utf8')
for (const family of ['Literata', 'Atkinson Hyperlegible Next', 'Newsreader', 'Archivo']) assert.ok(css.includes(`font-family: '${family}'`), `${family} is present`)
const refs = [...css.matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g)].map(match => match[1])
assert.ok(refs.length > 0, 'font files are referenced')
for (const ref of refs) assert.ok(existsSync(join('public', ref)), `font file exists: ${ref}`)
for (const name of ['literata', 'atkinson', 'newsreader', 'archivo']) assert.match(readFileSync(`public/fonts/${name}-OFL.txt`, 'utf8'), /SIL OPEN FONT LICENSE/)
console.log('Offline font families, files and licences PASS')
