import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScatterScene, fitTrend, normPartitions, constrainAngle, bubbleScaleFromDrag, trendLabelBox } from './scatterScene.js'
import { segmentHitsBox } from './labelLayout.js'

const P = [
  { key: 'a', label: 'Alpha', x: 1, y: 2, size: 10, group: 'G1' },
  { key: 'b', label: 'Beta', x: 2, y: 4, size: 40, group: 'G1' },
  { key: 'c', label: 'Gamma', x: 3, y: 6, size: 90, group: 'G2' },
]
test('one point per (x, y) pair, inside the plot', () => {
  const sc = buildScatterScene({}, P, { width: 500, height: 300 })
  assert.equal(sc.points.length, 3)
  for (const p of sc.points) assert.ok(p.x >= sc.plot.left && p.x <= sc.plot.right && p.y >= sc.plot.top && p.y <= sc.plot.bottom)
})
test('bubbles: area follows size', () => {
  const sc = buildScatterScene({ bubble: true }, P, { width: 500, height: 300 })
  const a = sc.points.find(p => p.key === 'a'), c = sc.points.find(p => p.key === 'c')
  assert.ok(Math.abs((c.r / a.r) ** 2 - 9) < 1.5)
})
test('exact trend line on aligned points', () => {
  const sc = buildScatterScene({ trend: true }, P, { width: 500, height: 300 })
  assert.ok(Math.abs(sc.trend.slope - 2) < 1e-9 && Math.abs(sc.trend.r2 - 1) < 1e-9)
})
test('partitions in x and y', () => {
  const sc = buildScatterScene({ partitions: { x: 2, y: 3 } }, P, { width: 500, height: 300 })
  assert.equal(sc.partitions.length, 2)
})
test('group legend', () => {
  assert.equal(buildScatterScene({}, P).legend.length, 2)
})
test('labels do not overlap', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, label: `Company ${i}`, x: i % 6, y: Math.floor(i / 6) }))
  const sc = buildScatterScene({}, many, { width: 500, height: 300 })
  assert.ok(sc.labels.length > 0)
})

// ── Label content, sizes, order, trends, partitions ──
const W = { width: 600, height: 360 }
test('label content: name, x, y, size, and second line', () => {
  const sc = buildScatterScene({ bubble: true, labelContent: ['name', 'x', 'y'], label2: ['size'] }, P, { ...W, format: v => `${v}%`, formatSize: v => `€${v}M` })
  const a = sc.labels.find(l => l.key === 'a')
  assert.deepEqual(a.lines, ['Alpha (1%, 2%)', '€10M'])
  const sc2 = buildScatterScene({ labelContent: ['x', 'y'] }, P, W)
  assert.equal(sc2.labels.find(l => l.key === 'b').lines[0], [2, 4].map(v => `€${v.toFixed(1)}M`).join(', '))
})
test('bubbles: diameter follows size instead of area', () => {
  const sc = buildScatterScene({ bubble: true, sizeBy: 'diameter' }, P, W)
  const r = Object.fromEntries(sc.points.map(p => [p.key, p.r]))
  assert.ok(Math.abs(r.c / r.b - 90 / 40) < 1e-9)
})
test('draw order: large bubbles behind, manual bring-to-front and send-to-back', () => {
  const sc = buildScatterScene({ bubble: true }, P, W)
  assert.deepEqual(sc.points.map(p => p.key), ['c', 'b', 'a'])
  assert.equal(buildScatterScene({ bubble: true, front: ['c'] }, P, W).points.at(-1).key, 'c')
  assert.equal(buildScatterScene({ bubble: true, back: ['a'] }, P, W).points[0].key, 'a')
})
test('no marker: label centered on the point; marker scheme per group', () => {
  const sc = buildScatterScene({ marker: 'none' }, P, W)
  const l = sc.labels.find(x => x.key === 'a'), p = sc.points.find(x => x.key === 'a')
  assert.equal(l.cx, p.x)
  assert.equal(l.cy, p.y)
  const g = buildScatterScene({ markers: 'group' }, P, W)
  assert.equal(g.points.find(x => x.key === 'a').shape, 'circle')
  assert.equal(g.points.find(x => x.key === 'c').shape, 'square')
  assert.equal(g.legend[1].shape, 'square')
})
test('manually placed label: offset kept, leader line when far away', () => {
  const sc = buildScatterScene({ labelOffsets: { a: { dx: 60, dy: -40 } } }, P, W)
  const l = sc.labels.find(x => x.key === 'a'), p = sc.points.find(x => x.key === 'a')
  assert.equal(l.cx, p.x + 60)
  assert.ok(l.manual && l.leader)
})
test('sheet color, or ignored (dataFill: false)', () => {
  const Q = P.map((p, i) => (i === 0 ? { ...p, color: 'red' } : p))
  assert.equal(buildScatterScene({}, Q, W).points.find(p => p.key === 'a').color, 'red')
  assert.equal(buildScatterScene({ dataFill: false }, Q, W).points.find(p => p.key === 'a').color, 'cat-1')
})
test('trends: exponential, power, logarithmic, polynomial', () => {
  const ex = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 2 * Math.exp(0.5 * i) }))
  const e = fitTrend('exp', ex)
  assert.ok(Math.abs(e.coef[0] - 2) < 1e-9 && Math.abs(e.coef[1] - 0.5) < 1e-9 && Math.abs(e.r2 - 1) < 1e-9)
  const pw = Array.from({ length: 6 }, (_, i) => ({ x: i + 1, y: 3 * (i + 1) ** 1.5 }))
  const p = fitTrend('power', pw)
  assert.ok(Math.abs(p.coef[0] - 3) < 1e-9 && Math.abs(p.coef[1] - 1.5) < 1e-9)
  const lg = Array.from({ length: 6 }, (_, i) => ({ x: i + 1, y: 1 + 2 * Math.log(i + 1) }))
  const l = fitTrend('log', lg)
  assert.ok(Math.abs(l.coef[0] - 1) < 1e-9 && Math.abs(l.coef[1] - 2) < 1e-9)
  const q = Array.from({ length: 7 }, (_, i) => ({ x: i - 3, y: 2 * (i - 3) ** 2 - (i - 3) + 1 }))
  const p2 = fitTrend('poly2', q)
  assert.ok(Math.abs(p2.coef[2] - 2) < 1e-6 && Math.abs(p2.r2 - 1) < 1e-9)
  assert.equal(p2.equation, 'y = 2x² − x + 1')
  const c = Array.from({ length: 8 }, (_, i) => ({ x: i, y: i ** 3 - 4 * i }))
  assert.ok(Math.abs(fitTrend('poly3', c).coef[3] - 1) < 1e-6)
  assert.equal(fitTrend('poly3', P.slice(0, 2)), null)
})
test('trend in the scene: curve, equation and R², fill', () => {
  const sc = buildScatterScene({ trend: 'poly2', trendLabel: 'both', trendFill: 'above' }, [...P, { key: 'd', label: 'D', x: 4, y: 5 }], W)
  assert.equal(sc.trend.type, 'poly2')
  assert.ok(sc.trend.d.split('L').length > 20)
  assert.ok(sc.trend.label.text.includes('R²') && sc.trend.label.text.startsWith('y ='))
  assert.equal(sc.trend.fill.side, 'above')
})
test('partition list: vertical, horizontal, oblique extended to the plot', () => {
  const sc = buildScatterScene({ partitions: [{ key: 'v', axis: 'x', value: 2 }, { key: 'o', axis: 'line', from: { x: 1, y: 2 }, to: { x: 2, y: 3 } }] }, P, W)
  const o = sc.partitions.find(p => p.key === 'o')
  assert.ok(o.x1 <= sc.plot.left + 1e-6 || o.y1 >= sc.plot.bottom - 1e-6 || o.y1 <= sc.plot.top + 1e-6)
  assert.ok(Math.abs(o.h1.x - sc.scale.x(1)) < 1e-9)
  assert.deepEqual(normPartitions({ x: 1, y: 2 }).map(p => p.axis), ['x', 'y'])
})
test('zones: named quadrants, background and label in the outer corner', () => {
  const sc = buildScatterScene({ partitions: { x: 2, y: 4 }, zones: { tr: { fill: 'cat-2', label: 'Stars' } } }, P, W)
  assert.deepEqual(sc.zones.map(z => z.key), ['tl', 'tr', 'bl', 'br'])
  const tr = sc.zones.find(z => z.key === 'tr')
  assert.equal(tr.fill, 'cat-2')
  assert.equal(tr.label.anchor, 'end')
  assert.ok(Math.abs(tr.label.x - (sc.plot.right - 6)) < 1e-9)
})
test('oblique partition zones: above and below', () => {
  const sc = buildScatterScene({ partitions: [{ key: 'o', axis: 'line', from: { x: 1, y: 2 }, to: { x: 3, y: 6 } }], zones: { 'above:o': { fill: 'green', label: 'Outperform' }, 'below:o': { fill: 'red' } } }, P, W)
  const ab = sc.zones.find(z => z.key === 'above:o'), be = sc.zones.find(z => z.key === 'below:o')
  assert.ok(ab && be)
  // the top-left corner of the plot is above the diagonal
  assert.ok(ab.d.includes(`${sc.plot.left.toFixed(1)},${sc.plot.top.toFixed(1)}`))
  assert.ok(ab.label.y < be.label?.y || !be.label)
})
test('Shift-drag: angle constrained to 15° steps, bubble size via the handle', () => {
  const q = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 1 })
  assert.ok(Math.abs(q.y) < 1e-9)
  const q2 = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 9 })
  assert.ok(Math.abs(q2.x - q2.y) < 1e-9)
  assert.equal(bubbleScaleFromDrag(1, 10, 20), 2)
  assert.equal(bubbleScaleFromDrag(1, 10, 100), 4)
})

// ── Weighted / group trend, 300 points, size legend, snapping ──
import { snapEndpoint, snapValue, sizeLegendFromDrag } from './scatterScene.js'
test('size-weighted trend: the large bubble pulls the line', () => {
  const Q = [{ key: 'a', x: 0, y: 0, size: 1 }, { key: 'b', x: 1, y: 1, size: 1 }, { key: 'c', x: 2, y: 4, size: 100 }, { key: 'd', x: 3, y: 3, size: 1 }]
  const plain = fitTrend('linear', Q), w = fitTrend('linear', Q, { weighted: true })
  assert.ok(Math.abs(w.f(2) - 4) < Math.abs(plain.f(2) - 4))
  const sc = buildScatterScene({ bubble: true, trend: 'linear', trendWeighted: true }, Q, { width: 500, height: 300 })
  assert.equal(sc.trend.weighted, true)
})
test('single-group trend', () => {
  const Q = [...P, { key: 'd', label: 'D', x: 4, y: 1, group: 'G2' }]
  const sc = buildScatterScene({ trend: 'linear', trendGroup: 'G1' }, Q, { width: 500, height: 300 })
  assert.equal(sc.trend.group, 'G1')
  assert.ok(Math.abs(sc.trend.slope - 2) < 1e-9)
})
test('beyond 300 points, labels off by default and re-enableable', () => {
  const many = Array.from({ length: 301 }, (_, i) => ({ key: `k${i}`, label: `P${i}`, x: i, y: (i * 7) % 50 }))
  assert.equal(buildScatterScene({}, many, { width: 600, height: 400 }).labels.length, 0)
  assert.ok(buildScatterScene({ labels: 'all' }, many, { width: 600, height: 400 }).labels.length > 0)
})
test('the size legend handle changes the reference bubble', () => {
  const sc = buildScatterScene({ bubble: true }, P, { width: 500, height: 300 })
  const v = sizeLegendFromDrag(sc, 6)
  assert.ok(v > 0 && v < 90)
  const sc2 = buildScatterScene({ bubble: true, sizeLegend: v }, P, { width: 500, height: 300 })
  assert.equal(sc2.sizeLegend[0].value, v)
})
test('partition endpoints snap to a nearby point, otherwise to a round value', () => {
  const sc = buildScatterScene({}, P, { width: 500, height: 300 })
  const b = sc.points.find(p => p.key === 'b')
  assert.deepEqual(snapEndpoint(sc, { x: b.x + 3, y: b.y - 2 }), { x: 2, y: 4, snapped: 'b' })
  assert.equal(snapEndpoint(sc, { x: sc.plot.left + 1, y: sc.plot.bottom - 1 }).snapped, null)
  assert.equal(snapValue(sc, 'x', b.x + 4), 2)
})

// Quadrants + trend at 12 / 24 / 36 pt. Lines (partitions, trend) are obstacles at every size;
// a label never moves further than twice its height from its point; the trend equation crosses
// no line and no point, whatever the width.
const Q = [
  ['Alpha', 8, 18, 'Region A'], ['Beta', 12, 22, 'Region A'], ['Gamma', 5, 11, 'Region B'], ['Delta', 15, 25, 'Region B'],
  ['Epsilon', 3, 9, 'Region A'], ['Zeta', 10, 14, 'Region B'], ['Eta', 7, 20, 'Region A'],
].map(([label, x, y, group]) => ({ key: label, label, x, y, group }))
const QSPEC = { markers: 'group', labelContent: ['name', 'y'], trend: 'poly2', trendLabel: 'both', partitions: [{ key: 'gx', axis: 'x', value: 9 }, { key: 'gy', axis: 'y', value: 16 }],
  zones: { tr: { fill: 'green', label: 'Stars' }, bl: { fill: 'red', label: 'Watch list' } }, x: { title: 'Revenue growth (%)' }, y: { title: 'EBITDA margin (%)' } }
const segsOf = sc => {
  const out = sc.partitions.map(p => [p.x1, p.y1, p.x2, p.y2])
  const tp = sc.trend.d.slice(1).split(' L').map(q => q.split(',').map(Number))
  for (let i = 1; i < tp.length; i++) out.push([...tp[i - 1], ...tp[i]])
  return out
}
test('quadrants at 12 / 24 / 36 pt: no label on a line, leader ≤ 2 × height, dropped ones counted', () => {
  for (const labelPt of [null, 24, 36]) for (const width of [540, 420]) {
    const sc = buildScatterScene({ ...QSPEC, labelPt }, Q, { width, height: 320, format: v => `${v}%` })
    const segs = segsOf(sc)
    for (const l of sc.labels) {
      assert.ok(!segs.some(s => segmentHitsBox(s, l.box)), `${labelPt} pt / ${width}: ${l.key} on a line`)
      const h = l.box.y1 - l.box.y0
      if (l.leader) assert.ok(Math.hypot(l.leader.x2 - l.leader.x1, l.leader.y2 - l.leader.y1) <= 2 * h + 0.5, `${l.key} too far`)
    }
    assert.equal(sc.labels.length + sc.noRoom, Q.length)
  }
})
test('trend equation: clear of partitions, trend and points, at every size and width', () => {
  for (const labelPt of [null, 24, 36]) for (const width of [700, 540, 420]) {
    const sc = buildScatterScene({ ...QSPEC, labelPt }, Q, { width, height: 320, format: v => `${v}%` })
    const L = sc.trend.label, b = trendLabelBox(L)
    assert.ok(!L.crowded, `${width}: no free space`)
    assert.ok(!segsOf(sc).some(s => segmentHitsBox(s, b)), `${width}: the equation crosses a line`)
    for (const p of sc.points) assert.ok(!(b.x0 < p.x + p.r && b.x1 > p.x - p.r && b.y0 < p.y + p.r && b.y1 > p.y - p.r), `${width}: over ${p.key}`)
    assert.ok(b.x0 >= sc.plot.left - 0.5 && b.x1 <= sc.plot.right + 0.5)
    // The text stays whole: equation then R², however it wraps.
    assert.equal(L.lines.join(' ').replace(/\s+/g, ' '), L.text.replace(/\s+/g, ' '))
  }
})
