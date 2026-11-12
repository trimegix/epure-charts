import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barSpot, coverOf, lineMarks, nextCompactLevel, compactValue } from './barPlacement.js'

const box = { left: 0, right: 600, top: 0, bottom: 400 }
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const rectOf = (p, w, h) => ({ x: p.left, y: p.top, w, h })

test('the bar never covers its target', () => {
  const T = { x: 100, y: 150, w: 40, h: 200, weight: 1000 }
  const p = barSpot({ T, box, w: 300, h: 32, marks: [T] })
  assert.ok(!overlaps(rectOf(p, 300, 32), T))
})

test('above by default when nothing is in the way', () => {
  const T = { x: 100, y: 150, w: 40, h: 200, weight: 1000 }
  const p = barSpot({ T, box, w: 300, h: 32, marks: [T] })
  assert.equal(p.side, 'above')
  assert.ok(p.top + 32 <= T.y)
})

test('avoids the target label and its neighbours: moves aside or goes below', () => {
  const T = { x: 100, y: 150, w: 40, h: 200, weight: 1000 }
  // Labels above the bar and its neighbours, a curve just above them.
  const labels = [60, 100, 140, 180].map((x, i) => ({ x, y: 130 - i * 6, w: 44, h: 14, weight: 4 }))
  const curve = lineMarks([{ x: 40, y: 120 }, { x: 300, y: 70 }], 2)
  const marks = [T, ...labels, ...curve]
  const w = 300, h = 32
  const p = barSpot({ T, box, w, h, marks })
  const r = rectOf(p, w, h)
  for (const l of labels) assert.ok(!overlaps(r, l), `covers the label at x=${l.x}`)
})

test('bounded by the card: never past the right edge (narrow half-card)', () => {
  const half = { left: 0, right: 520, top: 0, bottom: 300 }
  const T = { x: 470, y: 120, w: 40, h: 40, weight: 1000 }
  const p = barSpot({ T, box: half, w: 280, h: 32, marks: [T] })
  assert.ok(p.left + 280 <= half.right - 8)
  assert.ok(p.left >= half.left + 8)
})

test('scrolling: above leaves the viewport, so the bar goes below the target', () => {
  const T = { x: 100, y: 20, w: 40, h: 60, weight: 1000 }
  const card = { left: 0, right: 600, top: -200, bottom: 300 }
  const p = barSpot({ T, box: card, w: 300, h: 32, marks: [T], vh: 800 })
  assert.ok(p.top >= 8, `top=${p.top}`)
  assert.equal(p.side, 'below')
})

test('coverOf: a label weighs more than the same area of bar', () => {
  const bar = [{ x: 0, y: 0, w: 10, h: 10, weight: 1 }]
  const lab = [{ x: 0, y: 0, w: 10, h: 10, weight: 4 }]
  assert.ok(coverOf(0, 0, 10, 10, lab) > coverOf(0, 0, 10, 10, bar) * 10)
})

test('compact level: rises while it overflows, falls back when room returns', () => {
  const seen = [{ w: 700, cut: false }]
  assert.equal(nextCompactLevel(0, seen, 560), 1)
  // Enough room for the full level: left untouched.
  assert.equal(nextCompactLevel(0, seen, 800), 0)
  seen[1] = { w: 640, cut: false }
  assert.equal(nextCompactLevel(1, seen, 560), 2)
  seen[2] = { w: 480, cut: false }
  assert.equal(nextCompactLevel(2, seen, 560), 2)
  // The card widens: back to the less compact level, then full.
  assert.equal(nextCompactLevel(2, seen, 660), 1)
  assert.equal(nextCompactLevel(1, seen, 760), 0)
})

test('compact level: a value that is too long shortens names without collapsing a control', () => {
  const seen = [{ w: 400, cut: true }]
  assert.equal(nextCompactLevel(0, seen, 760), 1)
  seen[1] = { w: 380, cut: false }
  assert.equal(nextCompactLevel(1, seen, 760), 1)
})

test('compact level: a value drops its name only if it stands on its own', () => {
  assert.equal(compactValue('Year: FY Apr', 1), 'FY Apr')
  assert.equal(compactValue('Dates: 10 Feb 2025 → 2 May 2025', 2), '10 Feb 2025 → 2 May 2025')
  assert.equal(compactValue('Scales: Year + Quarter', 1), 'Year + Quarter')
  for (const v of ['Scale: auto – €150M', 'Values: absolute', 'Format: €173M', 'Fill: blue', 'Shape: bar', 'Labels: off']) {
    assert.equal(compactValue(v, 3), v)
  }
  // Full level: nothing changes.
  assert.equal(compactValue('Year: FY Apr', 0), 'Year: FY Apr')
})
