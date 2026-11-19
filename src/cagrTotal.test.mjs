// CAGR of a stacked chart: the column total (of: 'total'), or one series' arrow on its segment.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { validateSpec } from './spec.js'
import { readingDefaults, applyReading } from './reading.js'

const KEYS = ['2022', '2023', '2024', '2025']
const A = [100, 120, 130, 150]
const B = [50, 40, 60, 80]
const spec = (ann, extra = {}) => ({ id: 'st', version: 1, kind: 'cartesian', x: { grain: 'year', range: 'all' }, bars: 'stacked',
  series: [{ id: 'a', ref: { metric: 'm', source: 'actual' }, mark: 'bar' }, { id: 'b', ref: { metric: 'm', source: 'actual' }, mark: 'bar' }],
  annotations: [ann], ...extra })
const res = ys => ({ label: 'x', unit: 'M', points: KEYS.map((x, i) => ({ x, y: ys[i], type: 'actual' })) })
const scene = s => buildScene(s, [res(A), res(B)], { width: 640, height: 320 })
const cagrOf = sc => sc.annotations.find(a => a.type === 'cagr')
const pct = r => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%`

test('of: total: the rate of the column total, explicit or first to last', () => {
  const total = pct(((150 + 80) / (100 + 50)) ** (1 / 3) - 1)
  for (const ann of [{ type: 'cagr', of: 'total', from: { key: '2022' }, to: { key: '2025' } }, { type: 'cagr', of: 'total' }]) {
    assert.deepEqual(validateSpec(spec(ann)), [])
    const sc = scene(spec(ann))
    const c = cagrOf(sc)
    assert.equal(c.text, `CAGR ${total}`)
    assert.equal(c.of, 'total')
    const top = Math.min(...sc.bars.filter(b => b.key === '2022').map(b => b.y))
    assert.ok(c.ya < top, 'the arrow starts above the stack')
  }
})

test('a series CAGR on a stacked chart starts at its own segment', () => {
  const sc = scene(spec({ type: 'cagr', series: 'a', from: { key: '2022' }, to: { key: '2025' } }))
  const c = cagrOf(sc)
  assert.equal(c.text, `CAGR ${pct((150 / 100) ** (1 / 3) - 1)}`)
  const seg = sc.bars.find(b => b.seriesId === 'a' && b.key === '2022')
  const top = Math.min(...sc.bars.filter(b => b.key === '2022').map(b => b.y))
  assert.ok(seg.y > top, 'series a is the lower segment')
  assert.equal(c.ya, seg.y - 4, 'at the top of its segment, not of the stack')
})

test('stacked: a CAGR that names no series measures the column total', () => {
  const c = cagrOf(scene(spec({ type: 'cagr', from: { key: '2022' }, to: { key: '2025' } })))
  assert.equal(c.text, `CAGR ${pct(((150 + 80) / (100 + 50)) ** (1 / 3) - 1)}`)
  assert.equal(c.of, 'total')
  // Naming the series keeps the series' rate, on its segment.
  const a = cagrOf(scene(spec({ type: 'cagr', from: { key: '2022', series: 'a' }, to: { key: '2025', series: 'a' } })))
  assert.equal(a.text, `CAGR ${pct((150 / 100) ** (1 / 3) - 1)}`)
  // Clustered bars: unchanged (the first bar series).
  const cl = cagrOf(scene(spec({ type: 'cagr', from: { key: '2022' }, to: { key: '2025' } }, { bars: 'clustered' })))
  assert.equal(cl.text, `CAGR ${pct((150 / 100) ** (1 / 3) - 1)}`)
})

test('of: total in the live view, and validation', () => {
  const s = spec({ type: 'cagr', of: 'total' })
  const out = applyReading(s, readingDefaults(s))
  assert.deepEqual(out.annotations.filter(a => a.type === 'cagr'), [{ type: 'cagr', of: 'total' }])
  assert.match(validateSpec(spec({ type: 'cagr', of: 'sum' })).join(' '), /total/)
  assert.ok(validateSpec(spec({ type: 'cagr', of: 'total', series: 'a' })).length)
})
