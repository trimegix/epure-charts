// Labels and curves: a number is never placed across a line ("€161M" under the Plan
// line), at its real size (14 pt included); its own series' line does not push it away.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, estimateWidth } from './scene.js'
import { resolveCollisions, segmentHitsBox, leaderLine } from './labelLayout.js'

const P = a => a.map(([x, y]) => ({ x, y }))
// The "Revenue and EBITDA" chart from the gallery.
const spec = format => ({ id: 'c', version: 1, kind: 'cartesian', scope: 'shared', x: { grain: 'year', range: 'all' },
  series: [{ id: 'rev', ref: { metric: 'sales', source: 'actual' }, mark: 'bar', labels: 'all', style: { color: 'gray-700' } },
    { id: 'ebitda', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar', style: { color: 'cat-2' } },
    { id: 'plan', ref: { metric: 'sales', source: 'bp' }, mark: 'line' }], format })
const res = [
  { label: 'Revenue', unit: 'M', role: 'actual', points: P([['2020', 112], ['2021', 124], ['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]]) },
  { label: 'EBITDA', unit: 'M', role: 'actual', points: P([['2020', 18], ['2021', 21], ['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]]) },
  { label: 'Plan', unit: 'M', role: 'plan', points: P([['2020', 110], ['2021', 125], ['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]]) },
]

test('14 pt labels: each number stays next to its bar (the curve passes behind, outlined)', () => {
  for (const width of [1050, 1300]) for (const size of [undefined, 14, 'xlarge']) {
    const sc = buildScene(spec({ labels: { size } }), res, { width, height: 320, format: v => `€${v}M` })
    const rev = sc.labels.filter(l => l.key.startsWith('rev|'))
    assert.equal(rev.length, 6, 'no number disappears')
    for (const l of rev) {
      const bar = sc.bars.find(b => `${b.seriesId}|${b.key}` === l.key || l.key === `rev|${b.key}` && b.seriesId === 'rev')
      if (bar) assert.ok(bar.y - l.y < l.size + 8, `${width} ${size}: ${l.text} floats far from its bar`)
    }
  }
})

test('size of ONE label: the layout knows it before placing', () => {
  const sc = buildScene(spec({ labels: { styles: { 'rev|2024': { size: 20 } } } }), res, { width: 1050, height: 320, format: v => `€${v}M` })
  const l = sc.labels.find(x => x.key === 'rev|2024')
  assert.equal(l.size, 27)
})

test('anti-collision pass: a curve pushes away, its own does not, an optional number moves up', () => {
  const m = (t, s) => estimateWidth(t, s)
  const seg = { seg: [0, 95, 200, 95], owner: 'plan' }
  const a = { key: 'rev|1', x: 100, y: 100, size: 12, text: '€10M', anchor: 'middle' }
  const [pa] = resolveCollisions([a], m, [seg])
  assert.ok(pa.y + 2 < 95, 'moves above the line')
  const own = { key: 'plan|1', x: 100, y: 100, size: 12, text: '€10M', anchor: 'middle' }
  assert.equal(resolveCollisions([own], m, [seg])[0].y, 100)
  const opt = { key: 'rev|2', x: 100, y: 100, size: 12, text: '€10M', anchor: 'middle', droppable: true }
  const kept = resolveCollisions([opt], m, [seg])
  assert.equal(kept.length, 1)
  assert.ok(kept[0].y + 2 < 95)
  assert.equal(segmentHitsBox([0, 0, 10, 10], { x0: 20, x1: 30, y0: 0, y1: 30 }), false)
  assert.equal(segmentHitsBox([0, 5, 40, 5], { x0: 20, x1: 30, y0: 0, y1: 10 }), true)
})

// Vertical nudge (within the top margin) before any sideways shift;
// a number moved more than half a column away gets a short leader line to its bar.
test('collision: the number moves up a fine step before sliding sideways', () => {
  const m = (t, size) => String(t).length * size * 0.6
  const l = { key: 'a|k', x: 200, y: 60, size: 40, text: '€173M', anchor: 'middle' }
  // A full-line step would leave the card; an obstacle covers the bottom of the label.
  const [out] = resolveCollisions([l], m, [{ x0: 0, x1: 400, y0: 55, y1: 70 }], { bounds: { x0: 0, x1: 400, y0: 0, y1: 300 } })
  assert.equal(out.x, 200)
  assert.ok(out.y < 60 && out.y - 32 >= 0, `y ${out.y}`)
})
test('leader line: only beyond half a column and if the text no longer covers its point', () => {
  const m = (t, size) => String(t).length * size * 0.6
  const base = { text: '€173M', size: 40, anchor: 'middle', px: 100, py: 150, y: 150 }
  const far = leaderLine({ ...base, x: 300 }, m, 40)
  assert.ok(far)
  assert.equal(far.x1, 100); assert.equal(far.x2, 300 - m('€173M', 40) / 2)
  assert.equal(leaderLine({ ...base, x: 130 }, m, 40), null) // less than half a column
  assert.equal(leaderLine({ ...base, x: 150 }, m, 20), null) // shifted, but the text still covers its point
})
test('72 pt, 1100 px: "€173M" stays above its 2025 bar (not on 2024)', () => {
  const spec = { kind: 'cartesian', x: { grain: 'year', range: 'all' }, format: { labels: { size: 72 } }, series: [
    { id: 'rev', mark: 'bar', labels: 'all' }, { id: 'ebitda', mark: 'bar' }, { id: 'plan', mark: 'line' }] }
  const pts = vs => ['2020', '2021', '2022', '2023', '2024', '2025'].map((x, i) => ({ x, y: vs[i] }))
  const resolved = [
    { label: 'Revenue', unit: 'M', role: 'actual', points: pts([112, 124, 136, 149, 161, 173]) },
    { label: 'EBITDA', unit: 'M', role: 'actual', points: pts([18, 21, 24, 27, 30, 33]) },
    { label: 'Plan', unit: 'M', role: 'plan', points: pts([110, 125, 140, 155, 170, 185]) }]
  const fmt = v => `€${v.toFixed(0)}M`
  for (const width of [1100, 900, 700]) {
    const sc = buildScene(spec, resolved, { width, height: 260, format: fmt })
    const bars = sc.bars.filter(b => b.seriesId === 'rev'), step = bars[1].x - bars[0].x
    const b = bars.find(x => x.key === '2025'), l = sc.labels.find(x => x.key === 'rev|2025')
    assert.ok(l, `${width}: €173M removed`)
    assert.ok(Math.abs(l.x - (b.x + b.width / 2)) <= step / 2 || l.leader, `${width}: shifted without leader`)
  }
})
