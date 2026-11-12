// Same scale on a date X axis ("Set Same Scale": same units per pixel), axis start
// snapped to a tick, and a shifted date label at the left edge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, snapDateLo, estimateWidth } from './scene.js'
import { publishDomain, withdrawDomain, sameRangeFor, xGroupFor } from './sameScale.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs) => ({ label, unit: 'M', role: 'actual', points: pts(pairs) })
const spec = format => ({ id: 't', version: 1, kind: 'cartesian', scope: 'shared', 
  x: { grain: 'category', range: 'all' }, series: [{ id: 's', ref: { metric: 'nav', source: 'actual' }, mark: 'line' }], format })
const day = s => Date.parse(`${s}T00:00:00Z`) / 864e5
// The two order-backlog line charts from the gallery.
const A = [['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-01-31', 141], ['2025-06-30', 150]]
const B = [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2025-12-31', 75], ['2026-03-31', 79]]
const snap = (lo, hi) => snapDateLo(lo, hi)
const pxPerDay = sc => sc.plot.width / (sc.axes.x.drawn[1] - sc.axes.x.drawn[0])

test('a date axis start snaps to its tick: the first point gets its own', () => {
  const a = buildScene(spec({}), [res('A', A)], { width: 560, height: 260 })
  assert.equal(a.axes.x.drawn[0], day('2024-01-01'), 'Q1 24 starts the axis')
  assert.equal(a.axes.x.ticks[0].label, 'Q1 24')
  // Far from the unit start (more than half a unit): nothing moves.
  assert.equal(snapDateLo(day('2024-03-01'), day('2025-06-30')), day('2024-03-01'))
  assert.equal(snapDateLo(day('2024-02-10'), day('2024-04-01'), 'month'), day('2024-02-01'))
})

// What ChartView does: publish the natural extent with the plot width, then take the shared range.
const sameScenes = (W, groups, key = 'x|*|date') => {
  const O = { width: W, height: Math.round(Math.min(320, Math.max(220, W * 0.4))), format: v => `€${v}M` }
  const nat = groups.map(([, d]) => buildScene(spec({}), [res('N', d)], O))
  nat.forEach((n, i) => publishDomain(`x${i}`, key, ...n.axes.x.domain, null, Math.round(n.plot.width * 100) / 100))
  const out = groups.map(([, d], i) => {
    const r = sameRangeFor(key, Math.round(nat[i].plot.width * 100) / 100, snap, nat[i].axes.x.domain)
    return buildScene(spec({ xAxis: { min: r[0], max: r[1] } }), [res('N', d)], O)
  })
  nat.forEach((_, i) => withdrawDomain(`x${i}`))
  return out
}
const noTouch = sc => sc.axes.x.ticks.every((t, i, a) => i === 0
  || (a[i - 1].lx ?? a[i - 1].x) + estimateWidth(a[i - 1].label) / 2 + 8 <= (t.lx ?? t.x) - estimateWidth(t.label) / 2)

test('gallery Region A / B charts at 1100 px (two cards side by side): same px per day, each keeps its range', () => {
  // 1100 px: container 1100 - 2 × 24, two columns 18 px apart, card padding 2 × 20 + 2 border (± scrollbar).
  for (const W of [475, 467]) {
    const [fa, fb] = sameScenes(W, [['A', A], ['B', B]])
    assert.ok(Math.abs(pxPerDay(fa) - pxPerDay(fb)) < 1e-9, `${W}: ${pxPerDay(fa)} vs ${pxPerDay(fb)}`)
    // Each starts at its first point (snapped to its tick), not at the union.
    assert.equal(fa.axes.x.drawn[0], day('2024-01-01'))
    assert.equal(fb.axes.x.drawn[0], day('2024-07-01'))
    // Each fits its whole range.
    assert.ok(fa.axes.x.drawn[1] >= day('2025-06-30') && fb.axes.x.drawn[1] >= day('2026-03-31'))
    // Ticks: no two labels touch, and the same calendar step on both sides.
    assert.ok(noTouch(fa) && noTouch(fb), fb.axes.x.ticks.map(t => `${t.label}@${Math.round(t.lx ?? t.x)}`).join(' '))
    const q = sc => new Set(sc.axes.x.ticks.map(t => t.label.slice(0, 2)))
    assert.deepEqual([...q(fa)].sort(), [...q(fb)].sort())
  }
})

test('same X scale, different widths: the shared density is the one the tightest chart needs', () => {
  publishDomain('xa', 'x|g|date', day('2024-01-01'), day('2025-01-01'), null, 400)
  publishDomain('xb', 'x|g|date', day('2024-06-01'), day('2025-06-01'), null, 460)
  publishDomain('xc', 'x|g|date', day('2024-06-01'), day('2025-06-01'), null, 900)
  const ra = sameRangeFor('x|g|date', 400, undefined, [day('2024-01-01'), day('2025-01-01')])
  const rb = sameRangeFor('x|g|date', 460, undefined, [day('2024-06-01'), day('2025-06-01')])
  const rc = sameRangeFor('x|g|date', 900, undefined, [day('2024-06-01'), day('2025-06-01')])
  withdrawDomain('xa'); withdrawDomain('xb'); withdrawDomain('xc')
  const d = r => (r[1] - r[0])
  assert.ok(Math.abs(400 / d(ra) - 460 / d(rb)) < 1e-9 && Math.abs(400 / d(ra) - 900 / d(rc)) < 1e-9)
  assert.equal(ra[1], day('2025-01-01'), 'the tightest fits its range exactly')
  assert.equal(rb[0], day('2024-06-01'))
  assert.ok(rc[1] > day('2026-01-01'), 'the full-width card sees further, at the same scale')
})

test('"Set same scale" joins the X group already set by another chart', () => {
  publishDomain('ya|x', 'x|page-3|date', 1, 2, null, 300)
  assert.equal(xGroupFor('date', 'yb|x'), 'page-3')
  assert.equal(xGroupFor('num', 'yb|x'), true)
  withdrawDomain('ya|x')
  publishDomain('ya|x', 'x|*|date', 1, 2, null, 300)
  assert.equal(xGroupFor('date', 'yb|x'), true)
  withdrawDomain('ya|x')
})

test('a tick at the left edge does not overlap the value labels', () => {
  const b = buildScene(spec({}), [res('B', B)], { width: 560, height: 260 })
  const first = b.axes.x.ticks[0]
  assert.equal(first.label, 'Q3 24')
  assert.equal(first.x, b.plot.left)
  assert.ok(first.lx - estimateWidth(first.label) / 2 >= b.plot.left + 1, 'the label starts inside the plot')
  // A tick away from the edge keeps its center.
  assert.equal(b.axes.x.ticks.at(-1).lx, null)
})
