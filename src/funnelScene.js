// ─── epure-charts · the scene of a selection funnel ─────────────────────────
// buildFunnelScene(spec, stages, { width, height, format }) → pure geometry:
//   { width, height, plot, stages, necks, labels, filters, rates, noRoom, empty }
// A screening N → n → 3: one bar per stage, its width proportional to its value, the named
// filter between two stages ("Filter: EBITDA > €5M") and, optionally, the pass rate.
//
// spec: {
//   shape?: 'centered'|'bars'   bars centered on the axis with a light neck between them
//                               (default), or left-aligned bars
//   rates?: true                the pass rate (stage / previous stage) between two stages
//   filterPrefix?: false        the filter text alone, without "Filter:"
//   unit?, decimals?            passed to the formatter; without opts.format and without a
//                               unit, values read as counts ('1,250')
//   accent?: 'single', emphasis?: [keys]   single-accent mode (accent.js)
//   locale?, title?, source?…               see locale.js / figureMeta.js
// }
// stages: [{ key, label, value, filter?, color? }]; `filter` names the screen that leads
// from the previous stage to this one (ignored on the first stage).
// Values are written inside the bar when they fit, otherwise just past its right end.
// Pure, tested under node --test. Colors as token names.
import { defaultFormat } from './scene.js'
import { inkOn, labelMetrics } from './customStyle.js'
import { autoDecimals } from './decimals.js'
import { localeOf, localizedFormat, localizeNumber, t, NBSP } from './locale.js'
import { accentColor, accentInk } from './accent.js'
import { stamp } from './figureMeta.js'

const LABEL = 11
const NOTE = 10
const PAD = 6
const MIN_BAR = 3

function ellipsize(text, maxW, measure) {
  const s = String(text ?? '')
  if (measure(s) <= maxW) return s
  let cut = s
  while (cut.length > 1 && measure(`${cut}…`) > maxW) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** A count in English punctuation: 1250 → '1,250'. */
function countFormat(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const [i, d] = Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1).split('.')
  return `${v < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d ? `.${d}` : ''}`
}

export function buildFunnelScene(spec = {}, stagesIn = [], opts = {}) {
  spec = spec ?? {}
  const width = Math.max(200, Math.round(opts.width ?? 560))
  const height = Math.max(120, Math.round(opts.height ?? 320))
  const L = localeOf(spec)
  const counts = !opts.format && (spec.unit == null || spec.unit === 'count')
  const format = localizedFormat(opts.format ?? (counts ? countFormat : defaultFormat), L)
  // Default decimals: two significant digits (decimals.js), the same static and live.
  const fDec = spec.decimals ?? (spec.unit === 'pct' ? null : autoDecimals(stagesIn.map(s => s?.value)))
  const fmt = v => format(v, spec.unit, fDec)
  const LM = labelMetrics(opts.labelStyle ?? spec, LABEL)
  const LS = LM.size
  const BL = Math.round(LS * 0.35)
  const noteW = (s, size = NOTE) => LM.measure(s, size)
  const stages = stagesIn
    .filter(s => s && Number.isFinite(s.value) && s.value >= 0)
    .map((s, i) => ({ ...s, key: String(s.key ?? i), color: accentColor(spec, s.key ?? i, s.color ?? 'cat-1') }))
  const max = Math.max(0, ...stages.map(s => s.value))
  const base = { width, height, plot: null, stages: [], necks: [], labels: [], filters: [], rates: [], noRoom: 0, empty: !stages.length || !(max > 0) }
  if (base.empty) return stamp(base, 'funnel', spec)

  const centered = spec.shape !== 'bars'
  const prefix = spec.filterPrefix === false ? '' : `${t('Filter', L)}${L === 'fr' ? NBSP : ''}: `
  const filterOf = (s, i) => (i > 0 && s.filter ? `${prefix}${s.filter}` : null)
  const rateOf = i => (spec.rates && i > 0 && stages[i - 1].value > 0
    ? localizeNumber(`${((stages[i].value / stages[i - 1].value) * 100).toFixed(spec.decimals ?? 0)}%`, L) : null)

  // ── Rows: a bar per stage, a gap between two (taller when it carries a filter or a rate) ──
  const gapText = stages.some((s, i) => filterOf(s, i) || rateOf(i))
  const gapH = gapText ? NOTE + 12 : 8
  const avail = height - 2 * PAD - (stages.length - 1) * gapH
  const rowH = Math.max(LS + 6, Math.min(44, avail / stages.length))
  const total = stages.length * rowH + (stages.length - 1) * gapH
  const top = Math.max(PAD, (height - total) / 2)

  // ── Gutters: stage names on the left; for left-aligned bars, the values on the right ──
  const labelW = Math.min(width * 0.34, Math.max(...stages.map(s => LM.measure(s.label)))) + 12
  const valW = Math.max(...stages.map(s => LM.measure(fmt(s.value)))) + 8
  const plot = { left: labelW, right: width - (centered ? PAD : valW), top, bottom: top + total }
  plot.width = Math.max(20, plot.right - plot.left)
  plot.height = plot.bottom - plot.top
  base.plot = plot
  const cx = plot.left + plot.width / 2
  const barW = v => Math.max(MIN_BAR, (v / max) * plot.width)

  stages.forEach((s, i) => {
    const y = top + i * (rowH + gapH)
    const w = barW(s.value)
    const x = centered ? cx - w / 2 : plot.left
    const bar = { key: s.key, label: s.label, value: s.value, filter: s.filter ?? null, rate: rateOf(i), color: s.color, x, y, w, h: rowH, cy: y + rowH / 2 }
    base.stages.push(bar)
    // Stage name, in the left gutter.
    base.labels.push({ key: `${s.key}|name`, stage: s.key, kind: 'name', x: labelW - 10, y: bar.cy + BL, anchor: 'end',
      text: ellipsize(s.label, labelW - 11.5, t2 => LM.measure(t2)), full: s.label, color: 'gray-700' })
    // Value: inside the bar when it fits, otherwise past its right end.
    const text = fmt(s.value)
    const tw = LM.measure(text)
    // (a figure that would leave the card past the bar stays inside, even tight)
    const inside = tw + 10 <= w || x + w + 5 + tw > width - 2
    base.labels.push(inside
      ? { key: `${s.key}|value`, stage: s.key, kind: 'value', x: x + w / 2, y: bar.cy + BL, anchor: 'middle', text, color: accentInk(spec, s.color) ?? inkOn(s.color), inner: true }
      : { key: `${s.key}|value`, stage: s.key, kind: 'value', x: x + w + 5, y: bar.cy + BL, anchor: 'start', text, color: 'gray-700' })
    if (i === 0) return
    const prev = base.stages[i - 1]
    // Neck (centered shape): the trapezoid joining a bar to the next one.
    if (centered) base.necks.push({ key: s.key, d: `M${prev.x},${prev.y + prev.h} L${prev.x + prev.w},${prev.y + prev.h} L${x + w},${y} L${x},${y} Z` })
    // Filter and rate, in the gap above this stage.
    const gy = prev.y + prev.h + gapH / 2 + Math.round(NOTE * 0.35)
    const rate = rateOf(i)
    const rateText = rate ? `→ ${rate}` : null
    const rateW = rateText ? noteW(rateText) : 0
    if (rateText) base.rates.push({ key: s.key, x: plot.right, y: gy, anchor: 'end', text: rateText, value: s.value / prev.value })
    const f = filterOf(s, i)
    if (f) {
      const room = plot.width - (rateText ? rateW + 12 : 0)
      const text2 = ellipsize(f, room, t2 => noteW(t2))
      if (text2.length <= 1) { base.noRoom++; return }
      const fw = noteW(text2)
      // Centered on the funnel, unless it would run into the rate: then flush left.
      const fx = centered && cx + fw / 2 <= plot.right - (rateText ? rateW + 12 : 0) ? cx : plot.left + fw / 2
      base.filters.push({ key: s.key, x: fx, y: gy, anchor: 'middle', text: text2, full: f })
    }
  })
  return stamp(base, 'funnel', spec)
}
