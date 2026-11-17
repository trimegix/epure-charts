// ─── epure-charts · the scene of a Mekko chart (% or units) ─────────────────
// buildMekkoScene(spec, columns, { width, height, format }) → pure geometry:
//   { width, height, plot, segments, columns, labels, axes, legend, ridges, empty, mode, extent,
//     otherHandle: { x, y, value, pooled } (the handle of the "Other" threshold),
//     noRoom (the number of labels removed for lack of room) }
//
// Each column has a WIDTH proportional to its total (the market) and is
// split into segments (the players).
//   · spec.mode 'percent' (default): each column rises to 100 % (shares);
//   · spec.mode 'units'            : the height follows the absolute value.
// Independent width (X extent row, Mekko in units): if the
// columns carry `extent`, the width follows that row instead of the total
// (spec.extent === false to go back to totals).
// spec: { mode?, series: [{ id, label, color? }], labels?: 'share'|'value'|'none',
//          totals?: true (the total above the column),
//          xLabels?: 'share'|'value'|'none' (under the axis: each column's share
//                    of the total width, or its width as a value); widths: false = 'none',
//          sort?: 'desc'|'asc' (column order), gap?: px between columns,
//          segmentOrder?: 'sheet'|'reverse'|'desc'|'asc' (order of the segments WITHIN each
//                    column, bottom to top: 'desc' = the largest at the bottom),
//          legend?: 'top'|'none',
//          other?: share threshold below which a segment joins "Other",
//          toOther?: [seriesId | 'colKey|seriesId'] (segments moved into "Other" by hand),
//          outline?: 'thin'|'none'|'dark' (the segment outline),
//          ridges?: true (bold outline around each column),
//          valueLine?: true | number (value line: true = average weighted by the widths;
//                    in units, of the column totals; in %, of the bottom segment's share),
//          hundred?: 'left'|'right' ("100%" indicator, Mekko in % only),
//          grandTotal?: true (grand total, sum of the columns, above the right margin),
//          table?: [seriesId] (series moved into a data table under the axis) }
// columns: [{ key, label, extent?, values: { [seriesId]: number } }]
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): segment labels
// and totals measured, fitted and bounded at their actual size (labelMetrics).
// spec.locale: the engine's words ('Other', 'Total') and numbers in that language;
// spec.accent 'single': every segment neutral but those spec.emphasis names (a series id,
// a segment 'colKey|seriesId' or a column key).
// Pure, tested under node --test.
import { scaleLinear } from 'd3-scale'
import { estimateWidth, defaultFormat } from './scene.js'
import { roundToSum } from './numberStyle.js'
import { inkOn, labelMetrics } from './customStyle.js'
import { localeOf, localizedFormat, localizeNumber, t as word } from './locale.js'
import { singleAccent, emphasisOf, ACCENT, NEUTRAL, accentInk } from './accent.js'
import { stamp } from './figureMeta.js'

const CAT = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
const FONT = 10.5
const LEGEND_ROW = 18
export const MEKKO_OTHER = '__other__'
const OTHER_COLOR = 'gray-400'
const OUTLINE = { thin: { color: 'surface', width: 0.75 }, none: null, dark: { color: 'black', width: 1 } }

const OTHER_MAX = 0.5
const TABLE_ROW = 14

/** The value read at height y (dragged value line): a share in %, otherwise a round value. */
export function mekkoValueFromY(scene, y) {
  const d = scene?.yDomain, p = scene?.plot
  if (!d || !p) return null
  const v = d[0] + ((p.bottom - Math.max(p.top, Math.min(p.bottom, y))) / p.height) * (d[1] - d[0])
  return scene.mode === 'percent' ? Math.round(v * 1000) / 1000 : Number(v.toPrecision(3))
}

/** Dragged "100%" indicator: the side where it is dropped. */
export function mekkoHundredSideFromX(scene, x) {
  const p = scene?.plot
  if (!p) return 'left'
  return x < p.left + p.width / 2 ? 'left' : 'right'
}

/** The "Other" threshold read at the handle's height y (1 % steps, 0 to 50 %). */
export function mekkoOtherFromY(scene, y) {
  const p = scene?.plot
  if (!p) return null
  const v = Math.round(Math.max(0, Math.min(OTHER_MAX, (p.bottom - y) / p.height)) * 100) / 100
  return v > 0 ? v : null
}

export function buildMekkoScene(spec = {}, columnsIn = [], opts = {}) {
  const width = Math.max(240, Math.round(opts.width ?? 600))
  const height = Math.max(180, Math.round(opts.height ?? 320))
  const L = localeOf(spec)
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const num = str => localizeNumber(str, L)
  const OTHER = word('Other', L)
  const mode = spec.mode === 'units' ? 'units' : 'percent'
  const LM = labelMetrics(opts.labelStyle ?? spec, FONT)
  const LS = LM.size
  const BL = LM.base ? 3.5 : Math.round(LS * 0.35)
  const allSeries = (spec.series ?? []).map((s, i) => ({ ...s, color: s.color ?? CAT[i % CAT.length] }))
  // Data table (move series to table): these series leave the Mekko
  // and are written as rows under the axis, one cell per column (at least one series remains).
  const tableIds = new Set((spec.table ?? []).map(String))
  let tableSeries = allSeries.filter(s => tableIds.has(String(s.id)))
  if (tableSeries.length >= allSeries.length) tableSeries = tableSeries.slice(0, allSeries.length - 1)
  // Net lines (Mekko included): these series no longer stack,
  // one horizontal line per column at their value (in %, their share of the column total).
  const netIds = new Set((spec.netLines ?? []).map(String))
  let netSeries = allSeries.filter(s => netIds.has(String(s.id)) && !tableSeries.includes(s))
  if (netSeries.length + tableSeries.length >= allSeries.length) netSeries = netSeries.slice(0, Math.max(0, allSeries.length - tableSeries.length - 1))
  const series = allSeries.filter(s => !tableSeries.includes(s) && !netSeries.includes(s))
  const tot = c => series.reduce((t, s) => t + Math.max(0, c.values?.[s.id] ?? 0), 0)
  // The width: the "extent" row if it exists (and is not switched off), otherwise the total.
  const hasExtent = columnsIn.some(c => Number.isFinite(c?.extent) && c.extent > 0)
  const extentOn = hasExtent && spec.extent !== false
  const ext = c => (extentOn ? Math.max(0, Number.isFinite(c.extent) ? c.extent : 0) : tot(c))
  let cols = columnsIn.filter(c => c && tot(c) > 0 && ext(c) > 0)
  if (spec.sort === 'desc') cols = [...cols].sort((a, b) => ext(b) - ext(a))
  if (spec.sort === 'asc') cols = [...cols].sort((a, b) => ext(a) - ext(b))
  const base = { width, height, plot: null, segments: [], netLines: [], columns: [], labels: [], axes: null, legend: [], ridges: [], valueLine: null, hundred: null, grandTotal: null, noRoom: 0, table: { rows: [], heads: [] }, empty: !cols.length || !series.length, mode, extent: extentOn, hasExtent }
  if (base.empty) return stamp(base, 'mekko', spec)

  // "Other" pooling computed before the legend: it only depends on the shares, not on the
  // geometry. The legend follows what is drawn: a series entirely merged into
  // "Other" leaves it, and "Other" enters it as soon as a segment is pooled there.
  const toOther = new Set(spec.toOther ?? [])
  const parts = cols.map(c => {
    const t = tot(c)
    const segs = series.map((s, i) => ({ s, i, v: Math.max(0, c.values?.[s.id] ?? 0) })).filter(z => z.v > 0)
    // "Other": the segments moved by hand, plus those below the threshold (if there are several).
    const manual = segs.filter(z => toOther.has(z.s.id) || toOther.has(`${c.key}|${z.s.id}`))
    const rest = segs.filter(z => !manual.includes(z))
    const small = spec.other > 0 ? rest.filter(z => z.v / t < spec.other) : []
    const pooled = [...manual, ...(manual.length || small.length > 1 ? small : [])]
    return { segs: segs.filter(z => !pooled.includes(z)), pooled }
  })
  const shown = new Set(parts.flatMap(p => p.segs.map(z => z.s.id)))
  const anyPooled = parts.some(p => p.pooled.length)
  const legendSeries = series.filter(s => shown.has(s.id) || !parts.some(p => p.pooled.some(z => z.s.id === s.id)))
  if (anyPooled) legendSeries.push({ id: MEKKO_OTHER, label: OTHER, color: OTHER_COLOR })
  const legendOn = (spec.legend ?? 'top') !== 'none'
  let lx = 0, lrow = 0
  if (legendOn) {
    base.legend = [...legendSeries, ...netSeries.map(s => ({ ...s, line: true }))].map(s => {
      const w = 16 + estimateWidth(s.label, 11)
      if (lx > 0 && lx + w > width) { lx = 0; lrow++ }
      const it = { key: s.id, label: s.label, color: accentOf(spec, s.color, s.id), x: lx, y: lrow * LEGEND_ROW + 9, ...(s.line ? { line: true } : {}) }
      lx += w + 16
      return it
    })
  }
  const legendH = legendOn ? (lrow + 1) * LEGEND_ROW + 6 : 0
  const totalsOn = !!spec.totals
  const hundredOn = mode === 'percent' && (spec.hundred === 'left' || spec.hundred === 'right')
  const grandOn = !!spec.grandTotal
  const xLabels = spec.widths === false ? 'none' : (spec.xLabels ?? 'share')
  // The table's row headers widen the left gutter if needed.
  const headW = tableSeries.length ? Math.max(...tableSeries.map(s => estimateWidth(s.label, FONT))) + 10 : 0
  const left = Math.max(44, Math.min(Math.round(width * 0.3), headW))
  const tableH = tableSeries.length * TABLE_ROW + (tableSeries.length ? 4 : 0)
  // Reserved right margin (like the waterfall labels) when the value line or the
  // grand total is shown: their labels sit there, after the "Other" handle, outside the columns.
  const vlOn = spec.valueLine != null && spec.valueLine !== false
  const maxTot = Math.max(0, ...cols.map(tot))
  const vlText = !vlOn ? '' : mode === 'percent' ? num('100.0%') : format(typeof spec.valueLine === 'number' ? Math.max(maxTot, Math.abs(spec.valueLine)) : maxTot)
  const grandText = grandOn ? `${word('Total', L)} ${format(cols.reduce((t, c) => t + tot(c), 0))}` : ''
  const hundredRight = hundredOn && spec.hundred === 'right'
  const marginW = vlOn || grandOn || hundredRight ? Math.ceil(Math.max(estimateWidth(vlText, 10.5), estimateWidth(grandText, 10.5), hundredRight ? estimateWidth(num('100%'), 10.5) : 0)) + 4 : 0
  // Margin reserved for the outside labels of the last column (second pass, see below).
  const outPad = marginW ? 0 : Math.max(0, opts._outPad ?? 0)
  const plot = { left, right: width - 16 - marginW - outPad, top: legendH + (totalsOn || hundredOn || grandOn ? (totalsOn && !LM.base ? Math.max(18, Math.ceil(LS * 0.75) + 8) : 18) : 6), bottom: height - 20 - (xLabels !== 'none' ? 14 : 0) - tableH }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot

  const grand = cols.reduce((t, c) => t + ext(c), 0)
  const gap = Math.max(0, spec.gap ?? 2)
  const usable = plot.width - gap * (cols.length - 1)
  const maxCol = Math.max(...cols.map(tot))
  const y = scaleLinear().domain([0, mode === 'percent' ? 1 : maxCol]).range([plot.bottom, plot.top])
  if (mode === 'units') y.nice(5)
  base.yDomain = y.domain()
  const ticks = y.ticks(5)
  base.axes = { y: { x: plot.left, ticks: ticks.map(v => ({ value: v, y: y(v), label: mode === 'percent' ? num(`${Math.round(v * 100)}%`) : format(v) })) }, x: { y: plot.bottom } }

  // A segment too small for its label: the label sits beside it, with a leader
  // line, when there is room on the right (last column, outside the value line margin).
  // Otherwise it is removed and counted. `outWant`: the width that would need to be reserved on the right.
  let outWant = 0
  const OUT_X = 14
  const boxOf = l => { const tw = l.w ?? LM.measure(l.text), x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - tw : l.x - tw / 2; return { x0, x1: x0 + tw, y0: l.y - LS * 0.8, y1: l.y + LS * 0.25 } }
  const outside = (seg, text, ci) => {
    if (ci !== cols.length - 1 || marginW) return false
    const tw = LM.measure(text)
    if (plot.right + OUT_X + tw > width - 2) { outWant = Math.max(outWant, Math.ceil(tw)); return false }
    const mid = seg.y + seg.height / 2
    let ly = mid + BL
    // Above the outside labels already placed (segments go from bottom to top).
    const others = base.labels.filter(l => l.outside).map(boxOf)
    for (const o of others) if (ly + LS * 0.25 > o.y0 - 2 && ly - LS * 0.8 < o.y1) ly = o.y0 - 2 - LS * 0.25
    const l = { key: seg.key, x: plot.right + OUT_X, y: ly, text, anchor: 'start', color: 'black', outside: true, w: tw }
    const b = boxOf(l)
    if (b.y0 < plot.top - 1 || Math.abs(ly - BL - mid) > 2 * LS + 4 || base.labels.some(o => !o.outside && overlapBox(boxOf(o), b))) return false
    l.leader = { x1: seg.x + seg.width, y1: mid, x2: plot.right + OUT_X - 3, y2: ly - BL }
    base.labels.push(l)
    return true
  }
  const stroke = OUTLINE[spec.outline ?? 'thin'] ?? null
  const order = spec.segmentOrder ?? 'sheet'
  let x = plot.left
  for (const [ci, c] of cols.entries()) {
    const t = tot(c)
    const w = (ext(c) / grand) * usable
    let acc = 0
    const { pooled } = parts[ci]
    const segs = [...parts[ci].segs]
    // The order of the segments in the column (bottom to top); "Other" stays on top.
    if (order === 'reverse') segs.reverse()
    if (order === 'desc') segs.sort((a, b) => b.v - a.v || a.i - b.i)
    if (order === 'asc') segs.sort((a, b) => a.v - b.v || a.i - b.i)
    if (pooled.length) segs.push({ s: { id: MEKKO_OTHER, label: OTHER, color: OTHER_COLOR }, v: pooled.reduce((a, z) => a + z.v, 0), members: pooled.map(z => z.s.id) })
    // Consistent rounding of the column shares (they sum to 100 %).
    const shareR = roundToSum(segs.map(z => (z.v / t) * 100), 0)
    let si = 0
    for (const { s, v, members } of segs) {
      const shareTxt = num(`${shareR[si++]}%`)
      const from = mode === 'percent' ? acc / t : acc
      const to = mode === 'percent' ? (acc + v) / t : acc + v
      acc += v
      const y0 = y(to), y1 = y(from)
      const seg = { key: `${c.key}|${s.id}`, colKey: c.key, seriesId: s.id, x, y: y0, width: w, height: y1 - y0, color: accentOf(spec, c.colors?.[s.id] ?? s.color, s.id, `${c.key}|${s.id}`, c.key), value: v, share: v / t, stroke, label: s.label, valueText: format(v), shareText: num(`${Math.round((v / t) * 100)}%`), ...(members ? { members } : {}) }
      base.segments.push(seg)
      const lab = spec.labels ?? 'share'
      if (lab !== 'none') {
        const text = lab === 'value' ? format(v) : shareTxt
        if (LM.measure(text) + 6 <= w && seg.height >= LS + 4) {
          base.labels.push({ key: seg.key, x: x + w / 2, y: y0 + seg.height / 2 + BL, text, anchor: 'middle', color: accentInk(spec, seg.color) ?? inkOn(seg.color) })
        } else if (!outside(seg, text, ci)) base.noRoom++ // removed for lack of room: counted (the value remains on segment hover)
      }
    }
    for (const s of netSeries) {
      const v = c.values?.[s.id]
      if (!Number.isFinite(v)) continue
      const yy = y(mode === 'percent' ? Math.max(0, Math.min(1, v / t)) : Math.max(0, v))
      base.netLines.push({ key: `${c.key}|${s.id}`, colKey: c.key, seriesId: s.id, x1: x, x2: x + w, y: yy, color: accentOf(spec, s.color, s.id), value: v })
    }
    const top = mode === 'percent' ? y(1) : y(t)
    base.columns.push({ key: c.key, label: c.label, x, width: w, cx: x + w / 2, total: t, extent: ext(c), share: ext(c) / grand, top })
    if (spec.ridges) base.ridges.push({ key: c.key, x, y: top, width: w, height: plot.bottom - top })
    if (totalsOn) {
      const text = format(t)
      if (LM.base) base.labels.push({ key: `total|${c.key}`, x: x + w / 2, y: top - 5, text, anchor: 'middle', color: 'gray-700' })
      else {
        // Set size: the total stays inside the frame and is left out if it overlaps the previous one.
        const tw = LM.measure(text), cx0 = Math.max(tw / 2 + 1, Math.min(width - tw / 2 - 1, x + w / 2))
        const prev = base.labels.findLast(l => l.total)
        if (!prev || prev.x + prev.w / 2 + 4 <= cx0 - tw / 2) base.labels.push({ key: `total|${c.key}`, x: cx0, y: top - 5, text, anchor: 'middle', color: 'gray-700', total: true, w: tw })
        else base.noRoom++
      }
    }
    x += w + gap
  }
  const under = c => (xLabels === 'share' ? num(`${Math.round(c.share * 100)}%`) : xLabels === 'value' ? format(c.extent) : null)
  base.axes.x.ticks = base.columns.map(c => ({ key: c.key, x: c.cx, label: c.label, width: c.width, share: under(c) }))
  base.axes.x.labels = xLabels

  // Value line (initialized to the weighted average). In units: average of the
  // column totals weighted by the widths; in %: weighted share of the bottom segment.
  if (spec.valueLine != null && spec.valueLine !== false) {
    const wsum = base.columns.reduce((t, c) => t + c.share, 0) || 1
    const bottomShare = c => base.segments.filter(sg => sg.colKey === c.key).sort((a, b) => b.y - a.y)[0]?.share ?? 0
    const auto = base.columns.reduce((t, c) => t + c.share * (mode === 'percent' ? bottomShare(c) : c.total), 0) / wsum
    const manual = typeof spec.valueLine === 'number' && Number.isFinite(spec.valueLine)
    const v = manual ? spec.valueLine : auto
    const yy = y(v)
    const vy = Math.max(plot.top, Math.min(plot.bottom, yy))
    base.valueLine = { value: v, auto: !manual, name: manual ? null : word('Weighted average', L), y: vy, x1: plot.left, x2: plot.right, labelX: plot.right + 14, labelY: vy + 3.5,
      text: mode === 'percent' ? num(`${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`) : format(v) }
  }
  // "100%" indicator (Mekko in %), on the left or right above the plot.
  // On the right, it sits in the margin, just below the top of the plot (clear of the column totals).
  if (hundredOn) base.hundred = spec.hundred === 'left'
    ? { side: 'left', x: plot.left, y: plot.top - 5, anchor: 'start', text: num('100%') }
    : { side: 'right', x: plot.right + 14, y: plot.top + 11, anchor: 'start', text: num('100%') }
  // Grand total: the sum of the column totals, top right (top left if the indicator is there).
  if (grandOn) {
    const g = base.columns.reduce((t, c) => t + c.total, 0)
    // Above the right margin, right-aligned: never over a column total.
    base.grandTotal = { value: g, text: `${word('Total', L)} ${format(g)}`, x: width - 2, y: plot.top - 5, anchor: 'end' }
  }
  // Data table: one row per moved series, the value centered under each column.
  if (tableSeries.length) {
    const y0 = height - tableH + 2
    tableSeries.forEach((s, i) => {
      const yy = y0 + i * TABLE_ROW + 10
      base.table.heads.push({ seriesId: s.id, text: s.label, x: plot.left - 6, y: yy })
      for (const c of base.columns) {
        const src = cols.find(k => k.key === c.key)
        const v = src?.values?.[s.id]
        const text = Number.isFinite(v) ? format(v) : '–'
        const fits = estimateWidth(text, 10) <= c.width + 2
        base.table.rows.push({ key: `${s.id}|${c.key}`, seriesId: s.id, colKey: c.key, x: c.cx, y: yy, text: fits ? text : '…', full: text })
      }
    })
    base.table.top = y0 - 2
  }
  // The "Other" handle: to the right of the plot, at
  // the threshold's height (0 at the bottom, at most 50 %); dragging it adds or removes segments.
  const th = Math.max(0, Math.min(OTHER_MAX, spec.other ?? 0))
  base.otherHandle = { x: plot.right + 3, y: plot.bottom - th * plot.height, value: th,
    pooled: base.segments.filter(sg => sg.seriesId === MEKKO_OTHER).reduce((n, sg) => n + sg.members.length, 0) }
  // Second pass: reserve room on the right for the outside labels that did not fit
  // (at most 20 % of the width); those that still do not fit stay counted.
  if (outWant && !opts._outPad) return buildMekkoScene(spec, columnsIn, { ...opts, _outPad: Math.min(outWant, Math.round(width * 0.2)) })
  return stamp(base, 'mekko', spec)
}
// Single-accent color of a mark: accent when any of its keys is emphasized.
function accentOf(spec, color, ...keys) {
  if (!singleAccent(spec)) return color
  const e = emphasisOf(spec)
  return keys.some(k => k != null && e.has(String(k))) ? ACCENT : NEUTRAL
}
const overlapBox = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
