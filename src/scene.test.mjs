import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, formatX } from './scene.js'
import { withDefaults } from './defaults.js'

const pts = (pairs, type = 'actual') => pairs.map(([x, y]) => ({ x, y, type }))
const res = (label, pairs, extra = {}) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pts(pairs), ...extra })
const spec = (series, extra = {}) => ({
  id: 't', version: 1, kind: 'cartesian', scope: 'shared',
  x: { grain: 'quarter', range: 'all' },
  series, ...extra,
})
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'ebitda', source: 'actual' }, mark, ...extra })
const OPTS = { width: 600, height: 300 }
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps

test('grouped bars: side by side in the same band, proportional heights', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'clustered' }),
    [res('A', [['2023-Q1', 10], ['2023-Q2', 20]]), res('B', [['2023-Q1', 5], ['2023-Q2', 10]])], OPTS)
  assert.equal(sc.bars.length, 4)
  const [a1, b1] = sc.bars.filter(b => b.key === '2023-Q1')
  assert.ok(a1.x + a1.width <= b1.x + 0.01, 'B to the right of A')
  assert.ok(near(a1.height, 2 * b1.height, 1))
  const zeroY = sc.axes.left.ticks.find(t => t.value === 0).y
  assert.ok(near(a1.y + a1.height, zeroY), 'bars start at zero')
  assert.equal(sc.legend.length, 2)
  assert.ok(sc.gridlines.length >= 2)
})

test('stacked bars: the second starts where the first ends', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked' }),
    [res('A', [['2023-Q1', 10]]), res('B', [['2023-Q1', 6]])], OPTS)
  const [a, b] = sc.bars
  assert.ok(near(a.x, b.x) && near(a.width, b.width))
  assert.ok(near(b.y + b.height, a.y), 'stacked on A')
  // The domain covers the total of 16.
  assert.ok(sc.axes.left.ticks.at(-1).value >= 16)
})

test('100% bars: every stack fills the same height, percentage axis', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked100' }),
    [res('A', [['2023-Q1', 30], ['2023-Q2', 10]]), res('B', [['2023-Q1', 10], ['2023-Q2', 90]])], OPTS)
  const h = k => sc.bars.filter(b => b.key === k).reduce((s, b) => s + b.height, 0)
  assert.ok(near(h('2023-Q1'), h('2023-Q2')))
  assert.equal(sc.axes.left.unit, 'pct')
  assert.equal(sc.axes.left.ticks.at(-1).label, '100%')
})

test('secondary axis: the second unit gets its own scale on the right', () => {
  const s = withDefaults(spec([S('a', undefined), { id: 'm', ref: { metric: 'evEbitda', source: 'actual' } }]),
    [{ unit: 'M', role: 'actual', nature: 'flow' }, { unit: 'x', role: 'actual', nature: 'ratio' }])
  assert.equal(s.series[1].axis, 'right')
  assert.equal(s.series[1].mark, 'line')
  const sc = buildScene(s, [res('EBITDA', [['2023-Q1', 100], ['2023-Q2', 120]]),
    { label: 'EV / EBITDA', unit: 'x', nature: 'ratio', role: 'actual', points: pts([['2023-Q1', 8], ['2023-Q2', 9]]) }], OPTS)
  assert.ok(sc.axes.right, 'right axis present')
  assert.equal(sc.axes.right.unit, 'x')
  assert.ok(sc.axes.right.ticks.at(-1).value < 20, 'scale of multiples, not €M')
  assert.ok(sc.plot.right < 600 - 20, "la marge droite laisse place aux graduations")
  assert.ok(sc.lines[0].d.startsWith('M'))
})

test('empty series: no geometry, legend marked empty, no exception', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('ic', 'line', { style: { dash: 'dash' } })]),
    [res('A', [['2023-Q1', 10]]), res('IC', [], { role: 'ic' })], OPTS)
  assert.equal(sc.lines.length, 0)
  assert.equal(sc.legend[1].empty, true)
  assert.match(sc.legend[1].text, /no data/)
  assert.equal(sc.empty, false)
  const none = buildScene(spec([S('a', 'bar')]), [res('A', [])], OPTS)
  assert.equal(none.empty, true)
  assert.deepEqual(none.bars, [])
})

test('negative values: bar below zero, domain extends down', () => {
  const sc = buildScene(spec([S('a', 'bar')]), [res('A', [['2023-Q1', 10], ['2023-Q2', -5]])], OPTS)
  const zeroY = sc.axes.left.ticks.find(t => t.value === 0).y
  const neg = sc.bars.find(b => b.key === '2023-Q2')
  assert.ok(neg.negative)
  assert.ok(near(neg.y, zeroY), 'starts at zero')
  assert.ok(neg.y + neg.height > zeroY, 'goes below zero')
  assert.ok(sc.axes.left.ticks[0].value < 0)
  assert.ok(sc.gridlines.some(g => g.zero), 'zero line marked')
})

test('a single period: one band, the line becomes a marker', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('p', 'line')]),
    [res('A', [['2023-Q1', 10]]), res('P', [['2023-Q1', 12]], { role: 'plan' })], OPTS)
  assert.equal(sc.bars.length, 1)
  assert.ok(sc.bars[0].width > 0 && sc.bars[0].width <= 56)
  assert.equal(sc.lines[0].d, null)
  assert.equal(sc.lines[0].markers.length, 1)
  assert.equal(sc.axes.x.ticks.length, 1)
  assert.equal(sc.columns.length, 1)
})

test('forecast: actual bar in light gray, separate line segment', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('l', 'line')]), [
    { ...res('A', []), points: [...pts([['2023-Q1', 10]]), ...pts([['2023-Q2', 12]], 'forecast')] },
    { ...res('L', []), points: [...pts([['2023-Q1', 10], ['2023-Q2', 11]]), ...pts([['2023-Q3', 12]], 'forecast')] },
  ], OPTS)
  assert.equal(sc.bars[1].forecast, true)
  assert.equal(sc.bars[1].color, 'chart-forecast')
  assert.equal(sc.bars[0].color, 'chart-actual')
  assert.ok(sc.lines[0].d && sc.lines[0].dForecast)
})

test("'category' grain: categories in point order, text labels", () => {
  const sc = buildScene(spec([S('a', 'bar')], { x: { grain: 'category' } }),
    [res('A', [['Zeta', 3], ['Alpha', 5]])], OPTS)
  assert.deepEqual(sc.columns.map(c => c.key), ['Zeta', 'Alpha'])
  assert.deepEqual(sc.axes.x.ticks.map(t => t.label), ['Zeta', 'Alpha'])
})

test('round ticks and spaced X labels', () => {
  const many = Array.from({ length: 24 }, (_, i) => [`${2019 + Math.floor(i / 4)}-Q${(i % 4) + 1}`, 10 + i * 1.37])
  const sc = buildScene(spec([S('a', 'bar')]), [res('A', many)], { width: 360, height: 220 })
  const vals = sc.axes.left.ticks.map(t => t.value)
  const step = vals[1] - vals[0]
  assert.ok([1, 2, 2.5, 5].some(m => Number.isInteger(+(step / m).toFixed(9)) && Math.log10(step / m) % 1 === 0), `pas rond (${step})`)
  assert.ok(sc.axes.x.ticks.length < 24, 'labels thinned out')
  assert.equal(sc.axes.x.ticks.at(-1).key, '2024-Q4', 'the last one always shown')
  assert.equal(formatX('2024-Q1', 'quarter'), "Q1 '24")
})

test('contract: labels[] and annotations[] slots present', () => {
  const sc = buildScene(spec([S('a', 'bar')]), [res('A', [['2023-Q1', 1]])], OPTS)
  assert.deepEqual(sc.labels, [])
  assert.deepEqual(sc.annotations, [])
})

test('time axis: missing periods keep their place', () => {
  const sc = buildScene(spec([S('a', 'bar')]), [res('A', [['2022-Q2', 1], ['2023-Q2', 2], ['2023-Q3', 3]])], OPTS)
  assert.equal(sc.columns.length, 6)
  assert.equal(sc.bars.length, 3)
  const y = buildScene(spec([S('a', 'bar')], { x: { grain: 'year', range: 'all' } }), [res('A', [['2020', 1], ['2023', 2]])], OPTS)
  assert.deepEqual(y.columns.map(c => c.key), ['2020', '2021', '2022', '2023'])
})

// Date axis: a first label shifted right of the left edge must not crowd two ticks
// ("Q1 24" 58 px from "Q2 24" against 76 elsewhere): it is dropped.
test('date axis: no first label squeezed against the next one', () => {
  const nav = pairs => ({
    spec: { kind: 'cartesian', x: { grain: 'category' }, series: [{ id: 'nav', mark: 'line', labels: 'last', style: { color: 'cat-2', marker: true } }] },
    resolved: [{ label: 'NAV', unit: 'M', role: 'actual', points: pairs.map(([x, y]) => ({ x, y })) }],
  })
  const fmt = v => `€${v}M`
  for (const p of [[['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-01-31', 141], ['2025-06-30', 150]], [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2025-12-31', 75], ['2026-03-31', 79]]]) {
    for (const width of [540, 467, 700]) {
      const { spec, resolved } = nav(p)
      const sc = buildScene(spec, resolved, { width, height: 240, format: fmt, formatAxis: fmt })
      // The drawn labels (a "muted" tick keeps its place, without a label).
      const xs = sc.axes.x.ticks.filter(t => !t.muted).map(t => t.lx ?? t.x)
      assert.ok(xs.length >= 2)
      const gaps = xs.slice(1).map((x, i) => x - xs[i])
      const normal = Math.max(...gaps.slice(1), gaps[0])
      assert.ok(gaps[0] >= 0.85 * normal - 0.5, `${width}: ${gaps[0]} vs ${normal}`)
    }
  }
})
