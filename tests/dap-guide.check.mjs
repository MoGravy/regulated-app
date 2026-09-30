import assert from 'node:assert/strict'
import { dapGuideSteps } from '../src/config/courseCopy.js'

for (const source of ['program', 'manual', 'subscription', undefined, null, 'unknown']) {
  const steps = dapGuideSteps(source)
  assert.equal(steps.length, 6)
  assert.ok(steps.every(step => step.title !== 'Build your audio'))
}
const purchased = dapGuideSteps('purchase')
assert.equal(purchased.length, 7)
assert.equal(purchased.at(-1).title, 'Build your audio')
assert.equal(dapGuideSteps('program').length, 6, 'Purchase view must not mutate client instructions')
console.log('DAP client and purchase instructions PASS')
