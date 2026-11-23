// ─── Chart engine · the waterfall scene ──────────────────────────────────────
// buildWaterfallScene(spec, bridge, { width, height, format }) → geometry:
//   { width, height, plot, axes, gridlines, bars, labels, connectors,
//     whiskers, annotations, legend, columns, empty }
// Same contract as buildScene: ALL the layout happens here, the view only draws.
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): figures are measured,
// reserve their height and are placed at their actual size; a figure without room is left out.
// Pure, tested under node --test. Colors as token names.
//
// What the waterfall handles on its own:
//   · each bar floats on the running total; a 'total' is computed, never entered
//   · dotted connectors from the level reached to the start of the next bar
//   · signed labels outside the bar (above if it rises, below if
//     it falls), tightened when the column is narrow
//   · axis labels wrapped onto two lines rather than truncated
//   · difference arrow between any two steps (annotations: [{ type:'diff' }])
//   · high-scenario whisker on the steps that carry one
//   · gap axis (spec.axis 'gap'): zero = the starting point, a crisp line,
//     signed ticks; an anchor at zero is drawn as a line and carries its
//     amount; an assumption step (work mark) has a dotted gold outline
//   · dragged connector (spec.links { stepKey: sourceKey }): a movement restarts from the level
//     of an earlier column instead of the running total; the whole waterfall is recomputed
//   · data table (spec.table): values leave the bars for a row
//     under the axis, one cell per column, plus the running total as an option (spec.table === 'running')
//   · distorted connector: an anchor set midway through the
//     waterfall that does not land on the running total gets an oblique connector flagged as a conflict
//   · value line (spec.valueLine: true = the starting level, or a value), draggable
//   · bridge indexed to 100 (spec.index === 100): the start is 100 and every value
//     (bars, labels, axis, differences) reads as an index of it, no absolute figure;
//     a start that is zero, negative or missing leaves the bridge as is (scene.indexIgnored)
//   · language (spec.locale) and single accent (spec.accent 'single', spec.emphasis = step keys)
import { scaleLinear, scaleBand } from 'd3-scale'
import { estimateWidth, defaultFormat } from './scene.js'
import { resolveCollisions } from './labelLayout.js'
import { isLightHex, labelMetrics } from './customStyle.js'
import { localeOf, localizedFormat, localizeNumber, t } from './locale.js'
import { accentColor, singleAccent, ACCENT } from './accent.js'
import { stamp } from './figureMeta.js'
import { validateBridgeSpec } from './spec.js'

// Semantic tokens (--chart-*), each falling back on the palette color it replaced.
export const HYPOTHESIS_TOKEN = 'chart-hypothesis'
export const HYPOTHESIS_TEXT = 'chart-hypothesis-text'
export const TONE_TOKEN = {
  anchor: 'chart-anchor', positive: 'chart-pos', negative: 'chart-neg', upside: 'chart-upside', gap: 'chart-gap',
}
const TONE_LEGEND = {
  anchor: 'Anchor', positive: 'Value created', negative: 'Drag', upside: 'Upside to exit', gap: 'Unreconciled',
}

const TICK_FONT = 11
const LABEL_FONT = 10
const LABEL_H = 14
const DIFF_H = 30
const AXIS_LINE_H = 13
const MAX_BAR = 48
const LEGEND_ROW = 18
const TABLE_ROW = 14
const TABLE_HEAD = { value: 'Value', running: 'Running total' }

/**
 * Wraps a label onto at most `maxLines` lines of width `maxW`. Breaks
 * at spaces; a word that is too long breaks after "/" or "-" ("Accret./"
 * "Dilut."); as a last resort the line is shortened with an ellipsis, never
 * overlapping the neighboring column.
 */
export function wrapLabel(text, maxW, size = TICK_FONT, maxLines = 2) {
  const fit = t => estimateWidth(t, size) <= maxW
  const tokens = []
  for (const w of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (fit(w)) { tokens.push({ t: w, glue: ' ' }); continue }
    const parts = w.split(/(?<=[/-])/)
    parts.forEach((part, i) => tokens.push({ t: part, glue: i ? '' : ' ' }))
  }
  const lines = []
  let cur = ''
  for (const { t, glue } of tokens) {
    const next = cur ? `${cur}${glue}${t}` : t
    if (cur && !fit(next) && lines.length < maxLines - 1) { lines.push(cur); cur = t }
    else cur = next
  }
  if (cur) lines.push(cur)
  return lines.map(l => {
    if (fit(l)) return l
    let cut = l
    while (cut.length > 1 && !fit(`${cut}…`)) cut = cut.slice(0, -1)
    return `${cut}…`
  })
}

/**
 * Levels of each step: { from, to } in value, and the running total reached after it.
 * opts.down: downward waterfall (flipped): a movement is subtracted.
 * opts.backCalc: the first anchor is back-calculated from the last one (an "e" at the start).
 * opts.links: { movement key: key of an earlier column }: the movement restarts from the
 *   level reached by that column (dragged connector), the running total follows.
 * opts.toBaseline: keys of movements drawn from zero (the running total continues):
 *   the BOTTOM of the segment on the baseline; opts.toBaselineTop: its TOP
 *   ("Force top to baseline": the segment hangs below the axis).
 */
export function bridgeLevels(steps, opts = {}) {
  const sgn = opts.down ? -1 : 1
  let start = null
  if (opts.backCalc && steps[0]?.kind === 'anchor') {
    const last = [...steps].reverse().find(s => s.kind !== 'delta')
    if (last && last !== steps[0]) {
      const between = steps.slice(1, steps.indexOf(last)).filter(s => s.kind === 'delta').reduce((t, s) => t + sgn * s.value, 0)
      start = last.value - between
    }
  }
  const base = new Set(opts.toBaseline ?? [])
  const baseTop = new Set(opts.toBaselineTop ?? [])
  let run = 0
  const links = opts.links ?? {}
  const reached = {}
  return steps.map((s, i) => {
    let from, to
    if (s.kind === 'delta') {
      const src = links[s.key]
      if (src != null && reached[src] != null) run = reached[src]
      from = run; to = run + sgn * s.value
      reached[s.key] = to
      run = to
      if (base.has(s.key)) return { from: 0, to: sgn * s.value, level: run }
      if (baseTop.has(s.key)) return { from: 0, to: -Math.abs(s.value), level: run }
    } else {
      from = 0; to = s.kind === 'total' ? run : i === 0 && start != null ? start : s.value
      run = to
      reached[s.key] = to
    }
    return { from, to, level: run }
  })
}

/** An index value (spec.index === 100): the number alone, no currency nor unit. */
function indexFormat(L) {
  return (v, unit, decimals) => (v == null || !Number.isFinite(v) ? '—' : localizeNumber(v.toFixed(decimals ?? 0), L))
}

/** Scales every value a step carries (its value, segments, net lines, high scenario). */
function scaleStep(s, k) {
  const m = v => (Number.isFinite(v) ? v * k : v)
  const out = { ...s, value: m(s.value) }
  if (s.high != null) out.high = m(s.high)
  if (s.display != null) out.display = m(s.display)
  for (const f of ['parts', 'partsAll', 'nets']) if (Array.isArray(s[f])) out[f] = s[f].map(p => ({ ...p, value: m(p.value) }))
  return out
}

function signed(v, unit, dec, format) {
  // A zero lever is written 0, not "+€0M": it has neither meaning nor sign.
  if (Math.abs(v) < 0.5 * 10 ** -dec) return '0'
  return `${v >= 0 ? '+' : '−'}${format(Math.abs(v), unit, dec)}`
}

/**
 * Ticks of an axis in €M: a single unit along the whole axis. As soon as a
 * tick passes one billion, all are written in €B, with just as many
 * decimals as the step needs (€0.5B, €1.0B… rather than €500M next to €1.00B).
 */
export function axisLabels(values, unit, format, gap = false, locale = 'en') {
  if (gap) return values.map(v => (v === 0 ? '0' : signed(v, unit, 0, format)))
  const step = values.length > 1 ? Math.abs(values[1] - values[0]) : 0
  // Only for a formatter that writes a currency or a magnitude (the default writes bare numbers:
  // 1,000, 1,200…).
  if (unit === 'M' && values.some(v => Math.abs(v) >= 1000) && /[€$£]|\dM/.test(format(1, unit, 0))) {
    const d = step > 0 ? Math.max(0, Math.min(2, -Math.floor(Math.log10(step / 1000) + 1e-9))) : 1
    return values.map(v => (v === 0 ? '0' : localizeNumber(`€${(v / 1000).toFixed(d)}B`, locale)))
  }
  return values.map(v => (v === 0 ? '0' : format(v, unit, 0)))
}

function layoutLegend(items, width) {
  const out = []
  let x = 0
  let row = 0
  for (const it of items) {
    const w = 16 + estimateWidth(it.label, 11)
    if (x > 0 && x + w > width) { x = 0; row++ }
    out.push({ ...it, x, y: row * LEGEND_ROW + LEGEND_ROW / 2 })
    x += w + 16
  }
  return { items: out, height: items.length ? (row + 1) * LEGEND_ROW + 6 : 0 }
}

// A net line: half the stroke thickness (2.5 px drawn) and free margin around it.
const NET_HALF = 1.25
const NET_GAP = 4
export function buildWaterfallScene(spec, bridge, opts = {}) {
  const width = Math.max(200, Math.round(opts.width ?? 640))
  const height = Math.max(160, Math.round(opts.height ?? 260))
  const L = localeOf(spec)
  let format = localizedFormat(opts.format ?? defaultFormat, L)
  let axisFormat = localizedFormat(opts.axisFormat ?? null, L)
  const LM = labelMetrics(opts.labelStyle ?? spec, LABEL_FONT)
  const measure = LM.base ? estimateWidth : (tx, sz) => LM.measure(tx, sz)
  const labelH = LM.base ? LABEL_H : LM.size + 4
  let unit = bridge?.unit ?? 'M'
  const dec = spec?.numberFormat?.decimals ?? 0
  // Net lines (on a multi-series waterfall): the segments of these
  // series leave the stack and the step's sum; a horizontal line marks their level
  // (e.g. a budget reference on a waterfall). A step is recomputed on its stacked segments only.
  const netIds = new Set((spec?.netLines ?? []).map(String))
  const isNet = p => netIds.has(String(p.key))
  let steps = (bridge?.steps ?? []).filter(s => Number.isFinite(s.value)).map(s => {
    if (!netIds.size || !Array.isArray(s.parts) || !s.parts.some(isNet)) return s
    const kept = s.parts.filter(p => !isNet(p) && Number.isFinite(p.value))
    const nets = s.parts.filter(p => isNet(p) && Number.isFinite(p.value))
    const sum = kept.reduce((t, p) => t + p.value, 0)
    return { ...s, value: s.kind === 'total' ? s.value : sum, parts: kept.length > 1 ? kept : undefined, partsAll: kept, nets }
  })
  // Data table: values move under the axis (the bars no longer carry a label).
  // Indexed to 100: the start (the first column, an anchor) becomes 100 and every value
  // is scaled with it; the figures lose their currency and unit. The levels are linear in
  // the values, so the geometry keeps its proportions.
  let indexed = false
  let indexIgnored = false
  if (spec?.index === 100) {
    const start = steps[0] && steps[0].kind !== 'delta' ? bridgeLevels(steps, { down: spec?.direction === 'down', backCalc: !!spec?.backCalc })[0].to : null
    if (Number.isFinite(start) && start > 0) {
      const k = 100 / start
      steps = steps.map(s => scaleStep(s, k))
      format = indexFormat(L)
      axisFormat = null
      unit = 'index'
      indexed = true
    } else indexIgnored = true
  }
  const tableOn = !!spec?.table
  const tableRows = tableOn ? (spec.table === 'running' ? ['value', 'running'] : ['value']) : []
  const showLabels = (spec?.labels ?? 'all') === 'all' && !tableOn
  const showConnectors = spec?.connectors ?? true
  const showWhiskers = spec?.whiskers ?? false
  const gapAxis = spec?.axis === 'gap'
  const keys = steps.map(s => s.key)
  const diffs = (spec?.annotations ?? []).filter(a => a?.type === 'diff' && keys.includes(a.from) && keys.includes(a.to))

  const base = {
    width, height, plot: null, axes: { x: { ticks: [] }, left: null }, gridlines: [], bars: [], labels: [],
    connectors: [], whiskers: [], annotations: [], legend: [], columns: [], netLines: [], empty: steps.length === 0,
    indexed, ...(indexIgnored ? { indexIgnored: true } : {}),
  }
  // The same validation as the live view: what it would refuse, said here too (never thrown).
  base.errors = validateBridgeSpec(spec ?? {}, { bridge })
  if (base.empty) return stamp(base, 'waterfall', spec)

  // Dragged connectors: a movement can only restart from an earlier, non-adjacent column.
  const links = {}
  for (const [k, src] of Object.entries(spec?.links ?? {})) {
    const j = keys.indexOf(k), i = keys.indexOf(src)
    if (j > 0 && i >= 0 && i < j - 1 && steps[j].kind === 'delta') links[k] = src
  }
  base.links = links
  const levels = bridgeLevels(steps, { down: spec?.direction === 'down', backCalc: !!spec?.backCalc, toBaseline: spec?.toBaseline, toBaselineTop: spec?.toBaselineTop, links })
  const hasWhisker = showWhiskers && steps.some(s => s.high != null)

  // ── Legend: the tones present, in waterfall order ──────────────────────
  // An assumption waterfall reads in two words: what is signed, what is simulated.
  const hypo = steps.some(s => s.hypothesis)
  // Single accent: the colors no longer say the family, the family swatches leave the legend.
  const single = singleAccent(spec)
  const tones = single ? [] : [...new Set(steps.filter(s => !s.hypothesis).map(s => s.tone))].filter(tn => TONE_LEGEND[tn])
  // Chosen colors (reading settings): per family (toneColors), then per bar (stepColors).
  const toneColor = tn => spec?.toneColors?.[tn] ?? TONE_TOKEN[tn]
  const legendItems = tones.map(tn => ({
    key: tn, label: t(hypo && tn === 'anchor' ? 'Signed' : TONE_LEGEND[tn], L), color: toneColor(tn), kind: 'swatch',
  }))
  if (hypo) legendItems.push({ key: 'hypothesis', label: t('Working (simulated)', L), color: single ? 'chart-neutral' : HYPOTHESIS_TOKEN, kind: 'outline' })
  if (hasWhisker) legendItems.push({ key: 'high', label: t('High scenario', L), color: TONE_TOKEN.upside, kind: 'whisker' })
  const netColor = (s, p) => spec?.stepColors?.[`net|${p.key}`] ?? 'black'
  for (const k of netIds) {
    const st = steps.find(s => (s.nets ?? []).some(p => String(p.key) === k))
    if (st) { const p = st.nets.find(q => String(q.key) === k); legendItems.push({ key: `net:${k}`, label: p.label ?? k, color: netColor(st, p), kind: 'net' }) }
  }
  const legend = layoutLegend(legendItems, width)
  base.legend = legend.items

  // ── Provisional X axis to measure the labels ───────────────────────────
  // The left gutter depends on the ticks, which depend on the height,
  // which depends on the labels: measure with an estimated gutter, then
  // fix it. The estimation error is a few pixels, absorbed by the wrapping.
  const estLeft = 52
  const estStep = (width - estLeft - 12) / steps.length
  // Font steps down 11 → 10 → 9 before any abbreviation.
  const fits = size => steps.every(s => !wrapLabel(s.label, estStep - 1, size).some(l => l.endsWith('…')))
  const tickFont = [TICK_FONT, 10, 9].find(fits) ?? 9
  const wrapped = steps.map(s => wrapLabel(s.label, estStep - 1, tickFont))
  const lines = Math.max(...wrapped.map(w => w.length))
  const tableH = tableRows.length ? tableRows.length * TABLE_ROW + 4 : 0
  const xAxisH = lines * AXIS_LINE_H + 8 + tableH

  // ── Y axis: zero included, all bounds, room for the labels ──────────────
  // The level of a net line: from the start of the step (movement), from zero (anchor, total).
  const sgNet = spec?.direction === 'down' ? -1 : 1
  const netLevel = (s, l, p) => (s.kind === 'delta' ? l.from + sgNet * p.value : p.value)
  const vals = [0]
  levels.forEach((l, i) => {
    vals.push(l.from, l.to)
    for (const p of steps[i].nets ?? []) vals.push(netLevel(steps[i], l, p))
    if (hasWhisker && steps[i].high != null) vals.push(steps[i].high)
  })
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (lo === hi) hi = lo + 1

  const plotTop = legend.height + 4
  const plotBottom = height - xAxisH
  // Height reserved above the highest top: labels + difference arrow.
  const headroom = (showLabels ? labelH + 2 : 4) + (diffs.length ? DIFF_H : 0)
  const footroom = lo < 0 && showLabels ? labelH : 0
  const innerTop = plotTop + headroom
  const innerBottom = plotBottom - footroom
  const tickCount = Math.max(2, Math.min(6, Math.floor((plotBottom - plotTop) / 42)))
  // Scale set by hand (axis mini toolbar): min, max, step; out of bounds, bars are clipped.
  const ya = spec?.yAxis ?? {}
  const yMin = Number.isFinite(ya.min) ? ya.min : null
  const yMax = Number.isFinite(ya.max) ? ya.max : null
  const manualScale = (yMin != null || yMax != null) && (yMax ?? hi) > (yMin ?? lo)
  const y = scaleLinear().domain(manualScale ? [yMin ?? lo, yMax ?? hi] : [lo, hi]).range([innerBottom, innerTop])
  if (!manualScale) y.nice(tickCount)
  else y.clamp(true)
  const [dLo, dHi] = y.domain()
  const yStep = Number.isFinite(ya.step) && ya.step > 0 && (dHi - dLo) / ya.step <= 50 ? ya.step : null
  const rawTicks = yStep ? Array.from({ length: Math.floor((dHi - Math.ceil(dLo / yStep - 1e-9) * yStep) / yStep + 1e-9) + 1 }, (_, i) => Number((Math.ceil(dLo / yStep - 1e-9) * yStep + i * yStep).toPrecision(12))) : y.ticks(tickCount)
  // Ticks stay within the useful area; the top margin is breathing room.
  const ticks = rawTicks.filter(v => y(v) >= plotTop - 1 && y(v) <= plotBottom + 1)
  const tickText = ya.labels === false ? ticks.map(() => '') : axisFormat && !gapAxis ? ticks.map(v => (v === 0 ? '0' : axisFormat(v, unit, 0))) : axisLabels(ticks, unit, axisFormat ?? format, gapAxis, L)
  const tickLabels = ticks.map((v, i) => ({ value: v, y: y(v), label: tickText[i] }))
  const tableHead = r => t(TABLE_HEAD[r], L)
  const headW = tableRows.length ? Math.max(...tableRows.map(r => estimateWidth(tableHead(r), 10))) + 10 : 0
  const gutter = Math.max(Math.ceil(Math.max(...tickLabels.map(t => estimateWidth(t.label, TICK_FONT)), 0)) + 10, headW)

  const plot = { left: gutter, right: width - 8, top: plotTop, bottom: plotBottom }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot
  base.axes.left = { x: plot.left, ticks: tickLabels }
  // On a gap axis, zero IS the starting point: its line reads more crisply.
  base.gridlines = tickLabels.filter(t => ya.grid !== 'none' || t.value === 0).map(t => ({ x1: plot.left, x2: plot.right, y: t.y, zero: t.value === 0 && (lo < 0 || gapAxis), strong: gapAxis && t.value === 0 }))

  const x = scaleBand().domain(keys).range([plot.left, plot.right]).paddingInner(0.22).paddingOuter(0.1)
  const band = x.bandwidth()
  const barW = Math.min(band, MAX_BAR)
  const edge = k => { const l = x(k) + (band - barW) / 2; return { left: l, right: l + barW, mid: l + barW / 2 } }
  const step = x.step()

  base.axes.x = {
    y: plot.bottom,
    font: tickFont,
    // Wrap on the actual column width, within the reserved number of lines.
    ticks: steps.map(s => ({ key: s.key, x: edge(s.key).mid, lines: wrapLabel(s.label, step - 1, tickFont, lines) })),
  }

  // ── Bars and labels ────────────────────────────────────────────────────
  let labelFont = LM.size
  // Label content: value, % of the base (the
  // first total, the sheet's "100 %" column), or both.
  const content = spec?.labelContent ?? 'value'
  // The "100 %" base: a chosen level (spec.pctBase = its key), otherwise the first anchor.
  const baseIdx = spec?.pctBase != null ? steps.findIndex(s => s.key === spec.pctBase && s.kind !== 'delta') : -1
  const base100 = Math.abs(levels[baseIdx >= 0 ? baseIdx : 0]?.to ?? 0)
  const pctOf = v => (base100 ? localizeNumber(`${((v / base100) * 100).toFixed(0)}%`, L) : '')
  const labelText = (s, l) => {
    const raw = labelTextValue(s, l)
    if (content === 'value' || !base100 || gapAxis) return raw
    const v = s.kind === 'delta' ? s.value : l.to
    const pct = s.kind === 'delta' ? localizeNumber(`${v >= 0 ? '+' : '−'}${Math.abs((v / base100) * 100).toFixed(0)}%`, L) : pctOf(v)
    return content === 'pct' ? pct : `${raw} (${pct})`
  }
  const labelTextValue = (s, l) => {
    if (s.kind === 'delta') return signed(s.value, unit, dec, format)
    if (s.vs) return `${signed(l.to, unit, dec, format)} ${t('vs', L)} ${s.vs}`
    if (gapAxis) return s.display != null ? format(s.display, unit, dec) : '—'
    return format(l.to, unit, dec)
  }
  if (LM.base && steps.some((s, i) => estimateWidth(labelText(s, levels[i]), LABEL_FONT) > step - 2)) labelFont = 9

  steps.forEach((s, i) => {
    const l = levels[i]
    const e = edge(s.key)
    const yA = y(l.from)
    const yB = y(l.to)
    const top = Math.min(yA, yB)
    const hyp = !!s.hypothesis
    const color = accentColor(spec, s.key, hyp ? HYPOTHESIS_TOKEN : (spec?.stepColors?.[s.key] ?? toneColor(s.tone) ?? 'gray-700'))
    // An anchor set at zero (gap waterfall) is drawn as a 4 px line.
    const tick = gapAxis && s.kind === 'anchor' && l.to === 0
    // A step with several segments (stacked segments, mixed signs):
    // each segment chains from the start of the step; the algebraic sum makes the step.
    const parts = Array.isArray(s.parts) && s.parts.length ? s.parts.filter(p => Number.isFinite(p.value)) : null
    // A level (anchor, total) with several segments stacks from zero (stacked waterfall from the
    // sheet); its segments are distinguished by a gray ramp, unless the sheet sets a color.
    if (parts && !tick && !(s.kind === 'delta' && (spec?.toBaseline ?? []).concat(spec?.toBaselineTop ?? []).includes(s.key))) {
      const order = spec?.partOrder === 'posFirst' ? [...parts].sort((p, q) => q.value - p.value) : spec?.partOrder === 'negFirst' ? [...parts].sort((p, q) => p.value - q.value) : parts
      let cum = l.from
      const sg = spec?.direction === 'down' && s.kind === 'delta' ? -1 : 1
      const levelRamp = [toneColor('anchor'), 'gray-600', 'gray-400', 'gray-300']
      order.forEach((p, pi) => {
        const a = y(cum), b = y(cum + sg * p.value)
        cum += sg * p.value
        const auto = s.kind === 'delta' ? (sg * p.value >= 0 ? toneColor('positive') : toneColor('negative')) : levelRamp[pi % levelRamp.length]
        base.bars.push({
          key: s.key, part: p.key, x: e.left, width: barW, y: Math.min(a, b), height: Math.max(1, Math.abs(b - a)),
          color: accentColor(spec, s.key, spec?.stepColors?.[`${s.key}|${p.key}`] ?? p.color ?? auto),
          tone: s.kind !== 'delta' ? s.tone : sg * p.value >= 0 ? 'positive' : 'negative', projected: !!s.projected, hypothesis: false, value: p.value, label: p.label, section: s.section ?? null,
        })
      })
    } else {
      base.bars.push({
        key: s.key, x: e.left, width: barW, y: tick ? yB - 2 : top,
        height: tick ? 4 : Math.max(Math.abs(yB - yA), s.value === 0 && s.kind === 'delta' ? 0 : 1),
        color: tick ? 'gray-800' : color, tone: s.tone, projected: !!s.projected, hypothesis: hyp && !tick, value: s.value,
        section: s.section ?? null,
      })
    }
    // A hex that is too light (free style) is not written on the background: the figure switches to dark ink.
    // Single accent: the figures sit outside the bars, dark on the accent, muted elsewhere.
    const textColor = single ? (color === ACCENT ? 'black' : 'chart-neutral-ink') : hyp ? HYPOTHESIS_TEXT : isLightHex(color) ? 'gray-800' : color
    // A step with a whisker carries its label above the cap: the
    // dotted line never crosses the figure.
    const capY = hasWhisker && s.high != null && y(s.high) < top - 1 ? y(s.high) : null
    // The step's net lines (a line at their level): placed before the figure, which avoids them.
    const netYs = []
    for (const p of s.nets ?? []) {
      const v = netLevel(s, l, p)
      netYs.push(y(v))
      base.netLines.push({ key: `${s.key}|${p.key}`, stepKey: s.key, part: p.key, label: p.label ?? p.key, x1: e.left - 3, x2: e.right + 3, y: y(v), value: v, color: netColor(s, p), text: format(v, unit, dec) })
    }
    if (showLabels) {
      // What goes down carries its figure below (a movement, a negative end value).
      const down = s.kind !== 'anchor' && l.to < l.from
      // The figure moves past a net line that would touch it: its box (baseline
      // - body … baseline + 2) keeps NET_GAP px on either side of the line (thickness
      // included). The line closest to the bar first; a line far from the figure does not
      // move it.
      const hitNet = (b, v) => b + 2 + NET_GAP > v - NET_HALF && b - labelFont - NET_GAP < v + NET_HALF
      let upY = (capY ?? top) - 5
      for (const v of [...netYs].sort((p, q) => q - p)) if (hitNet(upY, v)) upY = v - NET_HALF - NET_GAP - 2
      let dnY = Math.max(yA, yB) + labelFont + 3
      for (const v of [...netYs].sort((p, q) => p - q)) if (hitNet(dnY, v)) dnY = v + NET_HALF + NET_GAP + labelFont
      base.labels.push({
        key: s.key, below: down, x: e.mid, y: down ? dnY : upY,
        text: labelText(s, l), color: labelText(s, l) === '0' ? 'gray-500' : tick ? 'black' : textColor, size: labelFont,
      })
    }
    if (hasWhisker && s.high != null) {
      // The whisker starts at the top of the step and rises to the high scenario.
      if (capY != null) base.whiskers.push({ key: s.key, x: e.mid, y1: top, y2: capY, cap: barW * 0.4, color: TONE_TOKEN.upside })
    }
    base.columns.push({
      key: s.key, label: s.label, x0: x(s.key) - (step - band) / 2, x1: x(s.key) + band + (step - band) / 2, cx: e.mid,
      color: textColor, text: labelText(s, l), level: s.kind === 'delta' && !gapAxis ? format(l.to, unit, dec) : null,
      high: s.high != null ? format(s.high, unit, dec) : null, projected: !!s.projected, tone: s.tone,
    })
  })

  // A label never leaves the frame: near an edge, it aligns to it.
  for (const l of base.labels) {
    const half = measure(l.text, l.size) * 0.52
    if (l.x + half > width) { l.anchor = 'end'; l.x = LM.base ? Math.min(l.x + barW / 2, width) : width }
    else if (l.x - half < 0) { l.anchor = 'start'; l.x = LM.base ? Math.max(l.x - barW / 2, 0) : 0 }
    else l.anchor = 'middle'
  }
  base.labels = resolveCollisions(base.labels, measure)
  // Set size: a figure that would leave the frame or overlap another is left out
  // (one figure fewer beats an unreadable figure).
  if (!LM.base) {
    const kept = []
    const box = l => { const w = measure(l.text, l.size), x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2; return { x0, x1: x0 + w, y0: l.y - l.size * 0.75, y1: l.y + l.size * 0.2 } }
    for (const l of base.labels) {
      const b = box(l)
      if (b.x0 < 0 || b.x1 > width || b.y0 < 0 || b.y1 > height) continue
      if (kept.some(k => { const q = box(k); return b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1 })) continue
      kept.push(l)
    }
    base.labels = kept
  }

  // ── Connectors: level reached → start of the next bar ──────────────────
  // A linked movement (dragged connector) gets its connector from the source column.
  if (showConnectors) {
    // Connectors can be removed one by one.
    const off = new Set(spec?.connectorsOff ?? [])
    for (let j = 1; j < steps.length; j++) {
      const src = links[steps[j].key]
      const i = src != null ? keys.indexOf(src) : j - 1
      if (off.has(steps[j - 1].key) && src == null) continue
      const a = edge(steps[i].key)
      const b = edge(steps[j].key)
      const yy = y(levels[i].level)
      // Conflict: an entered anchor (not a computed total) that does not extend the running total.
      const tol = Math.max(1e-9, Math.abs(levels[i].level) * 1e-6, 0.5 * 10 ** -dec)
      const clash = !gapAxis && steps[j].kind === 'anchor' && Math.abs(levels[j].to - levels[i].level) > tol
      base.connectors.push({ x1: a.right, x2: b.left, y: yy, from: steps[i].key, to: steps[j].key, linked: src != null,
        ...(clash ? { distorted: true, y2: y(levels[j].to), gap: levels[j].to - levels[i].level, text: `${signed(levels[j].to - levels[i].level, unit, dec, format)} ${t('vs running total', L)}` } : {}) })
    }
  }

  // ── Value line (column-chart decorations on a waterfall) ─
  if (spec?.valueLine != null && spec.valueLine !== false) {
    const manual = typeof spec.valueLine === 'number' && Number.isFinite(spec.valueLine)
    const v = manual ? spec.valueLine : (levels[0]?.to ?? 0)
    const [d0, d1] = y.domain()
    const yy = y(Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v)))
    base.valueLine = { value: v, auto: !manual, y: yy, x1: plot.left, x2: plot.right, text: format(v, unit, dec) }
  }
  base.yInvert = py => y.invert(py)
  base.unit = unit

  // ── Data table: one cell per column, centered under its label ─
  if (tableRows.length) {
    const y0 = plot.bottom + lines * AXIS_LINE_H + 8
    base.table = { top: y0, heads: [], rows: [] }
    tableRows.forEach((r, ri) => {
      const yy = y0 + ri * TABLE_ROW + 10
      base.table.heads.push({ key: r, text: tableHead(r), x: plot.left - 6, y: yy })
      steps.forEach((s, i) => {
        const l = levels[i]
        const full = r === 'value' ? labelText(s, l) : format(l.level, unit, dec)
        const fits = estimateWidth(full, 10) <= step - 2
        base.table.rows.push({ key: `${r}|${s.key}`, row: r, stepKey: s.key, x: edge(s.key).mid, y: yy, text: fits ? full : '…', full,
          color: r === 'value' ? (single ? (accentColor(spec, s.key, null) === ACCENT ? 'black' : 'chart-neutral-ink') : s.hypothesis ? HYPOTHESIS_TEXT : (spec?.stepColors?.[s.key] ?? toneColor(s.tone) ?? 'gray-700')) : 'gray-700' })
      })
    })
  }

  // ── Difference arrows ──────────────────────────────────────────────────
  for (const d of diffs) {
    const ia = keys.indexOf(d.from)
    const ib = keys.indexOf(d.to)
    const va = levels[ia].to
    const vb = levels[ib].to
    if (!va) continue
    const [i0, i1] = ia < ib ? [ia, ib] : [ib, ia]
    let peak = -Infinity
    for (let i = i0; i <= i1; i++) {
      peak = Math.max(peak, levels[i].from, levels[i].to)
      if (hasWhisker && steps[i].high != null) peak = Math.max(peak, steps[i].high)
    }
    const clear = showLabels ? labelH + 4 : 6
    const yTop = Math.max(plot.top + 9, y(peak) - clear - 14)
    const delta = vb - va
    // % of the difference (% of datasheet 100%): relative to the start of the arrow, to the
    // first anchor ('start'), to the "100 %" base of the labels ('pctBase'), or to a
    // chosen level (its key).
    const pick = spec?.diffBase === 'pctBase' ? spec?.pctBase : spec?.diffBase
    const refIdx = pick != null && pick !== 'start' ? steps.findIndex(s => s.key === pick && s.kind !== 'delta') : -1
    const ref = refIdx >= 0 ? (levels[refIdx].to || va)
      : spec?.diffBase === 'start' || (spec?.diffBase === 'pctBase' && spec?.pctBase == null) ? (levels[0]?.to || va) : va
    const pct = delta / Math.abs(ref)
    const sgn = delta >= 0 ? '+' : '−'
    const text = `${sgn}${format(Math.abs(delta), unit, dec)} (${localizeNumber(`${sgn}${Math.abs(pct * 100).toFixed(0)}%`, L)})`
    base.annotations.push({
      type: 'diff', from: d.from, to: d.to, text,
      xa: edge(d.from).mid, xb: edge(d.to).mid,
      ya: y(va) - clear, yb: y(vb) - clear, yTop,
      pillW: estimateWidth(text, 10.5) + 16,
    })
  }

  return stamp(base, 'waterfall', spec)
}
