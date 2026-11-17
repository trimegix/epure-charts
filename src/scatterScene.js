// ─── epure-charts · the scene of a scatter / bubble chart ───────────────────
// buildScatterScene(spec, points, { width, height, format, formatX, formatSize }) → pure geometry:
//   { width, height, plot, axes, gridlines, points, labels, trend, partitions, zones, legend, sizeLegend, empty, scale, invert }
//
// spec: {
//   x?: { title, min, max, log }, y?: { title, min, max, log }
//   bubble?: true          point size follows point.size
//   sizeBy?: 'area'|'diameter'   area (default) or diameter proportional to size
//   bubbleScale?: 0.2..4   bubble size factor
//   labels?: 'all'|'none'  point labels (placed without overlap, leader line if moved away);
//                          beyond 300 points, off by default, re-enabled with 'all'
//   labelContent?: ['name'|'x'|'y'|'size', …]   label content (default: the name)
//   label2?: ['name'|'x'|'y'|'size', …]         second label line (two labels per point)
//   labelOffsets?: { [key]: { dx, dy } }        labels placed by hand (px, from the point)
//   trend?: true|'linear'|'exp'|'power'|'log'|'poly2'|'poly3'|'poly4'   trend line
//   trendLabel?: 'none'|'equation'|'r2'|'both'  equation and / or R² at the end of the line
//   trendWeighted?: true   trend weighted by bubble size (weighted least squares)
//   trendGroup?: string    trend of a single group (partition type → group trend)
//   sizeLegend?: number    value of the reference bubble (size legend handle)
//   trendFill?: 'above'|'below', trendFillColor?: token   colored area above / below
//   partitions?: { x?, y? } | [{ key, axis: 'x'|'y', value } | { key, axis: 'line', from: { x, y }, to: { x, y } }]
//   zones?: { [zoneKey]: { fill?: token, label?: string } }   background and label of partition zones
//   legend?: 'top'|'none'  group legend
//   marker?: 'circle'|'square'|'diamond'|'triangle'|'none'
//   markers?: 'group'      one shape per group (marker scheme)
//   front?: [keys], back?: [keys]   drawing order (foreground / background)
//   dataFill?: false       ignore the sheet's colors (point.color)
//   locale?: 'en'|'fr'     ticks, labels, trend equation and R² in the chart's language
//   accent?: 'single', emphasis?: [point keys or group names]   one accent color, the rest neutral
// }
// points: [{ key, label, x, y, size?, group?, color? }]; groups → categorical colors.
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): labels are measured
// and avoid each other at their actual size (labelMetrics), line height included (label.lineH).
// Pure, tested under node --test.
import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale'
import { estimateWidth, defaultFormat } from './scene.js'
import { labelMetrics } from './customStyle.js'
import { segmentHitsBox } from './labelLayout.js'
import { localeOf, localizedFormat, localizeNumber, t } from './locale.js'
import { accentColor, emphasisOf } from './accent.js'
import { stamp } from './figureMeta.js'

const CAT = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
const SHAPES = ['circle', 'square', 'diamond', 'triangle']
const FONT = 11
// The trend equation: 10.5 px in a monospace font (0.6 em per character), 13 px line height.
const EQ_LH = 13
const eqWidth = t => String(t ?? '').length * 10.5 * 0.6
/** The box of the trend equation (right-anchored, baseline of the first line at y). */
export function trendLabelBox(L) {
  const tw = Math.max(...(L.lines ?? [L.text]).map(eqWidth))
  return { x0: L.x - tw - 2, x1: L.x + 2, y0: L.y - 11, y1: L.y + 3 + ((L.lines?.length ?? 1) - 1) * (L.lineH ?? EQ_LH) }
}
const LINE_H = 12
const LEGEND_ROW = 18
export const TREND_TYPES = ['linear', 'exp', 'power', 'log', 'poly2', 'poly3', 'poly4']

function axisScale(o = {}, vals, range) {
  let lo = Number.isFinite(o.min) ? o.min : Math.min(...vals)
  let hi = Number.isFinite(o.max) ? o.max : Math.max(...vals)
  if (lo === hi) { lo -= 1; hi += 1 }
  const log = !!o.log && lo > 0
  if (!Number.isFinite(o.min) && !log) lo -= (hi - lo) * 0.06
  if (!Number.isFinite(o.max) && !log) hi += (hi - lo) * 0.06
  const s = (log ? scaleLog() : scaleLinear()).domain([lo, hi]).range(range)
  if (!Number.isFinite(o.min) && !Number.isFinite(o.max) && !log) s.nice(5)
  const ticks = log ? s.ticks().filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9) : s.ticks(Math.max(2, Math.min(7, Math.floor(Math.abs(range[1] - range[0]) / 70))))
  return { s, ticks, log }
}

// ── Trends: least squares, computed the way Excel does ─────────────────────
/** Solves A·x = b (Gaussian elimination with partial pivoting); null if singular. */
function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}
/** Coefficients [a0, a1, …] of the degree-`deg` polynomial closest to the points. */
export function polyfit(xs, ys, deg, ws = null) {
  if (new Set(xs).size <= deg) return null
  const w = k => (ws ? ws[k] : 1)
  const A = Array.from({ length: deg + 1 }, (_, i) => Array.from({ length: deg + 1 }, (_, j) => xs.reduce((t, x, k) => t + w(k) * x ** (i + j), 0)))
  const b = Array.from({ length: deg + 1 }, (_, i) => xs.reduce((t, x, k) => t + w(k) * ys[k] * x ** i, 0))
  return solve(A, b)
}
const r2Of = (ys, fit, ws = null) => {
  const w = k => (ws ? ws[k] : 1)
  const W = ys.reduce((t, _, k) => t + w(k), 0)
  const m = ys.reduce((t, y, k) => t + w(k) * y, 0) / W
  const sst = ys.reduce((t, y, k) => t + w(k) * (y - m) ** 2, 0)
  const ssr = ys.reduce((t, y, i) => t + w(i) * (y - fit[i]) ** 2, 0)
  return sst ? 1 - ssr / sst : 1
}
const num = v => {
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2)
  return String(Number(v.toPrecision(3)))
}
const SUP = { 2: '²', 3: '³', 4: '⁴' }
/** A sum of signed terms: "2x² − 3x + 1". */
const terms = list => list.filter(([c]) => c !== 0).map(([c, t], i) => {
  const s = c < 0 ? (i ? ' − ' : '−') : (i ? ' + ' : '')
  const a = Math.abs(c)
  return `${s}${t && num(a) === '1' ? '' : num(a)}${t}`
}).join('') || '0'

/**
 * fitTrend(type, points, { weighted }) → { type, f, coef, r2, equation } | null.
 * R² as in Excel: in linearized space for exp and power (ln y), otherwise on y.
 * weighted: each point weighs its size (trend weighted by bubble size).
 */
export function fitTrend(type = 'linear', ptsIn = [], { weighted = false } = {}) {
  const pts = weighted ? ptsIn.filter(p => Number.isFinite(p.size) && Math.abs(p.size) > 0) : ptsIn
  const wOf = list => (weighted ? list.map(p => Math.abs(p.size)) : null)
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  if (type === 'linear' || /^poly[2-4]$/.test(type)) {
    const deg = type === 'linear' ? 1 : Number(type.slice(4))
    const c = polyfit(xs, ys, deg, wOf(pts))
    if (!c) return null
    const f = x => c.reduce((t, a, i) => t + a * x ** i, 0)
    const eq = `y = ${terms(c.map((a, i) => [a, i === 0 ? '' : i === 1 ? 'x' : `x${SUP[i]}`]).reverse())}`
    return { type, f, coef: c, r2: r2Of(ys, xs.map(f), wOf(pts)), equation: eq }
  }
  if (type === 'exp') {
    const ok = pts.filter(p => p.y > 0)
    const c = polyfit(ok.map(p => p.x), ok.map(p => Math.log(p.y)), 1, wOf(ok))
    if (!c) return null
    const a = Math.exp(c[0]), b = c[1]
    return { type, f: x => a * Math.exp(b * x), coef: [a, b], r2: r2Of(ok.map(p => Math.log(p.y)), ok.map(p => c[0] + b * p.x), wOf(ok)), equation: `y = ${num(a)}e^(${num(b)}x)` }
  }
  if (type === 'power') {
    const ok = pts.filter(p => p.y > 0 && p.x > 0)
    const c = polyfit(ok.map(p => Math.log(p.x)), ok.map(p => Math.log(p.y)), 1, wOf(ok))
    if (!c) return null
    const a = Math.exp(c[0]), b = c[1]
    return { type, f: x => (x > 0 ? a * x ** b : NaN), coef: [a, b], r2: r2Of(ok.map(p => Math.log(p.y)), ok.map(p => c[0] + b * Math.log(p.x)), wOf(ok)), equation: `y = ${num(a)}x^${num(b)}` }
  }
  if (type === 'log') {
    const ok = pts.filter(p => p.x > 0)
    const c = polyfit(ok.map(p => Math.log(p.x)), ok.map(p => p.y), 1, wOf(ok))
    if (!c) return null
    const f = x => (x > 0 ? c[0] + c[1] * Math.log(x) : NaN)
    return { type, f, coef: c, r2: r2Of(ok.map(p => p.y), ok.map(p => f(p.x)), wOf(ok)), equation: `y = ${terms([[c[1], ' ln(x)'], [c[0], '']])}` }
  }
  return null
}

// ── Partitions and zones ───────────────────────────────────────────────────
/** Partitions as a list (accepts the legacy { x, y }). */
export function normPartitions(p) {
  if (!p) return []
  if (Array.isArray(p)) return p.filter(Boolean)
  return [
    ...(Number.isFinite(p.x) ? [{ key: 'x', axis: 'x', value: p.x }] : []),
    ...(Number.isFinite(p.y) ? [{ key: 'y', axis: 'y', value: p.y }] : []),
  ]
}
/** Clips a polygon by the half-plane side·((q − a) × d) ≥ 0 (Sutherland–Hodgman, a single plane). */
function clipHalf(poly, a, d, side) {
  const val = q => side * (d.x * (q.y - a.y) - d.y * (q.x - a.x))
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    const vp = val(p), vq = val(q)
    if (vp >= 0) out.push(p)
    if ((vp >= 0) !== (vq >= 0)) { const t = vp / (vp - vq); out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }) }
  }
  return out
}
/** The (infinite) line through a and b, clipped to the plot rectangle; null if it misses it. */
function clipLine(a, b, plot) {
  const dx = b.x - a.x, dy = b.y - a.y
  if (!dx && !dy) return null
  let t0 = -Infinity, t1 = Infinity
  for (const [p, q] of [[-dx, a.x - plot.left], [dx, plot.right - a.x], [-dy, a.y - plot.top], [dy, plot.bottom - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
  }
  if (t0 > t1) return null
  return { x1: a.x + t0 * dx, y1: a.y + t0 * dy, x2: a.x + t1 * dx, y2: a.y + t1 * dy }
}
const pathOf = poly => (poly.length ? `M${poly.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' L')} Z` : '')
const centroid = poly => ({ x: poly.reduce((t, q) => t + q.x, 0) / poly.length, y: poly.reduce((t, q) => t + q.y, 0) / poly.length })

/** Constrains a segment a → b to an angle that is a multiple of `step` degrees (Shift-drag), length kept. */
export function constrainAngle(a, b, step = 15) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ang = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI / step) * step * (Math.PI / 180)
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len }
}
/**
 * Snapping of a partition end (handles snapped to values):
 * to the nearest data point within `tol` px, otherwise to the round value
 * (3 significant digits). q in px; returns { x, y } in values and `snapped` (the point key).
 */
export function snapEndpoint(scene, q, tol = 8) {
  let best = null, bd = tol
  for (const p of scene?.points ?? []) {
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d <= bd) { bd = d; best = p }
  }
  if (best) return { x: best.vx, y: best.vy, snapped: best.key }
  return { x: Number(scene.invert.x(q.x).toPrecision(3)), y: Number(scene.invert.y(q.y).toPrecision(3)), snapped: null }
}
/** The same on a single axis (vertical or horizontal partition): the value of a nearby point. */
export function snapValue(scene, axis, px, tol = 6) {
  let best = null, bd = tol
  for (const p of scene?.points ?? []) {
    const d = Math.abs((axis === 'x' ? p.x : p.y) - px)
    if (d <= bd) { bd = d; best = p }
  }
  if (best) return axis === 'x' ? best.vx : best.vy
  return Number((axis === 'x' ? scene.invert.x(px) : scene.invert.y(px)).toPrecision(3))
}
/** The value of the reference bubble when its edge is dragged to `dist` px (size legend handle). */
export function sizeLegendFromDrag(scene, dist) {
  const inv = scene?.sizeInvert
  if (!inv) return null
  const v = inv(Math.max(3, Math.min(12, dist)))
  return v > 0 ? Number(v.toPrecision(2)) : null
}
/** The bubble size factor when the edge of a bubble of radius r is dragged to `dist` px. */
export function bubbleScaleFromDrag(scale0 = 1, r, dist) {
  if (!(r > 0)) return scale0
  return Math.min(4, Math.max(0.2, Number((scale0 * (dist / r)).toFixed(2))))
}

export function buildScatterScene(spec = {}, pointsIn = [], opts = {}) {
  const width = Math.max(220, Math.round(opts.width ?? 560))
  const height = Math.max(180, Math.round(opts.height ?? 320))
  const L = localeOf(spec)
  const fy = localizedFormat(opts.format ?? defaultFormat, L)
  const fx = localizedFormat(opts.formatX ?? opts.format ?? defaultFormat, L)
  const fs = localizedFormat(opts.formatSize ?? defaultFormat, L)
  const LM = labelMetrics(opts.labelStyle ?? spec, FONT)
  const lineH = LM.base ? LINE_H : LM.size + 1
  const pts = pointsIn.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  const base = { width, height, plot: null, axes: null, gridlines: [], points: [], labels: [], trend: null, partitions: [], zones: [], legend: [], sizeLegend: [], empty: !pts.length }
  if (base.empty) return stamp(base, 'scatter', spec)

  const groups = [...new Set(pts.map(p => p.group ?? ''))]
  const gi = p => Math.max(0, groups.indexOf(p.group ?? ''))
  const dataFill = spec.dataFill !== false
  // Single accent: a point is emphasized by its own key or by its group's name.
  const em = emphasisOf(spec)
  const colorOf = p => accentColor(spec, em.has(String(p.key)) ? p.key : (p.group ?? p.key), (dataFill && p.color) || CAT[gi(p) % CAT.length])
  const byGroup = spec.markers === 'group'
  const shapeOf = p => (byGroup ? SHAPES[gi(p) % SHAPES.length] : (spec.marker ?? 'circle'))
  const legendOn = (spec.legend ?? 'top') !== 'none' && groups.length > 1
  let lx = 0, lrow = 0
  if (legendOn) {
    base.legend = groups.map((g, i) => {
      const w = 16 + estimateWidth(g, FONT)
      if (lx > 0 && lx + w > width) { lx = 0; lrow++ }
      const it = { key: g || `g${i}`, label: g, color: accentColor(spec, g, CAT[i % CAT.length]), shape: byGroup ? SHAPES[i % SHAPES.length] : 'circle', x: lx, y: lrow * LEGEND_ROW + 9 }
      lx += w + 16
      return it
    })
  }
  const legendH = legendOn ? (lrow + 1) * LEGEND_ROW + 6 : 0
  const yTitle = spec.y?.title ? 16 : 0
  const xTitle = spec.x?.title ? 16 : 0
  const yTickW = 46
  // Bubbles: a band at the top for the size legend, outside the plot (it hides no point).
  const bubble = !!spec.bubble && pts.some(p => Number.isFinite(p.size))
  const bubbleBand = bubble ? 30 : 0
  const plot = { left: yTickW + yTitle, right: width - 12, top: legendH + 10 + bubbleBand, bottom: height - 22 - xTitle }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot

  const X = axisScale(spec.x, pts.map(p => p.x), [plot.left, plot.right])
  const Y = axisScale(spec.y, pts.map(p => p.y), [plot.bottom, plot.top])
  base.axes = {
    x: { y: plot.bottom, ticks: X.ticks.map(v => ({ value: v, x: X.s(v), label: fx(v) })), title: spec.x?.title ?? null },
    y: { x: plot.left, ticks: Y.ticks.map(v => ({ value: v, y: Y.s(v), label: fy(v) })), title: spec.y?.title ?? null },
  }
  // Shared scale: a discreet note at the end of each linked axis.
  base.shared = { x: spec.x?.same ? t('shared scale', L) : null, y: spec.y?.same ? t('shared scale', L) : null }
  base.gridlines = [
    ...Y.ticks.map(v => ({ x1: plot.left, x2: plot.right, y1: Y.s(v), y2: Y.s(v) })),
    ...X.ticks.map(v => ({ x1: X.s(v), x2: X.s(v), y1: plot.top, y2: plot.bottom })),
  ]

  // Bubbles: area (square root) or diameter (linear) follows size, bounded to stay readable.
  const maxSize = bubble ? Math.max(...pts.map(p => Math.abs(p.size ?? 0))) : 0
  const rMax = Math.min(plot.width, plot.height) * 0.09 * (spec.bubbleScale ?? 1)
  const R = (spec.sizeBy === 'diameter' ? scaleLinear() : scaleSqrt()).domain([0, maxSize || 1]).range([0, rMax])
  const all = pts.map(p => ({
    key: p.key, label: p.label, label2: p.label2 ?? null, x: X.s(p.x), y: Y.s(p.y), vx: p.x, vy: p.y, size: p.size ?? null,
    r: bubble ? Math.max(3, R(Math.abs(p.size ?? 0))) : 4.5, color: colorOf(p), group: p.group ?? null,
    shape: bubble ? 'circle' : shapeOf(p),
  }))
  // Drawing order: large bubbles behind, then "background" / "foreground" set by hand.
  const front = spec.front ?? [], back = spec.back ?? []
  const rank = p => (back.includes(p.key) ? -1000 + back.indexOf(p.key) : front.includes(p.key) ? 1000 + front.indexOf(p.key) : 0)
  base.points = all.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || (bubble ? b.p.r - a.p.r : 0) || a.i - b.i).map(o => o.p)
  if (bubble) {
    // The reference bubble: the largest, or the value set with the handle (spec.sizeLegend).
    const main = Number.isFinite(spec.sizeLegend) && spec.sizeLegend > 0 ? spec.sizeLegend : maxSize
    const ref = [main, main / 4].filter(v => v > 0)
    base.sizeInvert = r => R.invert(r)
    // Two reference circles side by side, in the band above the plot, on the right.
    let sx = plot.right
    base.sizeLegend = ref.map(v => {
      const r = Math.min(R(v), 12)
      const text = fs(v)
      sx -= 2 * r + 12 + estimateWidth(text, 9.5)
      return { value: v, r, x: sx + r, y: plot.top - 16, text }
    })
  }

  // Trend: fitted on values (not pixels), drawn over the whole x domain.
  const ttype = spec.trend === true ? 'linear' : spec.trend
  // Trend of a single group (if the group exists), weighted by size (if bubbles).
  const tGroup = spec.trendGroup != null && groups.includes(spec.trendGroup) ? spec.trendGroup : null
  const tPts = tGroup != null ? pts.filter(p => (p.group ?? '') === tGroup) : pts
  const fit = ttype ? fitTrend(ttype, tPts, { weighted: !!spec.trendWeighted && bubble }) : null
  if (fit) {
    const [d0, d1] = X.s.domain()
    const N = ttype === 'linear' ? 2 : 80
    const xsS = Array.from({ length: N }, (_, i) => (X.log ? d0 * (d1 / d0) ** (i / (N - 1)) : d0 + ((d1 - d0) * i) / (N - 1)))
    const lim = v => Math.max(plot.top - plot.height * 2, Math.min(plot.bottom + plot.height * 2, v))
    const curve = xsS.map(x => ({ vx: x, vy: fit.f(x) })).filter(q => Number.isFinite(q.vy) && (!Y.log || q.vy > 0)).map(q => ({ x: X.s(q.vx), y: lim(Y.s(q.vy)) }))
    if (curve.length >= 2) {
      const d = `M${curve.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' L')}`
      const equation = localizeNumber(fit.equation, L)
      const tr = { type: ttype, d, coef: fit.coef, r2: fit.r2, equation, fill: null, label: null, group: tGroup, weighted: !!spec.trendWeighted && bubble, color: tGroup != null ? accentColor(spec, tGroup, CAT[groups.indexOf(tGroup) % CAT.length]) : null }
      if (ttype === 'linear') Object.assign(tr, { x1: curve[0].x, y1: curve[0].y, x2: curve.at(-1).x, y2: curve.at(-1).y, slope: fit.coef[1], intercept: fit.coef[0] })
      if (spec.trendFill === 'above' || spec.trendFill === 'below') {
        const edge = spec.trendFill === 'above' ? plot.top - plot.height * 2 : plot.bottom + plot.height * 2
        tr.fill = { side: spec.trendFill, color: spec.trendFillColor ?? 'cat-1', d: `${d} L${curve.at(-1).x.toFixed(1)},${edge} L${curve[0].x.toFixed(1)},${edge} Z` }
      }
      const show = spec.trendLabel ?? 'none'
      if (show !== 'none') {
        const r2t = `R² = ${localizeNumber(fit.r2.toFixed(3), L)}`
        const text = show === 'equation' ? equation : show === 'r2' ? r2t : `${equation}   ${r2t}`
        // Equation and R²: on two lines (narrower, fits in a quadrant).
        const lines = show === 'both' ? [equation, r2t] : [text]
        const inPlot = curve.filter(q => q.y >= plot.top + 14 && q.y <= plot.bottom - 4)
        const at = inPlot.at(-1) ?? curve.at(-1)
        const tw = Math.max(...lines.map(eqWidth))
        tr.label = { x: Math.max(plot.left + tw, Math.min(plot.right - 2, at.x)), y: Math.max(plot.top + 28, Math.min(plot.bottom - 4, at.y - 8)), text, lines, lineH: EQ_LH, anchor: 'end' }
      }
      base.trend = tr
    }
  }

  // Partitions: vertical, horizontal and oblique (line through two points, extended to the plot).
  const parts = normPartitions(spec.partitions)
  for (const pa of parts) {
    if (pa.axis === 'x' && Number.isFinite(pa.value)) base.partitions.push({ key: pa.key ?? 'x', axis: 'x', value: pa.value, x1: X.s(pa.value), x2: X.s(pa.value), y1: plot.top, y2: plot.bottom, text: fx(pa.value) })
    else if (pa.axis === 'y' && Number.isFinite(pa.value)) base.partitions.push({ key: pa.key ?? 'y', axis: 'y', value: pa.value, x1: plot.left, x2: plot.right, y1: Y.s(pa.value), y2: Y.s(pa.value), text: fy(pa.value) })
    else if (pa.axis === 'line' && pa.from && pa.to) {
      const h1 = { x: X.s(pa.from.x), y: Y.s(pa.from.y) }, h2 = { x: X.s(pa.to.x), y: Y.s(pa.to.y) }
      const seg = [h1.x, h1.y, h2.x, h2.y].every(Number.isFinite) ? clipLine(h1, h2, plot) : null
      if (seg) base.partitions.push({ key: pa.key, axis: 'line', from: pa.from, to: pa.to, h1, h2, ...seg })
    }
  }
  // Zones: the cells cut out by the vertical and horizontal partitions…
  const zs = spec.zones ?? {}
  const vx = [...new Set(base.partitions.filter(p => p.axis === 'x' && p.x1 > plot.left && p.x1 < plot.right).map(p => p.x1))].sort((a, b) => a - b)
  const hy = [...new Set(base.partitions.filter(p => p.axis === 'y' && p.y1 > plot.top && p.y1 < plot.bottom).map(p => p.y1))].sort((a, b) => a - b)
  if (vx.length || hy.length) {
    const xs = [plot.left, ...vx, plot.right], ys = [plot.top, ...hy, plot.bottom]
    const nx = xs.length - 1, ny = ys.length - 1
    const name = (i, j) => (nx === 2 && ny === 2 ? ['tl', 'tr', 'bl', 'br'][j * 2 + i] : nx === 2 && ny === 1 ? ['left', 'right'][i] : nx === 1 && ny === 2 ? ['top', 'bottom'][j] : `${i}-${j}`)
    const mx = (plot.left + plot.right) / 2, my = (plot.top + plot.bottom) / 2
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const key = name(i, j)
        const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1]
        const z = zs[key] ?? {}
        const left = (x0 + x1) / 2 <= mx, top = (y0 + y1) / 2 <= my
        base.zones.push({
          key, kind: 'cell', x: x0, y: y0, w: x1 - x0, h: y1 - y0, d: pathOf([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]),
          fill: z.fill ?? null,
          // Label at the outer corner of the zone (naming a quadrant).
          label: z.label ? { text: z.label, x: left ? x0 + 6 : x1 - 6, y: top ? y0 + 14 : y1 - 6, anchor: left ? 'start' : 'end' } : null,
        })
      }
    }
  }
  // … and both sides of each oblique partition ("above" / "below").
  const rect = [{ x: plot.left, y: plot.top }, { x: plot.right, y: plot.top }, { x: plot.right, y: plot.bottom }, { x: plot.left, y: plot.bottom }]
  for (const pa of base.partitions.filter(p => p.axis === 'line')) {
    let d = { x: pa.h2.x - pa.h1.x, y: pa.h2.y - pa.h1.y }
    if (d.x < 0 || (d.x === 0 && d.y > 0)) d = { x: -d.x, y: -d.y }
    for (const [side, sgn] of [['above', -1], ['below', 1]]) {
      const key = `${side}:${pa.key}`
      const z = zs[key] ?? {}
      if (!z.fill && !z.label) continue
      const poly = clipHalf(rect, pa.h1, d, sgn)
      if (poly.length < 3) continue
      const c = centroid(poly)
      base.zones.push({ key, kind: 'side', line: pa.key, side, d: pathOf(poly), fill: z.fill ?? null, label: z.label ? { text: z.label, x: c.x, y: c.y, anchor: 'middle' } : null })
    }
  }
  base.scale = { x: v => X.s(v), y: v => Y.s(v) }
  // Labels: content (name, x, y, size) on one or two lines.
  const fmtPart = (p, k) => ({ name: p.label, x: fx(p.vx), y: fy(p.vy), size: p.size != null ? fs(p.size) : null }[k])
  const compose = (p, parts) => {
    if (!parts?.length) return null
    const vals = parts.filter(k => k !== 'name').map(k => fmtPart(p, k)).filter(v => v != null)
    const name = parts.includes('name') ? p.label : null
    if (name && vals.length) return `${name} (${vals.join(', ')})`
    return name ?? (vals.join(', ') || null)
  }
  // Plot lines (partitions, trend line) as segments: neither the equation nor a
  // point label crosses them.
  const lineSegs = base.partitions.map(pa => [pa.x1, pa.y1, pa.x2, pa.y2])
  if (base.trend?.d) {
    const tp = base.trend.d.slice(1).split(' L').map(q => q.split(',').map(Number))
    for (let i = 1; i < tp.length; i++) lineSegs.push([tp[i - 1][0], tp[i - 1][1], tp[i][0], tp[i][1]])
  }
  const zoneBoxes = base.zones.filter(z => z.label).map(z => {
    // Zone label in letter-spaced capitals (0.04 em): wider than regular text.
    const w = String(z.label.text).length * FONT * 0.72, x0 = z.label.anchor === 'start' ? z.label.x : z.label.anchor === 'end' ? z.label.x - w : z.label.x - w / 2
    return { x0: x0 - 2, x1: x0 + w + 2, y0: z.label.y - 11, y1: z.label.y + 3 }
  })
  const over = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  // The trend equation in a free area: never across a line (partition, trend),
  // a point or a zone label. Candidates: the corners of the plot and of each quadrant, above
  // and below the end of the trend, then along the curve.
  if (base.trend?.label) {
    const TL = base.trend.label
    const ptBoxes = base.points.map(q => ({ x0: q.x - q.r - 2, x1: q.x + q.r + 2, y0: q.y - q.r - 2, y1: q.y + q.r + 2 }))
    // The cost of a spot: 0 = free; a crossed line weighs more than a covered point or label.
    const cost = (lines, x, y) => {
      const b = trendLabelBox({ ...TL, lines, x, y })
      if (b.x0 < plot.left - 0.5 || b.x1 > plot.right + 0.5 || b.y0 < plot.top || b.y1 > plot.bottom) return Infinity
      return 10 * lineSegs.filter(sg => segmentHitsBox(sg, b)).length + ptBoxes.filter(o => over(b, o)).length + zoneBoxes.filter(o => over(b, o)).length
    }
    // Possible layouts: two lines (equation, R²), a single one, then the equation split
    // at its central operator (three lines, half as wide).
    const eqSplit = eq => {
      const ops = [...eq.matchAll(/ [+−-] /g)].map(m => m.index)
      if (!ops.length) return [eq]
      const mid = ops.reduce((a, i) => (Math.abs(i - eq.length / 2) < Math.abs(a - eq.length / 2) ? i : a))
      return [eq.slice(0, mid), eq.slice(mid + 1)]
    }
    const eqLines = TL.lines.length > 1 ? TL.lines.slice(0, -1).join(' ') : TL.text
    const variants = TL.lines.length > 1 ? [TL.lines, [TL.text], [...eqSplit(eqLines), TL.lines.at(-1)]] : [TL.lines, eqSplit(TL.text)]
    const candsFor = lines => {
    const tw = Math.max(...lines.map(eqWidth)), hh = (lines.length - 1) * EQ_LH
    const cands = []
    const cells = base.zones.filter(z => z.kind === 'cell')
    for (const z of [{ x: plot.left, y: plot.top, w: plot.width, h: plot.height }, ...cells]) {
      cands.push([z.x + z.w - 4, z.y + 14], [z.x + z.w - 4, z.y + z.h - 6 - hh], [z.x + tw + 6, z.y + 14], [z.x + tw + 6, z.y + z.h - 6 - hh])
      // Below / above the zone label placed in that corner.
      cands.push([z.x + z.w - 4, z.y + 30], [z.x + tw + 6, z.y + z.h - 22 - hh])
    }
    const tpts = base.trend.d.slice(1).split(' L').map(q => q.split(',').map(Number))
    const clampX = x => Math.max(plot.left + tw + 2, Math.min(plot.right - 2, x))
    const end = tpts.filter(([, y]) => y >= plot.top && y <= plot.bottom).at(-1) ?? tpts.at(-1)
    cands.unshift([clampX(end[0]), end[1] - 8 - hh], [clampX(end[0]), end[1] + 16])
    for (let i = tpts.length - 1; i >= 0; i--) for (const dy of [-8 - hh, 16]) cands.push([clampX(tpts[i][0]), tpts[i][1] + dy])
    if (tpts.length === 2) for (let f = 0.9; f > 0.1; f -= 0.1) { const x = tpts[0][0] + (tpts[1][0] - tpts[0][0]) * f, y = tpts[0][1] + (tpts[1][1] - tpts[0][1]) * f; cands.push([clampX(x), y - 8 - hh], [clampX(x), y + 16]) }
    return cands
    }
    // The first free spot of the first layout that has one; otherwise the least bad one.
    let best = null
    for (const v of variants) {
      for (const [x, y] of candsFor(v)) {
        const k = cost(v, x, y)
        if (!best || k < best.k) best = { v, x, y, k }
        if (k === 0) break
      }
      if (best?.k === 0) break
    }
    if (best && Number.isFinite(best.k)) Object.assign(TL, { lines: best.v, x: best.x, y: best.y })
    if (!best || best.k > 0) TL.crowded = true
  }
  // Beyond 300 points, labels are off by default; 'all' brings them back.
  base.labelsAuto = spec.labels == null && pts.length > 300 ? 'none' : 'all'
  base.noRoom = 0
  if ((spec.labels ?? base.labelsAuto) === 'all') {
    const noMarker = !bubble && spec.marker === 'none' && !byGroup
    const obstacles = noMarker ? [] : base.points.map(p => ({ x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r }))
    // Obstacles placed before the labels: the trend equation, the partition
    // lines and the (sampled) trend line; no label crosses them.
    if (base.trend?.label) obstacles.push(trendLabelBox(base.trend.label))
    obstacles.push(...zoneBoxes)
    const inside = b => b.x0 >= plot.left && b.x1 <= plot.right && b.y0 >= plot.top && b.y1 <= plot.bottom
    const boxAt = (cx, cy, w, h) => ({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 })
    const offsets = spec.labelOffsets ?? {}
    // Priority (set size): the selection, then the extremes (x and y min / max), then the others.
    const sel = new Set((opts.priority ?? []).map(String))
    const ext = new Set()
    for (const k of ['vx', 'vy']) {
      const srt = [...base.points].sort((a, b) => a[k] - b[k])
      if (srt.length) { ext.add(srt[0].key); ext.add(srt.at(-1).key) }
    }
    const prio = p => (sel.has(String(p.key)) ? 0 : ext.has(p.key) ? 1 : 2)
    const texts = base.points.map(p => ({ p, lines: [compose(p, spec.labelContent ?? ['name']), compose(p, spec.label2) ?? p.label2].filter(Boolean) })).filter(it => it.lines.length)
    // One placement pass at size `size`: { labels, kept } (boxes updated in place).
    // Lines (partitions, trend) are always obstacles: a label is never placed on them.
    const place = size => {
      const out = []
      const LH = LM.base ? lineH : size + 1
      const boxes = [...obstacles]
      // Leader lines already drawn count too: a label is never placed on another's leader line.
      const leads = []
      const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || lineSegs.some(sg => segmentHitsBox(sg, b)) || leads.some(sg => segmentHitsBox(sg, b))
      const items = texts.map(t => ({ ...t, w: Math.max(...t.lines.map(x => LM.measure(x, size)), 0), h: t.lines.length * LH }))
      const emit = (it, cx, cy, extra = {}) => {
        const b = boxAt(cx, cy, it.w, it.h)
        boxes.push(b)
        if (extra.leader) leads.push([extra.leader.x1, extra.leader.y1, extra.leader.x2, extra.leader.y2])
        out.push({ key: it.p.key, x: cx, y: b.y0 + (LM.base ? 9 : Math.round(size * 0.8)), lineH: LH, size, cx, cy, anchor: 'middle', lines: it.lines, text: it.lines.join(' '), box: b, ...extra })
      }
      // Labels placed by hand first: the others avoid them.
      for (const it of items.filter(i => offsets[i.p.key])) {
        const { dx, dy } = offsets[it.p.key]
        let cx = it.p.x + dx, cy = it.p.y + dy
        // Set size: a label placed by hand stays within the plot.
        if (!LM.base) { cx = Math.max(plot.left + it.w / 2, Math.min(plot.right - it.w / 2, cx)); cy = Math.max(plot.top + it.h / 2, Math.min(plot.bottom - it.h / 2, cy)) }
        const b = boxAt(cx, cy, it.w, it.h)
        if (!LM.base && hit(b)) continue
        const far = Math.hypot(cx - it.p.x, cy - it.p.y) > it.p.r + Math.max(it.w, it.h) / 2 + 6
        emit(it, cx, cy, { manual: true, leader: far ? leaderTo(it.p, b) : null })
      }
      const rest = items.filter(i => !offsets[i.p.key]).sort((a, b) => (LM.base ? 0 : prio(a.p) - prio(b.p)) || a.p.y - b.p.y)
      for (const it of rest) {
        const { p, w, h } = it
        if (noMarker) { const b = boxAt(p.x, p.y, w, h); if (LM.base || (inside(b) && !hit(b))) emit(it, p.x, p.y); continue }
        // Next to the point (right, left, above, below), then further away with a leader line.
        const near = [[p.x + p.r + 4 + w / 2, p.y], [p.x - p.r - 4 - w / 2, p.y], [p.x, p.y - p.r - 3 - h / 2], [p.x, p.y + p.r + 3 + h / 2]]
        const c = near.find(([cx, cy]) => { const b = boxAt(cx, cy, w, h); return inside(b) && !hit(b) })
        if (c) { emit(it, c[0], c[1]); continue }
        // Further away with a leader line, never more than twice its height from its point
        // (beyond that, the label is removed and counted in "n hidden").
        const maxLead = 2 * Math.max(h, LM.base ? lineH : size + 1)
        let done = false
        for (let D = 8; D <= maxLead && !done; D += Math.max(6, h / 3)) {
          for (let k = 0; k < 16 && !done; k++) {
            const a = (k * Math.PI) / 8 - Math.PI / 4
            const cx = p.x + Math.cos(a) * (p.r + D + w / 2), cy = p.y + Math.sin(a) * (p.r + D + h / 2)
            const b = boxAt(cx, cy, w, h)
            if (!inside(b) || hit(b)) continue
            const ld = leaderTo(p, b)
            if (Math.hypot(ld.x2 - ld.x1, ld.y2 - ld.y1) > maxLead) continue
            // The leader line crosses no line (partition, trend) nor any other label:
            // otherwise another spot, and failing that the label is removed and counted.
            const seg = [ld.x1, ld.y1, ld.x2, ld.y2]
            if (lineSegs.some(sg => segmentsCross(sg, seg)) || out.some(o => segmentHitsBox(seg, o.box))) continue
            emit(it, cx, cy, { leader: ld }); done = true
          }
        }
      }
      return out
    }
    let labels = place(LM.size)
    // Set size: never remove everything. If less than half fits, the size steps down
    // to the default size, as long as half of the labels do not fit
    // (lines remain obstacles at every size).
    if (!LM.base && texts.length) {
      const half = Math.ceil(texts.length / 2)
      if (labels.length < half) {
        for (let size = LM.size; size >= FONT - 0.01; size = size > FONT ? Math.max(FONT, Math.floor(size * 0.85)) : FONT - 1) {
          const best = place(size)
          if (best.length > labels.length) labels = best
          if (labels.length >= half) break
        }
      }
    }
    base.labels = labels
    base.noRoom = texts.length - labels.length
  }

  base.invert = { x: px => X.s.invert(px), y: py => Y.s.invert(py) }
  base.domains = { x: X.s.domain(), y: Y.s.domain() }
  return stamp(base, 'scatter', spec)
}

/** Do two segments [x1, y1, x2, y2] intersect (touching included)? */
export function segmentsCross([a, b, c, d], [e, f, g, h]) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px))
  const o1 = o(a, b, c, d, e, f), o2 = o(a, b, c, d, g, h), o3 = o(e, f, g, h, a, b), o4 = o(e, f, g, h, c, d)
  if (o1 !== o2 && o3 !== o4) return true
  const on = (px, py, qx, qy, rx, ry) => Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy)
  return (o1 === 0 && on(a, b, c, d, e, f)) || (o2 === 0 && on(a, b, c, d, g, h)) || (o3 === 0 && on(e, f, g, h, a, b)) || (o4 === 0 && on(e, f, g, h, c, d))
}

/** The leader line: from the edge of the point to the nearest point of the label box. */
function leaderTo(p, b) {
  const qx = Math.max(b.x0, Math.min(b.x1, p.x)), qy = Math.max(b.y0, Math.min(b.y1, p.y))
  const L = Math.hypot(qx - p.x, qy - p.y) || 1
  return { x1: p.x + ((qx - p.x) / L) * p.r, y1: p.y + ((qy - p.y) / L) * p.r, x2: qx, y2: qy }
}
