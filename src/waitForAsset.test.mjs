// The release workflow ends only once its archive is downloadable (scripts/wait-for-asset.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { waitForAsset } from '../scripts/wait-for-asset.mjs'

const tgz = Buffer.from('package bytes')
const answer = (status, body = Buffer.alloc(0)) => ({ ok: status === 200, status, arrayBuffer: async () => body })
const serve = list => { let i = 0; const calls = []; return { calls, fetchImpl: async url => { calls.push(url); const r = list[Math.min(i++, list.length - 1)]; if (r instanceof Error) throw r; return r } } }
const sleeps = []
const sleep = async ms => { sleeps.push(ms) }

test('404 for a few seconds, then the archive: waits and succeeds', async () => {
  const s = serve([answer(404), new Error('ECONNRESET'), answer(404), answer(200, tgz)])
  const r = await waitForAsset('u', { expected: tgz, fetchImpl: s.fetchImpl, sleep, delay: 5000 })
  assert.deepEqual(r, { ok: true, tries: 4, last: `200, ${tgz.length} bytes` })
  assert.equal(s.calls.length, 4)
})

test('a body that is not the built archive is not success', async () => {
  const s = serve([answer(200, Buffer.from('<html>')), answer(200, tgz)])
  assert.equal((await waitForAsset('u', { expected: tgz, fetchImpl: s.fetchImpl, sleep })).tries, 2)
})

test('still 404 after the last try: failure, with the last answer', async () => {
  const s = serve([answer(404)])
  const r = await waitForAsset('u', { tries: 3, fetchImpl: s.fetchImpl, sleep })
  assert.deepEqual(r, { ok: false, tries: 3, last: 'HTTP 404' })
})

test('the release workflow runs the check after publishing', () => {
  const wf = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  const publish = wf.indexOf('gh release create')
  const check = wf.indexOf('node scripts/wait-for-asset.mjs')
  assert.ok(publish > 0 && check > publish, 'the check is the last step, after gh release create')
  assert.match(wf.slice(check), /releases\/download\/\$GITHUB_REF_NAME\/epure-charts-\$\{GITHUB_REF_NAME#v\}\.tgz/)
})
