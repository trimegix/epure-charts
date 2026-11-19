import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readingDefaults, applyReading, parseNumber } from './reading.js'
import { buildScene } from './scene.js'
import { validateSpec } from './spec.js'

const spec = (extra = {}) => ({
  id: 's', version: 1, kind: 'cartesian', scope: 'shared', 
  x: { grain: 'year', range: 'all' }, bars: 'clustered',
  series: [{ id: 'a', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar' }, { id: 'b', ref: { metric: 'ebitda', source: 'bp' }, mark: 'line', labels: 'last' }],
  annotations: [{ type: 'valueLine', value: 30, label: 'Target' }], ...extra,
})
const res = (label, pairs) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pairs.map(([x, y]) => ({ x, y, type: 'actual' })) })
const YEARS = [['2017', 70], ['2018', 78], ['2019', 86], ['2020', 89], ['2021', 93], ['2022', 96]]

test('defaults: the reading the spec carries originally', () => {
  const d = readingDefaults(spec({ annotations: [{ type: 'cagr', from: { key: '2018' }, to: { key: '2022' } }, { type: 'totals' }] }))
  assert.equal(d.labels, 'last')
  assert.equal(d.labelSeries, 'b')
  assert.deepEqual(d.cagrs, [{ from: '2018', to: '2022' }])
  assert.equal(d.totals, true)
  assert.deepEqual(d.hidden, [])
})

test('applying the defaults gives the same reading; the spec is never modified; host annotations pass through', () => {
  const s = spec()
  const before = JSON.stringify(s)
  const out = applyReading(s, readingDefaults(s))
  assert.equal(JSON.stringify(s), before)
  assert.deepEqual(out.series.map(x => x.labels), ['none', 'last'])
  assert.deepEqual(out.annotations, [{ type: 'valueLine', value: 30, label: 'Target' }], 'the host target stays')
})

test('hidden years, per-series shape and color, CAGR between two years, average', () => {
  const prefs = { ...readingDefaults(spec()), hidden: ['2017', '2019', '2021'], series: { a: { mark: 'line', color: 'cat-3' } },
    cagrs: [{ from: '2018', to: '2022' }], average: 'a' }
  const out = applyReading(spec(), prefs)
  assert.deepEqual(validateSpec(out), [])
  assert.equal(out.series[0].mark, 'line')
  assert.equal(out.series[0].style.color, 'cat-3')
  const sc = buildScene(out, [res('A', YEARS), res('B', YEARS)], { width: 640, height: 300 })
  assert.deepEqual(sc.columns.map(c => c.key), ['2018', '2020', '2022'], 'three years only')
  const c = sc.annotations.find(a => a.type === 'cagr')
  assert.equal(c.text, `CAGR +${(((96 / 78) ** (1 / 4) - 1) * 100).toFixed(1)}%`, 'duration inferred from the bounds')
  const avg = sc.annotations.find(a => a.type === 'valueLine' && a.text?.startsWith('Avg'))
  assert.ok(avg, 'the average is drawn')
})

test('user value line: while typing, then drawn; only it is replaced', () => {
  const base = readingDefaults(spec())
  assert.equal(applyReading(spec(), { ...base, valueLine: '-' }).annotations.filter(a => a.user).length, 0)
  const out = applyReading(spec(), { ...base, valueLine: '3.', valueLineLabel: 'Covenant' })
  assert.deepEqual(out.annotations.filter(a => a.type === 'valueLine').map(a => a.label), ['Target', 'Covenant'])
  assert.equal(parseNumber('27,5'), 27.5)
})

test('stale preferences (removed series, equal bounds): ignored without error', () => {
  const out = applyReading(spec(), { labels: 'last', labelSeries: 'zz', cagr: 'zz', cagrs: [{ from: '2018', to: '2018' }], average: 'zz', diffFrom: '2018', diffTo: '2018' })
  assert.equal(out.series[0].labels, 'last', 'falls back to the first series')
  assert.ok(!out.annotations.some(a => ['cagr', 'average', 'diff'].includes(a.type)))
})

test('a host-defined CAGR keeps its series and duration while its bounds do not move', () => {
  const origin = { type: 'cagr', from: { key: '2025', series: 'a' }, to: { key: 'Exit 2026', series: 'x' }, periods: 1.75, tone: 'gray-700' }
  const s = spec({ annotations: [origin] })
  const out = applyReading(s, readingDefaults(s))
  assert.deepEqual(out.annotations.find(a => a.type === 'cagr'), origin)
})

test('hiding the last category also removes the gap before it, and its series from the legend', () => {
  const s = { ...spec(), bars: 'stacked', x: { grain: 'category', keys: ['2024', '2025', '_gap', 'Exit 2026'], hidden: ['Exit 2026'] },
    series: [{ id: 'a', ref: { metric: 'm', source: 'actual' }, mark: 'bar' }, { id: 'x', ref: { metric: 'm', source: 'actual' }, mark: 'bar', style: { color: 'black' } }], annotations: [] }
  const sc = buildScene(s, [res('Sales', [['2024', 1], ['2025', 2]]), res('Exit', [['Exit 2026', 3]])], { width: 600, height: 260 })
  assert.deepEqual(sc.columns.map(c => c.key), ['2024', '2025'])
  assert.deepEqual(sc.legend.map(l => l.seriesId), ['a'])
})

test('property controls: outline, dash, weight, marker, smoothing, single segment, axis', () => {
  const prefs = { ...readingDefaults(spec()), series: {
    a: { stroke: 'black', weight: 2, dash: 'dash', points: { 2019: 'red' } },
    b: { markerShape: 'diamond', smooth: true, weight: 3, axis: 'right' },
  } }
  const out = applyReading(spec(), prefs)
  assert.deepEqual(validateSpec(out), [])
  const sc = buildScene(out, [res('A', YEARS), res('B', YEARS)], { width: 640, height: 300 })
  const b19 = sc.bars.find(b => b.key === '2019')
  assert.equal(b19.color, 'red', 'a single segment recolored')
  assert.equal(sc.bars.find(b => b.key === '2018').color !== 'red', true)
  assert.equal(b19.stroke, 'black')
  assert.equal(b19.strokeWidth, 2)
  assert.equal(b19.strokeDash, '6 4')
  const line = sc.lines.find(l => l.seriesId === 'b')
  assert.equal(line.strokeWidth, 3)
  assert.equal(line.markerShape, 'diamond')
  assert.ok(line.markers.length > 0)
  assert.ok(/C/.test(line.d), 'smoothed line: Bezier curves')
  assert.ok(sc.axes.right, 'series moved to the right axis')
})

test('bar layout, category sort, decimals; reset = back to defaults', () => {
  const s = { ...spec(), x: { grain: 'category' }, series: [{ id: 'a', ref: { metric: 'm', source: 'actual' }, mark: 'bar' }, { id: 'c', ref: { metric: 'm', source: 'actual' }, mark: 'bar' }], annotations: [] }
  const out = applyReading(s, { ...readingDefaults(s), bars: 'stacked', sort: 'desc', decimals: 1 })
  assert.equal(out.bars, 'stacked')
  assert.equal(out.numberFormat.decimals, 1)
  const sc = buildScene(out, [res('A', [['x', 1], ['y', 5], ['z', 3]]), res('C', [['x', 1], ['y', 1], ['z', 1]])], { width: 600, height: 260 })
  assert.deepEqual(sc.columns.map(c => c.key), ['y', 'z', 'x'], 'largest total first')
  assert.deepEqual(applyReading(s, readingDefaults(s)).x.sort, undefined)
})

test('labels set on several series all survive the reading layer (stacked)', () => {
  const s = { ...spec(), bars: 'stacked', annotations: [], series: ['a', 'b', 'c'].map(id => ({ id, ref: { metric: 'm', source: 'actual' }, mark: 'bar', labels: 'all' })) }
  const d = readingDefaults(s)
  assert.deepEqual(d.labelsBy, { a: 'all', b: 'all', c: 'all' })
  const out = applyReading(s, d)
  assert.deepEqual(out.series.map(x => x.labels), ['all', 'all', 'all'])
  const r = [res('A', YEARS), res('B', YEARS), res('C', YEARS)]
  const live = buildScene(out, r, { width: 640, height: 300 }).labels.length
  assert.ok(live >= 3 * YEARS.length, 'a label in every segment')
  assert.equal(live, buildScene(s, r, { width: 640, height: 300 }).labels.length, 'same labels as the static scene')
  // A series without labels stays without; a mixed spec keeps its mix.
  const mixed = { ...s, series: [{ ...s.series[0], labels: 'last' }, { ...s.series[1], labels: 'none' }, s.series[2]] }
  assert.deepEqual(applyReading(mixed, readingDefaults(mixed)).series.map(x => x.labels), ['last', 'none', 'all'])
})

test('a spec difference arrow keeps its mode, level and series in the live view', () => {
  const d0 = { type: 'diff', from: '2018', to: '2022', mode: 'both', level: true, series: 'a' }
  const s = spec({ annotations: [d0] })
  const d = readingDefaults(s)
  assert.equal(d.format.diffMode, 'both', 'the mode is the reading\'s starting mode')
  assert.equal(d.diffSeries, 'a')
  const out = applyReading(s, d)
  const a = out.annotations.find(x => x.type === 'diff')
  assert.equal(a.level, true)
  assert.equal(a.series, 'a')
  const r = [res('A', YEARS), res('B', YEARS)]
  const live = buildScene(out, r, { width: 640, height: 300 }).annotations.find(x => x.type === 'diff')
  const still = buildScene(s, r, { width: 640, height: 300 }).annotations.find(x => x.type === 'diff')
  assert.match(live.text, /^\+\S+ \(\+23%\)$/, 'value and %')
  assert.equal(live.text, still.text)
  assert.equal(live.style, still.style, 'a level arrow stays a level arrow')
  // The menu changes the mode from there ('Value' clears format.diffMode).
  const abs = applyReading(s, { ...d, format: {} })
  assert.doesNotMatch(buildScene(abs, r, { width: 640, height: 300 }).annotations.find(x => x.type === 'diff').text, /%/)
  // Moved bounds: a plain arrow, without the spec's level.
  assert.equal(applyReading(s, { ...d, diffFrom: '2019' }).annotations.find(x => x.type === 'diff').level, undefined)
})

test('CAGR arrows: every one is kept, each on the series of its ends', () => {
  const B = YEARS.map(([x, y]) => [x, y * 2 + 10])
  const on = (f, t, sid) => ({ type: 'cagr', from: { key: f, series: sid }, to: { key: t, series: sid } })
  const s = spec({ annotations: [on('2017', '2019', 'b'), on('2019', '2021', 'b'), on('2020', '2022', 'b')] })
  const d = readingDefaults(s)
  assert.equal(d.cagrs.length, 3, 'no cap at two')
  assert.deepEqual(d.cagrs[0], { from: '2017', to: '2019', fromSeries: 'b', toSeries: 'b' })
  const r = [res('A', YEARS), res('B', B)]
  const texts = sc => sc.annotations.filter(a => a.type === 'cagr').map(a => a.text)
  const still = texts(buildScene(s, r, { width: 640, height: 300 }))
  assert.equal(still.length, 3)
  assert.deepEqual(texts(buildScene(applyReading(s, d), r, { width: 640, height: 300 })), still)
  // The same settings published and applied to a spec that no longer carries the arrows:
  // rebuilt on series b, not on the first series that has a number.
  const bare = spec({ annotations: [] })
  assert.deepEqual(texts(buildScene(applyReading(bare, { ...readingDefaults(bare), cagrs: d.cagrs }), r, { width: 640, height: 300 })), still)
  // An `a.series` CAGR (both ends): its series is kept as well.
  assert.deepEqual(readingDefaults(spec({ annotations: [{ type: 'cagr', series: 'b', from: { key: '2017' }, to: { key: '2022' } }] })).cagrs,
    [{ from: '2017', to: '2022', fromSeries: 'b', toSeries: 'b' }])
})
