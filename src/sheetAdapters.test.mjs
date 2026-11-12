// The datasheet drives the chart: input in the sheet changes what the scene draws.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSheet, emptyEdits } from './sheetModel.js'
import { pieSheet, scatterSheet, mekkoSheet, barhSheet, tableSheet, bridgeSheet, ganttSheet } from './sheetAdapters.js'
import { buildPieScene } from './pieScene.js'
import { buildScatterScene } from './scatterScene.js'
import { buildMekkoScene } from './mekkoScene.js'
import { buildBarhScene } from './barhScene.js'
import { buildTableScene } from './tableScene.js'
import { buildWaterfallScene } from './waterfallScene.js'

const edit = (cells = {}, more = {}) => ({ ...emptyEdits(), cells, ...more })

test('pie: changing a value changes the slice, renaming changes the label, an added row becomes a slice', () => {
  const slices = [{ key: 'a', label: 'A', value: 50 }, { key: 'b', label: 'B', value: 50 }]
  const base = pieSheet.toBase(slices)
  const before = buildPieScene({}, pieSheet.fromSheet(buildSheet(base), slices), { width: 400, height: 240 })
  const sheet = buildSheet(base, edit({ 'a|value': '150' }, { rowNames: { b: 'Beta' }, addedRows: [{ id: 'row1', after: 'b' }], rowNames2: {} }))
  sheet.rows.find(r => r.id === 'row1').cells[0].value = null
  const data = pieSheet.fromSheet(buildSheet(base, edit({ 'a|value': '150', 'row1|value': '100' }, { rowNames: { b: 'Beta', row1: 'Gamma' }, addedRows: [{ id: 'row1', after: 'b' }] })), slices)
  const after = buildPieScene({}, data, { width: 400, height: 240 })
  assert.equal(before.arcs.length, 2)
  assert.equal(after.arcs.length, 3)
  assert.ok(after.arcs.find(a => a.key === 'a').share > before.arcs.find(a => a.key === 'a').share - 0.2)
  assert.deepEqual(after.arcs.map(a => a.label), ['A', 'Beta', 'Gamma'])
  assert.ok(Math.abs(after.arcs.find(a => a.key === 'a').share - 0.5) < 1e-9)
})

test('scatter: typed X / Y / group move and recolor the point; formulas accepted', () => {
  const pts = [{ key: 'p', label: 'P', x: 1, y: 1 }, { key: 'q', label: 'Q', x: 2, y: 2 }]
  const base = scatterSheet.toBase(pts)
  const s0 = buildScatterScene({}, scatterSheet.fromSheet(buildSheet(base), pts), { width: 400, height: 300 })
  const s1 = buildScatterScene({}, scatterSheet.fromSheet(buildSheet(base, edit({ 'p|x': '=B3*2', 'p|group': 'G2' })), pts), { width: 400, height: 300 })
  const p0 = s0.points.find(p => p.key === 'p'), p1 = s1.points.find(p => p.key === 'p')
  assert.equal(p1.vx, 4)
  assert.notEqual(p0.x, p1.x)
  assert.equal(p1.group, 'G2')
})

test('Mekko: a typed segment changes the height, the Width row changes the width', () => {
  const series = [{ id: 's1', label: 'S1' }, { id: 's2', label: 'S2' }]
  const cols = [{ key: 'c1', label: 'C1', extent: 10, values: { s1: 5, s2: 5 } }, { key: 'c2', label: 'C2', extent: 10, values: { s1: 5, s2: 5 } }]
  const base = mekkoSheet.toBase(cols, series)
  const d = mekkoSheet.fromSheet(buildSheet(base, edit({ 's1|c1': '15', '__width|c2': '30' })), cols, series)
  const sc = buildMekkoScene({ series: d.series, mode: 'units' }, d.columns, { width: 500, height: 300 })
  const c1 = sc.columns.find(c => c.key === 'c1'), c2 = sc.columns.find(c => c.key === 'c2')
  assert.equal(c1.total, 20)
  assert.ok(c2.width > c1.width)
})

test('horizontal bars: a typed value lengthens the bar; a renamed series changes the legend', () => {
  const series = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
  const rows = [{ key: 'r1', label: 'R1', values: { a: 1, b: 2 } }]
  const base = barhSheet.toBase(rows, series)
  const d = barhSheet.fromSheet(buildSheet(base, edit({ 'r1|a': '10' }, { colNames: { b: 'Bee' } })), rows, series)
  const sc = buildBarhScene({ series: d.series }, d.rows, { width: 500 })
  const w = id => sc.bars.find(b => b.seriesId === id).width
  assert.ok(w('a') > w('b'))
  assert.equal(sc.legend.find(l => l.key === 'b').label, 'Bee')
})

test('table: a typed cell changes the rendered cell', () => {
  const columns = [{ key: 'v', label: 'Value' }, { key: 'c', label: 'Comment' }]
  const rows = [{ key: 'a', label: 'Alpha', cells: { v: 1, c: 'ok' } }]
  const base = tableSheet.toBase(columns, rows)
  const d = tableSheet.fromSheet(buildSheet(base, edit({ 'a|v': '7', 'a|c': 'late' })), columns, rows)
  const sc = buildTableScene({}, d.columns, d.rows, { width: 500 })
  const texts = JSON.stringify(sc)
  assert.ok(texts.includes('late') && texts.includes('7'))
})

test('waterfall: a typed step changes the computed total; an added step is inserted', () => {
  const bridge = { unit: 'M', steps: [{ key: 'a', label: 'Start', kind: 'anchor', value: 100 }, { key: 'd', label: 'Up', kind: 'delta', value: 10, tone: 'positive' }, { key: 't', label: 'End', kind: 'total' }] }
  const base = bridgeSheet.toBase(bridge)
  const b = bridgeSheet.fromSheet(buildSheet(base, edit({ 'd|value': '30', 'row1|value': '-5' }, { addedRows: [{ id: 'row1', after: 'd' }], rowNames: { row1: 'Down' } })), bridge)
  const sc = buildWaterfallScene({}, b, { width: 500, height: 260 })
  assert.ok(b.steps.some(s => s.key === 'row1' && s.kind === 'delta' && s.value === -5))
  assert.equal(b.steps.find(s => s.key === 't').value, 125)
  assert.ok(/125/.test(sc.columns.find(c => c.key === 't').text))
})

test('sheet colors ("Use Datasheet Fill"): they color slice, point, segment, bar', async () => {
  const { setFill } = await import('./sheetModel.js')
  const slices = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 1 }]
  const pb = pieSheet.toBase(slices)
  const pie = buildPieScene({}, pieSheet.fromSheet(buildSheet(pb, setFill(emptyEdits(), [['a', '*']], 'cat-5')), slices), { width: 400, height: 240 })
  assert.equal(pie.arcs.find(a => a.key === 'a').color, 'cat-5')
  const series = [{ id: 's1', label: 'S1' }, { id: 's2', label: 'S2' }]
  const cols = [{ key: 'c1', label: 'C1', values: { s1: 5, s2: 5 } }]
  const d = mekkoSheet.fromSheet(buildSheet(mekkoSheet.toBase(cols, series), setFill(emptyEdits(), [['s2', 'c1']], 'cat-7')), cols, series)
  const mk = buildMekkoScene({ series: d.series }, d.columns, { width: 400, height: 300 })
  assert.equal(mk.segments.find(sg => sg.seriesId === 's2').color, 'cat-7')
  const rows = [{ key: 'r', label: 'R', values: { s1: 1, s2: 2 } }]
  const bh = barhSheet.fromSheet(buildSheet(barhSheet.toBase(rows, series), setFill(emptyEdits(), [['r', 's1']], 'cat-3')), rows, series)
  const bs = buildBarhScene({ series: bh.series }, bh.rows, { width: 400 })
  assert.equal(bs.bars.find(b => b.seriesId === 's1').color, 'cat-3')
})

test('waterfall: typing "e" turns a step into a computed subtotal; the total shows "e"', () => {
  const bridge = { unit: 'M', steps: [{ key: 'a', label: 'Start', kind: 'anchor', value: 100 }, { key: 'd1', label: 'Up', kind: 'delta', value: 10 }, { key: 'd2', label: 'More', kind: 'delta', value: 5 }, { key: 't', label: 'End', kind: 'total' }] }
  const base = bridgeSheet.toBase(bridge)
  assert.equal(buildSheet(base).rows.find(r => r.id === 't').cells[0].raw, 'e')
  const b = bridgeSheet.fromSheet(buildSheet(base, edit({}, { addedRows: [{ id: 'row1', after: 'd1' }], rowNames: { row1: 'Subtotal' }, cells: { 'row1|value': 'e' } })), bridge)
  assert.deepEqual(b.steps.map(s => [s.key, s.kind, s.value]), [['a', 'anchor', 100], ['d1', 'delta', 10], ['row1', 'total', 110], ['d2', 'delta', 5], ['t', 'total', 115]])
})

// ── Gantt: the datasheet drives the schedule ──
import { buildGanttScene, patchItem, moveRow, insertRow } from './ganttScene.js'
const GR = [
  { key: 'a', label: 'Migration', responsible: 'CIO', status: 0.5, items: [{ key: 'x', start: '2025-01-06', end: '2025-03-28', label: 'IT', done: 0.6 }] },
  { key: 'b', label: 'Pricing', items: [{ key: 'y', start: '2025-02-03', end: '2025-04-30' }, { key: 'y2', after: 'y', duration: 30, label: 'Wave 2' }] },
  { key: 'c', label: 'Launch', status: null, items: [{ key: 'z', start: '2025-09-15', kind: 'milestone', label: 'Signing' }] },
]
const GEV = [{ key: 'bd', date: '2025-06-26', label: 'Board' }]
const gantt = (e, rows = GR, evs = GEV) => {
  const base = ganttSheet.toBase(rows, evs)
  const sheet = buildSheet(base, e)
  const d = ganttSheet.fromSheet(sheet, rows, evs)
  return { base, sheet, d, sc: buildGanttScene({ events: d.events, columns: ['responsible', 'status'] }, d.rows, { width: 800 }) }
}

test('Gantt: untouched sheet = the source (links, durations, null status kept)', () => {
  const { d, base } = gantt(edit())
  assert.deepEqual(d.rows, GR)
  assert.deepEqual(d.events, GEV)
  assert.deepEqual(base.rows.map(r => r.id), ['a~x', 'b~y', 'b~y2', 'c~z', '__ev~bd'])
  assert.deepEqual(base.rows.map(r => r.name), ['Migration', 'Pricing', '↳ Pricing', 'Launch', 'Board'])
})

test('Gantt: a typed end lengthens the bar', () => {
  const w0 = gantt(edit()).sc.bars.find(b => b.itemKey === 'x').width
  const w1 = gantt(edit({ 'a~x|end': '2025-06-30' })).sc.bars.find(b => b.itemKey === 'x').width
  assert.ok(w1 > w0 * 1.5)
})

test('Gantt: renaming the row changes the activity label; typed bar label and status', () => {
  const { sc } = gantt(edit({ 'a~x|label': 'Separation', 'a~x|status': '4' }, { rowNames: { 'a~x': 'IT migration' } }))
  assert.equal(sc.rows.find(r => r.key === 'a').label, 'IT migration')
  assert.ok(sc.labels.some(l => l.text === 'Separation'))
  assert.equal(sc.cells.find(c => c.key === 'a|status').harvey, 1)
})

test('Gantt: an added row becomes a bar; without a name, it joins the activity above', () => {
  const s0 = gantt(edit()).sc
  const { sc, d } = gantt(edit({ 'row1|start': '2025-05-05', 'row1|end': '2025-07-31', 'row2|start': '2025-08-01', 'row2|duration': '10' },
    { addedRows: [{ id: 'row1', after: 'c~z' }, { id: 'row2', after: 'row1' }], rowNames: { row1: 'Integration' } }))
  assert.equal(sc.bars.length, s0.bars.length + 2)
  assert.equal(d.rows.at(-1).label, 'Integration')
  assert.equal(d.rows.at(-1).items.length, 2)
})

test('Gantt: a mistyped date is flagged; the bar is not drawn, never with the old date', () => {
  for (const bad of ['next week', '2025-02-29']) {
    const { sheet, d } = gantt(edit({ 'a~x|end': bad }))
    const cell = sheet.rows.find(r => r.id === 'a~x').cells[sheet.cols.findIndex(c => c.key === 'end')]
    assert.equal(cell.error, '#DATE')
    const it = d.rows[0].items[0]
    assert.equal(it.end, bad)
    assert.equal(it.sheetError, true)
    const v = ganttSheet.drawable(d)
    const sc = buildGanttScene({ events: v.events }, v.rows, { width: 800 })
    assert.equal(sc.bars.find(b => b.itemKey === 'x'), undefined)
    assert.ok(!JSON.stringify(sc).includes('2025-03-28'))
    // After a round trip through the chart (a drag elsewhere), the faulty input stays in the sheet.
    const base = ganttSheet.toBase(GR, GEV)
    assert.equal(ganttSheet.fromPlan(d.rows, d.events, base).cells['a~x|end'], bad)
  }
})

test('Gantt: the first row drives the key dates', () => {
  const { d, sc } = gantt(edit({ '__ev~bd|start': '2025-07-10', 'row1|start': '2025-12-11' }, { addedRows: [{ id: 'row1', after: '__ev~bd' }], rowNames: { row1: 'Budget' } }))
  assert.deepEqual(d.events.map(e => [e.label, e.date]), [['Board', '2025-07-10'], ['Budget', '2025-12-11']])
  assert.equal(sc.events.length, 2)
  assert.equal(d.rows.length, 3)
})

test('Gantt: a drag, a move and an insert on the chart go through the sheet', () => {
  const base = ganttSheet.toBase(GR, GEV)
  let plan = patchItem(GR, 'a', 'x', { start: '2025-02-03', end: '2025-04-30' })
  plan = moveRow(plan, 'c', -1)
  plan = insertRow(plan, 'a', 'below', { label: 'New activity' })
  const edits = ganttSheet.fromPlan(plan, GEV, base)
  const d = ganttSheet.fromSheet(buildSheet(base, edits), GR, GEV)
  assert.deepEqual(d.rows.map(r => r.key), ['a', 'row-1', 'c', 'b'])
  assert.equal(d.rows[0].items[0].end, '2025-04-30')
  assert.equal(d.rows[0].items[0].done, 0.6)
  assert.deepEqual(d.rows[3].items[1], GR[1].items[1])
  // Subsequent typing is added to the same overlay.
  const e2 = { ...edits, cells: { ...edits.cells, 'b~y|end': '2025-05-30' } }
  const d2 = ganttSheet.fromSheet(buildSheet(base, e2), GR, GEV)
  assert.equal(d2.rows.find(r => r.key === 'b').items[0].end, '2025-05-30')
  assert.equal(d2.rows[0].items[0].end, '2025-04-30')
})

test('hiding a sheet row or column removes it from the chart (it stays in the sheet)', async () => {
  const { toggleHidden } = await import('./sheetModel.js')
  const slices = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 1 }]
  const sh = buildSheet(pieSheet.toBase(slices), toggleHidden(emptyEdits(), ['b']))
  assert.equal(sh.rows.length, 2)
  assert.deepEqual(pieSheet.fromSheet(sh, slices).map(s => s.key), ['a'])
  const series = [{ id: 's1', label: 'S1' }]
  const cols = [{ key: 'c1', label: 'C1', values: { s1: 5 } }, { key: 'c2', label: 'C2', values: { s1: 5 } }]
  const d = mekkoSheet.fromSheet(buildSheet(mekkoSheet.toBase(cols, series), toggleHidden(emptyEdits(), [], ['c2'])), cols, series)
  assert.deepEqual(d.columns.map(c => c.key), ['c1'])
})

test('out-of-domain values: flagged as errors, ignored by the chart (never silently accepted)', async () => {
  const { applyValidation } = await import('./useSheet.js')
  const slices = [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 1 }]
  const sh = applyValidation(buildSheet(pieSheet.toBase(slices), edit({ 'b|value': '-5' })), pieSheet.validate)
  assert.match(sh.rows[1].cells[0].error, /negative/)
  assert.deepEqual(pieSheet.fromSheet(sh, slices).map(s => s.key), ['a'])
  const columns = [{ key: 'h', label: 'Progress', type: 'harvey' }, { key: 'c', label: 'Report', type: 'check' }]
  const rows = [{ key: 'r', label: 'R', cells: { h: 0.5, c: 'yes' } }]
  const tsh = applyValidation(buildSheet(tableSheet.toBase(columns, rows), edit({ 'r|h': '7', 'r|c': 'maybe' })), s => tableSheet.validate(s, columns))
  assert.ok(tsh.rows[0].cells.every(c => c.error))
})

test('Mekko in %: segments typed in %, the "100%=" row = column total (and width)', () => {
  const series = [{ id: 's1', label: 'S1' }, { id: 's2', label: 'S2' }]
  const cols = [{ key: 'c1', label: 'C1', values: { s1: 30, s2: 10 } }, { key: 'c2', label: 'C2', values: { s1: 20, s2: 20 } }]
  const base = mekkoSheet.toBase(cols, series, { mode: 'percent' })
  const s0 = buildSheet(base)
  assert.deepEqual(s0.rows.map(r => r.name), ['S2 (%)', 'S1 (%)', '100%='])
  assert.equal(s0.rows[1].cells[0].value, 75)
  const d = mekkoSheet.fromSheet(buildSheet(base, edit({ '__total|c1': '80' })), cols, series)
  assert.equal(d.columns[0].values.s1, 60)
  const sc = buildMekkoScene({ series: d.series }, d.columns, { width: 500, height: 300 })
  assert.ok(sc.columns[0].width > sc.columns[1].width)
})

// ── Waterfall: full datasheet ──
const WF = { unit: 'M', steps: [{ key: 'a', label: 'Start', kind: 'anchor', value: 100, tone: 'anchor' }, { key: 'd1', label: 'Up', kind: 'delta', value: 10, tone: 'positive' }, { key: 'd2', label: 'More', kind: 'delta', value: 5, tone: 'positive' }, { key: 't', label: 'End', kind: 'total', value: 115, tone: 'anchor' }] }

test('stacked waterfall: an added segment column stacks the step; "e" closes a stacked total, one "e" per step', async () => {
  const { applyValidation } = await import('./useSheet.js')
  const base = bridgeSheet.toBase(WF)
  const edits = edit({ 'd1|col1': '-4', 't|value': '60', 't|col1': 'e' }, { addedCols: [{ key: 'col1', after: 'value' }], colNames: { col1: 'M&A' } })
  const b = bridgeSheet.fromSheet(applyValidation(buildSheet(base, edits), bridgeSheet.validate), WF)
  const d1 = b.steps.find(s => s.key === 'd1')
  assert.equal(d1.value, 6)
  assert.deepEqual(d1.parts.map(p => [p.key, p.label, p.value]), [['value', 'Value', 10], ['col1', 'M&A', -4]])
  const t = b.steps.find(s => s.key === 't')
  assert.equal(t.kind, 'total')
  assert.equal(t.value, 111)
  assert.deepEqual(t.parts.map(p => p.value), [60, 51])
  const sc = buildWaterfallScene({}, b, { width: 600, height: 280 })
  assert.equal(sc.bars.filter(x => x.key === 'd1').length, 2)
  assert.equal(sc.bars.filter(x => x.key === 't').length, 2)
  assert.equal(sc.bars.find(x => x.key === 'd1' && x.part === 'col1').color, 'red')
  // Two "e" on the same step: the second is an error, ignored by the chart.
  const two = applyValidation(buildSheet(base, edit({ 't|col1': 'e' }, { addedCols: [{ key: 'col1', after: 'value' }] })), bridgeSheet.validate)
  assert.ok(two.rows.find(r => r.id === 't').cells[1].error)
  assert.equal(bridgeSheet.fromSheet(two, WF).steps.find(s => s.key === 't').parts, undefined)
  // Source segments (step.parts) arrive in the sheet as columns, and round-trip unchanged.
  const P = { unit: 'M', steps: [WF.steps[0], { key: 'g', label: 'Growth', kind: 'delta', value: 12, parts: [{ key: 'org', label: 'Organic', value: 8 }, { key: 'ma', label: 'M&A', value: 4 }] }, { key: 't', label: 'End', kind: 'total', value: 112 }] }
  const pb = bridgeSheet.toBase(P)
  assert.deepEqual(pb.cols.map(c => c.name), ['Organic', 'M&A'])
  const pg = bridgeSheet.fromSheet(buildSheet(pb, edit({ 'g|p:ma': '9' })), P).steps.find(s => s.key === 'g')
  assert.deepEqual(pg.parts.map(p => [p.key, p.value]), [['org', 8], ['ma', 9]])
  assert.equal(pg.value, 17)
})

test('"e" on the first step: the start is back-calculated from the end (scene backCalc)', () => {
  const base = bridgeSheet.toBase(WF)
  const b = bridgeSheet.fromSheet(buildSheet(base, edit({ 'a|value': 'e', 't|value': '200' })), WF)
  assert.equal(b.backCalc, true)
  assert.deepEqual(b.steps.map(s => [s.key, s.kind, s.value]), [['a', 'anchor', 185], ['d1', 'delta', 10], ['d2', 'delta', 5], ['t', 'anchor', 200]])
  const sc = buildWaterfallScene({ backCalc: true }, b, { width: 500, height: 260 })
  assert.ok(/185/.test(sc.columns.find(c => c.key === 'a').text))
  // End left as "e": it keeps its source value, the start is derived from it.
  const b2 = bridgeSheet.fromSheet(buildSheet(base, edit({ 'a|value': 'e', 'd1|value': '20' })), WF)
  assert.equal(b2.steps[0].value, 90)
  assert.equal(b2.steps.at(-1).value, 115)
  // The "Compute the start from the end" setting shows "e" at the top of the sheet.
  assert.equal(buildSheet(bridgeSheet.toBase(WF, { backCalc: true })).rows[0].cells[0].raw, 'e')
})

test('downward waterfall: a typed positive step is subtracted, the "e" total and the color follow', () => {
  const D = { unit: 'M', steps: [{ key: 'rev', label: 'Revenue', kind: 'anchor', value: 100, tone: 'anchor' }, { key: 'cogs', label: 'COGS', kind: 'delta', value: 40, tone: 'negative' }, { key: 'eb', label: 'EBITDA', kind: 'total', value: 60, tone: 'anchor' }] }
  const base = bridgeSheet.toBase(D)
  const b = bridgeSheet.fromSheet(buildSheet(base, edit({ 'row1|value': '30', 'cogs|value': '50' }, { addedRows: [{ id: 'row1', after: 'cogs' }], rowNames: { row1: 'Opex' } })), D, { direction: 'down' })
  assert.deepEqual(b.steps.map(s => [s.key, s.value, s.tone]), [['rev', 100, 'anchor'], ['cogs', 50, 'negative'], ['row1', 30, 'negative'], ['eb', 20, 'anchor']])
  const sc = buildWaterfallScene({ direction: 'down' }, b, { width: 500, height: 260 })
  const bar = k => sc.bars.find(x => x.key === k)
  // Steps go down: the bottom of "Opex" is at the EBITDA level.
  assert.ok(Math.abs(bar('row1').y + bar('row1').height - bar('eb').y) < 1)
  assert.ok(/20/.test(sc.columns.find(c => c.key === 'eb').text))
})

test('difference arrow: the % refers to the chosen "100%" base (level or label base)', () => {
  const B = { unit: 'M', steps: [{ key: 'a', label: 'Start', kind: 'anchor', value: 100 }, { key: 'd', label: 'Up', kind: 'delta', value: 20 }, { key: 'm', label: 'Mid', kind: 'total', value: 120 }, { key: 'd2', label: 'More', kind: 'delta', value: 30 }, { key: 't', label: 'End', kind: 'total', value: 150 }] }
  const arrow = spec => buildWaterfallScene({ annotations: [{ type: 'diff', from: 'm', to: 't' }], ...spec }, B, { width: 600, height: 280 }).annotations[0].text
  assert.match(arrow({}), /\+25%/)
  assert.match(arrow({ diffBase: 'start' }), /\+30%/)
  assert.match(arrow({ diffBase: 't' }), /\+20%/)
  assert.match(arrow({ diffBase: 'pctBase', pctBase: 't', labelContent: 'pct' }), /\+20%/)
})

test('Gantt: the sheet follows the chart order, with renamable group bands and key dates at the bottom', () => {
  const rows = [
    { key: 'p', label: 'Pricing', group: 'Phase 2', items: [{ key: 'p1', start: '2025-02-03', end: '2025-04-30' }] },
    { key: 'i', label: 'IT', group: 'Phase 1', level: 1, items: [{ key: 'i1', start: '2025-01-06', end: '2025-03-28' }] },
    { key: 'e', label: 'Launch', group: 'Phase 2', items: [] },
  ]
  const opts = { groups: true }
  const base = ganttSheet.toBase(rows, GEV, opts)
  const sheet0 = buildSheet(base)
  assert.deepEqual(base.rows.map(r => r.id), ['__grp~Phase 2', 'p~p1', 'e~', '__grp~Phase 1', 'i~i1', '__ev~bd'])
  assert.deepEqual(ganttSheet.rowInfo(sheet0).map(i => [i.kind, i.level]), [['group', 0], ['task', 0], ['task', 0], ['group', 0], ['task', 1], ['event', 0]])
  assert.equal(base.cols.find(c => c.key === 'level').name, 'Indent')
  // Chart order = sheet order.
  const sc = buildGanttScene({ groups: true, events: GEV }, rows, { width: 800 })
  assert.deepEqual(sc.rows.map(r => r.label), base.rows.map(r => r.name).slice(0, 5).concat('Key dates'))
  // Renaming a band renames its activities' group; the row without a task gets a bar.
  const d = ganttSheet.fromSheet(buildSheet(base, edit({ 'e~|start': '2025-06-02', 'e~|end': '2025-06-30' }, { rowNames: { '__grp~Phase 2': 'Run' } })), rows, GEV, opts)
  assert.deepEqual(d.rows.map(r => [r.key, r.group]), [['p', 'Run'], ['e', 'Run'], ['i', 'Phase 1']])
  assert.equal(d.rows[1].items.length, 1)
  assert.deepEqual(ganttSheet.fromSheet(sheet0, rows, GEV, opts).rows, rows)
})

test('Gantt: "↳" attaches a task to the activity above; status on the displayed scale', () => {
  const { d } = gantt(edit({ 'row1|start': '2025-06-02', 'row1|end': '2025-06-30' }, { addedRows: [{ id: 'row1', after: 'a~x' }], rowNames: { row1: '↳ Migration' } }))
  assert.equal(d.rows.length, 3)
  assert.deepEqual(d.rows[0].items.map(i => i.key), ['x', 'row1'])
  // Harvey: quarters 0-4.
  const base = ganttSheet.toBase(GR, GEV)
  assert.equal(buildSheet(base).rows.find(r => r.id === 'a~x').cells[base.cols.findIndex(c => c.key === 'status')].value, 2)
  const h = ganttSheet.fromSheet(buildSheet(base, edit({ 'a~x|status': '3' })), GR, GEV)
  assert.equal(h.rows[0].status, 0.75)
  // Checkbox: yes / no.
  const cb = { status: 'checkbox' }
  const bc = ganttSheet.toBase(GR, GEV, cb)
  assert.equal(buildSheet(bc).rows.find(r => r.id === 'a~x').cells[bc.cols.findIndex(c => c.key === 'status')].value, null)
  const c = ganttSheet.fromSheet(buildSheet(bc, edit({ 'a~x|status': 'yes', 'c~z|status': 'no' })), GR, GEV, cb)
  assert.equal(c.rows[0].status, true)
  assert.equal(c.rows[2].status, false)
})

test('scatter: dates typed in X give points placed in time', () => {
  const pts = [{ key: 'p', label: 'P', x: 1, y: 1 }, { key: 'q', label: 'Q', x: 2, y: 2 }, { key: 'r', label: 'R', x: 3, y: 3 }]
  const base = scatterSheet.toBase(pts)
  const d = scatterSheet.fromSheet(buildSheet(base, edit({ 'p|x': '2025-01-01', 'q|x': '2025-01-11', 'r|x': '2025-03-01' })), pts)
  assert.equal(d[1].x - d[0].x, 10)
  assert.ok(d[2].x - d[1].x > 40)
})

test('Gantt: the After column shows and edits dependencies (name or key, lag)', () => {
  const rows = [
    { key: 'd', label: 'Negotiation', items: [{ key: 'dd', start: '2025-03-03', end: '2025-05-30', label: 'Terms' }, { key: 'sg', after: 'dd', kind: 'milestone', label: 'Signing' }] },
    { key: 'c', label: 'Contract', items: [{ key: 'cl', start: '2025-08-01', end: '2025-08-29' }] },
  ]
  const base = ganttSheet.toBase(rows, [])
  const ai = base.cols.findIndex(c => c.key === 'after')
  const sheet0 = buildSheet(base)
  assert.equal(sheet0.rows.find(r => r.id === 'd~sg').cells[ai].value, 'Terms')
  // The Terms → Signing arrow is in the sheet, and on the chart.
  assert.equal(buildGanttScene({}, rows, { width: 800 }).links.length, 1)
  // Contract follows "Negotiation" (the activity name) with a 10-day lag: its start date moves.
  const d = ganttSheet.fromSheet(buildSheet(base, edit({ 'c~cl|after': 'Negotiation +10' })), rows, [])
  const cl = d.rows[1].items[0]
  assert.equal(cl.after, 'dd')
  assert.equal(cl.lag, 10)
  assert.equal(cl.start, undefined)
  const sc = buildGanttScene({}, d.rows, { width: 800 })
  assert.equal(sc.links.length, 2)
  assert.equal(sc.bars.find(b => b.itemKey === 'cl').start, '2025-06-10')
  // Round trip: the sheet reads back what it shows.
  assert.equal(buildSheet(ganttSheet.toBase(d.rows, [])).rows.find(r => r.id === 'c~cl').cells[ai].value, 'Terms +10')
  // After cleared: no more link.
  const d2 = ganttSheet.fromSheet(buildSheet(base, edit({ 'd~sg|after': '' })), rows, [])
  assert.equal(d2.rows[0].items[1].after, undefined)
})

test('waterfall that no longer closes: the end anchor is flagged (warning, the value stays)', async () => {
  const { applyValidation } = await import('./useSheet.js')
  const bridge = { unit: 'M', steps: [{ key: 'a', label: 'Start', kind: 'anchor', value: 100 }, { key: 'd', label: 'Up', kind: 'delta', value: 17 }, { key: 'z', label: 'Current', kind: 'anchor', value: 117 }] }
  const base = bridgeSheet.toBase(bridge)
  const ok = applyValidation(buildSheet(base), sh => bridgeSheet.closing(sh, bridge))
  assert.ok(!ok.rows.at(-1).cells[0].warning)
  const sh = applyValidation(buildSheet(base, edit({ 'd|value': '25' })), s => bridgeSheet.closing(s, bridge))
  assert.match(sh.rows.at(-1).cells[0].warning, /does not close.*125/)
  assert.equal(sh.rows.at(-1).cells[0].value, 117)
})

test('table: Harvey balls on the table scale (0-4) and empty checkboxes accepted, no error on the source', async () => {
  const { applyValidation } = await import('./useSheet.js')
  const columns = [{ key: 'h', label: 'Progress', type: 'harvey' }, { key: 'c', label: 'Report', type: 'check' }]
  const rows = [{ key: 'a', label: 'A', cells: { h: 3, c: 'empty' } }, { key: 'b', label: 'B', cells: { h: 4, c: 'yes' } }]
  const sh = applyValidation(buildSheet(tableSheet.toBase(columns, rows)), s => tableSheet.validate(s, columns, { harveyMax: { h: 4 } }))
  assert.ok(sh.rows.every(r => r.cells.every(c => !c.error)))
  const bad = applyValidation(buildSheet(tableSheet.toBase(columns, rows), edit({ 'a|h': '7' })), s => tableSheet.validate(s, columns, { harveyMax: { h: 4 } }))
  assert.match(bad.rows[0].cells[0].error, /0 to 4/)
})
