import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from '@playwright/test'

// Where the saved bypass cookie lands. Outside the repo on purpose.
export const STATE_PATH = join(tmpdir(), 'regulated-preview-state.json')

export function bypassSecret() {
  try {
    return readFileSync(join(homedir(), '.regulated-bypass'), 'utf8').trim() || null
  } catch {
    return null
  }
}

// Vercel previews are SSO protected. Sending the bypass secret as a header on
// every request also sends it to fonts.gstatic.com, where it fails CORS
// preflight and the fonts never load. Asking Vercel to set its cookie once and
// reusing that cookie keeps the secret on our own origin, where it belongs.
export default async function globalSetup() {
  const base = process.env.BASE_URL
  if (!base || base.includes('localhost')) return

  const secret = bypassSecret()
  if (!secret) throw new Error('no ~/.regulated-bypass — preview deployments are SSO protected')

  const ctx = await request.newContext()
  const res = await ctx.get(
    `${base}/?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${secret}`
  )
  if (!res.ok()) throw new Error(`bypass handshake returned ${res.status()}`)

  // Production is not protected, so it sets no cookie and that is fine. A
  // protected preview with a bad secret already failed the ok() check above.
  await ctx.storageState({ path: STATE_PATH })
  await ctx.dispose()
}
