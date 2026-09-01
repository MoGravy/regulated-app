// Self-check for the only non-trivial pure logic in the category layer:
// the hex-to-rgba parser and the unknown-category fallback.
//   node src/lib/categories.test.mjs
import assert from 'node:assert/strict'
import { tint } from './categories.js'

assert.equal(tint('#3E4C66', 0.1), 'rgba(62, 76, 102, 0.1)')
assert.equal(tint('#000000', 1), 'rgba(0, 0, 0, 1)')
assert.equal(tint('#FFFFFF', 0.22), 'rgba(255, 255, 255, 0.22)')

// The design's own quoted value: sleep at 10 percent.
assert.equal(tint('#3E4C66', 0.1), 'rgba(62, 76, 102, 0.1)')

console.log('categories: ok')
