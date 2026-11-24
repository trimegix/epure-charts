// ─── epure-charts · wait until a release archive is downloadable ─────────────
// Right after `gh release create`, the asset URL answers 404 for a few seconds: an
// `npm install <url>` launched then fails. The release workflow ends with this check, so
// "workflow done" means "archive installable".
//
//   node scripts/wait-for-asset.mjs <url> [expected-file] [--tries 30] [--delay 5000]
//
// Downloads the URL (redirects followed) until it answers 200 with the expected bytes (the
// local .tgz when given, else any non-empty body). Exit 0 when it does, 1 after the last try.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Tries `url` until it serves the expected bytes. Injectable fetch and sleep (tests).
 * @returns {Promise<{ ok: boolean, tries: number, last: string }>}
 */
export async function waitForAsset(url, { expected = null, tries = 30, delay = 5000, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), log = () => {} } = {}) {
  let last = ''
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetchImpl(url, { redirect: 'follow' })
      if (res.ok) {
        const body = Buffer.from(await res.arrayBuffer())
        if (expected ? body.equals(expected) : body.length > 0) return { ok: true, tries: i, last: `200, ${body.length} bytes` }
        last = `200 but ${body.length} bytes${expected ? `, expected ${expected.length} identical bytes` : ''}`
      } else last = `HTTP ${res.status}`
    } catch (e) {
      last = e?.message ?? String(e)
    }
    log(`try ${i}/${tries}: ${last}`)
    if (i < tries) await sleep(delay)
  }
  return { ok: false, tries, last }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = Number(args[i + 1]); args.splice(i, 2); return v }
  const tries = opt('--tries', 30)
  const delay = opt('--delay', 5000)
  const [url, file] = args
  if (!url) { console.error('usage: wait-for-asset.mjs <url> [expected-file] [--tries n] [--delay ms]'); process.exit(2) }
  const r = await waitForAsset(url, { expected: file ? readFileSync(file) : null, tries, delay, log: m => console.log(m) })
  if (r.ok) console.log(`downloadable after ${r.tries} tr${r.tries > 1 ? 'ies' : 'y'}: ${url}`)
  else console.error(`::error::${url} is still not downloadable after ${r.tries} tries (${r.last})`)
  process.exit(r.ok ? 0 : 1)
}
