// ─── Chart engine · label placement ──────────────────────────────────────────
// The anti-collision pass shared by the scenes (cartesian, waterfall). A label
// = { x, y (baseline), size, text, anchor, below?, droppable? }.
//   · from left to right, a label that overlaps one already placed
//     moves away by one line (upwards, or downwards if `below`), at most
//     three attempts;
//   · a `droppable` label (one among "all values") that gets in the way
//     is removed rather than moved: one figure fewer beats an unreadable
//     figure. Mandatory labels are placed first.
// An obstacle is a box { x0, x1, y0, y1 } or a curve segment { seg: [x1, y1, x2, y2],
// owner }: a label is never placed across a line (except its own series',
// `owner` = prefix of its key); it moves up one line, and an optional figure crossed
// by a line gives up. Boxes are measured at the actual size (l.size, measure).
// Priority (`rank`): the last category is mandatory, then the first, the extremes, the rest.
// Pure. `measure(text, size)` = estimated width (estimateWidth from scene.js).

function boxOf(l, measure) {
  const w = measure(l.text, l.size) * 1.04
  const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
  return { x0, x1: x0 + w, y0: l.y - l.size, y1: l.y + 2 }
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
/** Does a segment cross a box (Liang-Barsky clipping)? */
export function segmentHitsBox([x1, y1, x2, y2], b) {
  const dx = x2 - x1, dy = y2 - y1
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dy, y1 - b.y0], [dy, b.y1 - y1]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const r = q / p
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r } else { if (r < t0) return false; if (r < t1) t1 = r }
  }
  return t0 <= t1
}
const ownedBy = (l, o) => o.owner != null && String(l.key ?? '').startsWith(`${o.owner}|`)

export function resolveCollisions(labels, measure, obstacles = [], { bounds = null } = {}) {
  const placed = []
  const boxes = obstacles.filter(o => !o.seg), segs = obstacles.filter(o => o.seg)
  // Outside the card (bounds = { x0, x1, y0, y1 }) counts as a collision: a label never
  // flies above the plot to avoid a curve.
  const outside = l => {
    if (!bounds) return false
    const w = measure(l.text, l.size), x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
    return x0 < bounds.x0 || x0 + w > bounds.x1 || l.y - l.size * 0.8 < bounds.y0 || l.y + l.size * 0.25 > bounds.y1
  }
  const hitsBox = l => {
    const b = boxOf(l, measure)
    return outside(l) || placed.some(p => overlaps(boxOf(p, measure), b)) || boxes.some(o => overlaps(o, b))
  }
  const hitsSeg = l => { const b = boxOf(l, measure); return segs.some(o => !ownedBy(l, o) && segmentHitsBox(o.seg, b)) }
  const hits = l => hitsBox(l) || hitsSeg(l)
  // Move up one line, at most three times, until a free spot (curves included);
  // failing that, the first spot without another label (the curve passes, the figure stays readable).
  const climb = (l, strict) => {
    const y0 = l.y, dir = l.below ? 1 : -1
    for (let i = 1; i <= 3; i++) { l.y = y0 + dir * i * (l.size + 3); if (!hits(l)) return true }
    l.y = y0
    if (strict) return false
    // Fine vertical shift first (above, within the reserved margin, without leaving the
    // card): the figure stays aligned with its bar; a sideways shift is only a last resort.
    if (bounds && hitsBox(l)) {
      const step = Math.max(2, l.size / 4), far = 3 * (l.size + 3)
      for (const ok of [l2 => !hits(l2), l2 => !hitsBox(l2)]) {
        for (let d = step; d <= far; d += step) {
          l.y = y0 + dir * d
          if (outside(l)) break
          if (ok(l)) return true
        }
      }
      l.y = y0
    }
    // Within the card bounds: shift left or right (the text still covers its
    // point) before moving up; a label never moves up out of the card.
    if (bounds && hitsBox(l)) {
      const w = measure(l.text, l.size), x0 = l.x
      for (let i = 1; i <= 4; i++) {
        for (const d of [-1, 1]) { l.x = x0 + d * i * w / 8; if (!hitsBox(l)) return true }
      }
      l.x = x0
    }
    for (let i = 1; i <= 3 && hitsBox(l); i++) {
      l.y = y0 + dir * i * (l.size + 3)
      if (outside(l)) { l.y = y0 + dir * (i - 1) * (l.size + 3); break }
    }
    return true
  }
  const byX = arr => [...arr].sort((a, b) => boxOf(a, measure).x0 - boxOf(b, measure).x0)
  const kept = new Set()
  // Left or right offset of crowded labels:
  // two tight figures move apart in opposite directions, flush with their point.
  const shift = l => {
    if (!l.shiftable || l.anchor !== 'middle') return false
    const x0 = l.x
    const ok = [['start', x0 + 3], ['end', x0 - 3]].find(([a, x]) => { l.anchor = a; l.x = x; return !hits(l) })
    if (ok) return true
    l.anchor = 'middle'; l.x = x0
    // The neighbor already placed moves away too, on the other side (both move, neither disappears).
    const lb = boxOf(l, measure)
    const p = placed.find(q => q.shiftable && q.anchor === 'middle' && overlaps(boxOf(q, measure), lb))
    if (!p) return false
    const right = l.x >= p.x
    const px0 = p.x
    Object.assign(p, { anchor: right ? 'end' : 'start', x: px0 + (right ? 1 : -1) })
    Object.assign(l, { anchor: right ? 'start' : 'end', x: x0 + (right ? 1 : -1) })
    const pb = boxOf(p, measure)
    const pOk = !placed.some(q => q !== p && overlaps(boxOf(q, measure), pb)) && !obstacles.some(o => overlaps(o, pb))
    if (pOk && !hits(l)) return true
    Object.assign(p, { anchor: 'middle', x: px0 })
    Object.assign(l, { anchor: 'middle', x: x0 })
    return false
  }
  for (const l of byX(labels.filter(x => !x.droppable))) {
    // A fallback position (inside the top of the bar) before moving upwards.
    if (l.alt && hits(l)) {
      const keep = { y: l.y, color: l.color }
      Object.assign(l, { y: l.alt.y, color: l.alt.color, on: l.alt.on })
      if (!hits(l)) { placed.push(l); kept.add(l); continue }
      Object.assign(l, keep); delete l.on
    }
    // Then left or right, before moving up one line.
    if (hits(l) && shift(l)) { placed.push(l); kept.add(l); continue }
    if (hits(l)) climb(l, false)
    placed.push(l); kept.add(l)
  }
  // Keep priority of optional figures (`rank`, smallest first: first
  // category, then extremes), then from left to right.
  const byRank = arr => byX(arr).sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9))
  for (const l of byRank(labels.filter(x => x.droppable))) {
    if (!hits(l)) { placed.push(l); kept.add(l); continue }
    // Left or right offset before giving up:
    // two tight figures move apart in opposite directions rather than one disappearing.
    if (shift(l)) { placed.push(l); kept.add(l); continue }
    // Only a curve crosses it: it moves above rather than disappearing.
    if (!hitsBox(l) && climb(l, true)) { placed.push(l); kept.add(l) }
  }
  return labels.filter(l => kept.has(l))
}

/**
 * The leader line of a figure shifted sideways: if the
 * label has moved more than `half` (half a column) from its original spot (px, py) and no
 * longer covers its point, a short line runs from the top of the bar to the nearest edge of the text.
 * Returns `{ x1, y1, x2, y2 } | null`.
 */
export function leaderLine(l, measure, half) {
  if (l.anchor !== 'middle' || l.px == null || Math.abs(l.x - l.px) <= half) return null
  const w = measure(l.text, l.size), x0 = l.x - w / 2
  const y1 = l.below ? l.py - l.size - 1 : l.py + 3
  const x2 = Math.max(x0, Math.min(x0 + w, l.px)), y2 = Math.max(l.y - l.size * 0.75, Math.min(l.y + 2, y1))
  return Math.hypot(x2 - l.px, y2 - y1) > 6 ? { x1: l.px, y1, x2, y2 } : null
}
