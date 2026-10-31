import { test, expect } from './fixtures.js'
import { SUPABASE_URL } from './runtime.js'

for (const look of ['admiralty', 'night']) test(`signup explains a rejected weak password without echoing provider details (${look})`, async ({ page }, testInfo) => {
  // Synthetic SDK failure only. The fixture blocks all external requests; this
  // route replaces signup without creating an account or sending an email.
  let attempted = 0
  await page.route(`${SUPABASE_URL}/auth/v1/signup*`, route => {
    attempted += 1
    return route.fulfill({ status: 422, json: {
      code: 'weak_password', msg: 'Private fixture provider detail',
      weak_password: { reasons: ['pwned'] },
    } })
  })
  await page.goto(`/signin?next=%2Fcourses&look=${look}`)
  await page.getByRole('button', { name: 'Use a password instead', exact: true }).click()
  await page.getByRole('button', { name: 'Create an account', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('qa+reviewer@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('local-fixture-only')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This password is too easy to guess. Choose a different password.')
  await expect(page.getByRole('alert')).not.toContainText('Private fixture')
  await expect(page).toHaveURL(new RegExp(`/signin\\?next=%2Fcourses&look=${look}$`))
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled()
  expect(attempted).toBe(1)
  await page.screenshot({ path: testInfo.outputPath(`weak-password-${look}.png`) })
})
