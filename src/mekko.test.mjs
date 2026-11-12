import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMekkoScene } from './mekkoScene.js'

const spec = { series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }
const cols = [
  { key: 'eu', label: 'Europe', values: { a: 60, b: 30, c: 10 } },
  { key: 'us', label: 'US', values: { a: 20, b: 20, c: 10 } },
]
test('column widths proportional to totals', () => {
  const sc = buildMekkoScene(spec, cols, { width: 600, height: 300 })
  const [eu, us] = sc.columns
  assert.ok(Math.abs(eu.width / us.width - 2) < 0.02)
})
test('in %, every column reaches the same top', () => {
  const sc = buildMekkoScene(spec, cols, { width: 600, height: 300 })
  const tops = sc.columns.map(c => Math.min(...sc.segments.filter(s => s.colKey === c.key).map(s => s.y)))
  assert.ok(Math.abs(tops[0] - tops[1]) < 1e-6)
})
test('in units, the height follows the value', () => {
  const sc = buildMekkoScene({ ...spec, mode: 'units' }, cols, { width: 600, height: 300 })
  const h = k => sc.segments.filter(s => s.colKey === k).reduce((t, s) => t + s.height, 0)
  assert.ok(Math.abs(h('eu') / h('us') - 2) < 0.02)
})
test('small segments grouped into "Other"', () => {
  const sc = buildMekkoScene({ ...spec, other: 0.15 }, cols, { width: 600, height: 300 })
  assert.ok(sc.segments.filter(s => s.colKey === 'eu').length <= 3)
})
test('independent width: the "extent" row overrides the total (unit Mekko)', () => {
  const c2 = [{ ...cols[0], extent: 10 }, { ...cols[1], extent: 30 }]
  const sc = buildMekkoScene({ ...spec, mode: 'units' }, c2, { width: 600, height: 300 })
  assert.ok(sc.extent)
  assert.ok(Math.abs(sc.columns[1].width / sc.columns[0].width - 3) < 0.02)
  // the height still follows the value
  const h = k => sc.segments.filter(s => s.colKey === k).reduce((t, s) => t + s.height, 0)
  assert.ok(Math.abs(h('eu') / h('us') - 2) < 0.02)
  // extent: false → back to totals
  const off = buildMekkoScene({ ...spec, extent: false }, c2, { width: 600, height: 300 })
  assert.ok(Math.abs(off.columns[0].width / off.columns[1].width - 2) < 0.02)
})
test('below the axis: share, value or nothing', () => {
  const c2 = [{ ...cols[0], extent: 10 }, { ...cols[1], extent: 30 }]
  const f = v => `v${v}`
  assert.equal(buildMekkoScene(spec, c2, { width: 600, format: f }).axes.x.ticks[0].share, '25%')
  assert.equal(buildMekkoScene({ ...spec, xLabels: 'value' }, c2, { width: 600, format: f }).axes.x.ticks[0].share, 'v10')
  assert.equal(buildMekkoScene({ ...spec, xLabels: 'none' }, c2, { width: 600 }).axes.x.ticks[0].share, null)
})
test('"Move to Other": one series, or a single segment', () => {
  const sc = buildMekkoScene({ ...spec, toOther: ['b'] }, cols, { width: 600 })
  const eu = sc.segments.filter(s => s.colKey === 'eu')
  assert.deepEqual(eu.map(s => s.seriesId), ['a', 'c', '__other__'])
  assert.deepEqual(eu[2].members, ['b'])
  const one = buildMekkoScene({ ...spec, toOther: ['us|a'] }, cols, { width: 600 })
  assert.equal(one.segments.filter(s => s.colKey === 'eu' && s.seriesId === '__other__').length, 0)
  assert.equal(one.segments.find(s => s.key === 'us|__other__').value, 20)
})
test('segment order within each column', () => {
  const ids = (o, k) => buildMekkoScene({ ...spec, segmentOrder: o }, cols, { width: 600 }).segments.filter(s => s.colKey === k).map(s => s.seriesId)
  assert.deepEqual(ids('sheet', 'eu'), ['a', 'b', 'c'])
  assert.deepEqual(ids('reverse', 'eu'), ['c', 'b', 'a'])
  assert.deepEqual(ids('asc', 'eu'), ['c', 'b', 'a'])
  assert.deepEqual(ids('desc', 'us'), ['a', 'b', 'c'])
  // largest at the bottom: largest y
  const sc = buildMekkoScene({ ...spec, segmentOrder: 'desc' }, cols, { width: 600 })
  const eu = sc.segments.filter(s => s.colKey === 'eu')
  assert.ok(eu[0].y > eu[1].y)
})
test('segment outline and column edges', () => {
  assert.equal(buildMekkoScene({ ...spec, outline: 'none' }, cols, { width: 600 }).segments[0].stroke, null)
  assert.equal(buildMekkoScene({ ...spec, outline: 'dark' }, cols, { width: 600 }).segments[0].stroke.color, 'black')
  const sc = buildMekkoScene({ ...spec, ridges: true, mode: 'units' }, cols, { width: 600, height: 300 })
  assert.equal(sc.ridges.length, 2)
  assert.ok(sc.ridges[1].y > sc.ridges[0].y)
  assert.equal(buildMekkoScene(spec, cols, { width: 600 }).ridges.length, 0)
})
test('"Other" handle: its height follows the threshold, dragging it sets it', async () => {
  const { mekkoOtherFromY } = await import('./mekkoScene.js')
  const s4 = { series: [...spec.series, { id: 'd', label: 'D' }] }
  const c4 = [{ key: 'eu', label: 'Europe', values: { a: 60, b: 30, c: 6, d: 4 } }]
  const off = buildMekkoScene(s4, c4, { width: 600, height: 300 })
  assert.equal(off.otherHandle.value, 0)
  assert.equal(off.otherHandle.y, off.plot.bottom)
  assert.ok(off.otherHandle.x > off.plot.right)
  // drag to 8%: the two small segments join "Other"
  const th = mekkoOtherFromY(off, off.plot.bottom - 0.08 * off.plot.height)
  assert.equal(th, 0.08)
  const on = buildMekkoScene({ ...s4, other: th }, c4, { width: 600, height: 300 })
  assert.equal(on.otherHandle.pooled, 2)
  assert.ok(on.otherHandle.y < off.otherHandle.y)
  assert.equal(mekkoOtherFromY(off, off.plot.bottom + 20), null)
  assert.equal(mekkoOtherFromY(off, off.plot.top), 0.5)
})

// ── Value line, 100%, grand total, data table ───────────────────────────────
import { mekkoValueFromY } from './mekkoScene.js'
test('value line in units = mean of totals weighted by widths', () => {
  const sc = buildMekkoScene({ ...spec, mode: 'units', valueLine: true }, cols, { width: 600, height: 300 })
  // totals 100 and 50, weights 2/3 and 1/3 → 83.3
  assert.ok(Math.abs(sc.valueLine.value - 250 / 3) < 1e-9)
  assert.equal(sc.valueLine.auto, true)
})
test('value line in % = weighted share of the bottom segment, then placed by hand', () => {
  const sc = buildMekkoScene({ ...spec, valueLine: true }, cols, { width: 600, height: 300 })
  assert.ok(Math.abs(sc.valueLine.value - (2 / 3 * 0.6 + 1 / 3 * 0.4)) < 1e-9)
  const v = mekkoValueFromY(sc, sc.plot.top + sc.plot.height / 2)
  assert.ok(Math.abs(v - 0.5) < 0.01)
  const sc2 = buildMekkoScene({ ...spec, valueLine: 0.25 }, cols, { width: 600, height: 300 })
  assert.equal(sc2.valueLine.auto, false)
  assert.ok(Math.abs(sc2.valueLine.y - (sc2.plot.bottom - sc2.plot.height * 0.25)) < 1e-6)
})
test('100% indicator in % Mekko only, and grand total', () => {
  const sc = buildMekkoScene({ ...spec, hundred: 'left', grandTotal: true }, cols, { width: 600, height: 300, format: v => String(v) })
  assert.equal(sc.hundred.text, '100%')
  assert.equal(sc.hundred.anchor, 'start')
  assert.equal(sc.grandTotal.value, 150)
  assert.ok(sc.grandTotal.y < sc.plot.top)
  assert.equal(buildMekkoScene({ ...spec, mode: 'units', hundred: 'left' }, cols, { width: 600, height: 300 }).hundred, null)
})
test('a series moved to the table leaves the Mekko and is written below the axis', () => {
  const sc = buildMekkoScene({ ...spec, table: ['c'] }, cols, { width: 600, height: 300, format: v => String(v) })
  assert.ok(!sc.segments.some(s => s.seriesId === 'c'))
  assert.equal(sc.table.heads.length, 1)
  assert.deepEqual(sc.table.rows.map(r => r.full), ['10', '10'])
  // widths follow totals without the table series: 90 versus 40
  assert.ok(Math.abs(sc.columns[0].width / sc.columns[1].width - 90 / 40) < 0.05)
  assert.ok(sc.table.top > sc.plot.bottom)
  // at least one series stays in the chart
  assert.equal(buildMekkoScene({ ...spec, table: ['a', 'b', 'c'] }, cols, { width: 600, height: 300 }).table.heads.length, 2)
})

test('right margin: grand total and value-line label clear of the columns and totals', async () => {
  const { estimateWidth } = await import('./scene.js')
  const f = v => `€${Math.round(v)}M`
  const many = [
    { key: 'fr', label: 'France', values: { a: 60, b: 30, c: 10 } }, { key: 'de', label: 'Germany', values: { a: 50, b: 40, c: 20 } },
    { key: 'it', label: 'Italy', values: { a: 20, b: 20, c: 10 } }, { key: 'es', label: 'Spain', values: { a: 15, b: 10, c: 5 } },
  ]
  const sc = buildMekkoScene({ ...spec, totals: true, valueLine: true, hundred: 'right', grandTotal: true }, many, { width: 560, height: 300, format: f })
  const boxOf = (x, w, anchor) => (anchor === 'end' ? [x - w, x] : anchor === 'start' ? [x, x + w] : [x - w / 2, x + w / 2])
  const g = boxOf(sc.grandTotal.x, estimateWidth(sc.grandTotal.text, 10.5), 'end')
  const right = Math.max(...sc.columns.map(c => c.x + c.width))
  assert.ok(g[0] > right, 'grand total starts after the last column')
  for (const l of sc.labels.filter(x => x.key.startsWith('total|'))) {
    const b = boxOf(l.x, estimateWidth(l.text, 10.5), 'middle')
    assert.ok(b[1] <= g[0] || b[0] >= g[1])
  }
  const v = boxOf(sc.valueLine.labelX, estimateWidth(sc.valueLine.text, 10.5), 'start')
  assert.ok(v[0] > right && v[1] <= sc.width, 'the value-line label fits in the margin')
  assert.ok(sc.valueLine.labelX > sc.otherHandle.x + 8, 'after the "Other" handle')
})
test('100% indicator on the right: in the margin, below the grand total', () => {
  const sc = buildMekkoScene({ ...spec, totals: true, hundred: 'right', grandTotal: true }, cols, { width: 560, height: 300, format: v => `€${v}M` })
  const right = Math.max(...sc.columns.map(c => c.x + c.width))
  assert.ok(sc.hundred.x > right)
  assert.ok(sc.hundred.y - 10.5 >= sc.grandTotal.y)
})
test('legend: a series fully merged into "Other" leaves it, "Other" enters it', () => {
  const sc = buildMekkoScene({ ...spec, mode: 'units', toOther: ['b'] }, cols, { width: 600, height: 300 })
  const keys = sc.legend.map(l => l.key)
  assert.ok(!keys.includes('b'))
  assert.ok(keys.includes('__other__'))
  assert.equal(sc.legend.find(l => l.key === '__other__').color, sc.segments.find(s => s.seriesId === '__other__').color)
  // A single moved segment: the series stays (it is still drawn elsewhere).
  const one = buildMekkoScene({ ...spec, toOther: ['us|a'] }, cols, { width: 600, height: 300 })
  assert.deepEqual(one.legend.map(l => l.key), ['a', 'b', 'c', '__other__'])
  assert.ok(!buildMekkoScene(spec, cols, { width: 600, height: 300 }).legend.some(l => l.key === '__other__'))
})
test('100% indicator: its side follows where it is dropped', async () => {
  const { mekkoHundredSideFromX } = await import('./mekkoScene.js')
  const sc = buildMekkoScene({ ...spec, hundred: 'left' }, cols, { width: 600, height: 300 })
  assert.equal(mekkoHundredSideFromX(sc, sc.plot.left + 10), 'left')
  assert.equal(mekkoHundredSideFromX(sc, sc.plot.right - 10), 'right')
})

// A segment too small for its label (Spain, Competitor 1): label placed beside it with a
// leader line when there is room on the right; otherwise removed and counted.
const UNITS = { mode: 'units', series: [{ id: 'us', label: 'Our portfolio' }, { id: 'c1', label: 'Competitor 1' }, { id: 'c2', label: 'Competitor 2' }], segmentOrder: 'desc', ridges: true, xLabels: 'value', toOther: ['c2'] }
const UCOLS = [
  { key: 'fr', label: 'France', extent: 420, values: { us: 35, c1: 25, c2: 15 } },
  { key: 'de', label: 'Germany', extent: 610, values: { us: 20, c1: 40, c2: 10 } },
  { key: 'uk', label: 'UK', extent: 300, values: { us: 10, c1: 15, c2: 20 } },
  { key: 'es', label: 'Spain', extent: 180, values: { us: 12, c1: 4, c2: 6 } },
]
test('unit Mekko: the small segment of the last column gets its label beside it, with a leader', () => {
  for (const width of [600, 1000]) {
    const sc = buildMekkoScene(UNITS, UCOLS, { width, height: 320 })
    const l = sc.labels.find(x => x.key === 'es|c1')
    assert.ok(l, `${width}: no label for Spain / Competitor 1`)
    assert.ok(l.outside && l.leader && l.x >= sc.plot.right)
    const seg = sc.segments.find(s => s.key === 'es|c1')
    assert.ok(Math.abs(l.leader.y1 - (seg.y + seg.height / 2)) < 0.01 && l.leader.x1 === seg.x + seg.width)
    assert.ok(l.x + l.w <= width - 1, 'inside the card')
    // Every label is either drawn or counted.
    assert.equal(sc.labels.filter(x => !x.total).length + sc.noRoom, sc.segments.length)
  }
  // No room on the right (value-line margin): removed and counted.
  const vl = buildMekkoScene({ ...UNITS, valueLine: true }, UCOLS, { width: 600, height: 320 })
  assert.ok(!vl.labels.some(x => x.key === 'es|c1'))
  assert.equal(vl.labels.filter(x => !x.total).length + vl.noRoom, vl.segments.length)
  // A small segment of an inner column (no room beside it) stays counted.
  const inner = buildMekkoScene(UNITS, [UCOLS[3], ...UCOLS.slice(0, 3)], { width: 600, height: 320 })
  assert.ok(!inner.labels.some(x => x.key === 'es|c1') && inner.noRoom >= 1)
})
