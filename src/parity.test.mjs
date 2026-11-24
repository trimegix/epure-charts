// Static / live parity: every example spec of the repository (examples/specs.js) is drawn by
// the static entry (build*Scene) and by the live view in readOnly + applyPrefs; the two scenes
// must be equal, field by field. A spec the static entry accepts is read the same live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import ChartView from './ChartView.jsx'
import WaterfallChart from './WaterfallChart.jsx'
import BarhView from './BarhView.jsx'
import { buildScene } from './scene.js'
import { buildWaterfallScene } from './waterfallScene.js'
import { buildBarhScene } from './barhScene.js'
import { setSceneProbe } from './sceneProbe.js'
import * as EX from '../examples/specs.js'

const W = 720, H = 360
/** The scene the live view hands to its figure. */
function liveScene(el) {
  let scene = null
  const prev = setSceneProbe(s => { scene = s })
  try { renderToString(el) } finally { setSceneProbe(prev) }
  return scene
}
const plain = o => JSON.parse(JSON.stringify(o))
/** The paths where two scenes differ (at most 10, enough to say why). */
function differences(a, b, path = 'scene', out = []) {
  if (out.length >= 10) return out
  if (a === b) return out
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: live ${JSON.stringify(a)?.slice(0, 80)} ≠ static ${JSON.stringify(b)?.slice(0, 80)}`)
    return out
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[k], b[k], `${path}.${k}`, out)
  return out
}
const same = (live, stat) => {
  assert.ok(live, 'the live view drew a figure')
  assert.deepEqual(differences(plain(live), plain(stat)), [])
}
// The host formatter of the gallery, and none (the engine's default).
const FORMATS = [['engine format', undefined], ['host format', (v, unit, dec) => `€${v.toFixed(dec ?? (Math.abs(v) >= 100 ? 0 : 1))}M`]]

const charts = ['columns', 'forecast', 'navA', 'navB', 'stacked', 'grouped']
for (const name of charts) for (const [fname, format] of FORMATS) {
  test(`chart "${name}" (${fname}): live = static`, () => {
    const { spec, resolved } = EX[name]
    const live = liveScene(h(ChartView, { spec, resolved, format, width: W, height: H, readOnly: true, applyPrefs: true }))
    same(live, buildScene(spec, resolved, { width: W, height: H, format }))
  })
}

for (const name of ['bridge', 'bridgeBudget', 'bridgeMinimal']) {
  test(`bridge "${name}": live = static, and valid`, () => {
    const { spec, bridge } = EX[name]
    const live = liveScene(h(WaterfallChart, { spec, bridge, width: W, height: H, readOnly: true, applyPrefs: true }))
    const stat = buildWaterfallScene(spec, bridge, { width: W, height: H })
    assert.deepEqual(stat.errors, [])
    same(live, stat)
  })
}

for (const name of ['ranking', 'football']) for (const [fname, format] of [['engine format', undefined], ['host format', v => `€${Math.round(v)}M`]]) {
  test(`horizontal bars "${name}" (${fname}): live = static`, () => {
    const { spec, rows } = EX[name]
    const live = liveScene(h(BarhView, { id: name, spec, rows, format, width: W, readOnly: true, applyPrefs: true }))
    same(live, buildBarhScene(spec, rows, { width: W, format }))
  })
}

test('one validation: a spec the live view refuses is reported by the static scene too', () => {
  const { spec, resolved } = EX.stacked
  const bad = { ...spec, bars: 'piled' }
  const stat = buildScene(bad, resolved, { width: W, height: H })
  assert.ok(stat.errors.some(e => e.startsWith('bars:')), stat.errors.join(' · '))
  const html = renderToString(h(ChartView, { spec: bad, resolved, width: W, height: H, readOnly: true }))
  for (const e of stat.errors) assert.ok(html.includes(e.replace(/'/g, '&#x27;')), `live shows "${e}"`)
  assert.deepEqual(buildScene(spec, resolved, { width: W, height: H }).errors, [], 'a valid example has none')
})
