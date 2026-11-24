import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { validateSpec } from './spec.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs, extra = {}) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pts(pairs), ...extra })
const spec = (series, extra = {}) => ({
  id: 't', version: 1, kind: 'cartesian', scope: 'shared',
  x: { grain: 'year', range: 'all' }, series, ...extra,
})
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'ebitda', source: 'actual' }, mark, ...extra })
const OPTS = { width: 640, height: 300 }
const YEARS = [['2021', 10], ['2022', 12], ['2023', 14.4], ['2024', 17.28]]

test('labels: "last" only shows the last figure, above its bar', () => {
  const sc = buildScene(spec([S('a', 'bar', { labels: 'last' })]), [res('A', YEARS)], OPTS)
  assert.equal(sc.labels.length, 1)
  const bar = sc.bars.find(b => b.key === '2024')
  assert.ok(sc.labels[0].y < bar.y)
  assert.equal(sc.labels[0].text, '17.3')
})

test('labels: "all" on a dense series gives way, never overlaps, keeps the last one', () => {
  const many = Array.from({ length: 40 }, (_, i) => [`${2015 + Math.floor(i / 4)}-Q${(i % 4) + 1}`, 100 + i])
  const sc = buildScene({ ...spec([S('a', 'line', { labels: 'all' })]), x: { grain: 'quarter', range: 'all' } }, [res('A', many)], OPTS)
  assert.ok(sc.labels.length < 40 && sc.labels.length > 3)
  assert.ok(sc.labels.some(l => l.key.endsWith('2024-Q4')), 'the last figure stays')
  // No box overlaps another (left / right offset included).
  const box = l => { const w = l.text.length * l.size * 0.6; const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2; return { x0, x1: x0 + w, y0: l.y - l.size, y1: l.y } }
  const bs = sc.labels.map(box)
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j]
    assert.ok(!(a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1), `${sc.labels[i].key} / ${sc.labels[j].key}`)
  }
})

test('stack totals: the sum above each column', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked', annotations: [{ type: 'totals' }] }),
    [res('A', [['2023', 10], ['2024', 20]]), res('B', [['2023', 5], ['2024', 5]])], OPTS)
  const t = sc.labels.filter(l => l.key.startsWith('total|'))
  assert.deepEqual(t.map(l => l.text), ['15.0', '25.0'])
  const top24 = Math.min(...sc.bars.filter(b => b.key === '2024').map(b => b.y))
  assert.ok(t[1].y < top24)
})

test('CAGR: exact compound rate over the period, arrow above the bars', () => {
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a' }] }), [res('A', YEARS)], OPTS)
  const [c] = sc.annotations.filter(a => a.type === 'cagr')
  assert.equal(c.text, 'CAGR +20.0%')
  assert.ok(c.ya < sc.bars.find(b => b.key === '2021').y)
  assert.ok(c.yb < sc.bars.find(b => b.key === '2024').y)
  assert.ok(c.ya >= sc.plot.top && c.yb >= sc.plot.top)
})

test('quarterly CAGR: the period is counted in years (8 quarters = 2 years)', () => {
  const q = [['2022-Q4', 100], ['2023-Q4', 110], ['2024-Q4', 121]]
  const sc = buildScene({ ...spec([S('a', 'line')], { annotations: [{ type: 'cagr', series: 'a' }] }), x: { grain: 'quarter', range: 'all' } }, [res('A', q)], OPTS)
  assert.equal(sc.annotations.find(a => a.type === 'cagr').text, 'CAGR +10.0%')
})

test('impossible CAGR (negative value): no arrow, no error', () => {
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a' }] }), [res('A', [['2022', -5], ['2024', 10]])], OPTS)
  assert.equal(sc.annotations.filter(a => a.type === 'cagr').length, 0)
})

test('value line: inside the frame even beyond the data, named', () => {
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'valueLine', value: 30, label: 'Target' }] }), [res('A', YEARS)], OPTS)
  const v = sc.annotations.find(a => a.type === 'valueLine')
  assert.ok(v.y >= sc.plot.top && v.y <= sc.plot.bottom)
  assert.equal(v.text, 'Target 30.0')
})

test('spec: valid and rejected decorations', () => {
  const base = [S('a', 'bar')]
  assert.deepEqual(validateSpec(spec(base, { annotations: [{ type: 'cagr', series: 'a' }, { type: 'valueLine', value: 3 }] })), [])
  assert.ok(validateSpec(spec(base, { annotations: [{ type: 'cagr', series: 'zz' }] })).some(e => e.includes('series')))
  assert.ok(validateSpec(spec(base, { annotations: [{ type: 'valueLine', value: 'x' }] })).some(e => e.includes('value')))
  assert.ok(validateSpec(spec(base, { annotations: [{ type: 'totals' }] })).some(e => e.includes('stacked')))
})

test('CAGR: counted on actual dates, a year read on its Q1 is not twelve months', async () => {
  const { yearsBetween } = await import('./scene.js')
  assert.equal(yearsBetween({ x: '2017', period: '2017-12' }, { x: '2025', period: '2025-03' }, 'year'), 7.25)
  assert.equal(yearsBetween({ x: '2017' }, { x: '2025' }, 'year'), 8)
  const q = [{ x: '2017', y: 100, type: 'actual', period: '2017-12' }, { x: '2019', y: 121, type: 'actual', period: '2019-12' }]
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a' }] }), [{ label: 'A', unit: 'M', nature: 'flow', role: 'actual', points: q }], OPTS)
  assert.equal(sc.annotations.find(a => a.type === 'cagr').text, 'CAGR +10.0%')
})

test('monthly grain: continuous month-by-month axis, "Mar \'24" labels', async () => {
  const { formatX } = await import('./scene.js')
  const sc = buildScene({ ...spec([S('a', 'line')]), x: { grain: 'month', range: 'all' } }, [res('A', [['2024-01', 1], ['2024-04', 2]])], OPTS)
  assert.equal(sc.columns.length, 4, 'months without a figure keep their slot')
  assert.equal(formatX('2024-03', 'month'), "Mar '24")
})

test('vertical marker: placed on its period, ignored outside the axis', () => {
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'xMarker', key: '2022', label: 'Entry' }, { type: 'xMarker', key: '1999' }] }), [res('A', YEARS)], OPTS)
  const m = sc.annotations.filter(a => a.type === 'xMarker')
  assert.equal(m.length, 1)
  assert.ok(Math.abs(m[0].x - sc.columns.find(c => c.key === '2022').cx) < 0.5)
})

test('min / max: two named points, at the top and at the bottom', () => {
  const sc = buildScene(spec([S('a', 'line')], { annotations: [{ type: 'extremes', series: 'a' }] }), [res('A', YEARS)], OPTS)
  const e = sc.annotations.find(a => a.type === 'extremes')
  assert.deepEqual(e.items.map(i => i.kind), ['max', 'min'])
  assert.ok(sc.labels.some(l => l.text.startsWith('Max')) && sc.labels.some(l => l.text.startsWith('Min')))
})

test('CAGR: the forecast does not count', () => {
  const pts = [...YEARS.map(([x, y]) => ({ x, y, type: 'actual' })), { x: '2025', y: 100, type: 'forecast' }]
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a' }] }), [{ label: 'A', unit: 'M', nature: 'flow', role: 'actual', points: pts }], OPTS)
  assert.equal(sc.annotations.find(a => a.type === 'cagr').text, 'CAGR +20.0%')
})

test('legend removed and typed value line (threshold in red, label below)', () => {
  const sc = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'valueLine', value: 12, tone: 'red-text', dash: 'dot', labelSide: 'below' }] }), [res('A', YEARS)], { ...OPTS, legend: false })
  assert.equal(sc.legend.length, 0)
  const v = sc.annotations.find(a => a.type === 'valueLine')
  assert.equal(v.color, 'red-text')
  assert.ok(v.ty > v.y)
})

test('forced category axis: empty column without a label, secondary label under the year', () => {
  const sc = buildScene({ ...spec([S('a', 'bar')]), x: { grain: 'category', keys: ['2023', '2024', '_gap', 'Exit 2027'], sub: { 2024: '+12.0%' } } },
    [res('A', [['2023', 10], ['2024', 12], ['Exit 2027', 20]])], OPTS)
  assert.deepEqual(sc.axes.x.ticks.map(t => t.label), ['2023', '2024', '', 'Exit 2027'])
  assert.equal(sc.axes.x.ticks[1].sub[0].text, '+12.0%')
  assert.equal(sc.columns[2].items.length, 0, 'the empty column opens no tooltip')
})

test('explicit CAGR: from the last actual to the end, between two series, arc above what it spans', () => {
  const s2 = { ...spec([S('a', 'bar'), S('x', 'bar', { style: { color: 'black' } })], { bars: 'stacked' }),
    x: { grain: 'category', keys: ['2024', '_gap', 'Exit 2026'] },
    annotations: [{ type: 'cagr', from: { key: '2024', series: 'a' }, to: { key: 'Exit 2026', series: 'x' }, periods: 2 }] }
  assert.deepEqual(validateSpec(s2), [])
  const sc = buildScene(s2, [res('A', [['2024', 100]]), res('X', [['Exit 2026', 121]])], OPTS)
  const c = sc.annotations.find(a => a.type === 'cagr')
  assert.equal(c.text, 'CAGR +10.0%')
  assert.ok(c.ctrlY < Math.min(c.ya, c.yb), 'the arc bulges upwards')
  assert.ok(c.d.startsWith('M'))
})

test('≤ 4 curves: their name at the end of the line, no longer in the legend; bars keep theirs', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('p', 'line'), S('q', 'line')]),
    [res('Actual', YEARS), res('Plan', YEARS.map(([x, y]) => [x, y + 0.2])), res('IC', YEARS.map(([x, y]) => [x, y - 0.2]))], OPTS)
  assert.deepEqual(sc.legend.map(l => l.seriesId), ['a'])
  assert.deepEqual(sc.endLabels.map(e => e.text).sort(), ['IC', 'Plan'])
  const [e1, e2] = [...sc.endLabels].sort((p, q) => p.y - q.y)
  assert.ok(e2.y - e1.y >= 12, 'never one on top of the other')
  assert.ok(sc.endLabels.every(e => e.x > sc.plot.left + sc.plot.width * 0.8), 'at the end of the curves')
  const many = ['a', 'b', 'c', 'd', 'e'].map(id => S(id, 'line'))
  const sc5 = buildScene(spec(many), many.map(m => res(m.id, YEARS)), OPTS)
  assert.equal(sc5.endLabels.length, 0, 'beyond 4 series: the legend')
  assert.equal(sc5.legend.length, 5)
})

test('category axis: no name skipped, each shortened to its column', () => {
  const names = Array.from({ length: 14 }, (_, i) => [`Company number ${i}`, 10 + i])
  const sc = buildScene({ ...spec([S('a', 'bar')]), x: { grain: 'category' } }, [res('A', names)], { width: 520, height: 260 })
  assert.equal(sc.axes.x.ticks.length, 14)
  assert.ok(sc.axes.x.ticks.every(t => t.full.startsWith('Company')))
  assert.ok(sc.axes.x.ticks.some(t => t.label.endsWith('…')))
})

test('multi-line secondary label (events of the year), hollow forecast bars', () => {
  const s = { ...spec([S('a', 'bar', { style: { color: 'gold', forecast: 'hollow' } })]),
    x: { grain: 'year', range: 'all', sub: { 2024: ['Product A €45M', { text: 'Total €45M', tone: 'gold', strong: true }] } } }
  assert.deepEqual(validateSpec(s), [])
  const pts = [{ x: '2023', y: 10, type: 'actual' }, { x: '2024', y: 20, type: 'forecast' }]
  const sc = buildScene(s, [{ label: 'D', unit: 'M', nature: 'flow', role: 'actual', points: pts }], OPTS)
  assert.equal(sc.axes.x.ticks.find(t => t.key === '2024').sub.length, 2)
  const f = sc.bars.find(b => b.key === '2024')
  assert.ok(f.hollow && f.color === 'gold')
  assert.ok(!sc.bars.find(b => b.key === '2023').hollow)
  assert.deepEqual(validateSpec({ ...s, scope: 'user' }), [], 'neutral tokens are accepted whatever the scope')
})

test('callout: point and differences above / below; only removes the end name when asked', () => {
  const base = spec([S('a', 'line'), S('b', 'line')])
  const r = [res('Actual', YEARS), res('Plan', YEARS.map(([x, y]) => [x, y + 5]))]
  const s1 = { ...base, annotations: [{ type: 'callout', key: '2024', series: 'a', above: { text: '+8% vs IC' }, below: { text: '−5% vs BP' } }] }
  assert.deepEqual(validateSpec(s1), [])
  const sc = buildScene(s1, r, OPTS)
  const c = sc.annotations.find(a => a.type === 'callout')
  assert.ok(sc.labels.find(l => l.text === '+8% vs IC').y < c.y && sc.labels.find(l => l.text === '−5% vs BP').y > c.y)
  assert.equal(sc.endLabels.length, 2)
  const s2 = { ...s1, annotations: [{ ...s1.annotations[0], endLabel: false }] }
  assert.deepEqual(buildScene(s2, r, OPTS).endLabels.map(e => e.text), ['Plan'])
})

test('grouped-stacked: two stacks side by side per category', async () => {
  const { buildScene } = await import('./scene.js')
  const spec = { x: { grain: 'year' }, bars: 'stacked', series: [
    { id: 'a', mark: 'bar', stack: 'P' }, { id: 'b', mark: 'bar', stack: 'P' }, { id: 'c', mark: 'bar', stack: 'Q' }] }
  const res = ['a', 'b', 'c'].map(id => ({ label: id, unit: 'M', points: [{ x: '2024', y: 10 }, { x: '2025', y: 20 }] }))
  const sc = buildScene(spec, res, { width: 600, height: 300 })
  const xs = new Set(sc.bars.filter(b => b.key === '2024').map(b => Math.round(b.x)))
  assert.equal(xs.size, 2)
})
test('stacked areas: the second area starts from the top of the first', async () => {
  const { buildScene } = await import('./scene.js')
  const spec = { x: { grain: 'year' }, areaMode: 'stacked', series: [{ id: 'a', mark: 'area' }, { id: 'b', mark: 'area' }] }
  const res = ['a', 'b'].map(id => ({ label: id, unit: 'M', points: [{ x: '2024', y: 10 }, { x: '2025', y: 20 }] }))
  const sc = buildScene(spec, res, { width: 600, height: 300 })
  const la = sc.lines.find(l => l.seriesId === 'a'), lb = sc.lines.find(l => l.seriesId === 'b')
  assert.ok(lb.points[0].y < la.points[0].y)
  assert.ok(Math.abs(lb.points[0].y0 - la.points[0].y) < 1e-6)
})
test('100 % areas: the axis is in %', async () => {
  const { buildScene } = await import('./scene.js')
  const spec = { x: { grain: 'year' }, areaMode: 'stacked100', series: [{ id: 'a', mark: 'area' }, { id: 'b', mark: 'area' }] }
  const res = ['a', 'b'].map((id, i) => ({ label: id, unit: 'M', points: [{ x: '2024', y: 10 * (i + 1) }, { x: '2025', y: 20 }] }))
  const sc = buildScene(spec, res, { width: 600, height: 300 })
  assert.equal(sc.axes.left.unit, 'pct')
})

test('series labels on the chart: names to the right of the last stack, outside the legend', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { bars: 'stacked', format: { legend: 'series' } }),
    [res('A', [['2023', 10], ['2024', 20]]), res('B', [['2023', 5], ['2024', 5]])], OPTS)
  assert.equal(sc.legend.length, 0)
  assert.deepEqual(sc.endLabels.map(e => e.text).sort(), ['A', 'B'])
  const last = sc.bars.filter(b => b.key === '2024')
  for (const e of sc.endLabels) assert.ok(e.x > Math.max(...last.map(b => b.x + b.width)))
})

test('label moved by hand: the offset is applied and flagged', () => {
  const base = buildScene(spec([S('a', 'bar', { labels: 'last' })]), [res('A', YEARS)], OPTS)
  const l0 = base.labels.find(l => l.key === 'a|2024')
  const sc = buildScene(spec([S('a', 'bar', { labels: 'last' })], { format: { labels: { offsets: { 'a|2024': { dx: 10, dy: -5 } } } } }), [res('A', YEARS)], OPTS)
  const l = sc.labels.find(x => x.key === 'a|2024')
  assert.equal(l.x, l0.x + 10)
  assert.equal(l.y, l0.y - 5)
  assert.ok(l.moved)
})

const STK = [res('A', [['2023', 10.04], ['2024', 20.04]]), res('B', [['2023', 5.04], ['2024', 5.04]]), res('C', [['2023', 1.04], ['2024', 3.04]])]
const stk = (extra = {}) => spec([S('a', 'bar', { labels: 'all' }), S('b', 'bar', { labels: 'all' }), S('c', 'bar', { labels: 'all' })], { bars: 'stacked', ...extra })

test('segments sorted per column: the largest at the bottom of each stack', () => {
  const sc = buildScene(stk({ format: { stackOrder: 'descCat' } }), [res('A', [['2023', 1], ['2024', 9]]), res('B', [['2023', 9], ['2024', 1]]), res('C', [['2023', 5], ['2024', 5]])], OPTS)
  const bottom = k => sc.bars.filter(b => b.key === k).sort((p, q) => q.y - p.y)[0].seriesId
  assert.equal(bottom('2023'), 'b')
  assert.equal(bottom('2024'), 'a')
})

test('consistent rounding of amounts: the displayed segments sum to the total', () => {
  const OPT1 = { ...OPTS, format: (v) => `${Math.round(v)}` }
  const vals = [res('A', [['2024', 1.4]]), res('B', [['2024', 1.4]]), res('C', [['2024', 1.4]])]
  const plain = buildScene(stk({ annotations: [{ type: 'totals' }], format: { labels: { position: 'outside' } } }), vals, OPT1)
  const sc = buildScene(stk({ annotations: [{ type: 'totals' }], format: { labels: { consistent: true, position: 'outside' } } }), vals, OPT1)
  const segs = l => l.labels.filter(x => !x.key.startsWith('total')).map(x => Number(x.text))
  assert.equal(segs(plain).reduce((a, b) => a + b, 0), 3)
  assert.equal(segs(sc).reduce((a, b) => a + b, 0), 4)
  assert.equal(sc.labels.find(x => x.key === 'total|2024').text, '4')
})

test('grand total, free text bound to data, connectors, error bars, table', () => {
  const sc = buildScene(stk({
    annotations: [{ type: 'grandTotal' }],
    format: { connectors: true, errorBars: { a: { pct: 10 } }, labels: { texts: { 'a|2024': '{series}: {value}*' } }, table: ['c'] },
  }), STK, OPTS)
  assert.ok(sc.labels.find(l => l.key === 'grandTotal').text.startsWith('Total'))
  const t = sc.labels.find(l => l.key === 'a|2024')
  assert.ok(t.overwritten && t.text.startsWith('A: ') && t.text.endsWith('*'))
  assert.equal(sc.annotations.filter(a => a.type === 'connector').length, 2)
  assert.equal(sc.annotations.filter(a => a.type === 'errorBar').length, 2)
  assert.ok(!sc.bars.some(b => b.seriesId === 'c'))
  assert.equal(sc.axes.x.tableHeads[0].text, 'C')
  assert.equal(sc.axes.x.ticks[0].sub.length, 1)
})

test('date formats, ranks, mixed years, net line, legend frame', async () => {
  const { formatDateKey, ordinal } = await import('./scene.js')
  assert.equal(formatDateKey('2024-Q1', 'quarter', "'Q'Q yy"), 'Q1 24')
  assert.equal(formatDateKey('2024-03', 'month', 'MMMM yyyy'), 'March 2024')
  assert.equal(formatDateKey('2024', 'year', "'FY'yy"), 'FY24')
  assert.equal(formatDateKey('2024-Q2', 'quarter', 'MMM yy'), 'Jun 24')
  assert.deepEqual([1, 2, 3, 4, 11, 22].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '22nd'])
  const q = [['2023-Q3', 1], ['2023-Q4', 2], ['2024-Q1', 3]]
  const sc = buildScene({ ...spec([S('a', 'line', { style: { step: 'lines' } })], { format: { xAxis: { dateFormat: "'Q'Q yy", mixedYears: true } } }), x: { grain: 'quarter', range: 'all' } }, [res('A', q)], OPTS)
  assert.deepEqual(sc.axes.x.ticks.map(t => t.label), ['Q3 2023', 'Q4 23', 'Q1 2024'])
  assert.equal((sc.lines[0].d.match(/M/g) ?? []).length, 3)
  const o = buildScene(spec([S('a', 'bar')], { format: { xAxis: { ordinal: true } } }), [res('A', YEARS)], OPTS)
  assert.equal(o.axes.x.ticks[0].label, '1st')
})

test('straight break, label step, free legend order, single label style, line set', () => {
  const sc = buildScene(spec([S('a', 'bar', { labels: 'all' }), S('b', 'bar'), S('c', 'line'), S('d', 'line')], {
    format: { xAxis: { every: 2 }, legendOrder: ['b', 'a'], endLabels: false, lineScheme: 'distinct', labels: { styles: { 'a|2024': { size: 'large', color: 'red' } }, font: 'sans' } },
    endLabels: false,
  }), [res('A', YEARS), res('B', YEARS), res('C', YEARS), res('D', YEARS)], OPTS)
  assert.deepEqual(sc.axes.x.ticks.map(t => t.key), ['2021', '2023'])
  assert.deepEqual(sc.legend.slice(0, 2).map(i => i.seriesId), ['b', 'a'])
  const l = sc.labels.find(x => x.key === 'a|2024')
  assert.equal(l.color, 'red'); assert.equal(l.font, 'sans'); assert.ok(l.size > 10)
  assert.notEqual(sc.lines[0].dash, sc.lines[1].dash)
})

test('transpose: series become categories; axis on the categories', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { format: { transpose: true } }), [res('A', [['2023', 1], ['2024', 2]]), res('B', [['2023', 3], ['2024', 4]])], OPTS)
  assert.deepEqual(sc.axes.x.ticks.map(t => t.label), ['A', 'B'])
  assert.equal(sc.bars.length, 4)
  const ln = buildScene(spec([S('a', 'line')], { format: { xAxis: { crosses: 'at' } } }), [res('A', YEARS)], OPTS)
  assert.equal(ln.lines[0].points[0].x, ln.plot.left)
  assert.equal(ln.lines[0].points.at(-1).x, ln.plot.right)
})

test('names at line ends: the format option removes them (back to the legend)', () => {
  const on = buildScene(spec([S('a', 'line'), S('b', 'line')]), [res('A', YEARS), res('B', YEARS)], OPTS)
  const off = buildScene(spec([S('a', 'line'), S('b', 'line')], { format: { endLabels: false } }), [res('A', YEARS), res('B', YEARS)], OPTS)
  assert.ok(on.endLabels.length === 2 && on.legend.length === 0)
  assert.ok(off.endLabels.length === 0 && off.legend.length === 2)
})

test('"100 %=" row: a column reads against its base, the share follows', () => {
  const sc = buildScene(spec([S('a', 'bar', { labels: 'all' }), S('b', 'bar', { labels: 'all' })], { bars: 'stacked100', format: { base100: { 2024: 40 }, labels: { content: 'share' } } }),
    [res('A', [['2024', 10]]), res('B', [['2024', 10]])], OPTS)
  assert.equal(sc.labels.find(l => l.key === 'a|2024').text, '25%')
})

test('universal connector between two bars', () => {
  const sc = buildScene(spec([S('a', 'bar')], { format: { links: [{ from: { seriesId: 'a', key: '2021' }, to: { seriesId: 'a', key: '2024' } }] } }), [res('A', YEARS)], OPTS)
  const l = sc.annotations.find(a => a.type === 'link')
  assert.ok(l && l.x1 < l.x2)
})

test('swapped rows; column entered as % of the base', () => {
  const r = buildScene(spec([S('a', 'bar'), S('b', 'bar')], { format: { seriesOrder: 'reverse' } }), [res('A', YEARS), res('B', YEARS)], OPTS)
  assert.equal(r.legend[0].seriesId, 'b')
  const data = [res('A', [['2024', 25]])]
  const p = buildScene(spec([S('a', 'bar')], { format: { pctCols: ['2024'], base100: { 2024: 200 } } }), data, OPTS)
  assert.equal(p.bars[0].value, 50)
  assert.equal(data[0].points[0].y, 25, 'the caller\'s data does not move')
})

test('max set by hand: a tick at the bound', () => {
  const sc = buildScene(spec([S('a', 'bar')], { format: { yAxis: { left: { max: 23 } } } }), [res('A', YEARS)], OPTS)
  assert.equal(Math.max(...sc.axes.left.allTicks.map(t => t.value)), 23)
})

test('column break, color carried by the data, value X axis, area to zero', () => {
  const big = [['2021', 10], ['2022', 12], ['2023', 14], ['2024', 90]]
  const sc = buildScene(spec([S('a', 'bar')], { format: { colBreaks: ['2024'] } }), [res('A', big)], OPTS)
  assert.ok(sc.axes.left.domain[1] < 90)
  assert.ok(sc.annotations.some(a => a.type === 'colBreak' && a.key === '2024'))
  const col = buildScene(spec([S('a', 'bar')]), [{ ...res('A', YEARS), points: [{ x: '2021', y: 1, type: 'actual', color: 'cat-3' }] }], OPTS)
  assert.equal(col.bars[0].color, 'cat-3')
  const num = buildScene({ ...spec([S('a', 'line')]), x: { grain: 'category', keys: ['1', '2', '10'] } }, [res('A', [['1', 1], ['2', 2], ['10', 3]])], OPTS)
  const p = num.lines[0].points
  assert.ok(p[1].x - p[0].x < (p[2].x - p[1].x) / 4)
  const ar = buildScene(spec([S('a', 'area')], { format: { areaGaps: 'zero' }, x: { grain: 'category', keys: ['a', 'b', 'c'] } }), [res('A', [['a', 5], ['c', 5]])], OPTS)
  assert.equal(ar.lines[0].points.length, 3)
})

test('empty cell = 0: the line goes through zero instead of interpolating', () => {
  const data = [res('A', [['2021', 10], ['2023', 10]])]
  const sc = buildScene(spec([S('a', 'line')], { format: { emptyZero: true }, x: { grain: 'category', keys: ['2021', '2022', '2023'] } }), data, OPTS)
  assert.equal(sc.lines[0].points.length, 3)
  assert.equal(sc.lines[0].points[1].value, 0)
})

test('date axis: YYYY-MM-DD categories are placed by elapsed time', () => {
  const ks = ['2025-01-01', '2025-01-11', '2025-03-01']
  const sc = buildScene({ ...spec([S('a', 'line')]), x: { grain: 'category', keys: ks } }, [res('A', ks.map((k, i) => [k, i + 1]))], OPTS)
  const p = sc.lines[0].points
  assert.ok((p[1].x - p[0].x) * 4 < (p[2].x - p[1].x))
})

test('CAGR between two years, intermediate years hidden or missing: the period comes from the dates', () => {
  const pts = [['2020', 100], ['2021', 110], ['2022', 120], ['2023', 130], ['2024', 140], ['2025', 161.05]]
  const hidden = buildScene({ ...spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a', from: { key: '2020' }, to: { key: '2025' } }] }), x: { grain: 'year', range: 'all', hidden: ['2021', '2022', '2023'] } }, [res('A', pts)], OPTS)
  const absent = buildScene(spec([S('a', 'bar')], { annotations: [{ type: 'cagr', series: 'a', from: { key: '2020' }, to: { key: '2025' } }] }), [res('A', [['2020', 100], ['2025', 161.05]])], OPTS)
  for (const sc of [hidden, absent]) {
    const c = sc.annotations.find(a => a.type === 'cagr')
    assert.ok(c, 'arrow present')
    assert.match(c.text, /10\.0%/)
  }
})

test('"Chosen" labels: only the chosen points carry their figure', () => {
  const sc = buildScene(spec([S('a', 'bar', { labels: 'some' })], { format: { labelKeys: { a: ['2022', '2024'] } } }), [res('A', YEARS)], OPTS)
  assert.deepEqual(sc.labels.filter(l => l.key.startsWith('a|')).map(l => l.key).sort(), ['a|2022', 'a|2024'])
})

test('axis date format: day, week, roman quarter codes, line break', async () => {
  const { formatDateKey } = await import('./scene.js')
  assert.equal(formatDateKey('2024-Q4', 'quarter', 'QQQ yyyy'), 'IV 2024')
  assert.equal(formatDateKey('2024-03', 'month', 'MMM¶yyyy'), 'Mar\n2024')
  assert.equal(formatDateKey('2024-02', 'month', 'dd ddd'), '29 Thu', 'a month reads on its last day')
  assert.equal(formatDateKey('2024-03-11', 'day', 'www'), 'Week 11')
})
