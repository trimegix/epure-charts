// minBase on a CAGR: under it, at either end, no arrow and a warning (a rate over a small base says nothing).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { buildScene } from './scene.js'
import { validateSpec } from './spec.js'

globalThis.window ??= { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
const E = await import('./index.js')
const { configurePrefs } = await import('./chartPrefs.js')

const KEYS = ['2021', '2022', '2023', '2024']
const spec = (ann, id = 'mb') => ({ id, x: { grain: 'year', keys: KEYS }, y: { min: 0 }, series: [{ id: 'v', mark: 'bar' }], format: { legend: 'none' }, annotations: [ann] })
const data = ys => [{ label: 'v', points: KEYS.map((x, i) => ({ x, y: ys[i], type: 'actual' })) }]
const scene = (ann, ys) => buildScene(spec(ann), data(ys), { width: 400, height: 220 })
const cagrTexts = sc => sc.annotations.filter(a => a.type === 'cagr').map(a => a.text)

const SMALL = [11, 12, 13, 14]
const LARGE = [110, 120, 130, 140]
const explicit = extra => ({ type: 'cagr', from: { key: '2021' }, to: { key: '2024' }, ...extra })
const ofSeries = extra => ({ type: 'cagr', series: 'v', ...extra })

test('11 → 14 under minBase 50: no arrow, one warning', () => {
  for (const ann of [explicit({ minBase: 50 }), ofSeries({ minBase: 50 })]) {
    const sc = scene(ann, SMALL)
    assert.deepEqual(cagrTexts(sc), [])
    assert.equal(sc.warnings.length, 1)
    assert.match(sc.warnings[0], /CAGR .*: not drawn, its start is below minBase \(11 → 14, minBase 50\)/)
  }
})

test('only the end under minBase is named', () => {
  const sc = scene(explicit({ minBase: 50 }), [110, 120, 130, 14])
  assert.match(sc.warnings[0], /its end is below minBase/)
})

test('without minBase nothing changes', () => {
  const sc = scene(explicit(), SMALL)
  assert.equal(cagrTexts(sc).length, 1)
  assert.deepEqual(sc.warnings, [])
  assert.deepEqual(cagrTexts(scene(explicit({ minBase: 0 }), SMALL)), cagrTexts(sc))
})

test('a base above the threshold draws the arrow', () => {
  const sc = scene(explicit({ minBase: 50 }), LARGE)
  assert.equal(cagrTexts(sc).length, 1)
  assert.deepEqual(sc.warnings, [])
  assert.equal(cagrTexts(scene(explicit({ minBase: 110 }), LARGE)).length, 1, 'equal to minBase is not below it')
})

test('validateSpec: minBase is a finite number >= 0', () => {
  const errs = ann => validateSpec(spec(ann)).filter(e => /minBase/.test(JSON.stringify(e)))
  assert.equal(errs(explicit({ minBase: -1 })).length, 1)
  assert.equal(errs(explicit({ minBase: '50' })).length, 1)
  assert.equal(errs(ofSeries({ minBase: Infinity })).length, 1)
  assert.deepEqual(errs(explicit({ minBase: 50 })), [])
  assert.deepEqual(errs(explicit({ minBase: 0 })), [])
})

test('the live view (readOnly + applyPrefs) draws or refuses exactly like buildScene', () => {
  configurePrefs({ local: false })
  const fmt = (v, _u, d) => v.toFixed(d ?? 0)
  const live = (ann, ys, id) => renderToString(h(E.ChartsProvider, { value: {} },
    h(E.ChartView, { width: 400, readOnly: true, applyPrefs: true, spec: spec(ann, id), resolved: data(ys), format: fmt })))
  const cases = [
    [explicit({ minBase: 50 }), SMALL], [explicit(), SMALL], [explicit({ minBase: 50 }), LARGE],
    [ofSeries({ minBase: 50 }), SMALL], [ofSeries(), SMALL], [ofSeries({ minBase: 50 }), LARGE],
  ]
  cases.forEach(([ann, ys], i) => {
    const expected = cagrTexts(scene(ann, ys))
    const html = live(ann, ys, `mb-${i}`)
    assert.equal(/CAGR [+-−]/.test(html), expected.length > 0, `case ${i}: ${JSON.stringify(ann)} ${ys}`)
  })
  configurePrefs()
})
