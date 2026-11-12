// Large label sizes (36 and 72 pt): nothing outside the frame, no overlap, at least half of the
// labels kept, and the hidden ones are counted (never dropped silently).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelMetrics } from './customStyle.js'
import { buildPieScene } from './pieScene.js'

// A label's box: at its own size (l.size), otherwise at the configured size.
function boxOf(l, M) {
  const size = l.size ?? M.size
  const w = M.measure(l.text, size)
  const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
  return { x0, x1: x0 + w, y0: l.y - size * 0.75, y1: l.y + size * 0.2 }
}
const overlap = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5
export function assertClean(labels, frame, name, M) {
  const boxes = labels.map(l => [l, boxOf(l, M)])
  for (const [l, b] of boxes) {
    assert.ok(b.x0 >= -0.5 && b.x1 <= frame.x1 + 0.5 && b.y0 >= (frame.y0 ?? 0) - 0.5 && b.y1 <= frame.y1 + 0.5, `${name}: "${l.text}" outside the frame ${JSON.stringify(b)}`)
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    assert.ok(!overlap(boxes[i][1], boxes[j][1]), `${name}: "${boxes[i][0].text}" overlaps "${boxes[j][0].text}"`)
  }
}

const SLICES = [['Industrials', 42], ['Healthcare', 27], ['Software', 18], ['Consumer', 9], ['Other', 4]].map(([label, value]) => ({ key: label, label, value }))
for (const pt of [36, 72]) {
  test(`"Revenue mix" doughnut at ${pt} pt: floor radius, labels inside the area (legend excluded), no overlap`, () => {
    const spec = { donut: 0.4, direction: 'ccw', start: 90, content: 'nameShare', labelOffsets: { Software: { dx: 18, dy: -14 } }, explode: ['Healthcare'], labelPt: pt }
    const sc = buildPieScene(spec, SLICES, { width: 600, height: 280 })
    const M = labelMetrics(spec, 11)
    const areaW = sc.legend[0].x - 12
    assert.ok(sc.r >= 0.3 * Math.min(areaW, 280) - 0.5, `rayon ${sc.r}`)
    assertClean(sc.labels, { x1: areaW, y1: 280 }, `pie ${pt}`, M)
    assert.ok(sc.labels.length >= SLICES.length / 2, `${sc.labels.length} labels kept`)
    assert.equal(sc.labels.length + sc.noRoom, SLICES.length)
  })
}

import { buildScatterScene, trendLabelBox } from './scatterScene.js'
import { segmentHitsBox } from './labelLayout.js'
const POINTS = [
  ['Alpha', 8, 18, 120, 'Region A'], ['Beta', 12, 22, 80, 'Region A'], ['Gamma', 5, 11, 60, 'Region B'], ['Delta', 15, 25, 150, 'Region B'],
  ['Epsilon', 3, 9, 40, 'Region A'], ['Zeta', 10, 14, 90, 'Region B'], ['Eta', 7, 20, 70, 'Region A'],
].map(([label, x, y, size, group]) => ({ key: label, label, x, y, size, group }))
const QUAD = { markers: 'group', labelContent: ['name', 'y'], trend: 'poly2', trendLabel: 'both', partitions: [{ key: 'gx', axis: 'x', value: 9 }, { key: 'gy', axis: 'y', value: 16 }],
  zones: { tr: { fill: 'green', label: 'Stars' }, bl: { fill: 'red', label: 'Watch list' } }, x: { title: 'Revenue growth (%)' }, y: { title: 'EBITDA margin (%)' } }
for (const pt of [36, 72]) {
  test(`quadrant scatter at ${pt} pt: at least half of the labels, inside the plot, no overlap, the rest counted`, () => {
    const spec = { ...QUAD, labelPt: pt }
    const sc = buildScatterScene(spec, POINTS, { width: 600, height: 320, format: v => `${v}%` })
    const M = labelMetrics(spec, 11)
    assert.ok(sc.labels.length >= Math.ceil(POINTS.length / 2), `${sc.labels.length} labels`)
    assert.equal(sc.labels.length + sc.noRoom, POINTS.length)
    const bx = sc.labels.map(l => l.box)
    for (const b of bx) assert.ok(b.x0 >= sc.plot.left - 0.5 && b.x1 <= sc.plot.right + 0.5 && b.y0 >= sc.plot.top - 0.5 && b.y1 <= sc.plot.bottom + 0.5)
    for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) assert.ok(!overlap(bx[i], bx[j]), `${sc.labels[i].text} / ${sc.labels[j].text}`)
    // Kept labels are drawn at their size (≤ the configured size), extremes first.
    assert.ok(sc.labels.every(l => l.size <= M.size))
    assert.ok(sc.labels.some(l => l.key === 'Delta' || l.key === 'Epsilon'))
  })
}
test('quadrant scatter: the trend equation crosses no partition line', () => {
  const sc = buildScatterScene(QUAD, POINTS, { width: 600, height: 320, format: v => `${v}%` })
  // The actual box (one, two or three lines, monospaced).
  const b = trendLabelBox(sc.trend.label)
  for (const pa of sc.partitions) assert.ok(!segmentHitsBox([pa.x1, pa.y1, pa.x2, pa.y2], b), `equation on partition ${pa.key}`)
})

import { buildGanttScene } from './ganttScene.js'
const GANTT = [
  { key: 'it', label: 'IT migration', group: 'Phase 1', responsible: 'CIO', status: 0.75, remark: 'Legacy shutdown Q2', items: [{ key: 'it1', start: '2025-01-06', end: '2025-03-28', label: 'Separation', done: 0.7 }] },
  { key: 'pr', label: 'Pricing', group: 'Phase 1', responsible: 'CCO', status: 0.5, items: [{ key: 'pr1', start: '2025-02-03', end: '2025-05-30', label: 'Repricing wave 1', done: 0.4, shape: 'pentagon' }, { key: 'pr2', after: 'pr1', duration: 60, label: 'Wave 2', shape: 'chevron' }] },
  { key: 'ma', label: 'Partnerships', group: 'Phase 2', responsible: 'CFO', status: 0.25, items: [] },
  { key: 'ma-s', label: 'Screening', level: 1, group: 'Phase 2', responsible: 'BizDev', status: 1, items: [{ key: 'ma1', start: '2025-03-03', end: '2025-06-30', label: 'Partner screening' }] },
  { key: 'ma-d', label: 'Negotiation', level: 1, group: 'Phase 2', responsible: 'BizDev', status: 0, remark: 'Two partners', items: [{ key: 'ma3', after: 'ma1', duration: 90, label: 'Terms' }, { key: 'ma2', after: 'ma3', kind: 'milestone', label: 'Signing', line: true }] },
  { key: 'ex', label: 'Launch', group: 'Phase 2', responsible: 'CEO', status: 0, items: [{ key: 'exb', kind: 'bracket', start: '2026-01-05', end: '2026-03-31', label: 'Prep' }, { key: 'ex1', start: '2026-04-01', end: '2026-06-30', label: 'Rollout' }] },
]
const GSPEC = { groups: true, today: '2025-04-15', fiscalStart: 4, columns: ['responsible', 'status', 'remark'], shades: [{ from: '2025-07-14', to: '2025-08-31', label: 'Summer' }] }
for (const pt of [36, 72]) {
  test(`"Transformation plan" Gantt at ${pt} pt: row and bar contain the label, nothing outside the frame or overlapping`, () => {
    const spec = { ...GSPEC, labelPt: pt }
    const M = labelMetrics(spec, 11)
    const sc = buildGanttScene(spec, GANTT, { width: 640 })
    assertClean(sc.labels, { x1: sc.width, y1: sc.height }, `gantt ${pt}`, M)
    // A label inside its bar (white) fits its height.
    for (const l of sc.labels.filter(x => x.color === 'white' && !x.lines)) {
      const bar = sc.bars.find(b => b.key === String(l.key).replace(/\|date$/, ''))
      assert.ok(bar.height >= M.size, `"${l.text}" taller than its bar`)
    }
    // The bracket label does not sit on the "Rollout" bar.
    const prep = sc.labels.find(l => l.key === 'ex|exb'), dual = sc.bars.find(b => b.key === 'ex|ex1')
    if (prep) { const w = M.measure(prep.text), x0 = prep.anchor === 'end' ? prep.x - w : prep.x; assert.ok(x0 + w <= dual.x + 0.5 || x0 >= dual.x + dual.width) }
    assert.ok(sc.labels.length * 2 >= sc.labels.length + sc.noRoom, `${sc.labels.length} kept, ${sc.noRoom} dropped`)
  })
}

import { buildScene } from './scene.js'
const COLS = {
  spec: { kind: 'cartesian', x: { grain: 'year', range: 'all' }, series: [
    { id: 'rev', mark: 'bar', labels: 'all', style: { color: 'gray-700' } },
    { id: 'ebitda', mark: 'bar', style: { color: 'cat-2' } },
    { id: 'plan', mark: 'line' },
  ] },
  resolved: [
    { label: 'Revenue', unit: 'M', role: 'actual', points: [['2020', 112], ['2021', 124], ['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]].map(([x, y]) => ({ x, y })) },
    { label: 'EBITDA', unit: 'M', role: 'actual', points: [['2020', 18], ['2021', 21], ['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]].map(([x, y]) => ({ x, y })) },
    { label: 'Plan', unit: 'M', role: 'plan', points: [['2020', 110], ['2021', 125], ['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]].map(([x, y]) => ({ x, y })) },
  ],
}
const fmtM = (v, unit, dec) => `€${v.toFixed(dec ?? (Math.abs(v) >= 100 ? 0 : 1))}M`
for (const [pt, w] of [[36, 600], [72, 600], [72, 1100]]) {
  test(`"Revenue and EBITDA" columns at ${pt} pt (${w} px): values inside the card, no overlap, at least half`, () => {
    const spec = { ...COLS.spec, format: { labels: { size: pt } } }
    const sc = buildScene(spec, COLS.resolved, { width: w, height: 260, format: fmtM })
    const M = labelMetrics({}, 11)
    assertClean(sc.labels, { x1: sc.width, y1: sc.height }, `colonnes ${pt}`, M)
    assert.ok(sc.labels.length * 2 >= sc.labelsWanted, `${sc.labels.length} / ${sc.labelsWanted}`)
    assert.equal(sc.labels.length + sc.noRoom, sc.labelsWanted)
    // The drawn size is reported when it differs from the requested size.
    const used = Math.round(sc.labels[0].size * 3 / 4)
    if (used < pt) assert.equal(sc.labelCap?.asked, pt)
  })
}
test('columns: without a custom size, the scene is unchanged (no reserve, no cap)', () => {
  const sc = buildScene(COLS.spec, COLS.resolved, { width: 600, height: 260, format: fmtM })
  assert.equal(sc.labelCap, undefined)
  assert.equal(sc.noRoom, 0)
})
test('columns at 36 pt, settings button in the corner: no value over its area', () => {
  const spec = { ...COLS.spec, format: { labels: { size: 36 } } }
  const sc = buildScene(spec, COLS.resolved, { width: 600, height: 260, format: fmtM, menuBox: { w: 34, h: 30 } })
  const M = labelMetrics({}, 11)
  for (const l of sc.labels) { const b = boxOf(l, M); assert.ok(!(b.x1 > 600 - 34 && b.y0 < 30), `"${l.text}" over the button`) }
})

import { buildMekkoScene } from './mekkoScene.js'
test('Mekko at 36 pt: segments dropped for lack of room are counted (noRoom)', () => {
  const spec = { series: [{ id: 'us', label: 'Our company' }, { id: 'c1', label: 'Competitor 1' }, { id: 'c2', label: 'Competitor 2' }, { id: 'rest', label: 'Rest of market' }], totals: true, labelPt: 36 }
  const columns = [
    { key: 'fr', label: 'France', values: { us: 35, c1: 25, c2: 15, rest: 25 } },
    { key: 'de', label: 'Germany', values: { us: 20, c1: 30, c2: 10, rest: 40 } },
    { key: 'uk', label: 'UK', values: { us: 10, c1: 15, c2: 25, rest: 50 } },
  ]
  const sc = buildMekkoScene(spec, columns, { width: 600, height: 320 })
  const segLabels = sc.labels.filter(l => !l.total).length, totals = sc.labels.filter(l => l.total).length
  assert.ok(sc.noRoom > 0)
  assert.equal(segLabels + totals + sc.noRoom, sc.segments.length + columns.length)
  assertClean(sc.labels, { x1: sc.width, y1: sc.height }, 'mekko', labelMetrics(spec, 10.5))
})

// Large values avoid the value-axis tick labels.
for (const [pt, w] of [[72, 1100], [72, 600], [36, 600]]) {
  test(`columns at ${pt} pt (${w} px): no value over an axis tick`, () => {
    const sc = buildScene({ ...COLS.spec, format: { labels: { size: pt } } }, COLS.resolved, { width: w, height: 260, format: fmtM })
    const M = labelMetrics({}, 11)
    const ax = sc.axes.left
    const ticks = ax.ticks.map(t => { const tw = t.label.length * 11 * 0.58; return { x0: ax.x - 6 - tw, x1: ax.x - 6, y0: t.y - 6.5, y1: t.y + 6.5 } })
    for (const l of sc.labels) {
      const b = boxOf(l, M)
      for (const t of ticks) assert.ok(!overlap(b, t), `"${l.text}" covers a tick`)
    }
    // The first value slides into the plot rather than disappearing.
    if (w === 1100) assert.ok(sc.labels.some(l => l.text === '€112M'))
  })
}

// At 72 pt the last value (often the key figure) stays; then the first, then the extremes.
for (const [pt, w] of [[72, 1100], [72, 600], [36, 600]]) {
  test(`columns at ${pt} pt (${w} px): the last and first values are kept, inside the card, no overlap`, () => {
    const sc = buildScene({ ...COLS.spec, format: { labels: { size: pt } } }, COLS.resolved, { width: w, height: 260, format: fmtM })
    const texts = sc.labels.map(l => l.text)
    assert.ok(texts.includes('€173M'), `last value dropped: ${texts}`)
    assert.ok(texts.includes('€112M'), `first value dropped: ${texts}`)
    assertClean(sc.labels.filter(l => !l.inside), { x1: w, y1: 260 }, `colonnes ${pt}`, labelMetrics({}, 11))
  })
}
test('optional value priority: first, then extremes, then the rest (labelLayout)', async () => {
  const { resolveCollisions } = await import('./labelLayout.js')
  const m = (t, s) => t.length * s * 0.6
  // Three mutually overlapping values: only the best ranked stays, whatever the x order.
  const L = [
    { key: 'a', x: 100, y: 50, size: 20, text: 'AAAAAA', anchor: 'middle', droppable: true, rank: 4 },
    { key: 'b', x: 110, y: 50, size: 20, text: 'BBBBBB', anchor: 'middle', droppable: true, rank: 2 },
    { key: 'c', x: 120, y: 50, size: 20, text: 'CCCCCC', anchor: 'middle', droppable: true, rank: 3 },
  ]
  assert.deepEqual(resolveCollisions(L, m).map(l => l.key), ['b'])
  // A mandatory label does not leave the card (bounds) to avoid an obstacle.
  const must = { key: 'z', x: 100, y: 30, size: 20, text: 'ZZZZ', anchor: 'middle' }
  const out = resolveCollisions([must], m, [{ x0: 90, x1: 140, y0: 20, y1: 35 }], { bounds: { x0: 0, x1: 300, y0: 0, y1: 200 } })
  assert.ok(out[0].y - 20 * 0.8 >= 0, `y ${out[0].y}`)
})

// A leader line crosses no line (partition, trend) and no other label.
test('quadrant scatter at 36 and 72 pt: no leader line crosses a line or a label', async () => {
  const { segmentsCross } = await import('./scatterScene.js')
  for (const w of [600, 900, 1050, 1300]) for (const pt of [36, 72]) {
    const sc = buildScatterScene({ ...QUAD, labelPt: pt }, POINTS, { width: w, height: 320, format: v => `${v}%` })
    const segs = sc.partitions.map(pa => [pa.x1, pa.y1, pa.x2, pa.y2])
    const tp = sc.trend.d.slice(1).split(' L').map(q => q.split(',').map(Number))
    for (let i = 1; i < tp.length; i++) segs.push([...tp[i - 1], ...tp[i]])
    assert.equal(sc.labels.length + sc.noRoom, POINTS.length)
    for (const l of sc.labels.filter(x => x.leader && !x.manual)) {
      const ld = [l.leader.x1, l.leader.y1, l.leader.x2, l.leader.y2]
      assert.ok(!segs.some(sg => segmentsCross(sg, ld)), `${w}/${pt}: leader of ${l.text} on a line`)
      for (const o of sc.labels) if (o !== l) assert.ok(!segmentHitsBox(ld, o.box), `${w}/${pt}: leader of ${l.text} on ${o.text}`)
    }
  }
})
