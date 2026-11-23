// Annotations left out on purpose: the scene says why (scene.warnings), the views log it in development.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { readingDefaults } from './reading.js'
import { specArrowsHidden } from './useReadingPrefs.js'
import { devWarn, setDevWarnings } from './devWarn.js'

const KEYS = ['22', '23', '24', '25']
const panel = (ann, ys = [1783, 2565, 1850, 2302], grain = 'category') => buildScene(
  { id: 'p', x: { grain, keys: KEYS }, y: { min: 0 }, series: [{ id: 'v', mark: 'bar', labels: 'all' }], annotations: [ann] },
  [{ label: 'v', unit: 'M', points: KEYS.map((x, i) => ({ x, y: ys[i], type: 'actual' })) }],
  { width: 200, height: 170 })

test('the small multiple of the report: the CAGR is drawn, no warning', () => {
  const sc = panel({ type: 'cagr', from: { key: '22' }, to: { key: '25' } })
  assert.deepEqual(sc.annotations.filter(a => a.type === 'cagr').map(a => a.text), ['CAGR +8.9%'])
  assert.deepEqual(sc.warnings, [])
})

test('a CAGR the engine cannot draw is not dropped silently', () => {
  assert.match(panel({ type: 'cagr', from: { key: '22' }, to: { key: '25' } }, [0, 1, 2, 3]).warnings[0], /CAGR 22 → 25: not drawn, a growth rate needs two positive values/)
  assert.match(panel({ type: 'cagr', from: { key: '22' }, to: { key: '29' } }).warnings[0], /no value at one of its ends/)
  assert.match(panel({ type: 'cagr', series: 'v' }).warnings[0], /category axis has no first and last year/)
  assert.match(panel({ type: 'cagr', series: 'zz' }).warnings[0], /series is missing/)
  assert.match(panel({ type: 'diff', from: '22', to: '29' }).warnings[0], /Difference arrow 22 → 29: not drawn/)
})

test('stored settings that hide a spec arrow are named', () => {
  const spec = { id: 'p', x: { grain: 'category', keys: KEYS }, series: [{ id: 'v', mark: 'bar' }],
    annotations: [{ type: 'cagr', from: { key: '22' }, to: { key: '25' } }, { type: 'diff', from: '22', to: '25' }] }
  assert.deepEqual(specArrowsHidden(spec, readingDefaults(spec)), [], 'the defaults hide nothing')
  // Settings published before the arrows were added to the spec.
  assert.deepEqual(specArrowsHidden(spec, { ...readingDefaults(spec), cagrs: [], diffFrom: '', diffTo: '' }), ['CAGR 22 → 25', 'difference arrow 22 → 25'])
})

test('devWarn: once per message, in development only', t => {
  const warn = t.mock.method(console, 'warn', () => {})
  setDevWarnings(true)
  assert.equal(devWarn('x'), true)
  assert.equal(devWarn('x'), false)
  setDevWarnings(false)
  assert.equal(devWarn('y'), false)
  assert.equal(warn.mock.callCount(), 1)
  assert.equal(warn.mock.calls[0].arguments[0], '[epure-charts] x')
  setDevWarnings(null)
})
