import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBarhScene } from './barhScene.js'

const f = v => `€${v.toFixed(1)}M`
const OPTS = { width: 600, format: f }

test('sorted simple bars: largest first, value at the bar end', () => {
  const sc = buildBarhScene({ series: [{ id: 'v', label: 'V', color: 'green' }], sort: 'desc' },
    [{ key: 'a', label: 'Alpha', values: { v: 5 } }, { key: 'b', label: 'Beta', values: { v: 12 } }], OPTS)
  assert.deepEqual(sc.rows.map(r => r.key), ['b', 'a'])
  const bar = sc.bars.find(b => b.key === 'b')
  const lab = sc.labels.find(l => l.key === 'b|v')
  assert.ok(lab.x > bar.x + bar.width, 'past the bar end')
  assert.equal(lab.text, '€12.0M')
})

test('negative: the bar runs left from zero, its value on the left', () => {
  const sc = buildBarhScene({ series: [{ id: 'v', label: 'V', color: 'red' }] },
    [{ key: 'a', label: 'A', values: { v: -4 } }, { key: 'b', label: 'B', values: { v: 6 } }], OPTS)
  const zero = sc.gridlines.find(g => g.zero).x
  const a = sc.bars.find(b => b.key === 'a')
  assert.ok(Math.abs(a.x + a.width - zero) < 0.5)
  assert.equal(sc.labels.find(l => l.key === 'a|v').anchor, 'end')
})

test('signed stack: positive right of zero, negative left, total at the end', () => {
  const sc = buildBarhScene({ series: [{ id: 'p', label: 'P', color: 'green' }, { id: 'n', label: 'N', color: 'red' }], stacked: true },
    [{ key: 'a', label: 'A', values: { p: 3, n: -2 } }], OPTS)
  const zero = sc.gridlines.find(g => g.zero).x
  const p = sc.bars.find(b => b.seriesId === 'p')
  const n = sc.bars.find(b => b.seriesId === 'n')
  assert.ok(Math.abs(p.x - zero) < 0.5 && Math.abs(n.x + n.width - zero) < 0.5)
  assert.equal(sc.labels[0].text, '€1.0M')
  assert.equal(sc.legend.length, 2)
})

test('ranges: floating bar, both bounds on either side, named value line', () => {
  const sc = buildBarhScene({ series: [{ id: 'r', label: 'R', color: 'gray-400' }], annotations: [{ type: 'valueLine', value: 100, label: 'File' }] },
    [{ key: 'm', label: 'Multiple', range: [90, 115] }, { key: 't', label: 'Total', range: [80, 125], color: 'black' }], OPTS)
  const m = sc.bars.find(b => b.key === 'm')
  assert.ok(sc.labels.find(l => l.key === 'm|lo').x < m.x)
  assert.ok(sc.labels.find(l => l.key === 'm|hi').x > m.x + m.width)
  assert.equal(sc.bars.find(b => b.key === 't').color, 'black')
  const v = sc.annotations[0]
  assert.ok(v.x > m.x && v.x < m.x + m.width)
  assert.equal(v.text, 'File €100.0M')
})

test('label too long: truncated with an ellipsis, full text kept', () => {
  const sc = buildBarhScene({}, [{ key: 'a', label: 'A very very very long company name that never ends', values: { value: 1 } }], { width: 260, format: f })
  assert.ok(sc.rows[0].label.endsWith('…'))
  assert.ok(sc.rows[0].full.startsWith('A very'))
})

test('100% bars: each row sums to 1', async () => {
  const { buildBarhScene } = await import('./barhScene.js')
  const sc = buildBarhScene({ stacked100: true, series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    [{ key: 'r', label: 'R', values: { a: 30, b: 10 } }], { width: 600 })
  const w = sc.bars.reduce((t, b) => t + b.width, 0)
  assert.ok(Math.abs(w - sc.plot.width) < 2)
})
test('butterfly: one series on each side of the center', async () => {
  const { buildBarhScene } = await import('./barhScene.js')
  const sc = buildBarhScene({ butterfly: true, series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    [{ key: 'r', label: 'R', values: { a: 30, b: 10 } }], { width: 600 })
  const [l, r] = sc.bars
  assert.ok(l.x + l.width <= sc.plot.center && r.x >= sc.plot.center)
})

test('profile: one line per series, no bars, domain without forced zero', async () => {
  const { buildBarhScene } = await import('./barhScene.js')
  const rows = [{ key: 'q', label: 'Quality', values: { a: 7, b: 5 } }, { key: 'p', label: 'Price', values: { a: 4, b: 8 } }, { key: 's', label: 'Service', values: { a: 6, b: 6 } }]
  const sc = buildBarhScene({ profile: true, series: [{ id: 'a', label: 'Us', color: 'cat-1' }, { id: 'b', label: 'Them', color: 'cat-2' }] }, rows, { width: 500 })
  assert.equal(sc.bars.length, 0)
  assert.equal(sc.profiles.length, 2)
  assert.equal(sc.profiles[0].points.length, 3)
  assert.ok(sc.axis.ticks[0].value > 0)
})

test('range marker: median of the points, on the range bar, labelled on demand', () => {
  const sc = buildBarhScene({ rangeMarker: 'median', rangeMarkerLabel: true }, [
    { key: 'a', label: 'A', range: [10, 30], points: [10, 12, 20, 30] },
    { key: 'b', label: 'B', points: [5, 25, 9] },
    { key: 'c', label: 'C', range: [0, 40] },
  ], OPTS)
  const [a, b, c] = sc.rows
  assert.equal(a.marker.value, 16)
  const bar = sc.bars.find(z => z.key === 'a')
  assert.ok(a.marker.x > bar.x && a.marker.x < bar.x + bar.width)
  assert.equal(a.marker.text, '€16.0M')
  assert.ok(a.marker.ty < bar.y)
  // Points without a range: the bar spans them, the marker is their median.
  assert.deepEqual(sc.bars.find(z => z.key === 'b').range, [5, 25])
  assert.equal(b.marker.value, 9)
  assert.equal(c.marker, undefined)
  assert.ok(sc.rows[1].y1 - sc.rows[1].y0 >= 36, 'the row holds the marker label')
})

test('range marker: mean, the row\'s own marker, line shape, named label', () => {
  const sc = buildBarhScene({ rangeMarker: 'mean', rangeMarkerShape: 'line', rangeMarkerLabel: 'Mean' }, [
    { key: 'a', label: 'A', range: [0, 10], points: [1, 2, 6] },
    { key: 'b', label: 'B', range: [0, 10], marker: 7 },
  ], OPTS)
  assert.equal(sc.rows[0].marker.value, 3)
  assert.equal(sc.rows[0].marker.shape, 'line')
  assert.equal(sc.rows[1].marker.value, 7)
  assert.equal(sc.rows[1].marker.text, 'Mean €7.0M')
  // No spec.rangeMarker and no row marker: nothing drawn, no label.
  const plain = buildBarhScene({}, [{ key: 'a', label: 'A', range: [0, 10], points: [1, 2, 6] }], OPTS)
  assert.equal(plain.rows[0].marker, undefined)
})
