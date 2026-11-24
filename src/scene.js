// ─── epure-charts · stage 3: the scene ───────────────────────────────────────
// buildScene(spec, resolved, { width, height }) → geometry in pixels:
//   { width, height, plot, axes, gridlines, bars, lines, areas, labels,
//     annotations, legend, columns, empty }
// ALL the layout happens here; ChartView only draws.
//
// PURE function: no React, no DOM, no data access. Colors come out as token
// NAMES ('gray-700', 'cat-3'…): the view reads them as var(--…).
// `spec` is expected completed (withDefaults); otherwise missing fields
// take the most neutral default (bar, left axis, solid stroke).
//
// labels[]: the values requested per series (series[].labels 'last' | 'all'),
// stack totals; run through the same collision avoidance as the bridge
// (labelLayout.js): "all values" gives way rather than
// overlap. annotations[]: CAGR arrow of a series (on its actuals),
// typed value lines (target, threshold, mean: color, stroke, label
// side), vertical marker of a period, min / max,
// tinted horizontal bands (alert or watch zone: { from, to, tone }),
// annotated point (callout: a point of a series, a text above, one below).
// `opts.legend === false`: no legend in the SVG (the header carries it).
// 4 series or fewer → each LINE carries its name at the end of the line,
// instead of the legend (endLabels[]); bars keep their legend entry.
// `spec.endLabels === false` falls back to the legend.
import { scaleLinear, scaleLog, scaleBand } from 'd3-scale'
import { line as d3line, area as d3area, curveMonotoneX, curveLinear } from 'd3-shape'
import { resolveCollisions, leaderLine } from './labelLayout.js'
import { dateAxisTicks, DATE_UNITS } from './dateTicks.js'
import { roundToSum, formatDateCodes, consistentRound } from './numberStyle.js'
import { isHex, isLightHex, isFont, isPt, sizePx, labelMetrics, baseToken } from './customStyle.js'
import { autoDecimals, autoDecimalsByUnit } from './decimals.js'
import { withDefaults } from './defaults.js'
import { validateChartSpec } from './spec.js'
import { localeOf, localizedFormat, localizeNumber, t } from './locale.js'
import { accentColor, accentInk, accentSeriesColor, accentPoints, singleAccent, NEUTRAL, ACCENT } from './accent.js'
import { stamp } from './figureMeta.js'

// Role colors, as semantic tokens (themable as --chart-*): by default actual in
// dark gray (forecast in light gray), plan in gold, investment case in chart blue,
// budget in mid gray (customStyle.SEMANTIC_TOKENS holds the fallbacks).
export const ROLE_TOKEN = { actual: 'chart-actual', plan: 'chart-plan', ic: 'chart-ic', budget: 'chart-budget' }
export const FORECAST_TOKEN = 'chart-forecast'
export const DASH_ARRAY = { solid: null, dash: '6 4', dot: '1.5 3' }
// Bar fill patterns: drawn by the view as SVG <pattern>, strokes in the
// bar's color (token) over the card background.
export const PATTERNS = ['hatch', 'hatchBack', 'cross', 'dots', 'lines']

const TICK_FONT = 11
const SIZE_STEP = { xsmall: 0.8, small: 0.9, large: 1.2, xlarge: 1.4 }
const LEGEND_FONT = 11
const LEGEND_ROW = 18
const SWATCH = 14
const X_AXIS_H = 22
const SUB_LINE_H = 13
const MAX_BAR_GROUP = 56

const MONTHS_Q = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' }

/** Estimated text width (~0.58 em on average for a UI sans-serif, tabular figures). */
export function estimateWidth(text, size = TICK_FONT) {
  return String(text ?? '').length * size * 0.58
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Label of an X-axis key: '2024-Q1' → "Q1 '24", '2024-03' → "Mar '24",
 * '2024' → '2024', category → as is; a '_…' key is a spacer
 * column: no label.
 */
export function formatX(key, grain) {
  if (String(key).startsWith('_')) return ''
  if (grain === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(String(key))
    if (m) return `${MONTHS_Q[m[2]]} '${m[1].slice(2)}`
  }
  if (grain === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key))
    if (m) return `${MONTHS[+m[2] - 1]} '${m[1].slice(2)}`
  }
  return String(key)
}

/**
 * Date format of a key (date format codes, formatDateCodes in
 * numberStyle.js: day, week, month, quarter, year, literals, ¶).
 * `full` forces a four-digit year (mixed years: the first one, and each January).
 */
export function formatDateKey(key, grain, pattern, full = false) {
  const k = String(key)
  if (k.startsWith('_')) return ''
  let mt
  // A month reads on its last day (day, week), a quarter on its end month.
  const end = (y, m) => new Date(Date.UTC(+y, m, 0)).getUTCDate()
  if ((mt = /^(\d{4})-Q([1-4])$/.exec(k))) return formatDateCodes({ y: mt[1], m: +mt[2] * 3, d: end(mt[1], +mt[2] * 3) }, pattern, full)
  if ((mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k))) return formatDateCodes({ y: mt[1], m: +mt[2], d: +mt[3] }, pattern, full)
  if ((mt = /^(\d{4})-(\d{2})$/.exec(k))) return formatDateCodes({ y: mt[1], m: +mt[2], d: end(mt[1], +mt[2]) }, pattern, full)
  if ((mt = /^(\d{4})$/.exec(k))) return formatDateCodes({ y: mt[1] }, pattern, full)
  return k
}

/** English ordinal: 1 → 1st, 2 → 2nd, 11 → 11th. */
export function ordinal(n) {
  const v = n % 100
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * Default format (a view or a scene without formatter): the number alone, with thousands
 * separators (8,617; « 8 617 » in French), no currency nor magnitude: the page states the unit
 * (subtitle, axis title) or passes its own `format`. 'x' → 8.5x, 'pct' → 12% (decimal value
 * 0–1). `decimals` null = automatic.
 */
export function defaultFormat(value, unit, decimals = null) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (unit === 'pct') return `${(value * 100).toFixed(decimals ?? 0)}%`
  if (unit === 'x') return `${value.toFixed(decimals ?? 1)}x`
  const d = decimals ?? (Math.abs(value) >= 100 ? 0 : 1)
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** '2024-Q3' → continuous quarter index (to measure a duration in years). */
function qIndex(k) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(k))
  return m ? +m[1] * 4 + (+m[2] - 1) : NaN
}

const monthIndex = period => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''))
  return m ? +m[1] * 12 + (+m[2] - 1) : NaN
}

/**
 * Duration in years between two points: on their real dates when they are
 * known (a 2025 year read on its Q1 is not twelve months), otherwise on
 * the axis keys.
 */
export function yearsBetween(a, b, grain) {
  const months = monthIndex(b.period) - monthIndex(a.period)
  if (Number.isFinite(months)) return months / 12
  if (grain === 'quarter') return (qIndex(b.x) - qIndex(a.x)) / 4
  if (grain === 'month') return (monthIndex(b.x) - monthIndex(a.x)) / 12
  // Year or category: the last year written in the key ('2018', 'Exit 2026', 'FY24', '22').
  return yearOfKey(b.x) - yearOfKey(a.x)
}

/**
 * The year a category key names: its last four-digit year ('2018', 'Exit 2026', '2025E'),
 * otherwise a two-digit year standing alone or after FY / an apostrophe, with an optional
 * actual / estimate / budget / forecast letter ('22', 'FY24', "'23", '24E'). NaN otherwise.
 */
export function yearOfKey(k) {
  const t = String(k ?? '').trim()
  const four = t.match(/(\d{4})(?!.*\d{4})/)
  if (four) return +four[1]
  const two = t.match(/^(?:FY\s?|')?(\d{2})[AEBFP]?$/i)
  if (two) { const y = +two[1]; return y < 70 ? 2000 + y : 1900 + y }
  return NaN
}

function ellipsizeEnd(text, maxW, size) {
  const t = String(text ?? '')
  if (estimateWidth(t, size) <= maxW) return t
  let cut = t
  while (cut.length > 1 && estimateWidth(`${cut}…`, size) > maxW) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Decimals needed to write a tick step unambiguously. */
function tickDecimals(step, unit) {
  const s = unit === 'pct' || unit === 'calc%' ? step * 100 : step
  if (!(s > 0)) return 0
  return Math.max(0, Math.min(3, -Math.floor(Math.log10(s) + 1e-9)))
}

const COLOR_TOKENS_T = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
function colorToken(style, role, k = 0) {
  const c = style?.color
  if (c && ROLE_TOKEN[c]) return ROLE_TOKEN[c]
  if (c) return c
  // No color set: the first series of a role takes the role color, the next ones the palette.
  if (k === 0) return ROLE_TOKEN[role] ?? 'cat-1'
  return COLOR_TOKENS_T[k % COLOR_TOKENS_T.length]
}
/** For each series index: how many earlier series share its role and have no color set. */
function roleRanks(specSeries, resolved) {
  const seen = {}
  return (specSeries ?? []).map((s, i) => {
    if (s?.style?.color) return 0
    const role = resolved?.[i]?.role ?? 'actual'
    seen[role] = (seen[role] ?? -1) + 1
    return seen[role]
  })
}

/**
 * X-axis keys. Categories: in point order. Time: ALL the
 * periods from the first to the last point, gaps included: a time axis keeps
 * regular intervals (two annual points followed by quarterly ones are not
 * squeezed together).
 */
function axisKeys(keys, grain) {
  if (grain === 'category' || !keys.length) return keys
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const q = k => { const m = /^(\d{4})-Q([1-4])$/.exec(k); return m ? +m[1] * 4 + (+m[2] - 1) : null }
  if (grain === 'quarter' && sorted.every(k => q(k) != null)) {
    const out = []
    for (let i = q(sorted[0]); i <= q(sorted.at(-1)); i++) out.push(`${Math.floor(i / 4)}-Q${(i % 4) + 1}`)
    return out
  }
  const mo = k => { const m = /^(\d{4})-(\d{2})$/.exec(k); return m ? +m[1] * 12 + (+m[2] - 1) : null }
  if (grain === 'month' && sorted.every(k => mo(k) != null)) {
    const out = []
    for (let i = mo(sorted[0]); i <= mo(sorted.at(-1)); i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`)
    return out
  }
  if (grain === 'year' && sorted.every(k => /^\d{4}$/.test(k))) {
    const out = []
    for (let y = +sorted[0]; y <= +sorted.at(-1); y++) out.push(String(y))
    return out
  }
  return sorted
}

/** Readable [min, max] domain: 0 included when a bar or area rests on it, never degenerate. */
function domainOf(values, includeZero) {
  const v = values.filter(Number.isFinite)
  if (!v.length) return null
  let lo = Math.min(...v)
  let hi = Math.max(...v)
  if (includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  else {
    // A lone line keeps some air around it, without crossing zero for nothing.
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1
    lo = lo >= 0 ? Math.max(0, lo - pad) : lo - pad
    hi = hi + pad
  }
  if (lo === hi) { const e = Math.abs(lo) * 0.1 || 1; lo -= e; hi += e }
  return [lo, hi]
}

function layoutLegend(items, width, scale = 1, L = 'en') {
  const out = []
  const font = LEGEND_FONT * scale
  const rowH = LEGEND_ROW * Math.max(1, scale)
  let x = 0
  let row = 0
  for (const it of items) {
    // A series without data stays in the legend, labeled as such: its
    // absence is information.
    const text = it.empty ? `${it.label} · ${t('no data', L)}` : it.label
    const w = SWATCH + 6 + estimateWidth(text, font)
    if (x > 0 && x + w > width) { x = 0; row++ }
    out.push({ ...it, text, x, y: row * rowH + rowH / 2, width: w })
    x += w + 16
  }
  return { items: out, height: items.length ? (row + 1) * rowH + 8 : 0 }
}

/** The tick unit of a date axis that fits the span (in days). */
export const autoDateUnit = span => (span > 1100 ? 'year' : span > 270 ? 'quarter' : span > 60 ? 'month' : span > 14 ? 'week' : 'day')

// Thinning steps of a date axis, per unit (in units: 2 quarters = a half-year…).
const DATE_STEPS = { year: [1, 2, 5, 10, 20, 50], quarter: [1, 2, 4, 8], month: [1, 2, 3, 6, 12, 24], week: [1, 2, 4, 8, 13, 26, 52], day: [1, 2, 7, 14, 28] }
/** The calendar rank of a tick within its unit (quarter no. Y*4+Q…): the thinning phase (null: week, day). */
export function dateUnitIndex(day, unit) {
  const t = new Date(Math.round(day) * 864e5)
  const Y = t.getUTCFullYear(), M = t.getUTCMonth()
  if (unit === 'year') return Y
  if (unit === 'quarter') return Y * 4 + Math.floor(M / 3)
  if (unit === 'month') return Y * 12 + M
  // Weeks and days: no meaningful calendar phase, the step starts at the first tick.
  return null
}

/**
 * Snaps the start of a date axis to the start of its unit (year, quarter, month, week)
 * when close to it (less than half a unit): the first point thus gets its tick.
 * Further away, the next tick falls within half a unit of the first point: nothing moves.
 */
export function snapDateLo(lo, hi, unit = null, weekStart = 0) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return lo
  const u = DATE_UNITS.includes(unit) ? unit : autoDateUnit(hi - lo)
  let start
  if (u === 'day') start = Math.floor(lo)
  else if (u === 'week') { const d = Math.floor(lo); start = d - ((((d + 3) % 7) + 7) % 7 - weekStart + 7) % 7 }
  else {
    const t = new Date(Math.floor(lo) * 864e5)
    const months = { year: 12, quarter: 3, month: 1 }[u]
    start = Date.UTC(t.getUTCFullYear(), Math.floor(t.getUTCMonth() / months) * months, 1) / 864e5
  }
  const half = { year: 183, quarter: 46, month: 15.5, week: 3.5, day: 1 }[u]
  return lo - start < half ? start : lo
}

/**
 * The scene of a cartesian chart. Free label size (points): if fewer than half
 * of the labels fit in the card, the size steps down (×0.85, down to 8 pt);
 * scene.labelCap = { asked, used } gives the size actually drawn, scene.noRoom the number
 * of labels still removed for lack of room.
 */
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v)
const withErrors = (sc, errors) => { if (sc && typeof sc === 'object') sc.errors = errors; return sc }

export function buildScene(specIn, resolved = [], opts = {}) {
  // The spec as the live view reads it (ChartView): the defaults of its data (colors by role,
  // bar mode, axes) filled in, and the same validation, reported in scene.errors (never thrown).
  const spec = isObj(specIn) ? withDefaults(specIn, resolved) : specIn
  // A spec the validation refuses still draws what it can (a malformed chart renders as such).
  const errors = validateChartSpec(spec, { resolved })
  const sc = withErrors(buildSceneAt(spec, resolved, opts), errors)
  const LO = spec?.format?.labels ?? {}
  if (!isPt(LO.size) || sc.empty || spec?.format?.transpose) return stamp(sc, 'chart', spec)
  const ok = s => !s.labelsWanted || (s.labelsWanted - s.noRoom) * 2 >= s.labelsWanted
  if (ok(sc)) return stamp(sc, 'chart', spec)
  let best = sc
  for (let pt = Math.floor(LO.size * 0.85); pt >= 8; pt = Math.floor(pt * 0.85)) {
    const s2 = buildSceneAt({ ...spec, format: { ...spec.format, labels: { ...LO, size: pt } } }, resolved, opts)
    if (s2.noRoom < best.noRoom || best === sc) best = Object.assign(s2, { labelCap: { asked: LO.size, used: pt } })
    if (ok(s2)) break
  }
  return stamp(withErrors(best, errors), 'chart', spec)
}

function buildSceneAt(spec, resolved = [], opts = {}) {
  // Transpose rows and columns: series become
  // categories and vice versa; the original bars stay bars.
  if (spec?.format?.transpose) {
    const keysT = []
    for (const r of resolved) for (const p of r?.points ?? []) if (!keysT.includes(String(p.x))) keysT.push(String(p.x))
    const grainT = spec?.x?.grain ?? 'quarter'
    const sIds = (spec.series ?? []).map((s, i) => s.id ?? `s${i}`)
    const series = keysT.map((k, i) => ({ id: `t${i}`, mark: spec.series?.[0]?.mark ?? 'bar', labels: spec.series?.[0]?.labels ?? 'none', style: { color: COLOR_TOKENS_T[i % COLOR_TOKENS_T.length] } }))
    const res = keysT.map(k => ({
      label: spec?.x?.names?.[k] ?? formatX(k, grainT), unit: resolved[0]?.unit ?? 'M', role: 'actual',
      points: sIds.map((id, j) => ({ x: id, y: resolved[j]?.points?.find(p => String(p.x) === k)?.y, type: 'actual' })).filter(p => Number.isFinite(p.y)),
    }))
    const names = Object.fromEntries(sIds.map((id, j) => [id, resolved[j]?.label ?? id]))
    const fmt = { ...spec.format, transpose: undefined }
    return buildScene({ ...spec, series, x: { ...spec.x, grain: 'category', keys: sIds, names, sort: undefined, hidden: [] }, format: fmt, annotations: [] }, res, opts)
  }
  const width = Math.max(160, Math.round(opts.width ?? 640))
  const height = Math.max(140, Math.round(opts.height ?? 260))
  // Language: the formatter's punctuation, the engine's own words and numbers.
  const L = localeOf(spec)
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const loc = str => localizeNumber(str, L)
  const grain = spec?.x?.grain ?? 'quarter'
  const barsMode = spec?.bars ?? 'clustered'
  const stacked = barsMode === 'stacked' || barsMode === 'stacked100'
  const share = barsMode === 'stacked100'
  const userDecimals = spec?.numberFormat?.decimals ?? null
  // Formatting set by the reading layer (format bar and context menu
  // of each object). When absent, every setting keeps its default.
  const F = spec?.format ?? {}
  // Font size: five steps, from about 8 to 14 pt.
  const FS = SIZE_STEP[F.fontSize] ?? 1
  const tickFont = TICK_FONT * FS
  const xo = F.xAxis ?? {}
  const yo = side => F.yAxis?.[side] ?? {}

  // Categories hidden by the reading layer (x.hidden): neither column nor point.
  const hidden = new Set((spec?.x?.hidden ?? []).map(String))
  // Categories moved to the table: they leave
  // the plot and read as a column of numbers on the right, one row per series.
  const tableColKeys = [...new Set((F.tableCols ?? []).map(String))].filter(k => !hidden.has(k))
  const tableColSet = new Set(tableColKeys)
  const ranks = roleRanks(spec?.series, resolved)
  const allSeries = (spec?.series ?? []).map((s, i) => {
    const r = resolved[i] ?? { points: [] }
    const mark = s.mark ?? 'bar'
    return {
      id: s.id ?? `s${i}`,
      index: i,
      mark,
      axis: s.axis === 'right' ? 'right' : 'left',
      dash: s.style?.dash ?? 'solid',
      marker: !!s.style?.marker,
      // Property controls (Fill / Outline Color / Line Style):
      //   stroke    bar outline color (or 'none'), weight stroke
      //   width (line or outline), markerShape marker shape, smooth smoothed
      //   line, points { key: token } color of ONE segment.
      stroke: s.style?.stroke ?? null,
      weight: Number.isFinite(s.style?.weight) ? s.style.weight : null,
      markerShape: s.style?.markerShape ?? (s.style?.marker ? 'circle' : null),
      smooth: !!s.style?.smooth,
      step: s.style?.step === 'lines' || s.style?.step === 'steps' ? s.style.step : null,
      // Point color: set (style.points), otherwise carried by the data (point.color).
      // (single-accent mode: the categories `emphasis` names, in the accent; nothing else)
      pointColors: singleAccent(spec) ? accentPoints(spec, (spec?.series ?? []).map((x, j) => x.id ?? `s${j}`)) : { ...Object.fromEntries((r.points ?? []).filter(p => p?.color).map(p => [String(p.x), p.color])), ...(s.style?.points ?? {}) },
      // Stack group (stacked clustered): series with the same `stack` are stacked,
      // groups are placed side by side.
      stack: s.stack ?? null,
      // 'hollow': a forecast bar is drawn hollow, with a dotted outline
      // (the "assumption" convention), in its series color.
      forecastStyle: s.style?.forecast ?? null,
      // Fill pattern: hatched, crosshatch, dots, lines.
      pattern: PATTERNS.includes(F.patterns?.[s.id]) ? F.patterns[s.id] : null,
      color: accentSeriesColor(spec, s.id ?? `s${i}`, colorToken(s.style, r.role, ranks[i]), s.style?.color),
      role: r.role ?? 'actual',
      label: r.label ?? s.id,
      unit: r.unit ?? 'M',
      labels: s.labels ?? 'none',
      points: (r.points ?? []).filter(p => p && p.x != null && Number.isFinite(p.y) && !hidden.has(String(p.x)) && !tableColSet.has(String(p.x))).map(p => ({ ...p })),
      colVals: Object.fromEntries((r.points ?? []).filter(p => p && tableColSet.has(String(p.x)) && Number.isFinite(p.y)).map(p => [String(p.x), p.y])),
      // Hidden by the reading layer (all its categories hidden), not "no data".
      maskedOut: (r.points ?? []).length > 0 && (r.points ?? []).every(p => hidden.has(String(p?.x))),
      // (each point can carry `period` 'YYYY-MM': the real date of the number)
    }
  })

  // Line scheme: each line gets a distinct stroke
  // and marker, readable even printed in black and white.
  if (F.lineScheme === 'distinct') {
    const DASHES = ['solid', 'dash', 'dot']
    const MARKS = ['circle', 'square', 'diamond', 'triangle']
    allSeries.filter(s => s.mark === 'line').forEach((s, i) => {
      s.dash = DASHES[i % DASHES.length]
      s.markerShape = MARKS[i % MARKS.length]
    })
  }
  // Data table (move series to table): these series leave the
  // plot and read as rows below the category axis.
  // Sheet rows in reverse order.
  if (F.seriesOrder === 'reverse') allSeries.reverse()
  // Column entered as %: its numbers are shares of
  // the column's "100%=" row (by default, of 100).
  for (const k of (F.pctCols ?? []).map(String)) {
    const b = Number(F.base100?.[k])
    const base = Number.isFinite(b) && b > 0 ? b : 100
    for (const s of allSeries) for (const p of s.points) if (String(p.x) === k) p.y = (p.y / 100) * base
  }
  // "Data table" for the whole chart: every series except the first.
  const tableIds = new Set(F.tableAll ? allSeries.slice(1).map(s => s.id) : (F.table ?? []).map(String))
  const tableSeries = allSeries.filter(s => tableIds.has(s.id) && s.points.length)
  const series = allSeries.filter(s => !tableSeries.includes(s))
  // Default decimals (numberFormat.decimals unset): two significant digits per unit, the same
  // static and live (decimals.js). The host's formatter receives them as its third argument.
  const autoDec = autoDecimalsByUnit(allSeries.map(x => ({ unit: x.unit, points: x.points.filter(p => !hidden.has(String(p.x))) })))
  const decOf = unit => userDecimals ?? autoDec[unit ?? ''] ?? null
  // Color scheme order (stacked fill order): top to bottom.
  // (single-accent mode: colors follow the emphasis, not the order)
  if (F.colorOrder === 'reverse' && !singleAccent(spec)) {
    const bars = series.filter(s => s.mark === 'bar')
    const cols = bars.map(s => s.color).reverse()
    bars.forEach((s, i) => { s.color = cols[i] })
  }

  // "Other" series (stacked and 100%): in each column,
  // segments below the threshold (in % of the column) are grouped into a gray segment on top.
  const otherBelow = Number(F.otherBelow)
  if (stacked && otherBelow > 0) {
    const bs = series.filter(s => s.mark === 'bar' && s.points.length)
    const other = new Map()
    const colKeys = [...new Set(bs.flatMap(s => s.points.map(p => String(p.x))))]
    for (const k of colKeys) {
      const tot = bs.reduce((t, s) => t + Math.abs(s.points.find(p => String(p.x) === k)?.y ?? 0), 0)
      if (!tot) continue
      const small = bs.filter(s => { const p = s.points.find(q => String(q.x) === k); return p && (Math.abs(p.y) / tot) * 100 < otherBelow })
      // A single small segment stays itself: "Other" groups, it does not rename.
      if (small.length < 2) continue
      for (const s of small) {
        const p = s.points.find(q => String(q.x) === k)
        const o = other.get(k) ?? { x: p.x, y: 0, type: p.type }
        o.y += p.y
        other.set(k, o)
        s.points = s.points.filter(q => q !== p)
      }
    }
    if (other.size) {
      series.push({
        id: '_other', index: series.length, mark: 'bar', axis: bs[0].axis, dash: 'solid', marker: false, stroke: null, weight: null,
        markerShape: null, smooth: false, step: null, pointColors: {}, stack: bs[0].stack, forecastStyle: null, pattern: null,
        color: accentColor(spec, '_other', 'gray-300'), role: 'actual', label: t('Other', L), unit: bs[0].unit, labels: bs.find(s => s.labels !== 'none')?.labels ?? 'none',
        points: [...other.values()], maskedOut: false, other: true,
      })
    }
  }

  // ── Legend (on top, rows that wrap) ──────────────────────────────────────
  const withData = series.filter(s => s.points.length)
  // Direct legend (format.legend: 'direct', alias 'series'): the names of the bars right of the
  // last column, at the height of their segment (stacked), spread so they never overlap,
  // instead of the legend on top. By default (format.legend unset) on stacked columns of 2 to 5
  // series with room on the right (≥ 480 px): the reader no longer matches colors. 'top' keeps
  // the legend on top.
  const barCount = withData.filter(s => s.mark === 'bar').length
  // Only when every bar series has a segment in the last column (a name always sits by its
  // segment) and labels are not placed outside the bars (they would meet the names).
  const barEnds = withData.filter(s => s.mark === 'bar').map(s => s.points.at(-1))
  const autoDirect = F.legend == null && stacked && barCount >= 2 && barCount <= 5 && width >= 480
    && F.labels?.position !== 'outside'
    && barEnds.every(p => p && p.y && String(p.x) === String(barEnds[0].x))
  const seriesOnChart = (F.legend === 'direct' || F.legend === 'series' || autoDirect) && opts.legend !== false && barCount > 0
  const direct = opts.legend !== false && spec?.endLabels !== false && F.endLabels !== false && withData.length > 0 && (seriesOnChart || withData.length <= 4)
    && (seriesOnChart || withData.some(s => s.mark !== 'bar'))
  const onChart = s => s.mark !== 'bar' || seriesOnChart
  const legendSeries = (direct ? series.filter(s => !onChart(s) || !s.points.length) : series).filter(s => !s.maskedOut)
  // A single series: no legend by default (the title names it); format.legend set brings it back.
  const singleSeries = F.legend == null && series.filter(s => !s.maskedOut).length <= 1
  const legendPos = F.legend === 'none' || F.legend === 'bottom' ? F.legend : singleSeries ? 'none' : 'top'
  // The legend follows its own size, otherwise the chart text size (drawing and layout).
  const legendScale = SIZE_STEP[F.legendSize] ?? FS
  // CAGR in the series name (label content → CAGR in the series label).
  const seriesCagr = s => {
    const pts = s.points.filter(p => p.type !== 'forecast')
    const a = pts[0], b = pts.at(-1)
    const n = a && b && a !== b ? yearsBetween(a, b, grain) : 0
    if (!(n > 0 && a.y > 0 && b.y > 0)) return null
    const r = (b.y / a.y) ** (1 / n) - 1
    return loc(`${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%`)
  }
  // Legend order: the sheet, reversed, or a free order (list of ids).
  const legendOrdered = F.legendOrder === 'reverse' ? [...legendSeries].reverse()
    : Array.isArray(F.legendOrder) ? [...legendSeries].sort((a, b) => {
      const ia = F.legendOrder.indexOf(a.id), ib = F.legendOrder.indexOf(b.id)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    })
    : legendSeries
  const legend = opts.legend === false || legendPos === 'none' ? { items: [], height: 0 } : layoutLegend(legendOrdered.map(s => ({
    seriesId: s.id, label: F.legendCagr && seriesCagr(s) ? `${s.label} · ${t('CAGR', L)} ${seriesCagr(s)}` : s.label, color: s.color, mark: s.mark, pattern: s.pattern,
    dash: DASH_ARRAY[s.dash], empty: s.points.length === 0,
  })), Number.isFinite(F.legendWidth) ? Math.max(80, Math.min(width, F.legendWidth)) : width, legendScale, L)
  // Room for the end-of-line names, reserved right of the plot.
  const END_FONT = 11
  // Light fills: a white number would be unreadable.
  const LIGHT_FILLS = new Set(['gray-100', 'gray-200', 'gray-300', 'gold-light', 'teal-bg', 'red-bg', 'green-bg', 'amber-bg', 'blue-bg', 'white'])
  const endGutter = direct
    ? Math.min(width * 0.28, Math.max(...withData.filter(onChart).map(s => estimateWidth(s.label, END_FONT))) + 12)
    : 0

  // ── X-axis categories ──────────────────────────────────────────────────────
  const seen = []
  const seenSet = new Set()
  for (const s of series) for (const p of s.points) {
    if (!seenSet.has(p.x)) { seenSet.add(p.x); seen.push(p.x) }
  }
  // A categorical axis can impose its order (x.keys), empty columns included.
  const keys = (grain === 'category' && Array.isArray(spec?.x?.keys) ? spec.x.keys.map(String) : axisKeys(seen, grain))
    .filter(k => !hidden.has(k) && !tableColSet.has(k))
    // A spacer column ('_…') only makes sense between two visible columns.
    .filter((k, i, arr) => !k.startsWith('_') || (i > 0 && i < arr.length - 1 && !arr[i - 1].startsWith('_')))
  // Category sort (x.sort 'desc' | 'asc', categorical axis): by bar
  // total, otherwise by the first series. Spacer columns are dropped.
  if (grain === 'category' && (spec?.x?.sort === 'desc' || spec?.x?.sort === 'asc')) {
    const bar = series.filter(x => x.mark === 'bar')
    const pool = bar.length ? bar : series.slice(0, 1)
    const tot = k => pool.reduce((t, x) => t + (x.points.find(p => p.x === k)?.y ?? 0), 0)
    const sorted = keys.filter(k => !k.startsWith('_')).sort((a, b) => (spec.x.sort === 'desc' ? tot(b) - tot(a) : tot(a) - tot(b)))
    keys.splice(0, keys.length, ...sorted)
  }
  // Reverse sheet order.
  if (F.catOrder === 'reverse') keys.reverse()
  // Category axis break (column gap):
  // an empty column before the chosen category (e.g. an outlier).
  for (const g of F.catGaps ?? []) {
    const at = keys.indexOf(String(g))
    // Gap width in multiples of a column (dragged from the baseline handle).
    const n = Math.max(1, Math.min(4, Math.round(Number(F.catGapSize?.[g]) || 1)))
    if (at > 0 && !keys[at - 1].startsWith('_')) keys.splice(at, 0, ...Array.from({ length: n }, (_, j) => (j ? `_gap-${g}~${j + 1}` : `_gap-${g}`)))
  }
  // KPI rows of the data table:
  // a series' growth, or its ratio to another (margin), read from the sheet, aligned under the columns.
  const kpiOrder = keys.filter(q => !String(q).startsWith('_'))
  const kpiRows = (F.kpiRows ?? []).map(r => {
    const a = allSeries.find(s => s.id === r?.of)
    const b = r?.kind === 'ratio' ? allSeries.find(s => s.id === r.over) : null
    if (!a || !['growth', 'ratio'].includes(r.kind) || (r.kind === 'ratio' && !b)) return null
    const at = (s, k) => s.points.find(p => String(p.x) === String(k))?.y
    const value = k => {
      const v = at(a, k)
      if (!Number.isFinite(v)) return null
      if (b) { const d = at(b, k); return Number.isFinite(d) && d !== 0 ? v / d : null }
      const i = kpiOrder.indexOf(String(k))
      const pv = i > 0 ? at(a, kpiOrder[i - 1]) : null
      return Number.isFinite(pv) && pv !== 0 ? v / pv - 1 : null
    }
    return { id: `kpi:${r.kind}:${a.id}${b ? `:${b.id}` : ''}`, of: a.id, label: b ? `${a.label} / ${b.label}` : `${a.label} ${t('growth', L)}`, value }
  }).filter(Boolean)
  // Second label below the key: a text, or several lines ([text | { text, tone, strong }]).
  const subOf = k => {
    // Second label line: the chart's own, or typed in the sheet (optional row).
    const v = F.subLabels?.[k] ?? spec?.x?.sub?.[k]
    const own = v == null ? [] : (Array.isArray(v) ? v : [v]).map(l => (typeof l === 'string' ? { text: l } : l)).filter(l => l?.text)
    // One row per table series (empty when the series has no number there).
    const rows = tableSeries.map(ts => {
      const p = ts.points.find(q => q.x === k)
      // One precision per table row (like an axis): no "€18.0M" next to "€112M".
      const rowDec = userDecimals ?? (Math.max(...ts.points.map(q => Math.abs(q.y))) >= 10 ? 0 : 1)
      return { text: p ? format(p.y, ts.unit, rowDec) : '–', tone: 'gray-700', table: ts.id }
    })
    const kpis = kpiRows.map(r => { const v = r.value(k); return { text: v == null ? '–' : loc(defaultFormat(v, 'pct', userDecimals ?? 0)), tone: 'gray-700', table: r.id } })
    const all = [...own, ...rows, ...kpis]
    return all.length ? all : null
  }
  const subLines = Math.max(0, ...keys.map(k => subOf(k)?.length ?? 0))
  const hasSub = subLines > 0

  const barSeries0 = series.filter(s => s.mark === 'bar' && s.points.length)
  // Segment order: the sheet, or reversed.
  const totalOf = sr => sr.points.reduce((t, p) => t + Math.abs(p.y), 0)
  const barSeries = F.stackOrder === 'reverse' ? [...barSeries0].reverse()
    : F.stackOrder === 'desc' ? [...barSeries0].sort((a, b) => totalOf(b) - totalOf(a))
    : F.stackOrder === 'asc' ? [...barSeries0].sort((a, b) => totalOf(a) - totalOf(b))
    : barSeries0
  // Empty cell = 0 (do not interpolate): a category without a number counts as zero.
  const valueAt = (s, k) => s.points.find(p => p.x === k) ?? (F.emptyZero && !String(k).startsWith('_') && s.points.length ? { x: k, y: 0, type: 'actual' } : undefined)

  // ── Requested decorations (they reserve their height above the plot) ────────
  const anns = Array.isArray(spec?.annotations) ? spec.annotations : []
  // An explicit CAGR (from / to / periods) links two precise points, possibly
  // across two series (last actual → exit); otherwise, first → last
  // actual of one series, which assumes a time axis.
  // The duration of an explicit CAGR is given (periods) or derived from the bounds.
  const explicitCagr = a => a?.from?.key != null && a?.to?.key != null
  // Why a requested annotation is not drawn (scene.warnings; the views log them in development).
  const warnings = []
  const cagrName = a => (explicitCagr(a) ? `CAGR ${a.from.key} → ${a.to.key}` : `CAGR of series "${a.series ?? '?'}"`)
  const cagrs = anns.filter(a => {
    if (a?.type !== 'cagr') return false
    if (explicitCagr(a)) return true
    if (!series.some(s => s.id === a.series && s.points.length >= 2)) { warnings.push(`${cagrName(a)}: not drawn, the series is missing or has fewer than two points; set from / to, or a series with data.`); return false }
    if (grain === 'category') { warnings.push(`${cagrName(a)}: not drawn, a category axis has no first and last year; set from: { key } and to: { key }.`); return false }
    return true
  })
  const wantTotals = stacked && !share && anns.some(a => a?.type === 'totals')
  const wantAreaTotals = (F.areaMode ?? spec?.areaMode) === 'stacked' && anns.some(a => a?.type === 'totals')
  // A series' mean (over its visible points) reads as a value line.
  const averages = anns.filter(a => a?.type === 'average').map(a => {
    const s = series.find(x => x.id === a.series)
    const ys = (s?.points ?? []).map(p => p.y)
    return ys.length ? { type: 'valueLine', value: ys.reduce((t, v) => t + v, 0) / ys.length, label: t('Avg', L), axis: s.axis, tone: 'gray-600', dash: 'dot', labelAt: 'left' } : null
  }).filter(Boolean)
  // Several value lines: the spec's, then
  // those added by the reading layer (format.valueLines, each with its label, side, stroke).
  const extraLines = (F.valueLines ?? []).map((v, i) => (v && Number.isFinite(v.value)
    ? { type: 'valueLine', user: true, fi: i, value: v.value, axis: v.axis === 'right' ? 'right' : 'left', label: v.label || undefined, labelAt: v.side === 'left' ? 'left' : 'right', dash: DASH_ARRAY[v.dash] !== undefined ? v.dash : undefined, tone: v.tone || undefined }
    : null)).filter(Boolean)
  const valueLines = [...anns.filter(a => a?.type === 'valueLine' && Number.isFinite(a.value)), ...averages, ...extraLines]
  const xMarkers = anns.filter(a => a?.type === 'xMarker' && a.key != null)
  const bands = anns.filter(a => a?.type === 'band' && Number.isFinite(a.from) && Number.isFinite(a.to))
  // Difference arrow between two columns (the stack total, or a series value).
  // An end = { key, series? }: without series, the column total; with one, that segment or point.
  // `level`: level difference arrow placed beside
  // the two elements; otherwise the bridge above the columns. `fi`: index in format.diffs.
  const diffs = [
    ...anns.filter(a => a?.type === 'diff' && a.from != null && a.to != null)
      .map(a => ({ from: { key: String(a.from), series: a.series ?? null }, to: { key: String(a.to), series: a.series ?? null }, level: !!a.level, mode: a.mode })),
    ...(F.diffs ?? []).map((d, i) => (d?.from?.key != null && d?.to?.key != null
      ? { from: { key: String(d.from.key), series: d.from.series ?? null, vline: d.from.vline ?? null }, to: { key: String(d.to.key), series: d.to.series ?? null, vline: d.to.vline ?? null }, level: !!d.level, mode: d.mode, fi: i }
      : null)).filter(Boolean),
  ]
  const extremes = anns.filter(a => a?.type === 'extremes' && series.some(s => s.id === a.series && s.points.length))
  const wantLabels = series.some(s => s.labels !== 'none' && s.points.length)
  // Stacked annotations (arrows and CAGRs with overlapping ranges): a 22 px tier each.
  const spans = [
    ...cagrs.map(a => (explicitCagr(a) ? [keys.indexOf(String(a.from.key)), keys.indexOf(String(a.to.key))] : [0, keys.length - 1])),
    ...diffs.filter(d => !d.level).map(d => [keys.indexOf(d.from.key), keys.indexOf(d.to.key)]),
  ].filter(([i, j]) => i >= 0 && j >= 0).map(([i, j]) => [Math.min(i, j), Math.max(i, j)])
  const depth = Math.max(0, ...spans.map(([i, j]) => spans.filter(([p, q]) => Math.min(j, q) - Math.max(i, p) > 0).length - 1))
  const stackRoom = Math.min(66, depth * 22)
  // Rotated labels: room for their length above the bars.
  // (the text actually written: number, "+ (%)", series or category name; at the chosen label size; totals included).
  const rotSize = 10 * FS * (SIZE_STEP[F.labels?.size] ?? 1)
  const rotText = (s, p) => {
    const v = format(p.y, s.unit, decOf(s.unit))
    const c = F.labels?.content
    return c === 'valueShare' ? `${v} (100%)` : c === 'seriesShare' ? `${s.label} 100%` : c === 'series' ? s.label : c === 'category' ? (spec?.x?.names?.[p.x] ?? formatX(p.x, grain)) : c === 'share' ? '100%' : v
  }
  // Rotated labels (90° or 45°): the height they take above the bars.
  // 90: read bottom to top (towards the left); -90: top to bottom (towards the right); 45.
  const rotDeg = [90, 45, -90].includes(F.labels?.rotate) ? F.labels.rotate : 0
  const rotRoom = rotDeg && (wantLabels || wantTotals)
    ? (Math.max(0, ...series.filter(s => s.labels !== 'none' || (wantTotals && s.mark === 'bar')).flatMap(s => s.points.map(p => estimateWidth(rotText(s, p), rotSize)))) - 10) * Math.sin((Math.abs(rotDeg) * Math.PI) / 180)
    : 0
  // Free size in points: the room above the plot follows the label size (they stay inside the card).
  const lblRoom = isPt(F.labels?.size) ? Math.max(14, sizePx(F.labels.size) + 6) : 14
  const headroom = (wantLabels || wantTotals || wantAreaTotals || extremes.length || F.grandTotal ? lblRoom : 0) + (cagrs.length || diffs.some(d => !d.level) ? 26 + stackRoom : 0) + rotRoom

  // Totals per x for stacking (positive and negative apart, per axis).
  const stackTotals = {}
  const groupOf = s => (stacked ? s.stack ?? '_' : s.id)
  const groups = [...new Set(barSeries.map(groupOf))]
  if (stacked) {
    for (const k of keys) {
      for (const s of barSeries) {
        const p = valueAt(s, k)
        if (!p) continue
        const t = (stackTotals[`${s.axis}|${k}|${groupOf(s)}`] ??= { pos: 0, neg: 0, abs: 0 })
        if (p.y >= 0) t.pos += p.y; else t.neg += p.y
        t.abs += Math.abs(p.y)
      }
    }
  }

  // ── Y-axis domains ─────────────────────────────────────────────────────────
  // Stacked areas (stacked area / 100% area): cumulative per category.
  const areaMode = (F.areaMode ?? spec?.areaMode) === 'stacked' || (F.areaMode ?? spec?.areaMode) === 'stacked100' ? (F.areaMode ?? spec?.areaMode) : null
  const areaCum = {}
  const areaTop = {}
  if (areaMode) {
    const areaSeries = series.filter(s => s.mark === 'area' && s.points.length)
    for (const k of keys) {
      for (const side of ['left', 'right']) {
        const list = areaSeries.filter(s => s.axis === side)
        const tot = list.reduce((t, s) => t + Math.max(0, valueAt(s, k)?.y ?? 0), 0)
        let acc = 0
        for (const s of list) {
          const v = Math.max(0, valueAt(s, k)?.y ?? 0)
          const lo = acc, hi = acc + v
          acc = hi
          areaCum[`${s.id}|${k}`] = areaMode === 'stacked100' ? { lo: tot ? lo / tot : 0, hi: tot ? hi / tot : 0 } : { lo, hi }
        }
        if (list.length) areaTop[`${side}|${k}`] = acc
      }
    }
  }
  const axisUnit = side => {
    if (share && barSeries.some(s => s.axis === side)) return 'pct'
    if (areaMode === 'stacked100' && series.some(s => s.axis === side && s.mark === 'area')) return 'pct'
    return series.find(s => s.axis === side && s.points.length)?.unit ?? null
  }
  // Broken columns (column break): left out of the scale computation, drawn
  // clipped at the top of the plot with a break symbol; their number stays exact.
  const colBreaks = new Set((F.colBreaks ?? []).map(String))
  const axisValues = side => {
    const vals = []
    let zero = false
    for (const s of series) {
      if (s.axis !== side || !s.points.length) continue
      if (s.mark === 'bar') {
        zero = true
        if (!stacked) vals.push(...s.points.filter(p => !colBreaks.has(String(p.x))).map(p => p.y))
      } else {
        if (s.mark === 'area') zero = true
        // A missing value read as zero: zero enters the scale.
        if (F.gapsBy?.[s.id] === 'zero' && keys.some(k => !k.startsWith('_') && !s.points.some(p => p.x === k))) zero = true
        if (!(areaMode && s.mark === 'area')) vals.push(...s.points.map(p => p.y))
      }
    }
    if (stacked) {
      for (const k of keys) for (const g of groups) {
        if (colBreaks.has(String(k))) continue
        const t = stackTotals[`${side}|${k}|${g}`]
        if (!t) continue
        if (share) vals.push(t.abs ? t.pos / t.abs : 0, t.abs ? t.neg / t.abs : 0)
        else vals.push(t.pos, t.neg)
      }
    }
    // Stacked areas: the top of the stack; at 100%, the share.
    if (areaMode) for (const k of keys) { const top = areaTop[`${side}|${k}`]; if (top != null) vals.push(areaMode === 'stacked100' ? 1 : top) }
    // A value line (target, threshold) stays inside the frame.
    if (vals.length) for (const v of valueLines) if ((v.axis ?? 'left') === side) vals.push(v.value)
    // A band shows in full: both its bounds enter the domain.
    if (vals.length) for (const b of anns.filter(x => x?.type === 'band' && Number.isFinite(x.from) && Number.isFinite(x.to))) {
      if ((b.axis ?? 'left') === side) vals.push(b.from, b.to)
    }
    return { vals, zero }
  }

  const legendH = legend.height
  // Category axis: labels hidden, straight, or rotated (45° / 90°).
  const xLabels = xo.labels !== false
  const rotate = xLabels && (xo.rotate === 45 || xo.rotate === 90) ? xo.rotate : 0
  const catLabelW = Math.max(0, ...series.flatMap(sr => sr.points.map(p => estimateWidth(spec?.x?.names?.[p.x] ?? formatX(p.x, grain), tickFont))))
  // A date format with ¶ (ddd¶dd): one more line below the axis per break.
  const dateBreaks = grain !== 'category' && xo.dateFormat ? (String(xo.dateFormat).match(/¶/g) ?? []).length : 0
  const xAxisH = !xLabels ? 8 : rotate ? Math.min(110, Math.round(catLabelW * Math.sin((rotate * Math.PI) / 180) + tickFont + 8)) : (X_AXIS_H + dateBreaks * 13) * FS
  const plotTop = legendPos === 'top' ? legendH + 8 : 8
  // Category axis title: one line below the axis.
  const xTitleH = xo.title ? 16 : 0
  // Data table styled like a table: the text size
  // also sets the height of its rows.
  const tStyle = F.tableStyle ?? {}
  const tScale = { xsmall: 0.8, small: 0.9, large: 1.15, xlarge: 1.3 }[tStyle.size] ?? 1
  const subLineH = SUB_LINE_H * tScale
  const plotBottom = height - (legendPos === 'bottom' ? legendH + 4 : 0) - (hasSub && xLabels ? xAxisH + subLines * subLineH + 2 : xAxisH) - xTitleH
  const plotH = Math.max(40, plotBottom - plotTop)
  const tickCount = Math.max(2, Math.min(6, Math.floor(plotH / 42)))

  const makeAxis = side => {
    const { vals, zero } = axisValues(side)
    let dom = domainOf(vals, zero)
    if (!dom) return null
    const o = yo(side)
    // Log scale: only positive values make the scale; zero and negatives
    // sit on the base, marked "!" (further down).
    // Without the margin of a line, which would bring the bottom back to zero.
    if (o.log && !Number.isFinite(o.min)) {
      const pos = vals.filter(v => v > 0)
      if (pos.length) { const a = Math.min(...pos), b = Math.max(...pos); dom = a < b ? [a, b] : [a / 2, b * 2] }
    }
    const unit = axisUnit(side)
    // Manual scale (the axis end handles); an
    // inconsistent bound hands control back to automatic.
    const manual = Number.isFinite(o.min) || Number.isFinite(o.max)
    // The automatic scale, even under a manual one: a handle dragged up to it snaps back ("Automatic").
    const autoDomain = scaleLinear().domain(dom).nice(tickCount).domain()
    if (manual) {
      const d = [Number.isFinite(o.min) ? o.min : dom[0], Number.isFinite(o.max) ? o.max : dom[1]]
      if (d[0] < d[1]) dom = d
    }
    // Log scale: positive values only, otherwise the axis stays linear.
    const log = !!o.log && dom[0] > 0
    const range = o.reverse ? [plotTop + headroom, plotBottom] : [plotBottom, plotTop + headroom]
    let raw = (log ? scaleLog() : scaleLinear()).domain(dom).range(range)
    if (!manual) raw = raw.nice(tickCount)
    let tv
    if (log) {
      tv = raw.ticks().filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9)
      if (tv.length < 2) tv = raw.domain()
    } else if (Number.isFinite(o.step) && o.step > 0) {
      const [lo, hi] = raw.domain()
      tv = []
      for (let v = Math.ceil(lo / o.step - 1e-9) * o.step; v <= hi + 1e-9 && tv.length < 40; v += o.step) tv.push(Number(v.toFixed(10)))
    } else tv = raw.ticks(tickCount)
    // A min / max set by hand carries its tick (the bound reads on the axis),
    // unless it falls too close to an existing tick.
    // The regular step, read before adding the bounds (the handle snaps to it).
    const regStep = tv.length > 1 ? Math.abs(tv[1] - tv[0]) : null
    if (manual && !o.break && tv.length > 1) {
      // The bound wins: a tick within half a step gives way (no crowded "160 / 170").
      const gapV = regStep * 0.5
      const [dlo, dhi] = raw.domain()
      // Exactly half a step counts as crowded ("140 / 150" on a step of 20).
      if (Number.isFinite(o.max)) tv = [...tv.filter(v => v === dhi || Math.abs(v - dhi) > gapV + 1e-9), ...(tv.includes(dhi) ? [] : [dhi])]
      if (Number.isFinite(o.min)) tv = [...(tv.includes(dlo) ? [] : [dlo]), ...tv.filter(v => v === dlo || Math.abs(v - dlo) > gapV + 1e-9)]
    }
    const step = regStep ?? Math.abs(tv[0] ?? 1)
    const autoTicks = log ? [] : raw.ticks(tickCount)
    const autoStep = autoTicks.length > 1 ? Math.abs(autoTicks[1] - autoTicks[0]) : null
    const dec = log ? 0 : tickDecimals(step, unit)
    const d0 = raw.domain()[0]
    // A bar starts at zero: on a log scale, at the bottom of the axis.
    let scale = v => raw(log ? Math.max(v, d0) : v)
    // Axis break: the interval [from, to] is
    // compressed into a BREAK_GAP px band; each side keeps its scale.
    let brk = null
    const [lo, hi] = raw.domain()
    if (!log && o.break && Number.isFinite(o.break.from) && Number.isFinite(o.break.to) && lo < o.break.from && o.break.from < o.break.to && o.break.to < hi) {
      const BREAK_GAP = 10
      const [r0, r1] = raw.range()
      const dir = Math.sign(r0 - r1) || 1
      const span = (o.break.from - lo) + (hi - o.break.to)
      const avail = Math.abs(r0 - r1) - BREAK_GAP
      const lowH = (avail * (o.break.from - lo)) / span
      const yFrom = r0 - dir * lowH
      const yTo = yFrom - dir * BREAK_GAP
      scale = v => (v <= o.break.from ? r0 - dir * ((v - lo) / (o.break.from - lo)) * lowH
        : v >= o.break.to ? yTo - dir * ((v - o.break.to) / (hi - o.break.to)) * (avail - lowH)
        : (yFrom + yTo) / 2)
      const half = Math.max(2, Math.floor(tickCount / 2))
      // A segment too short keeps only its bound: two ticks would overlap there.
      // As many ticks as the height holds without overlap (≥ 24 px each).
      const fit = (a, b, h) => {
        const room = Math.floor(h / 24)
        if (room < 2) return [a]
        return scaleLinear().domain([a, b]).ticks(Math.min(half, room)).filter(v => v >= a && v < b)
      }
      const lowTicks = fit(lo, o.break.from, lowH)
      const highTicks = avail - lowH < 48 ? [hi] : fit(o.break.to, hi + 1e-9, avail - lowH).filter(v => v > o.break.to)
      tv = [...lowTicks, ...highTicks]
      brk = { y: (yFrom + yTo) / 2, gap: BREAK_GAP }
      // The exact inverse, break included (dragging a handle or a value line).
      const lowS = lo, fromV = o.break.from, toV = o.break.to, hiS = hi
      brk.invert = py => (dir * (r0 - py) <= lowH ? lowS + ((r0 - py) / (dir * lowH)) * (fromV - lowS)
        : dir * (yTo - py) >= 0 ? toV + ((yTo - py) / (dir * (avail - lowH))) * (hiS - toV)
        : (fromV + toV) / 2)
    }
    scale.domain = () => raw.domain()
    const fmtAxis = opts.formatAxis ? localizedFormat(opts.formatAxis, L) : format
    // One precision per axis (the step decides it): the shortest that tells all
    // ticks apart; zero is written "0".
    let axDec = dec
    if (axDec == null && unit !== 'pct') {
      for (let d = 0; d <= 3; d++) {
        const ls = tv.map(v => fmtAxis(v, unit, d))
        if (new Set(ls).size === ls.length) { axDec = d; break }
      }
    }
    const ticks = tv.map(v => ({ value: v, y: scale(v), label: v === 0 && unit !== 'pct' && unit !== 'x' ? '0' : fmtAxis(v, unit, axDec) }))
    const showLabels = o.labels !== false
    const labelW = showLabels ? Math.max(...ticks.map(t => estimateWidth(t.label, tickFont)), 0) : 0
    // Pixel → value (dragging a handle, a value line): the scale itself, break included.
    const invert = brk?.invert ?? (py => raw.invert(py))
    return { side, unit, scale, ticks, labelW, showLabels, title: o.title || null, line: !!o.line, log, manual, step, brk, invert, autoDomain, autoStep }
  }
  const left = makeAxis('left')
  const right = makeAxis('right')

  const TITLE_W = 16
  // Ticks "inside" (on the other side of the axis line): they no longer take margin.
  const gutterOf = a => (yo(a.side).labelsInside ? 6 : Math.ceil(a.labelW) + (a.showLabels ? 10 : 4)) + (a.title ? TITLE_W : 0)
  // Data table row headers (moved series, KPIs) fit in full left of the plot.
  const headW = Math.max(0, ...[...tableSeries.map(ts => ts.label), ...kpiRows.map(r => r.label)].map(t => estimateWidth(String(t ?? ''), 10) + 16))
  const plotLeft = Math.max(left ? gutterOf(left) : 12, headW)
  // Table columns, right of everything (end-of-line names included).
  const tableColText = (s, k) => (s.colVals[k] == null ? '–' : format(s.colVals[k], s.unit, decOf(s.unit)))
  const tableColW = tableColKeys.map(k => Math.ceil(Math.max(estimateWidth(spec?.x?.names?.[k] ?? formatX(k, grain), tickFont),
    ...series.filter(s => s.mark !== undefined && !s.other).map(s => estimateWidth(tableColText(s, k), 10)))) + 14)
  const tableW = tableColW.reduce((a, w) => a + w, 0)
  const plotRight = width - (right ? gutterOf(right) : 12) - endGutter - tableW
  const plot = { left: plotLeft, right: plotRight, top: plotTop, bottom: plotBottom, width: plotRight - plotLeft, height: plotH }

  const empty = !keys.length || (!left && !right)
  const base = {
    width, height, plot, legend: legend.items, labels: [], annotations: [],
    bars: [], lines: [], areas: [], gridlines: [], columns: [], endLabels: [], empty, warnings,
    axes: { x: { y: plotBottom, ticks: [], line: !!xo.line, rotate, labels: xLabels, tickMarks: !!xo.tickMarks }, left: null, right: null },
    gridColor: F.gridColor ?? null, fontScale: FS, legendScale, legendY: legendPos === 'bottom' ? height - legendH : 0, gridStyle: F.grid === 'dash' ? 'dash' : 'solid', gridTone: F.gridTone === 'dark' ? 'dark' : 'light',
  }
  if (empty) return base

  // ── X axis: one band per period / category ─────────────────────────────────
  // Column width (the baseline handle, "gap width").
  const gap = Number.isFinite(F.gap) ? Math.max(0, Math.min(0.9, F.gap)) : null
  const x = scaleBand().domain(keys).range([plot.left, plot.right]).paddingInner(gap ?? 0.22).paddingOuter(0.12)
  const band = x.bandwidth()
  // Lines and areas only: the axis can cross "on" categories (crosses
  // at categories): first and last points on the plot edge, no half column.
  const atCats = xo.crosses === 'at' && keys.length > 1 && !series.some(s => s.mark === 'bar' && s.points.length)
  // X axis as values (automatic value axis): numeric categories, lines only;
  // each point is placed at its value, not its rank.
  // Date axis: YYYY-MM-DD categories are placed by elapsed time.
  const dateKeys = keys.length > 2 && keys.every(k => /^\d{4}-\d{2}-\d{2}$/.test(k))
  const numKeys = keys.map(k => (dateKeys ? Date.parse(`${k}T00:00:00Z`) / 864e5 : Number(k)))
  const numericX = xo.numeric !== false && grain === 'category' && keys.length > 2 && (dateKeys || keys.every(k => /^-?\d+(\.\d+)?$/.test(k)))
    && !series.some(s => s.mark === 'bar' && s.points.length) && (xo.numeric || numKeys.every((v, i) => i === 0 || v > numKeys[i - 1]))
  const natMin = Math.min(...numKeys), natMax = Math.max(...numKeys)
  // Same scale on the X axis: the host imposes the group's common
  // range (xAxis.min / xAxis.max, in days for a date axis); it can only widen.
  // A date axis starts at the beginning of its unit when close to it (tick under the
  // first point); a common range imposed by the host is already snapped (sameRangeFor).
  const natLo = numericX && dateKeys && !Number.isFinite(xo.min) ? snapDateLo(natMin, natMax, xo.dateUnit, Number(xo.weekStart) || 0) : natMin
  const nMin = numericX && Number.isFinite(xo.min) ? Math.min(natMin, xo.min) : natLo
  const nMax = numericX && Number.isFinite(xo.max) ? Math.max(natMax, xo.max) : natMax
  const numOf = k => (dateKeys ? Date.parse(`${k}T00:00:00Z`) / 864e5 : Number(k))
  const cx = k => (numericX ? plot.left + ((numOf(k) - nMin) / (nMax - nMin || 1)) * plot.width
    : atCats ? plot.left + (keys.indexOf(k) * plot.width) / (keys.length - 1) : x(k) + band / 2)
  // A single bar (or stack) caps at MAX_BAR_GROUP; in a group, ~32 px per bar.
  const groupW = gap != null ? band : Math.min(band, stacked || barSeries.length <= 1 ? MAX_BAR_GROUP : barSeries.length * 32)

  // A category renamed in the data sheet (x.names) keeps that name.
  // Category labels: imposed name, ordinal labels, chosen date format.
  const realKeys = keys.filter(k => !k.startsWith('_'))
  const fx = k => {
    if (xo.ordinal && !k.startsWith('_')) return ordinal(realKeys.indexOf(k) + 1)
    if (spec?.x?.names?.[k] != null) return spec.x.names[k]
    if (xo.dateFormat && grain !== 'category') {
      const i = realKeys.indexOf(k)
      const full = !!xo.mixedYears && (i === 0 || (i > 0 && String(realKeys[i - 1]).slice(0, 4) !== String(k).slice(0, 4)))
      return formatDateKey(k, grain, xo.dateFormat, full)
    }
    return formatX(k, grain)
  }
  const labelW = Math.max(...keys.map(k => Math.max(...String(fx(k)).split('\n').map(l => estimateWidth(l))))) + 10
  const xStep = x.step()
  // A time axis thins out (every other date can be inferred); a
  // categorical axis never does: each name stays, truncated to its column.
  const every = Number.isInteger(xo.every) && xo.every > 0 ? xo.every : grain === 'category' || rotate === 90 || tableSeries.length || kpiRows.length ? 1 : Math.max(1, Math.ceil((rotate ? tickFont * 1.4 : labelW) / Math.max(1, xStep)))
  const lastIdx = keys.length - 1
  base.axes.x.ticks = keys.map(k => {
    const full = fx(k)
    const label = grain === 'category' && !rotate ? ellipsizeEnd(full, xStep - 4, tickFont) : full
    const sub = subOf(k)?.map(l => ({ ...l, text: ellipsizeEnd(l.text, xStep - 4, 10) }))
    return { key: k, x: cx(k), label, full, sub: sub?.length ? sub : null }
  }).filter((t, i) => (grain === 'category' && !xo.every) || (!xo.every && i === lastIdx) || (i % every === 0 && (xo.every || lastIdx - i >= every)))
  if (!xLabels) base.axes.x.ticks = []
  // Natural extent of the X value axis (published for the common scale), and the drawn one.
  if (numericX) { base.axes.x.domain = [natMin, natMax]; base.axes.x.drawn = [nMin, nMax]; base.axes.x.kind = dateKeys ? 'date' : 'num' }
  // Date axis ticked by unit (date axis tick units, week starts on):
  // years, quarters, months, weeks (chosen first day) or days, thinned if too dense.
  // Without a chosen unit, the one that fits the span (a date axis is ticked by default).
  const span = nMax - nMin
  const dateUnit = DATE_UNITS.includes(xo.dateUnit) ? xo.dateUnit : autoDateUnit(span)
  if (xLabels && dateKeys && numericX && !xo.dateFormat) {
    const dt = dateAxisTicks(nMin, nMax, dateUnit, Number(xo.weekStart) || 0)
    if (dt.length) {
      const xs = dt.map(t => plot.left + ((t.day - nMin) / (nMax - nMin || 1)) * plot.width)
      // A tick at the plot's left edge: its centered label would bite into the labels of
      // the value axis ("€50M" against "Q3 24"); it is shifted right of the edge (lx).
      const all = dt.map((t, i) => {
        const w = estimateWidth(t.label, tickFont)
        const lx = xs[i] - w / 2 < plot.left + 2 ? plot.left + 2 + w / 2 : null
        return { key: `_d${t.day}`, x: xs[i], lx, label: t.label, full: t.label, sub: null, w, idx: dateUnitIndex(t.day, dateUnit) ?? i }
      })
      // Thinned on the calendar step (every other quarter = Q1 and Q3 everywhere: two charts on the
      // same scale keep the same ticks), never two labels closer than 8 px.
      const clear = ts => ts.every((t, i) => i === 0 || (ts[i - 1].lx ?? ts[i - 1].x) + ts[i - 1].w / 2 + 8 <= (t.lx ?? t.x) - t.w / 2)
      const steps = DATE_STEPS[dateUnit] ?? [1, 2, 5, 10]
      let kept = all
      for (let s = 0; s < 40 && kept.length > 1 && !clear(kept); s++) {
        const n = s < steps.length ? steps[s] : steps.at(-1) * 2 ** (s - steps.length + 1)
        const next = all.filter(t => ((t.idx % n) + n) % n === 0)
        if (next.length) kept = next
      }
      // The first label shifted right of the edge must not crowd two ticks: shifted by more
      // than 15% of the normal step, it is muted (the tick stays, its label is not drawn;
      // "Q1 24" against "Q2 24", 44 px versus 62).
      if (kept.length >= 2 && kept[0].lx != null) {
        const pitch = kept.length >= 3 ? kept[2].x - kept[1].x : kept[1].x - kept[0].x
        if (kept[0].lx - kept[0].x > 0.15 * pitch) kept = [{ ...kept[0], muted: true }, ...kept.slice(1)]
      }
      base.axes.x.ticks = kept.map(t => { const o = { ...t }; delete o.w; delete o.idx; return o })
    }
  }
  // Category gap (category axis break): a break symbol on the axis.
  // One symbol per gap, in the middle of its empty columns; and the axis break without gap
  // between two neighboring categories.
  base.axes.x.gaps = [
    ...keys.filter(k => k.startsWith('_gap') && !k.includes('~')).map(k => {
      const run = keys.filter(q => q === k || q.startsWith(`${k}~`))
      return (cx(run[0]) + cx(run.at(-1))) / 2
    }),
    ...(F.catBreaks ?? []).map(String).filter(k => keys.indexOf(k) > 0 && !keys[keys.indexOf(k) - 1].startsWith('_')).map(k => (cx(keys[keys.indexOf(k) - 1]) + cx(k)) / 2),
  ]
  if (xo.title) base.axes.x.title = { text: xo.title, x: (plot.left + plot.right) / 2 + (Number(xo.titleOffset) || 0), y: height - (legendPos === 'bottom' ? legendH + 4 : 0) - 5 }
  // Data table row headers, on the left, aligned with their rows.
  const ownSub = Math.max(0, ...keys.map(k => (subOf(k)?.length ?? 0) - tableSeries.length - kpiRows.length))
  // Each row: its baseline (y), its band (top, h) for fill and rules.
  const sub0 = plotBottom + 15 + subLineH
  base.axes.x.subLineH = subLineH
  base.axes.x.subFont = 10 * tScale
  base.axes.x.sub0 = 15 + subLineH
  base.axes.x.tableHeads = xLabels ? [...tableSeries.map(ts => ({ seriesId: ts.id, text: ts.label })), ...kpiRows.map(r => ({ seriesId: r.of, text: r.label, kpi: r.id }))]
    .map((h, i) => { const y = sub0 + (ownSub + i) * subLineH; return { ...h, line: ownSub + i, y, top: y - subLineH * (10 / 13), h: subLineH } }) : []
  // Banded fill (every other row, two colors), rules between rows.
  const heads = base.axes.x.tableHeads
  const fillOn = tStyle.fill === 'rows' || (tStyle.fill == null && !!F.tableStripes)
  const [c1, c2] = Array.isArray(tStyle.colors) ? tStyle.colors : []
  base.axes.x.tableFill = fillOn ? heads.map((h, i) => ({ key: h.kpi ?? h.seriesId, y: h.top, h: h.h, fill: i % 2 === 0 ? (c1 ?? 'gray-100') : c2 ?? null })).filter(r => r.fill) : []
  base.axes.x.tableLines = heads.length && tStyle.lines && tStyle.lines !== 'none'
    ? [heads[0].top, ...(tStyle.lines === 'all' ? heads.map(h => h.top + h.h) : [heads.at(-1).top + heads.at(-1).h])].map((y, i) => ({ key: `tl${i}`, y }))
    : []

  const yScaleOf = side => (side === 'right' ? right : left)?.scale ?? left?.scale ?? right.scale
  // Top of the frame of a manually scaled axis (null when automatic): nothing goes above it.
  const manualTop = s => { const a = (s.axis === 'right' ? right : left) ?? left ?? right; return a?.manual ? Math.min(a.scale(a.scale.domain()[0]), a.scale(a.scale.domain()[1])) : null }
  const capTop = (s, k) => { const y = yScaleOf(s.axis); return colBreaks.has(String(k)) ? y(y.domain()[1]) : manualTop(s) ?? plot.top - 4 }
  const axisOut = a => a && {
    side: a.side, unit: a.unit, x: a.side === 'left' ? plot.left : plot.right,
    ticks: a.showLabels ? a.ticks.map(({ value, y, label }) => ({ value, y, label })) : [],
    // All ticks, labels shown or not (the gridlines, the scale handle).
    allTicks: a.ticks.map(({ value, y }) => ({ value, y })),
    title: a.title, titleX: a.side === 'left' ? 8 : width - endGutter - 8, titleOffset: Number(yo(a.side).titleOffset) || 0, labelsInside: !!yo(a.side).labelsInside, line: a.line, log: a.log, manual: a.manual, step: a.step,
    invert: a.invert, autoDomain: a.autoDomain, autoStep: a.autoStep,
    // The axis frame in pixels (from min to max): series never leave it (clip).
    frame: [a.scale(a.scale.domain()[0]), a.scale(a.scale.domain()[1])].sort((p, q) => p - q),
    tickMarks: !!yo(a.side).tickMarks, domain: a.scale.domain(), brk: a.brk ? { y: a.brk.y, gap: a.brk.gap, shape: yo(a.side).breakShape === 'straight' ? 'straight' : 'wiggle', from: yo(a.side).break.from, to: yo(a.side).break.to } : null,
  }
  base.axes.left = axisOut(left)
  base.axes.right = axisOut(right)

  // Gridlines: horizontal only, on the ticks of the main axis.
  const gridAxis = left ?? right
  base.gridlines = F.grid === 'none' ? [] : gridAxis.ticks.map(t => ({ x1: plot.left, x2: plot.right, y: t.y, zero: t.value === 0 && gridAxis.scale.domain()[0] < 0 }))

  // ── Bars ───────────────────────────────────────────────────────────────────
  // One slot per group: per series (clustered), a single one (stacked), one per `stack` (stacked clustered).
  const slots = stacked ? groups : barSeries.map(s => s.id)
  const inner = scaleBand().domain(slots).range([0, groupW]).paddingInner(slots.length > 1 ? 0.1 : 0)
  // Segments sorted column by column (segments in descending order):
  // the largest at the bottom of each stack, whatever the series order elsewhere.
  const orderAt = k => (stacked && (F.stackOrder === 'descCat' || F.stackOrder === 'ascCat')
    ? [...barSeries].sort((a, b) => {
      const d = Math.abs(valueAt(b, k)?.y ?? 0) - Math.abs(valueAt(a, k)?.y ?? 0)
      return F.stackOrder === 'descCat' ? d : -d
    })
    : barSeries)
  for (const k of keys) {
    const x0 = cx(k) - groupW / 2
    const accs = {}
    for (const s of orderAt(k)) {
      const p = valueAt(s, k)
      if (!p) continue
      const y = yScaleOf(s.axis)
      let from = 0
      let to = p.y
      if (stacked) {
        const t = stackTotals[`${s.axis}|${k}|${groupOf(s)}`]
        // "100%=" row: the column reads against a given base, not its sum.
        const b100 = Number(F.base100?.[k])
        const den = Number.isFinite(b100) && b100 > 0 ? b100 : t.abs
        const v = share ? (den ? p.y / den : 0) : p.y
        const a = (accs[`${s.axis}|${groupOf(s)}`] ??= { pos: 0, neg: 0 })
        if (v >= 0) { from = a.pos; to = a.pos + v; a.pos = to }
        else { from = a.neg; to = a.neg + v; a.neg = to }
      }
      const yA = y(from)
      const yB = y(to)
      const forecast = p.type === 'forecast'
      // Hatched forecast (series "hatch" style, or the chart's "Hatch forecast bars"):
      // the series color, hatched, instead of gray or hollow.
      const hatched = forecast && s.forecastStyle !== 'hollow' && (s.forecastStyle === 'hatch' || !!F.forecastHatch)
      const ownPattern = F.patternPoints?.[`${s.id}|${k}`]
      base.bars.push({
        seriesId: s.id, key: k,
        x: x0 + inner(stacked ? groupOf(s) : s.id),
        width: inner.bandwidth(),
        // Clipped to the frame (manual scale): what is seen, its label included.
        // A cut column stops at the top of the plot (its upper part is shortened).
        // A cut column stops at the last gridline (the top of the scale).
        // Axis max set below the data: the bar stops sharply at the top of the frame (marked "cut").
        y: Math.max(capTop(s, k), Math.min(yA, yB)),
        height: Math.max(0, Math.min(plot.bottom, Math.max(yA, yB)) - Math.max(capTop(s, k), Math.min(yA, yB))),
        cut: manualTop(s) != null && Math.min(yA, yB) < manualTop(s) - 0.5,
        value: p.y, negative: p.y < 0, forecast,
        hollow: forecast && s.forecastStyle === 'hollow',
        color: s.pointColors[k] ?? (forecast && s.role === 'actual' && s.forecastStyle !== 'hollow' && !hatched ? FORECAST_TOKEN : s.color),
        opacity: forecast && s.role !== 'actual' && s.forecastStyle !== 'hollow' && !hatched ? 0.5 : 1,
        pattern: ownPattern === 'none' ? null : PATTERNS.includes(ownPattern) ? ownPattern : hatched ? 'hatch' : s.pattern,
        stroke: s.stroke && s.stroke !== 'none' ? s.stroke : null,
        strokeWidth: s.stroke && s.stroke !== 'none' ? (s.weight ?? 1.25) : 0,
        strokeDash: s.stroke && s.stroke !== 'none' ? DASH_ARRAY[s.dash] : null,
      })
    }
  }

  // Bar cut by a max set by hand (cut mark): the double wave
  // at the top of the bar says its value exceeds the scale; its label stays at the top of the frame.
  for (const b of base.bars.filter(z => z.cut && z.height >= 14)) {
    base.annotations.push({ type: 'overflowCut', key: b.key, seriesId: b.seriesId, x: b.x, width: b.width, y: b.y + 7 })
  }
  for (const k of colBreaks) {
    const col = base.bars.filter(b => b.key === k)
    if (!col.length) continue
    // The double wave crosses EACH tall enough bar of the column, near its top,
    // at its exact width (never over the empty space beside it).
    // Only the tallest bar of the category is cut (the others keep their real height).
    const tallest = col.reduce((m, z) => (z.height > m.height ? z : m), col[0])
    for (const b of [tallest].filter(z => z.height >= 30)) {
      base.annotations.push({ type: 'colBreak', key: k, seriesId: b.seriesId, x: b.x, width: b.width, y: b.y + Math.max(10, Math.min(28, b.height * 0.3)) })
    }
  }
  // Series connectors: the top of each segment
  // linked to the top of the same segment in the next column.
  // Or those of one series only (format.connectorSeries), or of a single segment to the next
  // (format.segConnectors: "series|category", the series connector of one segment).
  const segConn = new Set((F.segConnectors ?? []).map(String))
  const connSeries = new Set((F.connectorSeries ?? []).map(String))
  if ((F.connectors || segConn.size || connSeries.size) && base.bars.length) {
    for (const s of barSeries) {
      const bs = keys.map(k => base.bars.find(b => b.seriesId === s.id && b.key === k)).filter(Boolean)
      for (let i = 1; i < bs.length; i++) {
        const a = bs[i - 1], b = bs[i]
        if (!F.connectors && !connSeries.has(s.id) && !segConn.has(`${s.id}|${a.key}`)) continue
        const ya = a.negative ? a.y + a.height : a.y
        const yb = b.negative ? b.y + b.height : b.y
        base.annotations.push({ type: 'connector', seriesId: s.id, x1: a.x + a.width, y1: ya, x2: b.x, y2: yb })
      }
    }
  }
  // Universal connectors: any two elements
  // linked, from the top of one to the top of the other.
  const topOf = (sid, k) => {
    const b = base.bars.find(x => x.seriesId === sid && x.key === k)
    if (b) return { x: b.x + b.width / 2, y: b.negative ? b.y + b.height : b.y }
    const s = series.find(x => x.id === sid)
    const p = s && valueAt(s, k)
    return p ? { x: cx(k), y: yScaleOf(s.axis)(p.y) } : null
  }
  for (const [i, ln] of (F.links ?? []).entries()) {
    const a = topOf(ln?.from?.seriesId, ln?.from?.key), b = topOf(ln?.to?.seriesId, ln?.to?.key)
    if (a && b) base.annotations.push({ type: 'link', i, x1: a.x, y1: a.y - 2, x2: b.x, y2: b.y - 2, elbow: ln.elbow !== false })
  }
  // Error bars: ±% of the value, or a spread read from
  // another series; when thick, they become a range (football field).
  for (const [sid, eb0] of Object.entries(F.errorBars ?? {})) {
    const s = series.find(x => x.id === sid)
    if (!s || !eb0) continue
    const y = yScaleOf(s.axis)
    // Several pairs (several error bars in different colors): the
    // main one, then eb.more[], each with its spread, color and ends.
    const pairs = [eb0, ...(Array.isArray(eb0.more) ? eb0.more.filter(Boolean) : [])]
    for (const [j, eb] of pairs.entries()) {
      const dev = (k, which) => {
        const ref = eb[which] ? allSeries.find(x => x.id === eb[which]) : null
        if (ref) return Math.abs(ref.points.find(p => p.x === k)?.y ?? 0)
        return Number.isFinite(eb.pct) ? Math.abs((valueAt(s, k)?.y ?? 0) * eb.pct / 100) : 0
      }
      for (const k of keys) {
        const p = valueAt(s, k)
        if (!p) continue
        const bar = base.bars.find(b => b.seriesId === sid && b.key === k)
        // In a stack, the error bar starts at the top of the segment (the cumulative value).
        const below = stacked && bar ? orderAt(k).slice(0, orderAt(k).findIndex(x => x.id === sid))
          .filter(x => groupOf(x) === groupOf(s)).map(x => valueAt(x, k)?.y ?? 0).filter(v => Math.sign(v) === Math.sign(p.y) || v === 0).reduce((a, v) => a + v, 0) : 0
        const top = below + p.y
        const hi = top + dev(k, 'hi'), lo = top - dev(k, 'lo')
        // Following pairs shift slightly right: they stay readable side by side.
        const x = (bar ? bar.x + bar.width / 2 : cx(k)) + j * 5
        const w = bar ? bar.width : 16
        // Ends (shape of each top / bottom marker): 'bar', 'none', 'dot', 'arrow'.
        const capOf = which => (['bar', 'none', 'dot', 'arrow'].includes(eb[which]) ? eb[which] : ['bar', 'none', 'dot', 'arrow'].includes(eb.capShape) ? eb.capShape : 'bar')
        base.annotations.push({ type: 'errorBar', seriesId: sid, key: k, pair: j, value: p.y, top, axis: s.axis, byPct: !(eb.lo || eb.hi), x, y1: y(hi), y2: y(lo), cap: eb.thick ? w * 0.5 : Math.min(10, w * 0.4), thick: !!eb.thick, color: eb.color ?? null, weight: Number(eb.weight) || 1, capHi: capOf('capHi'), capLo: capOf('capLo') })
      }
    }
  }

  // ── Lines and areas ────────────────────────────────────────────────────────
  for (const s of series) {
    if (s.mark === 'bar' || !s.points.length) continue
    const y = yScaleOf(s.axis)
    const stackedArea = areaMode && s.mark === 'area'
    // Areas: a gap reads as zero if requested (interpolation off), otherwise interpolated.
    // Per-series setting (interpolation line by line): 'connect', 'break' or 'zero'
    // ("Do not interpolate": a missing value is zero); otherwise, the chart setting.
    const gm = ['connect', 'break', 'zero'].includes(F.gapsBy?.[s.id]) ? F.gapsBy[s.id] : null
    const zeroGap = gm === 'zero' || (!gm && s.mark === 'area' && F.areaGaps === 'zero')
    const pts = keys.map(k => valueAt(s, k) ?? (zeroGap && !k.startsWith('_') ? { x: k, y: 0, type: 'actual' } : null)).filter(Boolean).map(p => ({
      key: p.x, x: cx(p.x), y: y(stackedArea ? areaCum[`${s.id}|${p.x}`]?.hi ?? 0 : p.y), y0: stackedArea ? y(areaCum[`${s.id}|${p.x}`]?.lo ?? 0) : null,
      value: p.y, forecast: p.type === 'forecast',
    }))
    const lastActual = pts.reduce((idx, p, i) => (p.forecast ? idx : i), -1)
    const actualPts = lastActual >= 0 ? pts.slice(0, lastActual + 1) : []
    const forecastPts = lastActual >= 0 ? pts.slice(lastActual) : pts
    const curve = s.smooth ? curveMonotoneX : curveLinear
    // Gaps (do not interpolate): the line breaks on a period without a number.
    const breakGaps = gm === 'break' || (!gm && F.gaps === 'break' && grain !== 'category')
    const gen = d3line().x(p => p.x).y(p => p.y).curve(curve).defined(p => !p.gap)
    const withGaps = arr => {
      if (!breakGaps || arr.length < 2) return arr
      const out = []
      for (let i = 0; i < arr.length; i++) {
        if (i > 0 && keys.indexOf(arr[i].key) - keys.indexOf(arr[i - 1].key) > 1) out.push({ gap: true })
        out.push(arr[i])
      }
      return out
    }
    // Net line: one horizontal stroke per column, at its
    // width; "steps" links them as a staircase.
    const half = groupW / 2
    // Two neighboring dashes with the same value merge into one stroke (connect equal net lines).
    const stepPath = arr => arr.map((p, i) => {
      const joined = s.step === 'steps' || (i > 0 && F.netJoin !== false && Math.abs(arr[i - 1].y - p.y) < 0.5 && keys.indexOf(p.key) - keys.indexOf(arr[i - 1].key) === 1)
      return `${i === 0 || !joined ? 'M' : 'L'}${p.x - half},${p.y} H${p.x + half}`
    }).join(' ')
    // Net line connectors: from the end of one dash to the start of the next.
    const netConn = arr => (s.step === 'lines' && F.netConnectors ? arr.slice(1).map((p, i) => (Math.abs(arr[i].y - p.y) < 0.5 ? '' : `M${arr[i].x + half},${arr[i].y} L${p.x - half},${p.y}`)).join(' ').trim() || null : null)
    const path = arr => (s.step ? (arr.length ? stepPath(arr) : null) : arr.length > 1 ? gen(withGaps(arr)) : null)
    const line = {
      seriesId: s.id, color: s.color, dash: DASH_ARRAY[s.dash],
      strokeWidth: s.weight ?? (s.role === 'actual' ? 2 : 1.75),
      d: path(actualPts), dForecast: forecastPts.length > 1 ? path(forecastPts) : null, dConn: netConn(pts),
      // An isolated point (a single period) shows as a marker, otherwise it would vanish.
      markerShape: s.markerShape ?? 'circle',
      markers: (s.markerShape && s.markerShape !== 'none') || pts.length === 1
        ? pts.map(p => ({ key: p.key, x: p.x, y: p.y, forecast: p.forecast, color: s.pointColors[p.key] ?? null })) : [],
      points: pts,
    }
    if (s.mark === 'area') {
      const y0 = y(Math.max(y.domain()[0], Math.min(0, y.domain()[1])))
      const ag = d3area().x(p => p.x).y0(p => (stackedArea ? p.y0 : y0)).y1(p => p.y).curve(curve)
      // Stacked, areas are opaque (readable as shares); alone, translucent.
      base.areas.push({ seriesId: s.id, color: s.color, d: pts.length > 1 ? ag(pts) : null, opacity: stackedArea ? 0.85 : 0.16 })
    }
    base.lines.push(line)
  }

  // Area order: the sheet, or reversed.
  if (F.areaOrder === 'reverse') base.areas.reverse()

  // ── Value labels ───────────────────────────────────────────────────────────
  const LO = F.labels ?? {}
  // A step (XS…XL), or a free point size for all labels.
  const LABEL = sizePx(LO.size, 10 * FS, SIZE_STEP)
  // Label content: value, share of the
  // column, series name, category, or value and share.
  const colAbs = k => base.bars.filter(b => b.key === k).reduce((t, b) => t + Math.abs(b.value), 0)
  // Percent format distinct from the value format (two formats).
  const pctDec = LO.pctDecimals ?? userDecimals ?? 0
  // Consistent rounding of amounts: the displayed segments
  // of a stack sum to its displayed total. The rounding grid is read from the
  // formatter itself (the largest step that changes no text).
  const consistent = {}
  if (LO.consistent && stacked && !share) {
    for (const k of keys) {
      for (const g of groups) {
        const col = base.bars.filter(b => b.key === k && groupOf(series.find(x => x.id === b.seriesId) ?? {}) === g)
        if (col.length < 2) continue
        const unit = series.find(x => x.id === col[0].seriesId)?.unit ?? 'M'
        const r = consistentRound(col.map(b => b.value), v => format(v, unit, decOf(unit)))
        if (r) col.forEach((b, i) => { consistent[`${b.seriesId}|${k}`] = r[i] })
      }
    }
  }
  // Shares of a column, rounded consistently (they sum to 100%).
  const shareMemo = {}
  const sharesOf = k => {
    if (shareMemo[k]) return shareMemo[k]
    const col = base.bars.filter(b => b.key === k)
    const t = colAbs(k)
    const r = roundToSum(col.map(b => (t ? (Math.abs(b.value) / t) * 100 : 0)), pctDec)
    return (shareMemo[k] = Object.fromEntries(col.map((b, i) => [b.seriesId, r[i] * Math.sign(b.value || 1)])))
  }
  const shareText = (v, k, sid) => {
    const b100 = Number(F.base100?.[k])
    if (Number.isFinite(b100) && b100 > 0) return loc(`${LO.pctPlus && v > 0 ? '+' : ''}${((v / b100) * 100).toFixed(pctDec)}%`)
    const t = colAbs(k)
    if (!t) return ''
    const r = sid != null ? sharesOf(k)[sid] : null
    const pv = r ?? (v / t) * 100
    return loc(`${LO.pctPlus && pv > 0 ? '+' : ''}${pv.toFixed(pctDec)}%`)
  }
  const contentOf = (s, v, k, fallback) => {
    switch (LO.content) {
      case 'share': return s.mark === 'bar' ? shareText(v, k, s.id) : fallback
      case 'series': return s.label
      case 'category': return fx(k)
      case 'valueShare': return s.mark === 'bar' ? `${fallback} (${shareText(v, k, s.id)})` : fallback
      case 'seriesValue': return `${s.label} ${fallback}`
      // "% with series": the series name and its share of the column.
      case 'seriesShare': return s.mark === 'bar' ? `${s.label} ${shareText(v, k, s.id)}` : `${s.label} ${fallback}`
      default: return fallback
    }
  }
  // "Keep all labels": none gives way on collision.
  const keepAll = !!LO.keepAll
  // A free color (hex, "Style" control) overrides the series color.
  const labelTone = c => (isHex(LO.color) ? LO.color : LO.color === 'black' ? 'black' : LO.color === 'gray' ? 'gray-600' : LO.color === 'accent' ? 'gold-dark' : c)
  // Text in a mark's color: the forecast gray and the neutral of single-accent mode are
  // too pale for a number; they read in their darker ink. The accent is a fill color
  // (often light: gold, a lime): its numbers read in black, as on a bridge.
  const labelColor = c => (c === FORECAST_TOKEN ? 'gray-500' : c === NEUTRAL ? 'chart-neutral-ink' : c === ACCENT ? 'black' : c)
  const lastKeyOf = s => s.points.at(-1)?.x
  // Keep priority of an optional number (labelLayout): the first category, then
  // the max and min of its series, then the rest (the last one is mandatory).
  const rankOf = (s, k) => {
    const pts = s.points.filter(p => Number.isFinite(p.y))
    if (String(k) === String(pts[0]?.x)) return 1
    const vs = pts.map(p => p.y), hit = v => pts.find(p => p.y === v && String(p.x) === String(k))
    return hit(Math.max(...vs)) ? 2 : hit(Math.min(...vs)) ? 3 : 4
  }
  const outside = []
  const inside = []
  const errTopOf = (sid, k) => { const a = base.annotations.find(z => z.type === 'errorBar' && z.seriesId === sid && z.key === k); return a ? Math.min(a.y1, a.y2) - 2 : null }
  for (const s of series) {
    if (s.labels === 'none' || !s.points.length) continue
    // "Chosen": only the chosen points carry their number (labels one by one).
    const want = k => (s.labels === 'some' ? (F.labelKeys?.[s.id] ?? []).map(String).includes(String(k)) : s.labels === 'all' || k === lastKeyOf(s))
    // The text of a cell formatted in the sheet wins (format taken from the sheet).
    const text = (v, k) => (k != null && s.points.find(p => p.x === k)?.text) || format(k != null && consistent[`${s.id}|${k}`] != null ? consistent[`${s.id}|${k}`] : v, s.unit, decOf(s.unit))
    if (s.mark === 'bar') {
      for (const b of base.bars.filter(x => x.seriesId === s.id && want(x.key))) {
        const t = contentOf(s, b.value, b.key, text(b.value, b.key))
        const mid = b.x + b.width / 2
        // Inside the bar (label position), if it fits.
        if (!stacked && LO.position === 'inside' && b.height >= LABEL + 6 && estimateWidth(t, LABEL) + 4 <= b.width) {
          inside.push({ key: `${s.id}|${b.key}`, x: mid, y: b.negative ? b.y + b.height - 5 : b.y + LABEL + 3, text: t, size: LABEL, color: accentInk(spec, b.color) ?? 'white', anchor: 'middle', on: b.color })
          continue
        }
        if (stacked && LO.position !== 'outside') {
          // In a stack, the number goes INSIDE its segment if it fits; otherwise nothing.
          const tw = estimateWidth(t, LABEL)
          if (b.height >= LABEL + 4 && tw + 4 <= b.width) {
            inside.push({ key: `${s.id}|${b.key}`, x: mid, y: b.y + b.height / 2 + LABEL * 0.36, text: t, size: LABEL, color: accentInk(spec, b.color) ?? 'white', anchor: 'middle', on: b.color })
          } else if (b.height >= LABEL + 2) {
            // Wider than its segment: placed on a backdrop of the segment color.
            inside.push({ key: `${s.id}|${b.key}`, x: mid, y: b.y + b.height / 2 + LABEL * 0.36, text: t, size: LABEL, color: accentInk(spec, b.color) ?? 'white', anchor: 'middle', on: b.color, backdrop: b.color })
          } else if (b.key === lastKeyOf(s) && plot.right - (b.x + b.width) > tw + 12) {
            // Too thin: outside, right of the last column, linked by a leader line.
            outside.push({ key: `${s.id}|${b.key}`, x: b.x + b.width + 10, y: b.y + b.height / 2 + LABEL * 0.36, text: t, size: LABEL, color: labelTone(labelColor(b.color)), anchor: 'start', droppable: true, leader: { x1: b.x + b.width, y1: b.y + b.height / 2, x2: b.x + b.width + 8, y2: b.y + b.height / 2 } })
          }
          continue
        }
        // Stack "outside": right of the segment.
        if (stacked) {
          outside.push({ key: `${s.id}|${b.key}`, x: b.x + b.width + 3, y: b.y + b.height / 2 + LABEL * 0.36, text: t, size: LABEL, color: labelTone(labelColor(b.color)), anchor: 'start', droppable: true })
          continue
        }
        // Above an error bar's cap, never crossed by it.
        const eTop = errTopOf(s.id, b.key)
        const fitsIn = !b.negative && b.height >= LABEL + 8 && estimateWidth(t, LABEL) + 4 <= b.width
        outside.push({
          key: `${s.id}|${b.key}`, x: mid, y: b.negative ? b.y + b.height + LABEL + 3 : Math.min(b.y, eTop ?? Infinity) - 4, below: b.negative,
          // On collision, the number moves into the top of its bar rather than floating away.
          alt: fitsIn ? { y: b.y + LABEL + 3, color: accentInk(spec, b.color) ?? 'white', on: b.color } : null,
          text: t, size: LABEL, color: labelTone(labelColor(b.color)), anchor: 'middle', droppable: b.key !== lastKeyOf(s), rank: rankOf(s, b.key),
        })
      }
    } else {
      const line = base.lines.find(l => l.seriesId === s.id)
      for (const p of line?.points ?? []) {
        if (!want(p.key)) continue
        outside.push({
          key: `${s.id}|${p.key}`, x: p.x, y: Math.min(p.y, errTopOf(s.id, p.key) ?? Infinity) - 7, text: contentOf(s, p.value, p.key, text(p.value, p.key)), size: LABEL,
          color: labelTone(labelInk(s.color)), anchor: 'middle', droppable: p.key !== lastKeyOf(s), shiftable: true, rank: rankOf(s, p.key),
        })
      }
    }
  }

  // Stack totals: the sum above each stacked column.
  if (wantTotals) {
    const lastK = keys.filter(k => base.bars.some(b => b.key === k)).at(-1)
    const groupOfId = id => groupOf(series.find(s => s.id === id) ?? {})
    for (const k of keys) {
      // One total per stack: a single one per column, or one per group (stacked clustered).
      for (const g of groups) {
        const col = base.bars.filter(b => b.key === k && groupOfId(b.seriesId) === g)
        if (!col.length) continue
        const total = col.reduce((sum, b) => sum + b.value, 0)
        const top = Math.min(...col.map(b => b.y))
        outside.push({
          key: groups.length > 1 ? `total|${k}|${g}` : `total|${k}`, x: col[0].x + col[0].width / 2, y: top - 4, text: format(total, series.find(s => s.id === col[0].seriesId)?.unit ?? 'M', decOf(series.find(s => s.id === col[0].seriesId)?.unit ?? 'M')),
          size: LABEL, color: 'black', anchor: 'middle', droppable: k !== lastK,
        })
      }
    }
  }
  // Grand total: the sum of all bars, top right.
  if ((F.grandTotal || anns.some(a => a?.type === 'grandTotal')) && base.bars.length && !share) {
    const sum = base.bars.reduce((t, b) => t + b.value, 0)
    const unit = barSeries[0]?.unit ?? 'M'
    outside.push({ key: 'grandTotal', x: plot.right, y: plot.top - 6, text: `${t('Total', L)} ${format(sum, unit, decOf(unit))}`, size: LABEL, color: 'black', anchor: 'end' })
  }
  // Totals of a stacked area chart: at the top of the stack.
  if (areaMode === 'stacked' && anns.some(a => a?.type === 'totals')) {
    for (const k of keys) {
      const side = ['left', 'right'].find(sd => areaTop[`${sd}|${k}`] != null)
      if (!side) continue
      const y = yScaleOf(side)
      const unit = series.find(s => s.mark === 'area' && s.axis === side)?.unit ?? 'M'
      outside.push({ key: `total|${k}`, x: cx(k), y: y(areaTop[`${side}|${k}`]) - 5, text: format(areaTop[`${side}|${k}`], unit, decOf(unit)), size: LABEL, color: 'black', anchor: 'middle' })
    }
  }

  // ── Value line: a named horizontal reference (target, threshold…) ──────────
  for (const v of valueLines) {
    const ax = (v.axis ?? 'left') === 'right' ? right : left
    if (!ax) continue
    const yy = ax.scale(v.value)
    // `silent`: a reference without a number (the zero of a growth chart).
    const text = v.silent ? null : v.label ? `${v.label} ${format(v.value, ax.unit, decOf(ax.unit))}` : format(v.value, ax.unit, decOf(ax.unit))
    // Label above (default) or below the line, on the right (default) or left.
    const atLeft = v.labelAt === 'left'
    base.annotations.push({
      type: 'valueLine', user: !!v.user, fi: v.fi ?? null, axis: v.axis ?? 'left', x1: plot.left, x2: plot.right, y: yy, text,
      tx: atLeft ? plot.left + 4 : plot.right, ty: v.labelSide === 'below' ? yy + 11 : yy - 4, anchor: atLeft ? 'start' : 'end',
      color: v.tone ?? 'gray-500', textColor: v.tone ?? 'gray-600', dash: v.dash === 'solid' ? null : DASH_ARRAY[v.dash ?? 'dash'] ?? '4 3',
    })
  }

  // ── Bands: a tinted value zone, clipped to the frame ───────────────────────
  for (const b of bands) {
    const ax = (b.axis ?? 'left') === 'right' ? right : left
    if (!ax) continue
    const [y0, y1] = [ax.scale(b.from), ax.scale(b.to)].map(v => Math.min(plot.bottom, Math.max(plot.top, v)))
    if (Math.abs(y1 - y0) < 0.5) continue
    base.annotations.push({ type: 'band', x: plot.left, width: plot.width, y: Math.min(y0, y1), height: Math.abs(y1 - y0), color: b.tone ?? 'red-bg', label: b.label ?? null })
  }

  // ── Vertical marker of a period (e.g. an entry date) ───────────────────────
  for (const m of xMarkers) {
    if (!keys.includes(m.key)) continue
    const xx = cx(m.key)
    base.annotations.push({ type: 'xMarker', x: xx, y1: plot.top, y2: plot.bottom, text: m.label ?? '', color: m.tone ?? 'gold' })
  }

  // ── Min / max of a series: a point and its number ──────────────────────────
  for (const a of extremes) {
    const s = series.find(x => x.id === a.series)
    const pts = s.points.filter(p => keys.includes(p.x))
    const hi = pts.reduce((b, p) => (!b || p.y > b.y ? p : b), null)
    const lo = pts.reduce((b, p) => (!b || p.y < b.y ? p : b), null)
    const y = yScaleOf(s.axis)
    const at = (p, kind) => {
      const bar = base.bars.find(b => b.seriesId === s.id && b.key === p.x)
      // On a bar, both min and max read at the top: below the bar, the
      // number would fall on the date axis.
      const py = bar ? bar.y : y(p.y)
      return { kind, x: cx(p.x), y: py, onBar: !!bar, text: `${t(kind === 'max' ? 'Max' : 'Min', L)} ${format(p.y, s.unit, decOf(s.unit))}` }
    }
    const items = [at(hi, 'max'), ...(lo !== hi ? [at(lo, 'min')] : [])]
    base.annotations.push({ type: 'extremes', seriesId: s.id, items })
    for (const it of items) {
      const below = it.kind === 'min' && !it.onBar
      outside.push({
        key: `${it.kind}|${s.id}`, x: it.x, y: below ? it.y + LABEL + 6 : it.y - 7, below,
        text: it.text, size: LABEL - 1, color: 'gray-500', anchor: 'middle',
      })
    }
  }

  // ── CAGR arrow: from the first to the last point of a series ───────────────
  // The area of the settings button placed in the plot corner (opts.menuBox, chart without header):
  // no label is placed there (it would stay clickable).
  const obstacles = opts.menuBox ? [{ x0: width - opts.menuBox.w, x1: width + 1, y0: -1000, y1: opts.menuBox.h }] : []
  // Value-axis tick labels: no label covers them (a large
  // number in the first column used to overflow onto "€150M").
  for (const ax of [base.axes.left, base.axes.right]) {
    if (!ax) continue
    const out = (ax.side === 'left') !== !!ax.labelsInside
    for (const t of ax.ticks) {
      const w = estimateWidth(t.label, tickFont), yc = ax.labelsInside ? t.y - 7 : t.y
      const x0 = out ? ax.x - 6 - w : ax.x + 6
      obstacles.push({ x0: x0 - 1, x1: x0 + w + 1, y0: yc - tickFont / 2 - 1, y1: yc + tickFont / 2 + 1 })
    }
  }
  // The drawn top of a point (bar or line point), all series together.
  const topAt = k => {
    const ys = [
      ...base.bars.filter(b => b.key === k).map(b => b.y),
      ...base.lines.flatMap(l => l.points.filter(p => p.key === k).map(p => p.y)),
    ]
    return ys.length ? Math.min(...ys) : null
  }
  const labelled = wantLabels || wantTotals
  // Annotation stacking: difference arrows first, then CAGRs; each takes
  // a tier above the previous ones that overlap its x range. `reserved`: what a
  // following annotation must not cross ({ x0, x1, y }: nothing below y in [x0, x1]).
  const reserved = []
  // ── Difference arrows ──────────────────────────────────────────────────────
  // An end: the column total (without series), or a series' segment / point.
  const endOf = e => {
    const k = e.key
    if (!keys.includes(k)) return null
    // To a value line (arrow to value line): the gap to the target.
    if (e.vline != null) {
      const v = e.vline === 'user' ? valueLines.find(z => z.user && z.fi == null) : valueLines.find(z => z.fi === Number(e.vline))
      const ax = (v?.axis ?? 'left') === 'right' ? right : left
      if (!v || !ax) return null
      return { v: v.value, unit: ax.unit ?? 'M', x: cx(k), y: ax.scale(v.value), right: cx(k) + 4, own: true, line: true }
    }
    if (e.series) {
      const s = series.find(x => x.id === e.series)
      const p = s && valueAt(s, k)
      if (!p) return null
      const b = base.bars.find(x => x.seriesId === s.id && x.key === k)
      if (b) return { v: p.y, unit: s.unit, x: b.x + b.width / 2, y: b.negative ? b.y + b.height : b.y, right: b.x + b.width, own: true }
      const yy = yScaleOf(s.axis)(p.y)
      return { v: p.y, unit: s.unit, x: cx(k), y: yy, right: cx(k) + 4, own: true }
    }
    const col = base.bars.filter(b => b.key === k)
    if (col.length) {
      const unit = series.find(x => x.id === col[0].seriesId)?.unit ?? 'M'
      return { v: col.reduce((t, b) => t + b.value, 0), unit, x: cx(k), y: Math.min(...col.map(b => b.y)), right: Math.max(...col.map(b => b.x + b.width)) }
    }
    const s = series.find(x => valueAt(x, k))
    if (!s) return null
    const p = valueAt(s, k)
    return { v: p.y, unit: s.unit, x: cx(k), y: yScaleOf(s.axis)(p.y), right: cx(k) + 4 }
  }
  const arrowText = (va, vb, unitA, mode) => {
    const delta = vb - va
    const sgn = delta >= 0 ? '+' : '−'
    // Arrow modes (double-click on the arrow): amount, %, or both.
    // A difference keeps two significant digits of its own (+2.4 between 40 and 42.4).
    const abs = `${sgn}${format(Math.abs(delta), unitA, userDecimals ?? Math.max(decOf(unitA) ?? 0, autoDecimals([Math.abs(delta) * (unitA === 'pct' ? 100 : 1)])))}`
    const pct = loc(`${sgn}${Math.abs((delta / Math.abs(va)) * 100).toFixed(0)}%`)
    // "% of end": the other relative mode (the difference over the end value).
    const pctEnd = vb ? loc(`${sgn}${Math.abs((delta / Math.abs(vb)) * 100).toFixed(0)}%`) : pct
    // A single measure by default (the absolute difference); "both" on request.
    return mode === 'both' ? `${abs} (${pct})` : mode === 'pct' ? pct : mode === 'pctEnd' ? pctEnd : abs
  }
  // Shortest bridges first: a wider bridge goes above them.
  const bridgeSpan = d => Math.abs(keys.indexOf(d.to.key) - keys.indexOf(d.from.key))
  const ordered = [...diffs].sort((a, b) => (a.level - b.level) || (bridgeSpan(a) - bridgeSpan(b)))
  const placedD = []
  let levelRank = 0
  for (const d of ordered) {
    const A = endOf(d.from)
    const B = endOf(d.to)
    if (!A || !B || !A.v || (d.from.key === d.to.key && d.from.series === d.to.series && d.from.vline === d.to.vline)) {
      warnings.push(`Difference arrow ${d.from.key} → ${d.to.key}: not drawn, ${!A || !B ? 'no value at one of its ends' : !A.v ? 'its start is zero' : 'both ends are the same point'}.`)
      continue
    }
    const unitA = d.from.series || d.to.series ? A.unit : A.unit ?? 'M'
    const text = arrowText(A.v, B.v, unitA, d.mode ?? F.diffMode)
    const pillW = estimateWidth(text, 10.5) + 16
    const common = { type: 'diff', fi: d.fi ?? null, fromKey: d.from.key, toKey: d.to.key, fromSeries: d.from.series, toSeries: d.to.series, text, pillW }
    if (d.level) {
      // Level difference: two horizontal strokes from both elements, a vertical
      // arrow right of the rightmost one, the number beside it.
      // Several level arrows side by side (they stack): an arrow whose
      // badge would touch an already placed badge moves to its right; without room, the badge moves down.
      let xr = Math.max(A.right, B.right) + 10 + levelRank * 12
      levelRank++
      let py = (A.y + B.y) / 2
      let px = xr + 6 + pillW <= width - 2 ? xr + 6 + pillW / 2 : xr - 6 - pillW / 2
      const box = () => ({ x0: px - pillW / 2 - 2, x1: px + pillW / 2 + 2, y0: py - 10, y1: py + 10 })
      const clash = () => reserved.find(r => r.pill && r.x0 < box().x1 && box().x0 < r.x1 && r.y < box().y1 && box().y0 < r.y + 20)
      for (let t = 0, c = clash(); c && t < 6; t++, c = clash()) {
        if (c.x1 + 8 + pillW <= width - 2) { xr = c.x1 + 4; px = xr + 6 + pillW / 2 } else py = c.y + 20 + 10 + 1
      }
      base.annotations.push({ ...common, style: 'level', xa: A.x, xb: B.x, ra: A.right, rb: B.right, ya: A.y, yb: B.y, xr, yTop: py, px, py })
      obstacles.push({ x0: px - pillW / 2, x1: px + pillW / 2, y0: py - 9, y1: py + 9 })
      reserved.push({ x0: px - pillW / 2, x1: px + pillW / 2, y: py - 10, pill: true })
      continue
    }
    const clear = labelled ? 18 : 8
    const [i0, i1] = [keys.indexOf(d.from.key), keys.indexOf(d.to.key)].sort((p, q) => p - q)
    let peak = Infinity
    for (let i = i0; i <= i1; i++) { const t = topAt(keys[i]); if (t != null) peak = Math.min(peak, t) }
    if (A.own) peak = Math.min(peak, A.y)
    if (B.own) peak = Math.min(peak, B.y)
    let yTop = Math.max(plot.top - 10, peak - clear - 14)
    const xa = A.own ? A.x : cx(d.from.key)
    const xb = B.own ? B.x : cx(d.to.key)
    const [lo, hi] = [Math.min(xa, xb), Math.max(xa, xb)]
    // Several difference arrows: one that overlaps another moves up one tier.
    for (const q of placedD) if (Math.min(hi, q.hi) - Math.max(lo, q.lo) > 1 && Math.abs(q.yTop - yTop) < 22) yTop = Math.min(yTop, q.yTop - 22)
    yTop = Math.max(4, yTop)
    placedD.push({ lo, hi, yTop })
    // The bracket and its badge reserve their height: a CAGR spanning them goes above.
    reserved.push({ x0: lo, x1: hi, y: yTop - 10 })
    const ya = (A.own ? A.y : topAt(d.from.key) ?? plot.bottom) - clear
    const yb = (B.own ? B.y : topAt(d.to.key) ?? plot.bottom) - clear
    // Arrow shorter than its bubble: the bubble moves beside the bracket.
    const short = hi - lo < pillW + 6
    const bx = short ? (hi + 6 + pillW <= width - 2 ? hi + 6 + pillW / 2 : lo - 6 - pillW / 2) : (xa + xb) / 2
    base.annotations.push({ ...common, style: 'bridge', xa, xb, ya, yb, yTop, px: bx, py: yTop, beside: short })
    obstacles.push({ x0: bx - pillW / 2, x1: bx + pillW / 2, y0: yTop - 9, y1: yTop + 9 })
  }

  for (const a of cagrs) {
    let first, last, periods, sid
    if (explicitCagr(a)) {
      // An end's point: in its series, otherwise in the first series that
      // has a number at that category (bars first).
      const at = end => {
        const k = String(end.key)
        const own = series.find(x => x.id === (end.series ?? a.series))?.points.find(p => p.x === k)
        if (own) return own
        const pool = [...series.filter(x => x.mark === 'bar'), ...series.filter(x => x.mark !== 'bar')]
        for (const sr of pool) { const p = sr.points.find(q => q.x === k); if (p) return p }
        return null
      }
      first = at(a.from)
      last = at(a.to)
      periods = a.periods > 0 ? a.periods : first && last ? yearsBetween(first, last, grain) : 0
      // Columns that name no year (a category axis of periods: 'H1', 'Wave 2'): one period per
      // column between the two ends, rather than no arrow at all.
      if (!(periods > 0) && grain === 'category' && first && last) periods = Math.abs(keys.indexOf(String(last.x)) - keys.indexOf(String(first.x)))
      sid = a.series ?? a.from.series
    } else {
      const s = series.find(x => x.id === a.series)
      // From the first to the last ACTUAL: a forecast does not make growth.
      const pool = s.points.filter(p => keys.includes(p.x) && p.type !== 'forecast')
      first = pool[0]
      last = pool.at(-1)
      periods = first && last ? yearsBetween(first, last, grain) : 0
      sid = s.id
    }
    if (!first || !last || first === last || !keys.includes(first.x) || !keys.includes(last.x)) {
      warnings.push(`${cagrName(a)}: not drawn, ${!first || !last ? 'no value at one of its ends' : first === last ? 'both ends are the same point' : 'one of its ends is hidden'}.`)
      continue
    }
    if (!(first.y > 0 && last.y > 0 && periods > 0)) {
      warnings.push(`${cagrName(a)}: not drawn, ${periods > 0 ? 'a growth rate needs two positive values' : 'no period between its ends'} (${first.y} → ${last.y}).`)
      continue
    }
    const rate = (last.y / first.y) ** (1 / periods) - 1
    const lift = (labelled ? 16 : 0) + 10
    const xa = cx(first.x)
    const xb = cx(last.x)
    let ya = Math.max(plot.top + 6, (topAt(first.x) ?? plot.bottom) - lift)
    let yb = Math.max(plot.top + 6, (topAt(last.x) ?? plot.bottom) - lift)
    // An arc that goes above everything it spans (and always slightly curved).
    const [i0, i1] = [keys.indexOf(first.x), keys.indexOf(last.x)].sort((p, q) => p - q)
    let peak = Math.min(ya, yb)
    for (let i = i0 + 1; i < i1; i++) { const t = topAt(keys[i]); if (t != null) peak = Math.min(peak, t - lift) }
    const ctrlX = (xa + xb) / 2
    let ctrlY = Math.max(plot.top - 4, peak - 14)
    // Above the brackets and badges already placed: an end under a bracket rises above
    // it, and the arc passes at least 6 px from everything it spans.
    const [lx, hx] = [Math.min(xa, xb), Math.max(xa, xb)]
    for (const r of reserved) {
      if (r.x1 < lx - 2 || r.x0 > hx + 2) continue
      if (xa >= r.x0 - 2 && xa <= r.x1 + 2) ya = Math.min(ya, r.y - 6)
      if (xb >= r.x0 - 2 && xb <= r.x1 + 2) yb = Math.min(yb, r.y - 6)
    }
    for (const r of reserved) {
      if (r.x1 < lx || r.x0 > hx) continue
      for (const px of [Math.max(r.x0, lx), Math.min(r.x1, hx), (Math.max(r.x0, lx) + Math.min(r.x1, hx)) / 2]) {
        const t = (px - xa) / (xb - xa || 1)
        if (!(t > 0.02 && t < 0.98)) continue
        const A = (1 - t) ** 2 * ya + t ** 2 * yb
        ctrlY = Math.min(ctrlY, (r.y - 6 - A) / (2 * t * (1 - t)))
      }
    }
    const mx = (xa + 2 * ctrlX + xb) / 4
    let my = (ya + 2 * ctrlY + yb) / 4
    const sgn = rate >= 0 ? '+' : '−'
    const text = `${a.label ?? t('CAGR', L)} ${loc(`${sgn}${Math.abs(rate * 100).toFixed(1)}%`)}`
    const pillW = estimateWidth(text, 10.5) + 16
    // Several CAGRs (over successive pairs): an arc that spans another,
    // or whose label would touch its own, moves up one tier.
    const placedC = base.annotations.filter(z => z.type === 'cagr')
    for (let t = 0; t < 8; t++) {
      const clash = placedC.find(z => (Math.abs(z.mx - mx) < (z.pillW + pillW) / 2 + 4 && Math.abs(z.my - my) < 20)
        || (Math.min(xb, z.xb) - Math.max(xa, z.xa) > 1 && Math.max(xa, xb) - Math.min(xa, xb) > Math.abs(z.xb - z.xa) && z.my - my < 20))
      if (!clash) break
      my = Math.min(my, clash.my) - 20
      ctrlY = (4 * my - ya - yb) / 2
    }
    base.annotations.push({
      type: 'cagr', seriesId: sid, fromKey: first.x, toKey: last.x, xa, ya, xb, yb, ctrlX, ctrlY, mx, my, text, pillW,
      // Color (CAGR arrow color): set by the reading layer per bounds, otherwise the spec's.
      d: `M${xa},${ya} Q${ctrlX},${ctrlY} ${xb},${yb}`, tone: F.cagrTones?.[`${first.x}|${last.x}`] ?? a.tone ?? 'gray-500',
    })
    obstacles.push({ x0: mx - pillW / 2, x1: mx + pillW / 2, y0: my - 9, y1: my + 9 })
  }

  // ── Annotated points: the break at the last actual, written on the chart ────
  for (const a of anns.filter(x => x?.type === 'callout')) {
    const s = series.find(x => x.id === a.series)
    const p = s?.points.find(q => q.x === String(a.key))
    if (!p || !keys.includes(p.x)) continue
    const px = cx(p.x)
    const py = yScaleOf(s.axis)(p.y)
    base.annotations.push({ type: 'callout', x: px, y: py, tone: a.tone ?? labelInk(s.color) })
    if (a.above?.text) outside.push({ key: `callout-a|${a.key}`, x: px, y: py - 10, text: a.above.text, size: LABEL + 1, color: a.above.tone ?? 'gray-700', anchor: 'middle' })
    if (a.below?.text) outside.push({ key: `callout-b|${a.key}`, x: px, y: py + LABEL + 12, below: true, text: a.below.text, size: LABEL + 1, color: a.below.tone ?? 'gray-700', anchor: 'middle' })
  }

  // ── End-of-line names: at the last point, spread so they never touch ───────
  base.endLabels = []
  if (direct) {
    // A callout `endLabel: false` replaces its series' end name (it already says it).
    const calloutAt = new Set(anns.filter(a => a?.type === 'callout' && a.endLabel === false).map(a => `${a.series}|${a.key}`))
    const ends = base.lines
      .filter(l => l.points.length && !calloutAt.has(`${l.seriesId}|${l.points.at(-1).key}`))
      .map(l => {
        const s = series.find(x => x.id === l.seriesId)
        const last = l.points.at(-1)
        return { seriesId: l.seriesId, text: s.label, color: labelInk(s.color), x: last.x + 8, y: last.y, anchorY: last.y }
      })
    // Bars: in the middle of their segment in the last column (stacked), or at the top.
    if (seriesOnChart) {
      const lastK = keys.filter(k => base.bars.some(b => b.key === k)).at(-1)
      for (const b of base.bars.filter(x => x.key === lastK)) {
        const s = series.find(x => x.id === b.seriesId)
        if (!s || ends.some(e => e.seriesId === s.id)) continue
        const yy = stacked ? b.y + b.height / 2 : b.y
        ends.push({ seriesId: s.id, text: s.label, color: labelInk(s.color), x: b.x + b.width + 8, y: yy, anchorY: yy, fromX: b.x + b.width + 1 })
      }
    }
    ends.sort((a, b) => a.y - b.y)
    const GAP = END_FONT + 2
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < GAP) ends[i].y = ends[i - 1].y + GAP
    // If the pile overflows at the bottom, it is moved up as a block.
    const over = (ends.at(-1)?.y ?? 0) - plot.bottom
    if (over > 0) for (const e of ends) e.y -= over
    // A line clipped by a max set by hand: its name stays inside the frame, below the edge.
    const fTop = Math.min(...[left, right].filter(a => a?.manual).map(a => Math.min(a.scale(a.scale.domain()[0]), a.scale(a.scale.domain()[1]))))
    if (Number.isFinite(fTop) && ends[0] && ends[0].y < fTop + END_FONT / 2 + 1) {
      const shift = fTop + END_FONT / 2 + 1 - ends[0].y
      for (const e of ends) e.y += shift
    }
    for (const e of ends) e.text = ellipsizeEnd(e.text, width - e.x - 2, END_FONT)
    base.endLabels = ends
    // Placed names are obstacles: value labels move away from them.
    for (const e of ends) obstacles.push({ x0: e.x, x1: e.x + estimateWidth(e.text, END_FONT), y0: e.y - END_FONT / 2 - 1, y1: e.y + END_FONT / 2 + 1 })
  }



  // ── Value-line labels: mutual obstacles with the badges ────────────────────
  // A label that would touch an arrow or CAGR badge, or another value-line
  // label, moves below its line, then to the other end, then up one tier.
  const pillBoxes = base.annotations.filter(a => a.pillW).map(a => {
    const px = a.mx ?? a.px, py = a.my ?? a.py
    return { x0: px - a.pillW / 2 - 2, x1: px + a.pillW / 2 + 2, y0: py - 11, y1: py + 11 }
  })
  const touches = (b, list) => list.some(o => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1)
  const placedV = []
  for (const v of base.annotations.filter(a => a.type === 'valueLine' && a.text)) {
    const w = estimateWidth(v.text, 10)
    const boxAt = (tx, ty, anchor) => { const x0 = anchor === 'end' ? tx - w : tx; return { x0, x1: x0 + w, y0: ty - 10, y1: ty + 2 } }
    const otherX = v.anchor === 'end' ? plot.left + 4 : plot.right
    const otherA = v.anchor === 'end' ? 'start' : 'end'
    const below = v.ty > v.y
    const tries = [[v.tx, v.ty, v.anchor], [v.tx, below ? v.y - 4 : v.y + 11, v.anchor], [otherX, v.ty, otherA], [otherX, below ? v.y - 4 : v.y + 11, otherA]]
    const others = [...pillBoxes, ...placedV]
    let ok = tries.find(([tx, ty, an]) => !touches(boxAt(tx, ty, an), others))
    if (!ok) {
      let ty = v.ty
      for (let i = 0; i < 4 && touches(boxAt(v.tx, ty, v.anchor), others); i++) ty -= 12
      ok = [v.tx, ty, v.anchor]
    }
    ;[v.tx, v.ty, v.anchor] = ok
    const b = boxAt(v.tx, v.ty, v.anchor)
    placedV.push(b)
    obstacles.push(b)
  }

  // ── Table columns (categories moved out of the plot) ───────────────────────
  // Each number at the height of its series in the last column (middle of the segment,
  // top of the bar, last point of the line), spread so they do not touch.
  base.tableCols = []
  if (tableColKeys.length) {
    const lastK = keys.filter(k => !k.startsWith('_')).at(-1)
    const rows = series.filter(s => !s.other && Object.keys(s.colVals).length).map((s, i) => {
      const b = base.bars.find(x => x.seriesId === s.id && x.key === lastK)
      const lp = base.lines.find(l => l.seriesId === s.id)?.points.at(-1)
      const y = b ? (stacked ? b.y + b.height / 2 : b.y + 6) : lp ? lp.y : plot.top + 10 + i * 14
      return { seriesId: s.id, color: labelColor(s.color), y }
    }).sort((a, b) => a.y - b.y)
    for (let i = 1; i < rows.length; i++) if (rows[i].y - rows[i - 1].y < 13) rows[i].y = rows[i - 1].y + 13
    const over = (rows.at(-1)?.y ?? 0) - (plot.bottom - 4)
    if (over > 0) for (const r of rows) r.y -= over
    let x0 = width - tableW
    tableColKeys.forEach((k, ci) => {
      const w = tableColW[ci]
      const xc = x0 + w / 2
      base.tableCols.push({
        key: k, header: spec?.x?.names?.[k] ?? formatX(k, grain), x: xc, x0, width: w,
        items: rows.map(r => ({ seriesId: r.seriesId, y: r.y, color: r.color, text: tableColText(series.find(s => s.id === r.seriesId), k) })),
      })
      x0 += w
    })
  }

  // A label removed one by one (select it, Delete); bold or not.
  const gone = new Set(LO.hidden ?? [])
  const weight = LO.bold === false ? 400 : 600
  const rot = [90, 45, -90].includes(LO.rotate) ? LO.rotate : 0
  // Rotated: the label rises from the top of its bar (anchored at start), no horizontal collision handling.
  const placed = rot ? outside.map(l => ({ ...l, droppable: false })) : keepAll ? outside.map(l => ({ ...l, droppable: false })) : outside
  // Label moved by hand (drag a label; "Reset" puts it back).
  const moved = LO.offsets ?? {}
  // Dropped INSIDE its bar ("center" position): an inside label, no leader
  // line, in a contrasting color (white, or black on a light fill).
  const inBarIfDropped = l => {
    const w = estimateWidth(l.text, l.size)
    const cxl = l.anchor === 'start' ? l.x + w / 2 : l.anchor === 'end' ? l.x - w / 2 : l.x
    const cyl = l.y - l.size * 0.35
    // Its bar, or any other bar under its center: contrast is read on the actual fill.
    const b = base.bars.find(x => !x.hollow && cxl >= x.x && cxl <= x.x + x.width && cyl >= x.y && cyl <= x.y + x.height && x.height >= l.size + 2)
    if (!b) return l
    return { ...l, inBar: true, color: accentInk(spec, b.color) ?? 'white', on: b.color, backdrop: undefined }
  }
  // A number stays attached to its bar even when a line crosses it: the view
  // outlines it (halo in the background color), so it reads without floating away from its
  // segment. Labels are measured at their real size (single-label size included) and in their font.
  for (const l of placed) {
    const st = LO.styles?.[l.key]
    if (st?.size && !l.sized) { l.size = sizePx(st.size, l.size, { xsmall: 0.8, small: 0.85, large: 1.25, xlarge: 1.4 }); l.sized = true }
  }
  const lblMeasure = labelMetrics({ labelFont: isFont(LO.font) && LO.font ? LO.font : null }, LABEL).measure
  // A label that would overflow onto a value axis's ticks slides into the
  // plot (the first number shifts rather than covering the axis or disappearing).
  if (!rot) {
    // The original spot (the bar's point), for the leader line of a displaced label.
    for (const l of placed) if (l.px == null) { l.px = l.x; l.py = l.y }
    for (const l of placed) {
      if (moved[l.key]) continue
      const w = lblMeasure(l.text, l.size) * 1.04
      const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
      // The shifted label still covers its point (its anchor stays under the text).
      if (base.axes.left?.ticks.length && !base.axes.left.labelsInside && x0 < plot.left + 2 && plot.left + 2 <= l.x) l.x += plot.left + 2 - x0
      else if (base.axes.right?.ticks.length && !base.axes.right.labelsInside && x0 + w > plot.right - 2 && plot.right - 2 >= l.x) l.x -= x0 + w - (plot.right - 2)
    }
  }
  const kept = rot ? placed : resolveCollisions(placed, lblMeasure, obstacles, isPt(LO.size) ? { bounds: { x0: 0, x1: width, y0: 0, y1: height } } : {})
  // Labels removed for lack of room (counted, never silently); at a free size, a label
  // that would leave the card (above the plot, at the edge) is removed too.
  const inCard = l => {
    if (rot || !isPt(LO.size) || moved[l.key]) return true
    const w = lblMeasure(l.text, l.size), x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
    return x0 >= 0 && x0 + w <= width && l.y - l.size * 0.8 >= 0 && l.y + l.size * 0.25 <= height
  }
  const keptIn = kept.filter(inCard)
  // Moved sideways by more than half a column: a short leader line
  // links the number to its bar, from the bar top to the nearest edge of the text.
  if (!rot) {
    for (const l of keptIn) {
      if (moved[l.key] || l.leader) continue
      const ld = leaderLine(l, lblMeasure, xStep / 2)
      if (ld) l.leader = ld
    }
  }
  base.noRoom = placed.filter(l => !gone.has(l.key)).length - keptIn.filter(l => !gone.has(l.key)).length
  base.labelsWanted = placed.filter(l => !gone.has(l.key)).length + inside.filter(l => !gone.has(l.key)).length
  base.labels = [...keptIn, ...inside]
    .filter(l => !gone.has(l.key))
    .map(l => (moved[l.key] ? inBarIfDropped({ ...l, x: l.x + moved[l.key].dx, y: l.y + moved[l.key].dy, moved: true, ox: l.x, oy: l.y - l.size * 0.35 }) : l))
    // Free text (typing on a label): a template where {value}, {share},
    // {series}, {category} stay linked to the data; the label is marked "overwritten".
    .map(l => {
      const tpl = LO.texts?.[l.key]
      if (tpl == null) return l
      const [sid, k] = l.key.split('|')
      const sr = series.find(x => x.id === sid)
      const b = base.bars.find(x => x.seriesId === sid && x.key === k)
      const v = b?.value ?? valueAt(sr ?? { points: [] }, k)?.y
      const text = String(tpl)
        .replaceAll('{value}', v != null && sr ? format(v, sr.unit, decOf(sr.unit)) : '')
        .replaceAll('{share}', b ? shareText(b.value, k, sid) : '')
        .replaceAll('{series}', sr?.label ?? '')
        .replaceAll('{category}', k != null ? fx(k) : '')
      return { ...l, text, overwritten: true }
    })
    // Automatic contrast: on a light segment, the number turns black.
    // (a semantic token reads as its palette fallback: the forecast gray is light).
    .map(l => (l.color === 'white' && l.on && (LIGHT_FILLS.has(baseToken(l.on)) || isLightHex(l.on)) ? { ...l, color: 'black' } : l))
    // Label style (size, bold, color of ONE label); the chart's number font.
    .map(l => {
      const st = LO.styles?.[l.key]
      // Number font, or a free family (customStyle.FONTS) for all, then label by label.
      const font = isFont(LO.font) && LO.font ? LO.font : 'mono'
      // Italic / underline (label font): for all, then label by label.
      const it = { italic: !!LO.italic || !!l.italic, underline: !!LO.underline }
      if (!st) return { ...l, font, ...it }
      return { ...l, font: st.font ?? font, size: st.size && !l.sized ? sizePx(st.size, l.size, { xsmall: 0.8, small: 0.85, large: 1.25, xlarge: 1.4 }) : l.size,
        ownWeight: st.bold === false ? 400 : st.bold ? 700 : undefined, color: st.color ?? l.color,
        italic: st.italic ?? it.italic, underline: st.underline ?? it.underline }
    })
    // Background of an overflowing label: the width of its text.
    .map(l => (l.backdrop ? { ...l, backdropW: estimateWidth(l.text, l.size) + 8 } : l))
    // On a negative bar, it goes down from the bottom of the bar (anchored at end).
    .map(l => (rot && l.color !== 'white'
      ? rot < 0
        // Rotated to the right: the text ends at the bar top and reads downwards.
        ? { ...l, weight: l.ownWeight ?? weight, rotate: rot, anchor: l.below ? 'start' : 'end', x: l.x - l.size * 0.35, y: l.below ? l.y - l.size : l.y }
        : { ...l, weight: l.ownWeight ?? weight, rotate: rot, anchor: l.below ? 'end' : 'start', x: l.x + l.size * 0.35, y: l.below ? l.y - l.size : l.y }
      : { ...l, weight: l.ownWeight ?? weight, rotate: 0 }))
  // Sheet font on labels ("Use Datasheet Bold/Italic, Font Color,
  // Alignment, Border"): bold, italic, color, left / right, top / bottom, frame.
  if (F.sheetFont) {
    base.labels = base.labels.map(l => {
      const [sid, k] = String(l.key).split('|')
      const ft = series.find(x => x.id === sid)?.points.find(p => String(p.x) === k)?.font
      if (!ft || l.rotate) return l
      const w = estimateWidth(l.text, l.size)
      const cxl = l.anchor === 'start' ? l.x + w / 2 : l.anchor === 'end' ? l.x - w / 2 : l.x
      const x = ft.align === 'left' ? cxl - w / 2 - 2 : ft.align === 'right' ? cxl + w / 2 + 2 : l.x
      const anchor = ft.align === 'left' ? 'middle' : ft.align === 'right' ? 'middle' : l.anchor
      const y = l.y + (ft.valign === 'top' ? -l.size * 0.6 : ft.valign === 'bottom' ? l.size * 0.6 : 0)
      return { ...l, x: ft.align ? x : l.x, anchor: ft.align ? anchor : l.anchor, y, weight: ft.bold ? 700 : l.weight, italic: !!ft.italic, color: ft.color ?? l.color, border: !!ft.border }
    })
  }
  // 100% indicator: above the first column of a 100% stacked chart.
  if (share && F.indicator100 !== false && F.indicator100) {
    const first = keys.find(k => base.bars.some(b => b.key === k))
    const col = base.bars.filter(b => b.key === first)
    if (col.length) base.labels.push({ key: 'indicator100', x: col[0].x + col[0].width / 2, y: Math.min(...col.map(b => b.y)) - 4, text: loc('100%'), size: LABEL, color: 'gray-700', anchor: 'middle', weight })
  }

  // Free text fields: placed as fractions of the plot, they follow the chart size.
  base.notes = (F.notes ?? []).map((n, i) => n && Number.isFinite(n.fx) && Number.isFinite(n.fy) ? {
    i, text: String(n.text ?? ''), x: plot.left + n.fx * plot.width, y: plot.top + n.fy * plot.height,
    size: Math.round(11 * FS * ({ small: 0.9, large: 1.25 }[n.size] ?? 1)), bold: !!n.bold, anchor: n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start',
    // Rotation (rotate text 90° left / right) and vertical alignment on the placed point.
    rotate: n.rotate === 90 || n.rotate === -90 ? n.rotate : 0, valign: n.valign === 'middle' || n.valign === 'bottom' ? n.valign : 'top',
  } : null).filter(Boolean)
  // Legend frame: a rule around the entries.
  if (F.legendFrame && base.legend.length) {
    const x0 = Math.min(...base.legend.map(it => it.x)) - 6
    const x1 = Math.max(...base.legend.map(it => it.x + (it.width ?? 60))) + 6
    const y0 = Math.min(...base.legend.map(it => it.y)) - 10
    const y1 = Math.max(...base.legend.map(it => it.y)) + 8
    base.legendFrame = { x: x0, y: base.legendY + y0, width: x1 - x0, height: y1 - y0, color: F.legendFrameColor ?? null, style: F.legendFrameStyle ?? null }
  }
  // Legend moved by hand (dragged): an offset applied to the whole legend.
  const lo = F.legendOffset
  base.legendOffset = lo && Number.isFinite(lo.dx) && Number.isFinite(lo.dy) ? { dx: lo.dx, dy: lo.dy } : null

  // Values that cannot be shown on a log scale: placed on the base, marked "!".
  for (const s of series) {
    const ax = s.axis === 'right' ? right : left
    if (!ax?.log) continue
    for (const p of s.points) {
      if (!(p.y <= 0) || !keys.includes(String(p.x))) continue
      base.labels.push({ key: `logflag|${s.id}|${p.x}`, x: cx(String(p.x)), y: ax.scale(ax.scale.domain()[0]) - 4, text: '!', size: LABEL, color: 'red-text', anchor: 'middle', weight: 700, logFlag: true })
    }
  }

  // ── Hover columns (tooltip) ────────────────────────────────────────────────
  const half = xStep / 2
  base.columns = keys.map(k => ({
    key: k, label: fx(k), cx: cx(k),
    x0: Math.max(plot.left, cx(k) - half), x1: Math.min(plot.right, cx(k) + half),
    items: series.map(s => {
      const p = valueAt(s, k)
      if (!p) return null
      return {
        seriesId: s.id, label: s.label, color: p.type === 'forecast' && s.role === 'actual' && s.mark === 'bar' ? FORECAST_TOKEN : s.color,
        mark: s.mark, dash: DASH_ARRAY[s.dash], value: p.y, type: p.type,
        text: format(p.y, s.unit, decOf(s.unit)),
      }
    }).filter(Boolean),
  }))

  return base
}

// Text drawn in a series color: the single-accent neutral is too pale for text.
const labelInk = c => (c === NEUTRAL ? 'chart-neutral-ink' : c)

/**
 * Profile chart: lines rotated by 90°.
 * Categories read top to bottom on the left, values along the x axis; each
 * series links its points from row to row. Lines only (a bar makes no sense here).
 * → { profile: true, width, height, plot, legend, legendY, lines, labels, gridlines, axes: { cat, value }, empty }
 */
export function buildProfileScene(spec, resolved = [], opts = {}) {
  const width = Math.max(160, Math.round(opts.width ?? 640))
  const height = Math.max(140, Math.round(opts.height ?? 260))
  const L = localeOf(spec)
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const fmtAxis = opts.formatAxis ? localizedFormat(opts.formatAxis, L) : format
  const grain = spec?.x?.grain ?? 'quarter'
  const F = spec?.format ?? {}
  const userDecimals = spec?.numberFormat?.decimals ?? null
  const hidden = new Set((spec?.x?.hidden ?? []).map(String))
  const ranks = roleRanks(spec?.series, resolved)
  const series = (spec?.series ?? []).map((s, i) => {
    const r = resolved[i] ?? { points: [] }
    return {
      id: s.id ?? `s${i}`, color: accentColor(spec, s.id ?? `s${i}`, colorToken(s.style, r.role, ranks[i])), label: r.label ?? s.id, unit: r.unit ?? 'M',
      dash: DASH_ARRAY[s.style?.dash ?? 'solid'] ?? null, weight: Number.isFinite(s.style?.weight) ? s.style.weight : 2,
      markerShape: s.style?.markerShape ?? 'circle', labels: s.labels ?? 'none', net: s.style?.step === 'lines',
      points: (r.points ?? []).filter(p => p && p.x != null && Number.isFinite(p.y) && !hidden.has(String(p.x))),
    }
  })
  const autoDec = autoDecimalsByUnit(series)
  const decOf = unit => userDecimals ?? autoDec[unit ?? ''] ?? null
  const seen = []
  for (const s of series) for (const p of s.points) if (!seen.includes(String(p.x))) seen.push(String(p.x))
  const keys = (grain === 'category' && Array.isArray(spec?.x?.keys) ? spec.x.keys.map(String) : axisKeys(seen, grain))
    .filter(k => !hidden.has(k) && !k.startsWith('_'))
  if (F.catOrder === 'reverse') keys.reverse()
  const fx = k => spec?.x?.names?.[k] ?? formatX(k, grain)
  const legend = opts.legend === false || F.legend === 'none' ? { items: [], height: 0 }
    : layoutLegend(series.map(s => ({ seriesId: s.id, label: s.label, color: s.color, mark: 'line', dash: s.dash, empty: !s.points.length })), width, 1, L)
  const vals = series.flatMap(s => s.points.map(p => p.y))
  const base = { profile: true, width, height, legend: legend.items, legendY: 0, lines: [], labels: [], gridlines: [], axes: { cat: [], value: [] }, empty: !keys.length || !vals.length }
  const catW = Math.min(width * 0.3, Math.max(0, ...keys.map(k => estimateWidth(fx(k)))) + 14)
  const plot = { left: catW, right: width - 18, top: legend.height + 10, bottom: height - 22 }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot
  if (base.empty) return stamp(base, 'chart', spec, { variant: 'profile' })
  const yo = F.yAxis?.left ?? {}
  let dom = domainOf(vals, false)
  if (Number.isFinite(yo.min) || Number.isFinite(yo.max)) {
    const d = [Number.isFinite(yo.min) ? yo.min : dom[0], Number.isFinite(yo.max) ? yo.max : dom[1]]
    if (d[0] < d[1]) dom = d
  }
  const sx = scaleLinear().domain(dom).range(yo.reverse ? [plot.right, plot.left] : [plot.left, plot.right])
  const count = Math.max(2, Math.min(8, Math.floor(plot.width / 70)))
  if (!(Number.isFinite(yo.min) || Number.isFinite(yo.max))) sx.nice(count)
  const tv = sx.ticks(count)
  const unit = series.find(s => s.points.length)?.unit ?? 'M'
  const dec = tickDecimals(tv.length > 1 ? Math.abs(tv[1] - tv[0]) : 1, unit)
  base.axes.value = tv.map(v => ({ value: v, x: sx(v), label: v === 0 && unit !== 'pct' && unit !== 'x' ? '0' : fmtAxis(v, unit, unit === 'pct' ? null : dec) }))
  base.axes.y = plot.bottom
  base.gridlines = F.grid === 'none' ? [] : tv.map(v => ({ x: sx(v), y1: plot.top, y2: plot.bottom, zero: v === 0 && sx.domain()[0] < 0 }))
  const row = plot.height / keys.length
  const ry = k => plot.top + (keys.indexOf(k) + 0.5) * row
  base.axes.cat = keys.map(k => ({ key: k, label: ellipsizeEnd(fx(k), catW - 10, TICK_FONT), y: ry(k) }))
  const gen = d3line().x(p => p.x).y(p => p.y).curve(curveLinear)
  const outside = []
  for (const s of series) {
    const pts = keys.map(k => s.points.find(p => String(p.x) === k)).filter(Boolean)
      .map(p => ({ key: String(p.x), x: sx(p.y), y: ry(String(p.x)), value: p.y }))
    if (!pts.length) continue
    // Net line on a profile: one vertical stroke per row, at its value.
    const d = s.net ? pts.map(p => `M${p.x},${p.y - row * 0.35} V${p.y + row * 0.35}`).join(' ') : pts.length > 1 ? gen(pts) : null
    base.lines.push({ seriesId: s.id, color: s.color, dash: s.dash, strokeWidth: s.weight, d, markerShape: s.net || s.markerShape === 'none' ? null : s.markerShape, points: pts })
    if (s.labels === 'none') continue
    const last = pts.at(-1)?.key
    for (const p of pts) {
      if (s.labels === 'last' && p.key !== last) continue
      if (s.labels === 'some' && !(F.labelKeys?.[s.id] ?? []).map(String).includes(p.key)) continue
      outside.push({ key: `${s.id}|${p.key}`, x: p.x + 7, y: p.y + 3.5, text: format(p.value, s.unit, decOf(s.unit)), size: 10, color: labelInk(s.color), anchor: 'start', droppable: p.key !== last })
    }
  }
  base.labels = resolveCollisions(outside, estimateWidth)
  return stamp(base, 'chart', spec, { variant: 'profile' })
}
