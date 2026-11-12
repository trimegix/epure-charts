import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPieScene, pieSlices, pieStartFromPoint, pieHoleFromPoint } from './pieScene.js'

const S = [{ key: 'a', label: 'A', value: 50 }, { key: 'b', label: 'B', value: 30 }, { key: 'c', label: 'C', value: 15 }, { key: 'd', label: 'D', value: 3 }, { key: 'e', label: 'E', value: 2 }]

test('one slice per positive value, slices sum to 100%', () => {
  const sc = buildPieScene({}, S, { width: 480, height: 280 })
  assert.equal(sc.arcs.length, 5)
  assert.ok(Math.abs(sc.arcs.reduce((t, a) => t + a.share, 0) - 1) < 1e-9)
})
test('doughnut: inner radius and total in the center', () => {
  const sc = buildPieScene({ donut: 0.5, total: true }, S, { width: 480, height: 280 })
  assert.ok(sc.r0 > 0 && Math.abs(sc.r0 - sc.r * 0.5) < 1e-6)
  assert.ok(sc.center && sc.center.text)
})
test('small slices are grouped into "Other"', () => {
  const { slices } = pieSlices({ other: 0.04 }, S)
  assert.equal(slices.at(-1).key, '__other__')
  assert.deepEqual(slices.at(-1).members, ['d', 'e'])
})
test('descending sort', () => {
  const { slices } = pieSlices({ sort: 'asc' }, S)
  assert.equal(slices[0].key, 'e')
})
test('outside labels do not overlap', () => {
  const sc = buildPieScene({ labels: 'outside' }, S, { width: 480, height: 280 })
  for (const side of ['start', 'end']) {
    const ys = sc.labels.filter(l => l.anchor === side).map(l => l.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 13)
  }
})
test('nothing to draw without a positive value', () => {
  assert.equal(buildPieScene({}, [{ key: 'x', label: 'X', value: 0 }]).empty, true)
})

// ── Handles, counter-clockwise direction, moved labels, center title ──
test('counter-clockwise: the first slice goes left', () => {
  const cw = buildPieScene({}, S, { width: 480, height: 280 })
  const ccw = buildPieScene({ direction: 'ccw' }, S, { width: 480, height: 280 })
  assert.ok(Math.sin(cw.arcs[0].mid) > 0)
  assert.ok(Math.sin(ccw.arcs[0].mid) < 0)
  assert.ok(Math.abs(ccw.arcs[0].mid + cw.arcs[0].mid) < 1e-9)
})
test('rotation handle: angle snaps to quarters, handle on the rim', () => {
  const sc = buildPieScene({ start: 90 }, S, { width: 480, height: 280 })
  assert.ok(Math.abs(sc.handles.rotate.x - (sc.cx + sc.r + 7)) < 1e-9 && Math.abs(sc.handles.rotate.y - sc.cy) < 1e-9)
  assert.equal(pieStartFromPoint(sc, sc.cx + 100, sc.cy + 4), 90)
  assert.equal(pieStartFromPoint(sc, sc.cx - 3, sc.cy - 100), 0)
  assert.equal(pieStartFromPoint(sc, sc.cx + 100, sc.cy - 100), 45)
})
test('hole handle: fraction of the radius, 0 near the center, capped', () => {
  const sc = buildPieScene({ donut: 0.5 }, S, { width: 480, height: 280 })
  assert.ok(Math.abs(sc.handles.hole.y - (sc.cy - sc.r0)) < 1e-9)
  assert.equal(pieHoleFromPoint(sc, sc.cx, sc.cy - sc.r * 0.6), 0.6)
  assert.equal(pieHoleFromPoint(sc, sc.cx + 2, sc.cy), 0)
  assert.equal(pieHoleFromPoint(sc, sc.cx + sc.r * 2, sc.cy), 0.85)
})
test('moved outside label: offset kept, straight leader line', () => {
  const sc = buildPieScene({}, S, { width: 480, height: 280 })
  const base = sc.labels.find(l => l.key === 'a')
  const mv = buildPieScene({ labelOffsets: { a: { dx: 20, dy: -15 } } }, S, { width: 480, height: 280 })
  const l = mv.labels.find(x => x.key === 'a')
  assert.ok(l.manual)
  assert.equal(l.y, base.y - 15)
  assert.equal(mv.leaders.find(x => x.key === 'a').d.split('L').length, 2)
})
test('title in the doughnut center, with or without total', () => {
  assert.equal(buildPieScene({ donut: 0.5, centerTitle: 'AUM' }, S).center.title, 'AUM')
  assert.equal(buildPieScene({ donut: 0.5, total: true, centerTitle: 'AUM' }, S).center.sub, 'AUM')
  assert.equal(buildPieScene({ centerTitle: 'AUM' }, S).center, null)
})

// ── Four handles per slice ──
import { pieStartFromHandle } from './pieScene.js'
test('four handles per slice; dragging one rotates the chart', () => {
  const sc = buildPieScene({ start: 0 }, S, { width: 480, height: 280 })
  const a = sc.arcs[0]
  assert.equal(a.handles.length, 4)
  // A's end edge (180°, half) dragged to 3 o'clock (90°): the chart rotates by -90°, to 270°.
  const h = a.handles.find(q => Math.abs(q.angle - Math.PI) < 1e-9)
  assert.equal(pieStartFromHandle(sc, h.angle, sc.cx + 50, sc.cy), 270)
  // A free rotation (off the quarters) stays precise to the degree.
  assert.equal(pieStartFromHandle(sc, 0, sc.cx + 50, sc.cy - 50), 45)
})
test('inside labels: near the rim, pushed toward the center, colored background when too large', () => {
  const sc = buildPieScene({ labels: 'inside' }, S, { width: 480, height: 280 })
  assert.equal(sc.labels.length, 5)
  const lab = k => sc.labels.find(l => l.key === k)
  // The large slice: label closest to the outer rim, no background.
  const a = sc.arcs.find(x => x.key === 'a'), la = lab('a')
  const dist = Math.hypot(la.x - a.tx, la.y - 4 - a.ty)
  assert.ok(dist > sc.r * 0.6)
  assert.ok(!la.box)
  // Small slices (3% and 2%): a background in their color, and no overlap.
  assert.ok(lab('e').box)
  assert.equal(lab('e').box.fill, sc.arcs.find(x => x.key === 'e').color)
  const d = lab('d'), e = lab('e')
  const overlap = d.box && e.box && d.box.x < e.box.x + e.box.w && e.box.x < d.box.x + d.box.w && d.box.y < e.box.y + e.box.h && e.box.y < d.box.y + d.box.h
  assert.ok(!overlap)
})
