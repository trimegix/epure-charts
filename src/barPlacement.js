// ─── epure-charts · where to put a format bar: pure geometry ────────────────────
// No DOM, no React (tested in barPlacement.test.mjs). useWheelPlacement measures,
// these functions decide.
//   · barSpot: among candidate spots around the target (above, below, left,
//     right, then sliding away in 12 px steps), bounded by the card and the viewport,
//     picks the one covering the fewest weighted marks (the target: never; labels, annotations,
//     legend, ticks: heavily; bars: lightly), the nearest on a tie.
//   · nextCompactLevel: the bar's compact level given the room in the card;
//   · compactValue: a control's value at a compact level (its name drops only if the value stands alone).

const STEP = 12
const SLIDES = 6

/** Weighted area covered by the rectangle [l, t, w, h]. */
export function coverOf(l, t, w, h, marks = []) {
  let sum = 0
  for (const m of marks) {
    const ix = Math.min(l + w, m.x + m.w) - Math.max(l, m.x)
    if (ix <= 0) continue
    const iy = Math.min(t + h, m.y + m.h) - Math.max(t, m.y)
    if (iy <= 0) continue
    // A label, a tick or a curve (weight ≥ 2) counts 10 times: covering one costs
    // more than covering a good part of a bar, which stays readable.
    const wt = m.weight ?? 1
    sum += ix * iy * (wt >= 2 && wt < 1000 ? wt * 10 : wt)
  }
  return sum
}

/**
 * Position of a target's format bar.
 *   T: the target box { x, y, w, h }; box: the card { left, right, top, bottom };
 *   w, h: the bar; cap: its maximum width; marks: [{ x, y, w, h, weight }];
 *   vw, vh: the viewport (a bar never leaves it if another spot exists).
 * → { left, top, side } (side: 'above' | 'below' | 'left' | 'right').
 */
export function barSpot({ T, box, w, h, cap = Infinity, marks = [], vw = Infinity, vh = Infinity }) {
  const fw = Math.min(w, cap)
  const L0 = box.left + 8
  const R0 = box.right - 8
  // Bounded by the card: never past its right edge; too wide, aligned left.
  const clampX = l => Math.max(L0, Math.min(l, R0 - fw))
  const onLeft = T.x + T.w / 2 < (box.left + box.right) / 2
  const xs = [...new Set((onLeft ? [T.x, T.x + T.w / 2 - fw / 2, T.x + T.w - fw] : [T.x + T.w - fw, T.x + T.w / 2 - fw / 2, T.x]).map(clampX))]
  const cands = []
  for (let k = 0; k <= SLIDES; k++) {
    for (const l of xs) cands.push([l, T.y - h - 4 - k * STEP, 'above'])
    for (const l of xs) cands.push([l, T.y + T.h + 4 + k * STEP, 'below'])
  }
  // To the side: top, middle or bottom of the target, then sliding.
  const sideTops = [T.y + T.h / 2 - h / 2, T.y, T.y + T.h - h]
  for (const [l, side] of [[T.x - fw - 6, 'left'], [T.x + T.w + 6, 'right']]) {
    for (const t of sideTops) cands.push([l, t, side])
  }
  const score = ([l, t], i) => {
    const outBox = Math.max(0, box.top - t) + Math.max(0, t + h - box.bottom) + Math.max(0, L0 - l) + Math.max(0, l + fw - R0)
    const outView = Math.max(0, 8 - t) + Math.max(0, t + h - (vh - 8)) + Math.max(0, 8 - l) + Math.max(0, l + fw - (vw - 8))
    const gx = Math.max(0, T.x - (l + fw), l - (T.x + T.w))
    const gy = Math.max(0, T.y - (t + h), t - (T.y + T.h))
    return coverOf(l, t, fw, h, marks) + outBox * 1e5 + outView * 1e6 + Math.hypot(gx, gy) * 6 + i * 0.01
  }
  let best = null
  cands.forEach((c, i) => {
    const s = score(c, i)
    if (!best || s < best.s) best = { s, c }
  })
  const [left, top, side] = best.c
  return { left, top, side }
}

/** A curve as small marks along its segments (12 px step), so the bar avoids it. */
export function lineMarks(points = [], weight = 2) {
  const out = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP))
    for (let j = 0; j <= n; j++) {
      const x = a.x + ((b.x - a.x) * j) / n
      const y = a.y + ((b.y - a.y) * j) / n
      out.push({ x: x - 6, y: y - 6, w: 12, h: 12, weight })
    }
  }
  return out
}

/**
 * Next compact level, pure: `seen[l]` = { w: natural width at level l, cut: a value
 * exceeds its maximum width }, `room` = the available room. Rises while it overflows, falls back
 * as soon as the previous level fits.
 */
export function nextCompactLevel(level, seen, room) {
  const cur = seen[level]
  if (!cur) return level
  if (cur.w > room + 1 && level < 3) return level + 1
  if (cur.cut && level < 1) return 1
  if (level > 0) {
    const prev = seen[level - 1]
    if (!prev || (prev.w <= room + 1 && !(level - 1 === 0 && prev.cut))) return level - 1
  }
  return level
}

// A self-sufficient value: what it sets is clear without its name. Fiscal year (FY Apr), date or
// date range (10 Feb 2025, … → …), scale units (Year + Quarter), language.
const SELF_SUFFICIENT = [
  /^FY [A-Z][a-z]{2}$/,
  /→/,
  /^\d{1,2} [A-Z][a-z]{2,3}\.?( \d{2,4})?$/,
  /^(Year|Quarter|Month|Week|Day)( \+ (Year|Quarter|Month|Week|Day))+$/,
  /^(English|Français|Deutsch)$/,
]

/**
 * "Year: FY Apr" → "FY Apr" from level 1 on; any other value keeps its short name
 * ("Scale: auto – €150M", "Values: absolute", "Fill: blue", "Shape: bar"):
 * the bar then folds controls behind "⋯" rather than making them mute.
 */
export function compactValue(value, level) {
  if (level < 1 || typeof value !== 'string') return value
  const m = /^([^:]{1,28}):\s+(.*)$/.exec(value)
  if (!m) return value
  const v = m[2].trim()
  return SELF_SUFFICIENT.some(re => re.test(v)) ? v : value
}
