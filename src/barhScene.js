// ─── Chart engine · the horizontal bar scene ─────────────────────────────────
// buildBarhScene(spec, rows, { width, format }) → geometry:
//   { width, height, plot, rows, bars, labels, axis, gridlines, annotations, legend, empty }
// For rankings and ranges: one row per category, the value
// on the horizontal axis. Handled automatically:
//   · simple bars, stacked by sign (positive to the right of zero,
//     negative to the left) or floating (row.range = [low, high]);
//   · the figure at the end of the bar: at the positive end on the right, at the negative end
//     on the left, the two bounds of a range on either side;
//   · measured row labels, shortened with an ellipsis rather than cut off;
//   · sorting (spec.sort 'desc' | 'asc'), named vertical value line.
//
// spec: { series: [{ id, label, color }], stacked?, sort?, labels?: 'end'|'none',
//          axis?: true|false, rowHeight?, annotations?: [{ type:'valueLine', value, label, tone, dash, side? }] }
// (side 'left' | 'right': the label moves to that side of the line, so two
//  close lines never overlap their names)
// rows: [{ key, label, values: { [seriesId]: number }, range?: [lo, hi], color?, emphasis?,
//          marker?: number, points?: number[] }]
// Range with a marker (dot plot, football field): a row's `marker` (a number), or
// spec.rangeMarker 'median' | 'mean' computed from the row's `points` (a row with points
// and no range spans their extent). Drawn on the range bar as a dot, or a vertical tick
// with spec.rangeMarkerShape 'line'. spec.rangeMarkerLabel: true writes the value above
// the marker, a string writes that name then the value ('Median €12.0M').
// scene row.marker = { x, y, value, text, tx, ty, shape, color, r, h }.
// spec.locale: the engine's words and numbers in that language; spec.accent 'single':
// every bar neutral but those whose row key (or series id, or 'row|series') spec.emphasis names.
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): figures are measured
// at their actual size (gutters, fit inside a segment) and the row grows to hold them.
// Pure, tested under node --test. Colors as token names.
import { scaleLinear } from 'd3-scale'
import { estimateWidth, defaultFormat } from './scene.js'
import { inkOn, labelMetrics } from './customStyle.js'
import { localeOf, localizedFormat, t } from './locale.js'
import { singleAccent, emphasisOf, ACCENT, NEUTRAL, accentInk } from './accent.js'
import { stamp } from './figureMeta.js'

const LABEL = 11
const VALUE = 10.5
const LEGEND_ROW = 18
const DASH = { solid: null, dash: '4 3', dot: '1.5 3' }

function ellipsize(text, maxW, size) {
  const t = String(text ?? '')
  if (estimateWidth(t, size) <= maxW) return t
  let cut = t
  while (cut.length > 1 && estimateWidth(`${cut}…`, size) > maxW) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Signed total of a row (the sum of its values, or the top of a range). */
// Single-accent color of a mark: accent when any of its keys is emphasized.
function accentOf(spec, color, ...keys) {
  if (!singleAccent(spec)) return color
  const e = emphasisOf(spec)
  return keys.some(k => k != null && e.has(String(k))) ? ACCENT : NEUTRAL
}

const finite = a => (Array.isArray(a) ? a.filter(Number.isFinite) : [])
function median(v) {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** The marker value of a range row: its own `marker`, else the median or mean of its points. */
function markerOf(spec, r) {
  if (Number.isFinite(r.marker)) return r.marker
  const pts = finite(r.points)
  if (!pts.length) return null
  if (spec?.rangeMarker === 'median') return median(pts)
  if (spec?.rangeMarker === 'mean') return pts.reduce((a, v) => a + v, 0) / pts.length
  return null
}
/** A row with points and no range spans their extent. */
function withRange(r) {
  if (!r || r.range) return r
  const pts = finite(r.points)
  return pts.length ? { ...r, range: [Math.min(...pts), Math.max(...pts)] } : r
}

const rowTotal = r => (r.range ? r.range[1] : Object.values(r.values ?? {}).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0))

export function buildBarhScene(spec, rowsIn = [], opts = {}) {
  if (spec?.butterfly) return buildButterflyScene(spec, rowsIn, opts)
  const L = localeOf(spec)
  // 100 % bars: each row normalized to its sum.
  if (spec?.stacked100) {
    const pct = v => `${Math.round(v * 100)}%`
    const norm = rowsIn.map(r => {
      const tot = Object.values(r.values ?? {}).reduce((a, v) => a + Math.abs(Number.isFinite(v) ? v : 0), 0)
      return { ...r, values: Object.fromEntries(Object.entries(r.values ?? {}).map(([k, v]) => [k, tot ? v / tot : 0])) }
    })
    return buildBarhScene({ ...spec, stacked100: false, stacked: true, labels: spec.labels === 'end' || spec.labels == null ? 'segments' : spec.labels, axis: spec.axis ?? false }, norm, { ...opts, format: opts.formatShare ?? pct })
  }
  const width = Math.max(220, Math.round(opts.width ?? 640))
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const series0 = spec?.series ?? [{ id: 'value', label: t('Value', L), color: 'gray-700' }]
  // Rotated combination chart (type options follow the orientation): a series
  // with `mark: 'line'` reads as a line from row to row over the bars.
  const lineSeries = !spec?.profile && series0.length > 1 ? series0.filter(s => s.mark === 'line') : []
  const series = lineSeries.length < series0.length ? series0.filter(s => !lineSeries.includes(s)) : series0
  // Pattern of a segment: the row's (rows[].patterns[series]), otherwise
  // the series'; 'none' removes the series pattern on that row.
  const patternOf = (r, s) => { const p = r.patterns?.[s.id] ?? s.pattern ?? null; return p && p !== 'none' ? p : null }
  const stacked = !!spec?.stacked
  // 'segments': each segment's share written inside (a stacked 100 % bar); 'end': the total at the end.
  const segLabels = spec?.labels === 'segments'
  // Profile chart: vertical lines that join the value of
  // each series from one row to the next, a criteria profile without bars.
  const profile = !!spec?.profile
  const showLabels = !profile && (spec?.labels ?? 'end') === 'end'
  const showAxis = spec?.axis ?? true
  const LM = labelMetrics(opts.labelStyle ?? spec, VALUE)
  const BL = LM.base ? 3.5 : Math.round(LM.size * 0.35)
  const inner0 = !stacked && series.length > 1 ? series.length : 1
  // Set size: the row holds its figures (one per bar of a grouped chart), never any overlap.
  const rowMin = LM.base || profile ? 0 : showLabels && inner0 > 1 ? Math.ceil((inner0 * (LM.size + 2)) / 0.72) : LM.size + 6
  // A marker labelled above the bar: the row holds the bar and its note.
  const markerLabels = !!spec?.rangeMarkerLabel && rowsIn.some(r => r && markerOf(spec, withRange(r) ?? r) != null)
  const rowH = Math.max(spec?.rowHeight ?? 28, rowMin, markerLabels ? 36 : 0)
  // Grouped with several series: the row is shared, each bar keeps ~13 px (its figure readable).
  const barH = !stacked && (spec?.series ?? []).length > 1 ? Math.round(rowH * 0.72) : Math.min(18, Math.round(rowH * 0.58))

  let rows = rowsIn.map(withRange).filter(r => r && (r.range || Object.values(r.values ?? {}).some(Number.isFinite)))
  if (spec?.sort === 'desc') rows = [...rows].sort((a, b) => rowTotal(b) - rowTotal(a))
  if (spec?.sort === 'asc') rows = [...rows].sort((a, b) => rowTotal(a) - rowTotal(b))

  const multi = series0.length > 1
  // Legend hidden by the reading settings (spec.legend === false).
  const legendItems = multi && spec?.legend !== false ? [...series.map(s => ({ key: s.id, label: s.label, color: accentOf(spec, s.color, s.id), pattern: s.pattern ?? null })), ...lineSeries.map(s => ({ key: s.id, label: s.label, color: accentOf(spec, s.color, s.id), line: true }))] : []
  let lx = 0
  let lrow = 0
  const legend = legendItems.map(it => {
    const w = 16 + estimateWidth(it.label, 11)
    if (lx > 0 && lx + w > width) { lx = 0; lrow++ }
    const out = { ...it, x: lx, y: lrow * LEGEND_ROW + LEGEND_ROW / 2 }
    lx += w + 16
    return out
  })
  const legendH = legend.length ? (lrow + 1) * LEGEND_ROW + 6 : 0

  const valueLines = (spec?.annotations ?? []).filter(a => a?.type === 'valueLine' && Number.isFinite(a.value))
  const topPad = legendH + (valueLines.some(v => v.label) ? 16 : 4)
  const axisH = showAxis ? 20 : 0
  const height = topPad + rows.length * rowH + axisH + 4

  const base = {
    width, height, plot: null, rows: [], bars: [], labels: [], gridlines: [], annotations: [],
    axis: null, legend, empty: rows.length === 0, profiles: [],
  }
  if (base.empty) return stamp(base, 'barh', spec)

  // ── Domain: zero included (except pure ranges), bounds, value lines ──
  const vals = []
  const ranged = rows.every(r => r.range)
  if (!ranged && !profile) vals.push(0)
  for (const r of rows) {
    if (r.range) { vals.push(r.range[0], r.range[1]); const m = markerOf(spec, r); if (m != null) vals.push(m); continue }
    if (stacked) {
      let pos = 0, neg = 0
      for (const s of series) { const v = r.values?.[s.id]; if (Number.isFinite(v)) { if (v >= 0) pos += v; else neg += v } }
      vals.push(pos, neg)
    } else for (const s of series) { const v = r.values?.[s.id]; if (Number.isFinite(v)) vals.push(v) }
  }
  for (const v of valueLines) vals.push(v.value)
  for (const r of rows) for (const s of lineSeries) { const v = r.values?.[s.id]; if (Number.isFinite(v)) vals.push(v) }
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (lo === hi) { hi += 1; lo -= ranged ? 1 : 0 }
  if (ranged) { const pad = (hi - lo) * 0.04; lo -= pad; hi += pad }

  // ── Gutters: row labels on the left, figures at the end of the bar ──
  // The label gutter: their width + a margin (a short label is never shortened).
  const labelW = Math.min(width * 0.36, Math.max(...rows.map(r => estimateWidth(r.label, LABEL))) + 18)
  const endText = (r, side) => {
    if (r.range) return format(side === 'lo' ? r.range[0] : r.range[1])
    return format(rowTotal(r))
  }
  // Grouped with several series: each bar carries ITS value (not the row sum).
  const perBar = !stacked && series.length > 1
  const valW = showLabels
    ? Math.max(...rows.map(r => (perBar ? Math.max(...series.map(s => (Number.isFinite(r.values?.[s.id]) ? LM.measure(format(r.values[s.id])) : 0))) : LM.measure(endText(r, 'hi'))))) + 8
    : 6
  const negW = showLabels && (lo < 0 || ranged) ? Math.max(...rows.map(r => LM.measure(endText(r, 'lo')))) + 8 : 0
  const plot = { left: labelW + negW, right: width - valW, top: topPad, bottom: topPad + rows.length * rowH }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot

  // Scale set by hand (axis mini toolbar): min, max, step; out of bounds, clipped.
  const sc = spec?.scale ?? {}
  const sMin = Number.isFinite(sc.min) ? sc.min : null
  const sMax = Number.isFinite(sc.max) ? sc.max : null
  const manualScale = (sMin != null || sMax != null) && (sMax ?? hi) > (sMin ?? lo)
  const x = scaleLinear().domain(manualScale ? [sMin ?? lo, sMax ?? hi] : [lo, hi]).range([plot.left, plot.right])
  // Without a displayed axis (a 100 % bar), the scale is not rounded: the bar fills the width.
  if (manualScale) x.clamp(true)
  else if (!ranged && spec?.axis !== false) x.nice(5)
  const [dLo, dHi] = x.domain()
  const sStep = Number.isFinite(sc.step) && sc.step > 0 && (dHi - dLo) / sc.step <= 50 ? sc.step : null
  const first = sStep ? Math.ceil(dLo / sStep - 1e-9) * sStep : 0
  const ticks = sStep ? Array.from({ length: Math.floor((dHi - first) / sStep + 1e-9) + 1 }, (_, i) => Number((first + i * sStep).toPrecision(12)))
    : x.ticks(Math.max(2, Math.min(6, Math.floor(plot.width / 80))))
  if (showAxis) base.axis = { y: plot.bottom + 14, ticks: ticks.map(v => ({ value: v, x: x(v), label: v === 0 ? '0' : format(v) })) }
  // Gridlines: solid (default), dotted, or none (zero stays).
  // axis: false also removes the gridlines (a bare bar list), unless spec.grid asks for them;
  // the zero line stays when bars go both ways.
  const gridOn = spec?.grid != null ? spec.grid !== 'none' : showAxis
  const twoWays = x.domain()[0] < 0 && x.domain()[1] > 0
  base.gridlines = ticks.filter(v => (gridOn && spec?.grid !== 'none') || (v === 0 && (showAxis || twoWays))).map(v => ({ x: x(v), y1: plot.top, y2: plot.bottom, zero: v === 0, dash: spec?.grid === 'dash' && v !== 0 }))

  const prof = {}
  rows.forEach((r, i) => {
    const y0 = plot.top + i * rowH
    const cy = y0 + rowH / 2
    base.rows.push({ key: r.key, label: ellipsize(r.label, labelW - 10, LABEL), full: r.label, y: cy, y0, y1: y0 + rowH, emphasis: !!r.emphasis })
    const top = cy - barH / 2
    if (r.range) {
      const [a, b] = r.range
      base.bars.push({ key: r.key, seriesId: series[0].id, x: x(Math.min(a, b)), width: Math.max(1, Math.abs(x(b) - x(a))), y: top, height: barH, color: accentOf(spec, r.color ?? series[0].color, r.key, series[0].id), pattern: patternOf(r, series[0]), range: [Math.min(a, b), Math.max(a, b)] })
      const m = markerOf(spec, r)
      if (m != null) {
        const mx = x(m)
        const name = typeof spec?.rangeMarkerLabel === 'string' ? spec.rangeMarkerLabel : null
        const text = spec?.rangeMarkerLabel ? (name ? `${name} ${format(m)}` : format(m)) : null
        base.rows[base.rows.length - 1].marker = {
          x: mx, y: cy, value: m, text, tx: mx, ty: top - 4,
          shape: spec?.rangeMarkerShape === 'line' ? 'line' : 'dot', color: spec?.rangeMarkerColor ?? 'black',
          r: Math.max(3, Math.min(5, barH * 0.28)), h: barH + 4,
        }
      }
      if (showLabels) {
        base.labels.push({ key: `${r.key}|lo`, x: x(Math.min(a, b)) - 5, y: cy + BL, text: format(Math.min(a, b)), anchor: 'end' })
        base.labels.push({ key: `${r.key}|hi`, x: x(Math.max(a, b)) + 5, y: cy + BL, text: format(Math.max(a, b)), anchor: 'start' })
      }
      return
    }
    if (profile) {
      for (const s of series) {
        const v = r.values?.[s.id]
        if (Number.isFinite(v)) (prof[s.id] ??= []).push({ key: r.key, x: x(v), y: cy, value: v })
      }
      return
    }
    let pos = 0, neg = 0
    const inner = stacked ? 1 : series.length
    series.forEach((s, k) => {
      const v = r.values?.[s.id]
      if (!Number.isFinite(v) || v === 0) return
      let from, to
      if (stacked) { if (v >= 0) { from = pos; to = pos += v } else { from = neg; to = neg += v } }
      else { from = 0; to = v }
      const h = stacked ? barH : barH / inner
      const yy = stacked ? top : top + k * h
      const bw = Math.max(1, Math.abs(x(to) - x(from)))
      base.bars.push({
        key: r.key, seriesId: s.id, x: x(Math.min(from, to)), width: bw,
        y: yy, height: Math.max(2, h - (stacked ? 0 : 1)), color: accentOf(spec, r.colors?.[s.id] ?? r.color ?? s.color, r.key, s.id, `${r.key}|${s.id}`), value: v, pattern: patternOf(r, s),
      })
      const txt = format(v)
      if (segLabels && LM.measure(txt) + 8 <= bw && (LM.base || LM.size + 2 <= h)) {
        const fill = base.bars[base.bars.length - 1].color
        base.labels.push({ key: `${r.key}|${s.id}`, x: x(Math.min(from, to)) + bw / 2, y: yy + h / 2 + BL, text: txt, anchor: 'middle', color: accentInk(spec, fill) ?? inkOn(fill) })
      }
    })
    if (showLabels && perBar) {
      for (const b of base.bars.filter(z => z.key === r.key)) {
        const neg = b.value < 0
        base.labels.push({ key: `${r.key}|${b.seriesId}`, x: neg ? b.x - 4 : b.x + b.width + 4, y: b.y + b.height / 2 + BL, text: format(b.value), anchor: neg ? 'end' : 'start' })
      }
    } else if (showLabels) {
      const total = rowTotal(r)
      // Stacked by sign: the total to the right of the positive part; an all-negative row carries it on the left.
      const rightEnd = x(stacked ? Math.max(pos, 0) : Math.max(total, 0))
      const leftEnd = x(stacked ? Math.min(neg, 0) : Math.min(total, 0))
      const atLeft = total < 0
      base.labels.push({
        key: `${r.key}|v`, x: atLeft ? leftEnd - 5 : rightEnd + 5, y: cy + BL, text: format(total), anchor: atLeft ? 'end' : 'start',
      })
    }
  })

  // The lines of the combination chart: a point at the center of each row, at its value.
  for (const s of lineSeries) {
    const pts = base.rows.map(row => ({ row, v: rows.find(r => r.key === row.key)?.values?.[s.id] })).filter(z => Number.isFinite(z.v)).map(z => ({ key: z.row.key, x: x(z.v), y: z.row.y, value: z.v }))
    if (pts.length) base.profiles.push({ seriesId: s.id, color: accentOf(spec, s.color ?? 'gray-700', s.id), dash: DASH[s.dash ?? 'solid'] ?? null, points: pts, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') })
  }
  if (profile) {
    base.profiles = series.filter(s => prof[s.id]?.length).map(s => ({
      seriesId: s.id, color: accentOf(spec, s.color ?? 'gray-700', s.id), dash: DASH[s.dash ?? 'solid'] ?? null, points: prof[s.id],
      d: prof[s.id].map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '),
    }))
    if (spec?.labels === 'all') for (const pr of base.profiles) for (const p of pr.points) base.labels.push({ key: `${p.key}|${pr.seriesId}`, x: p.x + 7, y: p.y - 5, text: format(p.value), anchor: 'start', color: pr.color })
  }
  for (const v of valueLines) {
    const xx = x(v.value)
    base.annotations.push({
      type: 'valueLine', x: xx, y1: plot.top - 4, y2: plot.bottom, text: v.label ? `${v.label} ${format(v.value)}` : null,
      tx: v.side === 'left' ? xx - 4 : v.side === 'right' ? xx + 4 : xx, anchor: v.side === 'left' ? 'end' : v.side === 'right' ? 'start' : 'middle',
      color: v.tone ?? 'black', dash: DASH[v.dash ?? 'dash'] ?? '4 3',
    })
  }
  return stamp(base, 'barh', spec)
}

// ─── Butterfly chart: two series back to back, same scale,
// a single set of labels in the center. spec.series[0] on the left, spec.series[1] on the right.
export function buildButterflyScene(spec, rowsIn = [], opts = {}) {
  const width = Math.max(260, Math.round(opts.width ?? 640))
  const format = localizedFormat(opts.format ?? defaultFormat, localeOf(spec))
  const [L, R] = spec.series ?? []
  const rows = rowsIn.filter(r => r && (Number.isFinite(r.values?.[L?.id]) || Number.isFinite(r.values?.[R?.id])))
  const showLabels = (spec.labels ?? 'end') !== 'none'
  const LM = labelMetrics(opts.labelStyle ?? spec, VALUE)
  const BL = LM.base ? 3.5 : Math.round(LM.size * 0.35)
  const rowH = Math.max(spec.rowHeight ?? 28, LM.base || !showLabels ? 0 : LM.size + 6)
  const barH = Math.min(18, Math.round(rowH * 0.58))
  const headH = 18
  const height = headH + rows.length * rowH + 6
  const base = { width, height, plot: null, rows: [], bars: [], labels: [], gridlines: [], annotations: [], axis: null, legend: [], empty: !rows.length || !L || !R, butterfly: true }
  if (base.empty) return stamp(base, 'barh', spec)
  const labelW = Math.min(width * 0.3, Math.max(...rows.map(r => estimateWidth(r.label, LABEL))) + 16)
  const valW = showLabels ? Math.max(...rows.flatMap(r => [L, R].map(s => (Number.isFinite(r.values?.[s.id]) ? LM.measure(format(Math.abs(r.values[s.id]))) : 0)))) + 8 : 4
  const mid = width / 2
  const half = mid - labelW / 2 - valW
  const max = Math.max(...rows.flatMap(r => [Math.abs(r.values?.[L.id] ?? 0), Math.abs(r.values?.[R.id] ?? 0)])) || 1
  const sx = scaleLinear().domain([0, max]).range([0, half])
  const plot = { left: valW, right: width - valW, top: headH, bottom: headH + rows.length * rowH, center: mid, labelW }
  plot.width = plot.right - plot.left; plot.height = plot.bottom - plot.top
  base.plot = plot
  base.legend = [
    { key: L.id, label: L.label, color: accentOf(spec, L.color ?? 'cat-1', L.id), x: mid - labelW / 2 - 4, y: 9, anchor: 'end' },
    { key: R.id, label: R.label, color: accentOf(spec, R.color ?? 'cat-2', R.id), x: mid + labelW / 2 + 4, y: 9, anchor: 'start' },
  ]
  rows.forEach((r, i) => {
    const y0 = headH + i * rowH, cy = y0 + rowH / 2, top = cy - barH / 2
    base.rows.push({ key: r.key, label: ellipsize(r.label, labelW - 10, LABEL), full: r.label, y: cy, y0, y1: y0 + rowH, center: true })
    const lv = Math.abs(r.values?.[L.id] ?? 0), rv = Math.abs(r.values?.[R.id] ?? 0)
    const lw = sx(lv), rw = sx(rv)
    const lx = mid - labelW / 2 - lw
    base.bars.push({ key: r.key, seriesId: L.id, x: lx, width: Math.max(1, lw), y: top, height: barH, color: accentOf(spec, r.colors?.[L.id] ?? L.color ?? 'cat-1', r.key, L.id, `${r.key}|${L.id}`), value: r.values?.[L.id] ?? 0 })
    base.bars.push({ key: r.key, seriesId: R.id, x: mid + labelW / 2, width: Math.max(1, rw), y: top, height: barH, color: accentOf(spec, r.colors?.[R.id] ?? R.color ?? 'cat-2', r.key, R.id, `${r.key}|${R.id}`), value: r.values?.[R.id] ?? 0 })
    if (showLabels) {
      base.labels.push({ key: `${r.key}|${L.id}`, x: lx - 4, y: cy + BL, text: format(lv), anchor: 'end' })
      base.labels.push({ key: `${r.key}|${R.id}`, x: mid + labelW / 2 + rw + 4, y: cy + BL, text: format(rv), anchor: 'start' })
    }
  })
  return stamp(base, 'barh', spec)
}
