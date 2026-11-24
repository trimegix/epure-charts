import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFunnelScene } from './funnelScene.js'

const stages = [
  { key: 'all', label: 'Universe', value: 1250 },
  { key: 'size', label: 'Size screen', value: 180, filter: 'EBITDA > €5M' },
  { key: 'fit', label: 'Strategic fit', value: 24, filter: 'Sector match' },
  { key: 'short', label: 'Shortlist', value: 3 },
]
const OPTS = { width: 600, height: 320 }
const sp = s => s.replace(/[\u00a0\u202f]/g, ' ')

test('centered bars, width proportional to the value, counts by default', () => {
  const sc = buildFunnelScene({}, stages, OPTS)
  assert.equal(sc.meta.figure, 'funnel')
  assert.equal(sc.stages.length, 4)
  const [a, b] = sc.stages
  assert.ok(Math.abs(a.w - sc.plot.width) < 0.01)
  assert.ok(Math.abs(b.w / a.w - 180 / 1250) < 0.001)
  const mid = s => s.x + s.w / 2
  assert.ok(sc.stages.every(s => Math.abs(mid(s) - mid(a)) < 0.01), 'centered')
  assert.ok(sc.stages.every((s, i) => i === 0 || s.y > sc.stages[i - 1].y + sc.stages[i - 1].h), 'top to bottom, no overlap')
  assert.equal(sc.necks.length, 3)
  assert.ok(sc.labels.some(l => l.kind === 'value' && l.text === '1,250'))
  assert.ok(sc.labels.some(l => l.kind === 'name' && l.text === 'Universe'))
  // A narrow bar carries its value past its end.
  const last = sc.labels.find(l => l.key === 'short|value')
  assert.equal(last.anchor, 'start')
  assert.ok(last.x > sc.stages[3].x + sc.stages[3].w)
})

test('the named filter sits between two stages; the first stage has none', () => {
  const sc = buildFunnelScene({}, [{ ...stages[0], filter: 'ignored' }, ...stages.slice(1)], OPTS)
  assert.deepEqual(sc.filters.map(f => f.text), ['Filter: EBITDA > €5M', 'Filter: Sector match'])
  const [s0, s1] = sc.stages
  const f = sc.filters[0]
  assert.ok(f.y > s0.y + s0.h && f.y < s1.y + 4, 'in the gap')
  assert.deepEqual(buildFunnelScene({ filterPrefix: false }, stages, OPTS).filters.map(x => x.text), ['EBITDA > €5M', 'Sector match'])
  assert.equal(sc.rates.length, 0)
})

test('pass rates (optional)', () => {
  const sc = buildFunnelScene({ rates: true }, stages, OPTS)
  assert.deepEqual(sc.rates.map(r => r.text), ['→ 14%', '→ 13%', '→ 13%'])
  for (const r of sc.rates) assert.ok(r.x <= sc.width)
})

test('left-aligned bars', () => {
  const sc = buildFunnelScene({ shape: 'bars' }, stages, OPTS)
  assert.ok(sc.stages.every(s => s.x === sc.plot.left))
  assert.equal(sc.necks.length, 0)
  for (const l of sc.labels.filter(x => x.kind === 'value' && x.anchor === 'start')) assert.ok(l.x + 5 * l.text.length <= sc.width)
})

test('formatter and unit; empty', () => {
  const sc = buildFunnelScene({ unit: 'M' }, [{ key: 'a', label: 'A', value: 50 }, { key: 'b', label: 'B', value: 20 }], OPTS)
  assert.ok(sc.labels.some(l => l.text === '50'), 'two significant digits: 50, not 50.0')
  const f = buildFunnelScene({}, stages, { ...OPTS, format: v => `${v} cos` })
  assert.ok(f.labels.some(l => l.text === '1250 cos'))
  for (const e of [buildFunnelScene({}, [], OPTS), buildFunnelScene({}, [{ key: 'z', label: 'Z', value: 0 }], OPTS)]) {
    assert.ok(e.empty)
    assert.equal(e.meta.figure, 'funnel')
  }
})

test('locale fr and single accent', () => {
  const sc = buildFunnelScene({ locale: 'fr', rates: true, accent: 'single', emphasis: ['short'] }, stages, OPTS)
  assert.deepEqual(sc.stages.map(s => s.color), ['chart-neutral', 'chart-neutral', 'chart-neutral', 'chart-accent'])
  assert.ok(sc.labels.some(l => sp(l.text) === '1 250'), sc.labels.map(l => l.text).join('|'))
  assert.equal(sp(sc.rates[0].text), '→ 14 %')
  const inner = sc.labels.find(l => l.key === 'all|value')
  assert.ok(inner.inner)
  assert.equal(inner.color, 'gray-800', 'ink on the neutral bar')
  assert.match(sp(sc.filters[0].text), /^(Filter|Filtre) : /)
  assert.equal(sc.meta.locale, 'fr')
})
