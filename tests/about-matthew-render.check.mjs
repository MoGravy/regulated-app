import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutMatthew from '../.tmp/about-matthew/component.mjs'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { aboutMatthewProfile } from '../src/config/aboutMatthew.js'

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
const routerFor = value => createMemoryRouter([
  { path: '/about', element: createElement(AboutMatthew, { profile: value }) },
  { path: '/premium', element: createElement('h1', null, 'You') },
], { initialEntries: ['/premium', '/about'] })
const router = routerFor(profile)
const markup = renderToStaticMarkup(createElement(RouterProvider, { router }))
assert.equal((markup.match(/<h1\b/g) || []).length, 1)
assert.match(markup, /<main[^>]+aria-labelledby="about-matthew-title"/)
assert.match(markup, /<a[^>]+class="btn-primary btn-lg"[^>]+href="mailto:info@matthewtweediehypnosis.com.au\?/)
assert.match(markup, /Email Matthew about working together/)
assert.match(markup, /Currently completing a Master of Counselling/)
assert.match(markup, /overflow-wrap:anywhere/)
assert.match(markup, /min-height:52px/)
assert.doesNotMatch(markup, /PACFA|psychologist|guaranteed/i)
const missingEmail = renderToStaticMarkup(createElement(RouterProvider, { router: routerFor({ ...profile, email: '' }) }))
assert.doesNotMatch(missingEmail, /mailto:/)
for (const recipient of ['x?bcc=other@example.com', 'x#tag@example.com', 'x%3Fcc%3Dother@example.com']) {
  const recipientRouter = routerFor({ ...profile, email: recipient })
  const rendered = renderToStaticMarkup(createElement(RouterProvider, { router: recipientRouter }))
  const hrefs = [...rendered.matchAll(/href="(mailto:[^"]+)"/g)].map(match => match[1])
  assert.equal(hrefs.length, 2)
  for (const href of hrefs) {
    const parsed = new URL(href)
    assert.equal(decodeURIComponent(parsed.pathname), recipient)
    assert.ok([...parsed.searchParams.keys()].every(key => key === 'subject'))
    assert.equal(parsed.hash, '')
  }
  recipientRouter.dispose()
}
await router.navigate(-1)
assert.equal(router.state.location.pathname, '/premium')
await router.navigate('/about')
assert.equal(router.state.location.pathname, '/about')
const realRouter = routerFor(aboutMatthewProfile)
const realMarkup = renderToStaticMarkup(createElement(RouterProvider, { router: realRouter }))
assert.match(realMarkup, /href="\/premium"/)
assert.match(realMarkup, /aria-label="Home"/)
assert.match(realMarkup, /I am Matthew Tweedie/)
for (const paragraph of aboutMatthewProfile.paragraphs) {
  const escaped = renderToStaticMarkup(createElement('span', null, paragraph)).replace(/^<span>|<\/span>$/g, '')
  assert.ok(realMarkup.includes(escaped))
}
realRouter.dispose()
router.dispose()
console.log('PASS: semantic page, verified email fixture/CTA, current-study distinction, flexible CTA and missing-email refusal')
