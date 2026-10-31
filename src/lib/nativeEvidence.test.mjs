import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../../', import.meta.url).pathname
test('Android production evidence fences discontinuities and retains background qualification', () => {
  const source = join(root, 'android/app/src/main/java/co/regulatedapp/app/ListeningEvidence.java')
  assert.ok(existsSync(source), 'Android playback evidence implementation is missing')
  const dir = mkdtempSync(join(tmpdir(), 'regulated-java-evidence-'))
  try {
    const java = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/'
    const compile = spawnSync(java + 'javac', ['-d', dir, source, join(root, 'tests/native/ListeningEvidenceTest.java')], { encoding: 'utf8' })
    assert.equal(compile.status, 0, compile.stderr)
    const run = spawnSync(java + 'java', ['-cp', dir, 'co.regulatedapp.app.ListeningEvidenceTest'], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('iOS production evidence fences discontinuities and retains background qualification', () => {
  const source = join(root, 'ios/App/App/ListeningEvidence.swift')
  assert.ok(existsSync(source), 'iOS playback evidence implementation is missing')
  const dir = mkdtempSync(join(tmpdir(), 'regulated-swift-evidence-'))
  try {
    const env = { ...process.env, DEVELOPER_DIR: '/Users/matthew/Applications/Xcode.app/Contents/Developer' }
    const compile = spawnSync('/usr/bin/xcrun', ['swiftc', source, join(root, 'tests/native/main.swift'), '-o', join(dir, 'check')], { encoding: 'utf8', env })
    assert.equal(compile.status, 0, compile.stderr)
    const run = spawnSync(join(dir, 'check'), [], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
