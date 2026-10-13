import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutMatthew from '../.tmp/about-matthew/component.mjs'

// Synthetic content tests the scaffold; this is not the requested model draft.
const profile = {
  email: 'info@matthewtweediehypnosis.com.au',
  role: 'Clinical hypnotherapist and NLP Master Practitioner',
  paragraphs: ['Synthetic biography fixture.'],
  programmes: 'Synthetic one-to-one programme fixture.',
  qualifications: ['Masters Degree of Hypno-Psychotherapy (ICHP Ireland/Australia)'],
  membership: 'AACHP member.',
  currentStudy: 'Currently completing a Master of Counselling at the University of Canberra.',
}
const markup = renderToStaticMarkup(createElement(AboutMatthew, { profile }))
assert.equal((markup.match(/<h1\b/g) || []).length, 1)
assert.match(markup, /<main[^>]+aria-labelledby="about-matthew-title"/)
assert.match(markup, /<a[^>]+class="btn-primary btn-lg"[^>]+href="mailto:info@matthewtweediehypnosis.com.au\?/)
assert.match(markup, /Email Matthew about working together/)
assert.match(markup, /Currently completing a Master of Counselling/)
assert.match(markup, /overflow-wrap:anywhere/)
assert.match(markup, /min-height:52px/)
assert.doesNotMatch(markup, /PACFA|psychologist|guaranteed/i)
const missingEmail = renderToStaticMarkup(createElement(AboutMatthew, { profile: { ...profile, email: '' } }))
assert.doesNotMatch(missingEmail, /mailto:/)
console.log('PASS: semantic page, verified email fixture/CTA, current-study distinction, flexible CTA and missing-email refusal')
