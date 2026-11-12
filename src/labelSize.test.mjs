// Free label size ("Style" control, in points): placement follows the actual size.
// At 36 pt, in every scene: no label box overlaps another, none leaves the frame.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelMetrics } from './customStyle.js'
import { buildPieScene } from './pieScene.js'
import { buildMekkoScene } from './mekkoScene.js'
import { buildBarhScene } from './barhScene.js'
import { buildWaterfallScene } from './waterfallScene.js'
import { buildScatterScene } from './scatterScene.js'
import { buildGanttScene } from './ganttScene.js'
import { buildTableScene } from './tableScene.js'

const BIG = { labelPt: 36 }
const LM = labelMetrics(BIG, 11)
// The box of a label at the set size: estimated width, from cap height to descender.
function boxOf(l, measure = LM.measure, size = LM.size) {
  const lines = l.lines ?? [l.text]
  const w = Math.max(...lines.map(t => measure(t)))
  const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
  const lh = l.lineH ?? size
  return { x0, x1: x0 + w, y0: l.y - size * 0.75, y1: l.y + size * 0.2 + (lines.length - 1) * lh }
}
const overlap = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5
function assertClean(labels, frame, name, opts) {
  assert.ok(labels.length > 0, `${name}: at least one label`)
  const boxes = labels.map(l => [l, boxOf(l, opts?.measure, opts?.size)])
  for (const [l, b] of boxes) {
    assert.ok(b.x0 >= -0.5 && b.x1 <= frame.width + 0.5 && b.y0 >= -0.5 && b.y1 <= frame.height + 0.5, `${name}: "${l.text}" outside the frame ${JSON.stringify(b)}`)
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    assert.ok(!overlap(boxes[i][1], boxes[j][1]), `${name}: "${boxes[i][0].text}" overlaps "${boxes[j][0].text}"`)
  }
}

test('labelMetrics: nothing set = default size and unchanged estimate; 36 pt = 48 px', () => {
  const d = labelMetrics({}, 11)
  assert.equal(d.size, 11)
  assert.equal(d.base, true)
  assert.equal(d.measure('1234'), 4 * 11 * 0.58)
  assert.equal(LM.size, 48)
  assert.ok(labelMetrics({ labelPt: 36, labelFont: 'verdana' }, 11).measure('1234') > labelMetrics({ labelPt: 36, labelFont: 'serif' }, 11).measure('1234'))
})

const SLICES = [{ key: 'a', label: 'Alpha', value: 50 }, { key: 'b', label: 'Beta', value: 30 }, { key: 'c', label: 'Gamma', value: 15 }, { key: 'd', label: 'Delta', value: 3 }, { key: 'e', label: 'Eps', value: 2 }]
for (const labels of ['outside', 'inside']) {
  test(`pie (${labels}) at 36 pt: labels without overlap, inside the frame`, () => {
    const sc = buildPieScene({ labels, ...BIG }, SLICES, { width: 480, height: 280 })
    assertClean(sc.labels, sc, `pie ${labels}`)
  })
}
test('pie: the set size widens the label reserve (the radius shrinks)', () => {
  const a = buildPieScene({}, SLICES, { width: 480, height: 280 })
  const b = buildPieScene(BIG, SLICES, { width: 480, height: 280 })
  assert.ok(b.r < a.r)
})

test('Mekko at 36 pt (shares and totals): labels without overlap, inside the frame', () => {
  const spec = { series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], totals: true, ...BIG }
  const cols = [
    { key: 'eu', label: 'Europe', values: { a: 60, b: 30, c: 10 } },
    { key: 'us', label: 'US', values: { a: 20, b: 20, c: 10 } },
    { key: 'as', label: 'Asia', values: { a: 10, b: 5, c: 5 } },
  ]
  const sc = buildMekkoScene(spec, cols, { width: 600, height: 320 })
  const M = labelMetrics(BIG, 10.5)
  assertClean(sc.labels, sc, 'mekko', M)
  // A segment writes its share inside only if it fits, in width and height; otherwise beside it,
  // with a leader line, to the right of the last column.
  for (const l of sc.labels.filter(x => x.outside)) assert.ok(l.leader && l.x >= sc.plot.right)
  for (const l of sc.labels.filter(x => !x.total && !x.outside)) {
    const seg = sc.segments.find(s => s.key === l.key)
    assert.ok(M.measure(l.text) + 6 <= seg.width && seg.height >= M.size + 4)
  }
})

const F = v => `€${v.toFixed(1)}M`
const BROWS = [
  { key: 'a', label: 'Alpha', values: { v: 12, w: 4 } },
  { key: 'b', label: 'Beta', values: { v: -3, w: 6 } },
  { key: 'c', label: 'Gamma', values: { v: 8, w: 2 } },
]
for (const [name, spec] of [
  ['simple', { series: [{ id: 'v', label: 'V' }] }],
  ['grouped', { series: [{ id: 'v', label: 'V' }, { id: 'w', label: 'W' }] }],
  ['stacked', { series: [{ id: 'v', label: 'V' }, { id: 'w', label: 'W' }], stacked: true }],
  ['butterfly', { series: [{ id: 'v', label: 'Left' }, { id: 'w', label: 'Right' }], butterfly: true }],
]) {
  test(`horizontal bars (${name}) at 36 pt: figures without overlap, inside the frame`, () => {
    const M = labelMetrics(BIG, 10.5)
    // Rows only carry the chart's series (a row total = the sum of its values).
    const rows = BROWS.map(r => ({ ...r, values: Object.fromEntries(spec.series.map(z => [z.id, r.values[z.id]])) }))
    const sc = buildBarhScene(spec, rows, { width: 900, format: F, labelStyle: BIG })
    assertClean(sc.labels, sc, `barh ${name}`, M)
  })
}
test('horizontal bars: the row grows to hold 36 pt figures', () => {
  const spec = { series: [{ id: 'v', label: 'V' }] }
  const a = buildBarhScene(spec, BROWS, { width: 900, format: F })
  const b = buildBarhScene(spec, BROWS, { width: 900, format: F, labelStyle: BIG })
  assert.ok(b.height > a.height && b.rows[1].y - b.rows[0].y >= 48 + 4)
})

const BRIDGE = {
  unit: 'M',
  steps: [
    { key: 'start', label: 'Start', kind: 'anchor', value: 100, tone: 'anchor' },
    { key: 'a', label: 'Volume', kind: 'delta', value: 20, tone: 'positive' },
    { key: 'b', label: 'Price', kind: 'delta', value: -10, tone: 'negative' },
    { key: 'c', label: 'Mix', kind: 'delta', value: 5, tone: 'positive' },
    { key: 'd', label: 'FX', kind: 'delta', value: -2, tone: 'negative' },
    { key: 'end', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
  ],
}
test('waterfall at 36 pt: figures without overlap, inside the frame', () => {
  const M = labelMetrics(BIG, 10)
  const sc = buildWaterfallScene({}, BRIDGE, { width: 900, height: 320, format: v => String(Math.round(v)), labelStyle: BIG })
  assertClean(sc.labels, sc, 'waterfall', M)
  // Figures are drawn at the set size (no more 9 px fallback).
  assert.ok(sc.labels.every(l => l.size === 48))
})

test('scatter at 36 pt: labels without overlap, inside the frame', () => {
  const P = [
    { key: 'a', label: 'Alpha', x: 1, y: 2 }, { key: 'b', label: 'Beta', x: 2, y: 4 },
    { key: 'c', label: 'Gamma', x: 3, y: 6 }, { key: 'd', label: 'Delta', x: 4, y: 5 },
  ]
  const sc = buildScatterScene(BIG, P, { width: 800, height: 420 })
  assertClean(sc.labels, sc, 'scatter')
})

test('Gantt at 36 pt: labels without overlap, inside the frame; the row grows', () => {
  const R = [
    { key: 'a', label: 'Carve-out', items: [{ key: 'x', start: '2025-01-06', end: '2025-03-28', label: 'IT separation' }] },
    { key: 'b', label: 'Pricing', items: [{ key: 'y', start: '2025-02-03', end: '2025-06-30', label: 'Repricing' }, { key: 'y2', start: '2025-07-07', end: '2025-08-29', label: 'Rollout' }] },
    { key: 'c', label: 'Exit', items: [{ key: 'z', start: '2025-09-15', label: 'Signing', kind: 'milestone' }] },
  ]
  const a = buildGanttScene({}, R, { width: 900 })
  const sc = buildGanttScene(BIG, R, { width: 900 })
  assert.ok(sc.height > a.height)
  assertClean(sc.labels, sc, 'gantt')
})

test('table at 36 pt: each text fits in its cell, the row contains the text', () => {
  const cols = [{ key: 'ebitda', label: 'EBITDA', type: 'number' }, { key: 'note', label: 'Comment' }]
  const rows = [
    { key: 'a', label: 'Alpha', cells: { ebitda: 12.5, note: 'On plan' } },
    { key: 'b', label: 'Beta', cells: { ebitda: 8, note: 'Watch' } },
  ]
  const sc = buildTableScene(BIG, cols, rows, { width: 1400, format: v => v.toFixed(1) })
  const M = labelMetrics(BIG, 12)
  assert.ok(sc.rowH >= M.size + 6)
  const texts = sc.cells.filter(c => c.text)
  for (const c of texts) {
    assert.equal(c.fs, 48)
    const w = M.measure(c.text)
    const x0 = c.anchor === 'end' ? c.tx - w : c.anchor === 'middle' ? c.tx - w / 2 : c.tx
    assert.ok(x0 >= c.x && x0 + w <= c.x + c.w, `"${c.text}" overflows its cell`)
    assert.ok(c.y + c.h >= c.cy + M.size * 0.5 && c.cy - M.size * 0.5 >= c.y, `"${c.text}" taller than its row`)
  }
})
