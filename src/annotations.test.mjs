// Multiple annotations, patterns, per-series interpolation, "Other", table columns, profile.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, buildProfileScene } from './scene.js'
import { resolveCollisions } from './labelLayout.js'
import { validateSpec } from './spec.js'

const pts = pairs => pairs.map(([x, y, type = 'actual']) => ({ x, y, type }))
const res = (label, pairs, extra = {}) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pts(pairs), ...extra })
const spec = (series, extra = {}) => ({
  id: 't', version: 1, kind: 'cartesian', scope: 'shared',
  x: { grain: 'year', range: 'all' }, series, ...extra,
})
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'ebitda', source: 'actual' }, mark, ...extra })
const OPTS = { width: 640, height: 300 }
const YEARS = [['2021', 10], ['2022', 12], ['2023', 14.4], ['2024', 17.28]]

test('patterns: a hatched series, a single segment, forecasts hatched in the series color', () => {
  const r = [res('A', [['2023', 10], ['2024', 12], ['2025', 14, 'forecast']])]
  const sc = buildScene(spec([S('a', 'bar')], { format: { patterns: { a: 'cross' }, patternPoints: { 'a|2023': 'dots' } } }), r, OPTS)
  assert.equal(sc.bars.find(b => b.key === '2023').pattern, 'dots')
  assert.equal(sc.bars.find(b => b.key === '2024').pattern, 'cross')
  const h = buildScene(spec([S('a', 'bar')], { format: { forecastHatch: true } }), r, OPTS)
  const f = h.bars.find(b => b.key === '2025')
  assert.equal(f.pattern, 'hatch')
  assert.equal(f.color, 'chart-actual', 'the series color (the actual role token), not the forecast gray')
  assert.equal(h.bars.find(b => b.key === '2024').pattern, null)
  // The "hatch" series style (set by code) is accepted by the spec.
  assert.deepEqual(validateSpec(spec([S('a', 'bar', { style: { forecast: 'hatch' } })])), [])
  assert.equal(buildScene(spec([S('a', 'bar', { style: { forecast: 'hatch' } })]), r, OPTS).bars.find(b => b.key === '2025').pattern, 'hatch')
})

test('difference arrows: several at once, one overlapping another moves up', () => {
  const sc = buildScene(spec([S('a', 'bar')], { format: { diffs: [{ from: { key: '2021' }, to: { key: '2024' } }, { from: { key: '2022' }, to: { key: '2023' } }] } }), [res('A', YEARS)], OPTS)
  const d = sc.annotations.filter(a => a.type === 'diff')
  assert.equal(d.length, 2)
  const wide = d.find(a => a.fromKey === '2021'), narrow = d.find(a => a.fromKey === '2022')
  assert.equal(wide.fi, 0)
  assert.ok(wide.yTop <= narrow.yTop - 20, 'the widest goes above')
  assert.equal(narrow.text, '+2.4')
})

test('level difference arrow: between two points of two series, beside the elements', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'line')]), [res('A', YEARS), res('B', [['2021', 8], ['2024', 20]])], {
    ...OPTS,
  })
  const withLevel = buildScene(spec([S('a', 'bar'), S('b', 'line')], { format: { diffs: [{ from: { key: '2024', series: 'a' }, to: { key: '2024', series: 'b' }, level: true }] } }),
    [res('A', YEARS), res('B', [['2021', 8], ['2024', 20]])], OPTS)
  const d = withLevel.annotations.find(a => a.type === 'diff')
  assert.equal(d.style, 'level')
  assert.equal(d.text, '+2.7')
  const bar = withLevel.bars.find(b => b.key === '2024')
  assert.ok(d.xr > bar.x + bar.width, 'the arrow is to the right of the bar')
  assert.ok(Math.abs(d.ya - bar.y) < 0.01)
  assert.ok(sc.annotations.every(a => a.type !== 'diff'))
})

test('CAGR: successive pairs, no limit on count', () => {
  const ann = [['2021', '2022'], ['2022', '2023'], ['2023', '2024'], ['2021', '2024']].map(([f, t]) => ({ type: 'cagr', from: { key: f }, to: { key: t } }))
  const sc = buildScene(spec([S('a', 'bar')], { annotations: ann }), [res('A', YEARS)], OPTS)
  const c = sc.annotations.filter(a => a.type === 'cagr')
  assert.equal(c.length, 4)
  assert.deepEqual(c.slice(0, 3).map(a => a.text), ['CAGR +20.0%', 'CAGR +20.0%', 'CAGR +20.0%'])
  const all = c.find(a => a.fromKey === '2021' && a.toKey === '2024')
  assert.ok(c.filter(a => a !== all).every(a => all.my <= a.my - 19), 'the overall CAGR above the pairs')
})

test('value lines: several, each with its label and rank', () => {
  const sc = buildScene(spec([S('a', 'bar')], { format: { valueLines: [{ value: 12, label: 'Budget' }, { value: 15, label: 'Target', side: 'left' }] } }), [res('A', YEARS)], OPTS)
  const v = sc.annotations.filter(a => a.type === 'valueLine')
  assert.equal(v.length, 2)
  assert.deepEqual(v.map(a => a.fi), [0, 1])
  assert.equal(v[1].anchor, 'start')
  assert.ok(v[1].y < v[0].y)
  assert.match(v[0].text, /^Budget /)
})

test('per-series interpolation: "zero" for one, "break" for the other', () => {
  const holes = [['2021', 10], ['2023', 14]]
  const sc = buildScene(spec([S('a', 'line'), S('b', 'line')], { format: { gapsBy: { a: 'zero', b: 'break' } } }), [res('A', [...holes, ['2024', 15]]), res('B', [...holes, ['2024', 16]])], OPTS)
  const a = sc.lines.find(l => l.seriesId === 'a'), b = sc.lines.find(l => l.seriesId === 'b')
  assert.equal(a.points.find(p => p.key === '2022').value, 0)
  assert.equal(b.points.some(p => p.key === '2022'), false)
  assert.equal((b.d.match(/M/g) ?? []).length, 2, 'line B is split in two')
  assert.ok(sc.axes.left.domain[0] <= 0, 'zero is included in the scale')
})

test('"Other" series: small segments of a 100% column are grouped', () => {
  const r = [res('A', [['2023', 80], ['2024', 50]]), res('B', [['2023', 15], ['2024', 30]]), res('C', [['2023', 3], ['2024', 10]]), res('D', [['2023', 2], ['2024', 10]])]
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar'), S('c', 'bar'), S('d', 'bar')], { bars: 'stacked100', format: { otherBelow: 5 } }), r, OPTS)
  const o = sc.bars.filter(b => b.seriesId === '_other')
  assert.equal(o.length, 1)
  assert.equal(o[0].key, '2023')
  assert.equal(o[0].value, 5)
  assert.ok(!sc.bars.some(b => b.key === '2023' && (b.seriesId === 'c' || b.seriesId === 'd')))
  assert.equal(sc.bars.filter(b => b.key === '2024').length, 4, '2024: no segment under 5%')
  assert.ok(sc.legend.some(l => l.seriesId === '_other' && l.label === 'Other'))
})

test('table column: the category leaves the plot, its numbers read on the right', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked', format: { tableCols: ['2024'] } }), [res('A', YEARS), res('B', [['2021', 1], ['2024', 40]])], OPTS)
  assert.ok(!sc.bars.some(b => b.key === '2024'))
  assert.equal(sc.tableCols.length, 1)
  const t = sc.tableCols[0]
  assert.equal(t.header, '2024')
  assert.deepEqual(t.items.map(i => i.text).sort(), ['17.3', '40.0'].sort())
  assert.ok(t.x0 >= sc.plot.right)
  assert.ok(sc.axes.left.domain[1] < 40, 'the scale no longer counts the moved-out column')
})

test('category gap in column multiples, axis break without a gap', () => {
  const base = buildScene(spec([S('a', 'bar')]), [res('A', YEARS)], OPTS)
  const two = buildScene(spec([S('a', 'bar')], { format: { catGaps: ['2023'], catGapSize: { 2023: 2 } } }), [res('A', YEARS)], OPTS)
  assert.equal(two.columns.length, base.columns.length + 2)
  assert.equal(two.axes.x.gaps.length, 1)
  const brk = buildScene(spec([S('a', 'bar')], { format: { catBreaks: ['2023'] } }), [res('A', YEARS)], OPTS)
  assert.equal(brk.columns.length, base.columns.length)
  const [gx] = brk.axes.x.gaps
  assert.ok(gx > brk.columns.find(c => c.key === '2022').cx && gx < brk.columns.find(c => c.key === '2023').cx)
})

test('manual scale: the automatic one stays known (snap back while dragging)', () => {
  const sc = buildScene(spec([S('a', 'bar')], { format: { yAxis: { left: { max: 40 } } } }), [res('A', YEARS)], OPTS)
  assert.equal(sc.axes.left.domain[1], 40)
  assert.ok(sc.axes.left.autoDomain[1] < 40 && sc.axes.left.autoDomain[1] >= 17.28)
  assert.ok(sc.axes.left.autoStep > 0)
})

test('profile chart: categories run downward, values read along the horizontal axis', () => {
  const sc = buildProfileScene({ ...spec([S('a', 'line', { labels: 'all' }), S('b', 'line')]), x: { grain: 'category' } },
    [res('A', [['Price', 3], ['Quality', 5], ['Service', 4]]), res('B', [['Price', 4], ['Quality', 2], ['Service', 5]])], OPTS)
  assert.equal(sc.profile, true)
  assert.deepEqual(sc.axes.cat.map(c => c.key), ['Price', 'Quality', 'Service'])
  const a = sc.lines.find(l => l.seriesId === 'a')
  assert.ok(a.points[0].y < a.points[1].y && a.points[1].y < a.points[2].y)
  assert.ok(a.points[1].x > a.points[0].x, 'the highest value is rightmost')
  assert.equal(sc.labels.length, 3)
  assert.ok(sc.gridlines.length >= 2)
})

test('crowded mandatory labels: shifted left and right before moving up', () => {
  const m = (t, s) => String(t).length * s * 0.58
  const a = { key: 'a', x: 100, y: 50, size: 10, text: '12.3', anchor: 'middle', shiftable: true }
  const b = { key: 'b', x: 104, y: 50, size: 10, text: '12.4', anchor: 'middle', shiftable: true }
  const out = resolveCollisions([a, b], m)
  assert.equal(out.length, 2)
  assert.equal(out[1].y, 50, 'same row')
  assert.notEqual(out[1].anchor, 'middle')
})

test('stacking: the CAGR passes above the arrows it spans, line labels avoid the pills', () => {
  const rev = [['2020', 112], ['2021', 124], ['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]]
  const ebitda = [['2020', 18], ['2021', 21], ['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]]
  const plan = [['2020', 110], ['2021', 125], ['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]]
  const sc = buildScene(spec([S('r', 'bar'), S('e', 'bar'), S('p', 'line')], {
    annotations: [{ type: 'cagr', from: { key: '2020' }, to: { key: '2025' } }],
    format: {
      diffs: [{ from: { key: '2021' }, to: { key: '2022' } }, { from: { key: '2023' }, to: { key: '2024' } }, { from: { key: '2024', series: 'r' }, to: { key: '2025', series: 'r' }, level: true }],
      valueLines: [{ value: 173 }, { value: 140 }],
    },
  }), [res('Revenue', rev), res('EBITDA', ebitda), res('Plan', plan, { role: 'plan' })], { width: 760, height: 320 })
  const c = sc.annotations.find(a => a.type === 'cagr')
  const arcY = x => { const t = (x - c.xa) / (c.xb - c.xa); return (1 - t) ** 2 * c.ya + 2 * t * (1 - t) * c.ctrlY + t ** 2 * c.yb }
  const pills = sc.annotations.filter(a => a.pillW).map(a => { const x = a.mx ?? a.px, y = a.my ?? a.py; return { a, x0: x - a.pillW / 2, x1: x + a.pillW / 2, y0: y - 9, y1: y + 9 } })
  for (const d of sc.annotations.filter(a => a.type === 'diff' && a.style === 'bridge')) {
    for (const x of [Math.min(d.xa, d.xb), (d.xa + d.xb) / 2, Math.max(d.xa, d.xb)]) {
      assert.ok(arcY(x) <= d.yTop - 10, `the arc passes above the bracket ${d.fromKey}→${d.toKey} (${arcY(x).toFixed(1)} vs ${d.yTop})`)
    }
  }
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) assert.ok(!hit(pills[i], pills[j]), 'no two pills touch')
  for (const v of sc.annotations.filter(a => a.type === 'valueLine')) {
    const w = v.text.length * 10 * 0.58
    const x0 = v.anchor === 'end' ? v.tx - w : v.tx
    const box = { x0, x1: x0 + w, y0: v.ty - 10, y1: v.ty + 2 }
    for (const p of pills) assert.ok(!hit(box, p), `the label "${v.text}" touches no pill`)
  }
})

test('error bars: on a stack, several pairs, selectable caps', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked', format: { errorBars: { b: { pct: 10, capHi: 'arrow', capLo: 'none', more: [{ pct: 20, color: 'gray-400' }] } } } }),
    [res('A', [['2023', 10], ['2024', 20]]), res('B', [['2023', 10], ['2024', 10]])], OPTS)
  const eb = sc.annotations.filter(a => a.type === 'errorBar')
  assert.equal(eb.length, 4, 'two pairs × two columns')
  const p0 = eb.find(a => a.key === '2024' && a.pair === 0)
  assert.equal(p0.top, 30, 'starts at the top of the stack')
  assert.equal(p0.capHi, 'arrow')
  assert.equal(p0.capLo, 'none')
  const p1 = eb.find(a => a.key === '2024' && a.pair === 1)
  assert.ok(Math.abs(p1.y2 - p1.y1) > Math.abs(p0.y2 - p0.y1), 'the 2nd pair (20%) is longer')
  assert.equal(p1.color, 'gray-400')
})

test('net lines: two equal adjacent dashes join, connectors between the others; labels at -90°', () => {
  const sc = buildScene(spec([S('a', 'line', { style: { step: 'lines' }, labels: 'all' })], { format: { netConnectors: true, labels: { rotate: -90 } } }), [res('A', [['2021', 10], ['2022', 10], ['2023', 14]])], OPTS)
  const l = sc.lines[0]
  assert.equal((l.d.match(/M/g) ?? []).length, 2, '2021 and 2022 form a single stroke')
  assert.equal((l.dConn.match(/M/g) ?? []).length, 1)
  assert.ok(sc.labels.every(x => x.rotate === -90))
})

test('level arrows: two on the same pair stack, their pills do not overlap', () => {
  const lv = { from: { key: '2023', series: 'a' }, to: { key: '2024', series: 'a' }, level: true }
  const sc = buildScene(spec([S('a', 'bar')], { format: { diffs: [lv, { ...lv, from: { key: '2022', series: 'a' } }] } }), [res('A', YEARS)], OPTS)
  const [p, q] = sc.annotations.filter(a => a.type === 'diff')
  const hit = Math.abs(p.px - q.px) < (p.pillW + q.pillW) / 2 && Math.abs(p.py - q.py) < 18
  assert.ok(!hit, `${p.px},${p.py} / ${q.px},${q.py}`)
  assert.notEqual(p.xr, q.xr)
})

test('sheet font: bold, italic, color, alignment, border carried to the labels', async () => {
  const { emptyEdits, setFont, buildSheet } = await import('./sheetModel.js')
  const e = setFont(emptyEdits(), [['a', '2024']], { bold: true, italic: true, color: 'red', align: 'right', border: true })
  const sh = buildSheet({ rows: [{ id: 'a', name: 'A', points: { 2024: { x: '2024', y: 5 } } }], cols: [{ key: '2024', name: '2024' }] }, e)
  assert.deepEqual(sh.rows[0].cells[0].font, { bold: true, italic: true, color: 'red', align: 'right', border: true })
  assert.equal(setFont(e, [['a', '2024']], { bold: false, italic: null, color: null, align: null, border: false }).fonts['a|2024'], undefined, 'all removed: no formatting left')
  const r = [{ label: 'A', unit: 'M', role: 'actual', points: [{ x: '2023', y: 4, type: 'actual' }, { x: '2024', y: 5, type: 'actual', font: { bold: true, italic: true, color: 'red', align: 'right', border: true } }] }]
  const on = buildScene(spec([S('a', 'bar', { labels: 'all' })], { format: { sheetFont: true } }), r, OPTS)
  const off = buildScene(spec([S('a', 'bar', { labels: 'all' })]), r, OPTS)
  const l = on.labels.find(x => x.key === 'a|2024'), l0 = off.labels.find(x => x.key === 'a|2024')
  assert.equal(l.weight, 700)
  assert.equal(l.italic, true)
  assert.equal(l.color, 'red')
  assert.equal(l.border, true)
  assert.ok(l.x > l0.x, 'right-aligned: shifted right of its point')
  assert.ok(!off.labels.find(x => x.key === 'a|2024').italic)
})

test('rotated combo, Mekko net lines, data table for the whole chart', async () => {
  const { buildBarhScene } = await import('./barhScene.js')
  const h = buildBarhScene({ series: [{ id: 'a', label: 'A', color: 'cat-1' }, { id: 'p', label: 'Plan', color: 'gold', mark: 'line' }] },
    [{ key: 'x', label: 'X', values: { a: 10, p: 30 } }, { key: 'y', label: 'Y', values: { a: 12, p: 8 } }], { width: 500 })
  assert.ok(h.bars.every(b => b.seriesId === 'a'), 'the line draws no bar')
  assert.equal(h.profiles.length, 1)
  assert.ok(h.profiles[0].points[0].x > h.bars[0].x + h.bars[0].width, '30 reads further than 10: the scale counts the line')
  assert.ok(h.legend.some(l => l.key === 'p' && l.line))
  const { buildMekkoScene } = await import('./mekkoScene.js')
  const m = buildMekkoScene({ series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'n', label: 'Target' }], netLines: ['n'] },
    [{ key: 'c1', label: 'C1', values: { a: 60, b: 40, n: 50 } }], { width: 500, height: 300 })
  assert.ok(!m.segments.some(sg => sg.seriesId === 'n'))
  const [nl] = m.netLines
  assert.ok(Math.abs(nl.y - (m.plot.bottom - m.plot.height * 0.5)) < 1, 'at 50% of the column')
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'line'), S('c', 'line')], { format: { tableAll: true } }), [res('A', YEARS), res('B', YEARS), res('C', YEARS)], OPTS)
  assert.deepEqual(sc.axes.x.tableHeads.map(t => t.seriesId), ['b', 'c'])
  assert.equal(sc.lines.length, 0)
})

test('arrow to a value line, pill beside a short arrow, CAGR color, single-segment connector', () => {
  const sc = buildScene(spec([S('a', 'bar')], {
    annotations: [{ type: 'cagr', from: { key: '2021' }, to: { key: '2024' } }],
    format: {
      valueLines: [{ value: 20, label: 'Target' }],
      diffs: [{ from: { key: '2024', series: 'a' }, to: { key: '2024', vline: 0 }, level: true }, { from: { key: '2021' }, to: { key: '2022' } }],
      cagrTones: { '2021|2024': 'cat-3' },
      segConnectors: ['a|2022'],
    },
  }), [res('A', YEARS)], OPTS)
  const [toTarget] = sc.annotations.filter(a => a.type === 'diff' && a.style === 'level')
  assert.equal(toTarget.text, '+2.7', '20 − 17.28')
  const vl = sc.annotations.find(a => a.type === 'valueLine')
  assert.ok(Math.abs(toTarget.yb - vl.y) < 0.01, 'the arrow ends on the value line')
  const narrow = sc.annotations.find(a => a.type === 'diff' && a.style === 'bridge')
  assert.equal(narrow.beside, Math.abs(narrow.xb - narrow.xa) < narrow.pillW + 6)
  assert.equal(sc.annotations.find(a => a.type === 'cagr').tone, 'cat-3')
  const cn = sc.annotations.filter(a => a.type === 'connector')
  assert.equal(cn.length, 1)
})
