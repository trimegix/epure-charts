// Same scale on the X axis (dates), data table styled as a table, net lines
// on a multi-series waterfall (data sheet included).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { buildWaterfallScene } from './waterfallScene.js'
import { bridgeSheet } from './sheetAdapters.js'
import { publishDomain, withdrawDomain, unionFor } from './sameScale.js'
import { buildSheet, emptyEdits } from './sheetModel.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs, unit = 'M') => ({ label, unit, role: 'actual', points: pts(pairs) })
const spec = (series, format = {}, x = { grain: 'category', range: 'all' }) => ({ id: 't', version: 1, kind: 'cartesian', scope: 'shared', x, series, format })
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'ebitda', source: 'actual' }, mark, ...extra })
const OPTS = { width: 640, height: 300 }
const day = s => Date.parse(`${s}T00:00:00Z`) / 864e5
const A = [['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-06-30', 150]]
const B = [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2026-03-31', 79]]

test('date X axis: the natural extent is published, the shared range widens the plot', () => {
  const a = buildScene(spec([S('a', 'line')]), [res('A', A)], OPTS)
  const b = buildScene(spec([S('b', 'line')]), [res('B', B)], OPTS)
  assert.equal(a.axes.x.kind, 'date')
  assert.deepEqual(a.axes.x.domain, [day('2024-01-15'), day('2025-06-30')])
  // The scale group (sameScale): the union of both ranges.
  publishDomain('ga', 'x|g|date', ...a.axes.x.domain)
  publishDomain('gb', 'x|g|date', ...b.axes.x.domain)
  const u = unionFor('x|g|date')
  withdrawDomain('ga'); withdrawDomain('gb')
  assert.deepEqual(u, [day('2024-01-15'), day('2026-03-31')])
  // Forced on A: A's last point (June 2025) is no longer at the right edge, the first stays at the left edge.
  const fa = buildScene(spec([S('a', 'line')], { xAxis: { min: u[0], max: u[1] } }), [res('A', A)], OPTS)
  const fb = buildScene(spec([S('b', 'line')], { xAxis: { min: u[0], max: u[1] } }), [res('B', B)], OPTS)
  const xOf = (sc, k) => sc.lines[0].points.find(p => p.key === k).x
  assert.ok(xOf(fa, '2025-06-30') < fa.plot.right - 50, 'A stops before the edge')
  // The same date lands on the same x in both charts (same plot width).
  if (fa.plot.left === fb.plot.left && fa.plot.right === fb.plot.right) assert.ok(Math.abs(xOf(fa, '2025-06-30') - xOf(fb, '2025-06-30')) < 0.5)
  assert.deepEqual(fa.axes.x.domain, a.axes.x.domain, 'the published domain stays the natural one')
  assert.deepEqual(fa.axes.x.drawn, u)
})

test('category X axis: no published domain, min / max have no effect', () => {
  const pairs = [['2020', 1], ['2021', 2], ['2022', 3]]
  const sc = buildScene(spec([S('a', 'bar')], { xAxis: { min: 0, max: 99999 } }, { grain: 'year', range: 'all' }), [res('A', pairs)], OPTS)
  assert.equal(sc.axes.x.domain, undefined)
})

test('data table styled as a table: bands, rules, text size', () => {
  const REV = [['2020', 112], ['2021', 124], ['2022', 136]]
  const EB = [['2020', 18], ['2021', 21], ['2022', 24]]
  const MG = [['2020', 16], ['2021', 17], ['2022', 18]]
  const base = { table: ['b', 'c'] }
  const series = [S('a', 'bar'), S('b', 'bar'), S('c', 'bar')]
  const rs = [res('Rev', REV), res('EBITDA', EB), res('Margin', MG)]
  const g = { grain: 'year', range: 'all' }
  const plain = buildScene(spec(series, base, g), rs, OPTS)
  assert.equal(plain.axes.x.tableHeads.length, 2)
  assert.deepEqual(plain.axes.x.tableFill, [])
  assert.deepEqual(plain.axes.x.tableLines, [])
  // Bands (every other row) in two colors, a rule under each row.
  const st = buildScene(spec(series, { ...base, tableStyle: { fill: 'rows', colors: ['blue-bg', 'gray-50'], lines: 'all' } }, g), rs, OPTS)
  assert.deepEqual(st.axes.x.tableFill.map(r => r.fill), ['blue-bg', 'gray-50'])
  assert.equal(st.axes.x.tableLines.length, 3, 'one rule on top and one under each row')
  const frame = buildScene(spec(series, { ...base, tableStyle: { lines: 'frame' } }, g), rs, OPTS)
  assert.equal(frame.axes.x.tableLines.length, 2, 'top and bottom')
  // The legacy "table stripes" flag still works; "none" turns it off.
  assert.equal(buildScene(spec(series, { ...base, tableStripes: true }, g), rs, OPTS).axes.x.tableFill.length, 1)
  assert.equal(buildScene(spec(series, { ...base, tableStripes: true, tableStyle: { fill: 'none' } }, g), rs, OPTS).axes.x.tableFill.length, 0)
  // Size: text and row height grow, the plot makes room.
  const big = buildScene(spec(series, { ...base, tableStyle: { size: 'xlarge' } }, g), rs, OPTS)
  assert.ok(big.axes.x.subFont > plain.axes.x.subFont)
  assert.ok(big.axes.x.tableHeads[1].y - big.axes.x.tableHeads[0].y > plain.axes.x.tableHeads[1].y - plain.axes.x.tableHeads[0].y)
  assert.ok(big.plot.bottom < plain.plot.bottom)
})

const BUDGET = {
  unit: 'M',
  steps: [
    { key: 'ly', label: 'Last year', value: 30, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 30 }, { key: 'budget', label: 'Budget', value: 30 }] },
    { key: 'vol', label: 'Volume', value: 6, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', label: 'Actual', value: 6 }, { key: 'budget', label: 'Budget', value: 8 }] },
    { key: 'cost', label: 'Cost', value: -3, kind: 'delta', tone: 'negative', parts: [{ key: 'actual', label: 'Actual', value: -3 }, { key: 'budget', label: 'Budget', value: -2 }] },
    { key: 'ty', label: 'This year', value: 33, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 33 }, { key: 'budget', label: 'Budget', value: 36 }] },
  ],
}

test('two-series waterfall: the budget as a net line, outside the stack, one stroke at its level', () => {
  const sc = buildWaterfallScene({ netLines: ['budget'] }, BUDGET, { width: 600, height: 280 })
  // Bars: one per step (actual only), no more budget segment.
  assert.equal(sc.bars.length, 4)
  assert.ok(sc.bars.every(b => b.part == null))
  // Strokes: the budget movement starts at the step's start (30 + 8 = 38), an anchor from zero (36).
  const net = Object.fromEntries(sc.netLines.map(n => [n.stepKey, n.value]))
  assert.deepEqual(net, { ly: 30, vol: 38, cost: 34, ty: 36 })
  // The stroke slightly overhangs its column, at the height of its value on the axis.
  const vol = sc.netLines.find(n => n.stepKey === 'vol')
  const bar = sc.bars.find(b => b.key === 'vol')
  assert.ok(vol.x1 < bar.x && vol.x2 > bar.x + bar.width)
  assert.ok(vol.y < bar.y, 'budget (38) above actual (36)')
  assert.ok(sc.legend.some(l => l.kind === 'net' && l.label === 'Budget'))
  // Without a net line: both series stack as segments.
  const seg = buildWaterfallScene({}, BUDGET, { width: 600, height: 280 })
  assert.equal(seg.netLines.length, 0)
  assert.equal(seg.bars.filter(b => b.part === 'budget').length, 4)
})

test('two-series waterfall: the sheet keeps the budget column and drives it', () => {
  const base = bridgeSheet.toBase(BUDGET)
  assert.deepEqual(base.cols.map(c => c.name), ['Actual', 'Budget'])
  // The volume budget goes to 10 in the sheet: only its stroke moves, the actual bridge still closes.
  const sheet = buildSheet(base, { ...emptyEdits(), cells: { 'vol|p:budget': '10' } })
  const b = bridgeSheet.fromSheet(sheet, BUDGET, { netLines: ['budget'] })
  assert.equal(b.steps.find(s => s.key === 'vol').value, 6, 'the step = actual only')
  assert.deepEqual(bridgeSheet.closing(sheet, BUDGET, { netLines: ['budget'] }), {}, 'no closing warning')
  const sc = buildWaterfallScene({ netLines: ['budget'] }, b, { width: 600, height: 280 })
  assert.equal(sc.netLines.find(n => n.stepKey === 'vol').value, 40)
  assert.equal(sc.bars.find(b2 => b2.key === 'ty').height, buildWaterfallScene({ netLines: ['budget'] }, BUDGET, { width: 600, height: 280 }).bars.find(b2 => b2.key === 'ty').height)
  // Actual edited: the step and the next level follow.
  const s2 = buildSheet(base, { ...emptyEdits(), cells: { 'vol|value': '9' } })
  const b2 = bridgeSheet.fromSheet(s2, BUDGET, { netLines: ['budget'] })
  assert.equal(b2.steps.find(s => s.key === 'vol').value, 9)
})
