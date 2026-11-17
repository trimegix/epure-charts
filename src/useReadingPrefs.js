// ─── epure-charts · reading menu of a cartesian chart ────────────────────────
// useReadingPrefs(spec, resolved) → [specEffective, api]
//   · reading settings (reading.js), kept per browser under
//     epure-chart-read-<id>;
//   · the wheel API (ChartWheel): the settings button and a click on a
//     series open the same wheel and adjust the same preferences.
import { useState } from 'react'
import { useChartPrefs } from './chartPrefs'
import { buildSheet, emptyEdits, hasEdits } from './sheetModel'
import { readingDefaults, applyReading } from './reading'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec'
import { formatX } from './scene'

const isGap = k => String(k).startsWith('_')

/** Offered colors: the categorical palette plus the neutral tokens. */
// eslint-disable-next-line no-unused-vars -- spec kept for API compatibility
export function paletteFor(spec) {
  return [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
}

/** Axis categories, in order (spacer columns excluded). */
function keysOf(spec, resolved) {
  if (Array.isArray(spec.x?.keys)) return spec.x.keys.map(String).filter(k => !isGap(k))
  const set = new Set()
  for (const r of resolved) for (const p of r?.points ?? []) set.add(String(p.x))
  const out = [...set]
  return spec.x?.grain === 'category' ? out : out.sort()
}

// The sheet layout the user saved as default ("Use this layout as my default").
function userLayout() {
  if (typeof window === 'undefined') return {} // server rendering: no per-browser layout
  try { return Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('epure-chart-sheet-layout') ?? '{}')).filter(([, v]) => v != null)) } catch { return {} }
}

/**
 * Applies the data sheet to the chart: effective series and categories. Without
 * edits nothing changes. With edits, each sheet row is a series and each column a
 * category; as soon as a column is added, removed or renamed, the axis becomes
 * categorical (categories are labels). The host's spacer columns ('_…') keep
 * their place.
 */
function applySheet(spec, resolved, sheetIn, edits, fmt = {}) {
  if (!sheetIn.edited) return { spec, resolved }
  // An added row still empty (no name, no number) does not enter the chart.
  // Rows hidden in the sheet: out of the chart; hidden columns: categories removed.
  // An added column left empty (Tab at the end of a row, no name nor number) is not a category.
  const keepCols = sheetIn.cols.map((c, ci) => !(c.added && !c.name && sheetIn.rows.every(r => r.cells[ci]?.value == null)))
  if (keepCols.some(k => !k)) sheetIn = { ...sheetIn, cols: sheetIn.cols.filter((_, ci) => keepCols[ci]), rows: sheetIn.rows.map(r => ({ ...r, cells: r.cells.filter((_, ci) => keepCols[ci]) })) }
  // An empty row (added, no name nor number) creates no series but skips a color.
  const colorIndex = new Map(sheetIn.rows.map((r, i) => [r.id, i]))
  const sheet = { ...sheetIn, rows: sheetIn.rows.filter(r => !r.hidden && (!r.added || r.name || r.cells.some(c => c.value != null))) }
  const base = new Map((spec.series ?? []).map((s, i) => [s.id, { s, r: resolved[i] }]))
  const series = sheet.rows.map((row, i) => {
    const s = base.get(row.id)?.s ?? {
      id: row.id, ref: { metric: 'sheet', source: 'actual' }, mark: spec.series?.[0]?.mark ?? 'bar',
      style: { color: COLOR_TOKENS[((colorIndex.get(row.id) ?? i) + 2) % COLOR_TOKENS.length] }, labels: 'none',
    }
    // Row color in the sheet ("Use Datasheet Fill"): the series color.
    return row.fill ? { ...s, style: { ...(s.style ?? {}), color: row.fill } } : s
  })
  const out = sheet.rows.map(row => {
    const r = base.get(row.id)?.r
    return {
      label: row.name, unit: r?.unit ?? resolved[0]?.unit ?? 'M', nature: r?.nature ?? 'flow', role: r?.role ?? 'actual',
      points: sheet.cols.map((c, ci) => {
        const cell = row.cells[ci]
        // A cell color: that of its segment / point (the whole row is set on the series).
        // "Use Datasheet Number Format": a formatted input ("12.5 %", "€1.2bn") is shown as typed.
        const typed = fmt.sheetFormat && cell.edited && !String(cell.raw).trim().startsWith('=') && !/^-?\d+(\.\d+)?$/.test(String(cell.raw).trim()) ? String(cell.raw).trim() : null
        return cell.value == null || c.hidden ? null : { ...(typed ? { text: typed } : {}), x: c.key, y: cell.value, type: cell.type ?? 'actual', period: row.points?.[c.key]?.period, ...(cell.fill && !row.fill ? { color: cell.fill } : {}), ...(cell.font ? { font: cell.font } : {}) }
      }).filter(Boolean),
    }
  })
  const structural = (edits.addedCols ?? []).length || (edits.removedCols ?? []).length || Object.keys(edits.colNames ?? {}).length
  let x = spec.x
  if (structural) {
    const keys = sheet.cols.map(c => c.key)
    const orig = (spec.x?.keys ?? []).map(String)
    orig.forEach((k, i) => {
      if (!k.startsWith('_')) return
      const next = orig.slice(i + 1).find(n => keys.includes(n))
      const at = next ? keys.indexOf(next) : -1
      if (at > 0) keys.splice(at, 0, k)
    })
    x = { ...spec.x, grain: 'category', keys, names: Object.fromEntries(sheet.cols.map(c => [c.key, c.name])) }
    delete x.range
  }
  return { spec: { ...spec, x, series }, resolved: out }
}

/**
 * Reading preferences for a cartesian chart.
 * @returns {[object, object]} [effective spec, api for the format wheel and menus]
 */
export function useReadingPrefs(spec, resolved = []) {
  const [prefs, setPref, reset, update, latest] = useChartPrefs(`epure-chart-read-${spec.id}`, readingDefaults(spec))
  const [sheetOpen, setSheetOpen] = useState(false)
  const allKeys = keysOf(spec, resolved)
  // The sheet: the base is recomputed from the host series; edits are a view
  // preference (never the collected data).
  const edits = { ...emptyEdits(), ...(prefs.sheet ?? {}) }
  const sheetBase = {
    rows: (spec.series ?? []).map((s, i) => ({
      id: s.id, name: resolved[i]?.label ?? s.id,
      points: Object.fromEntries((resolved[i]?.points ?? []).map(p => [String(p.x), p])),
    })),
    cols: allKeys.map(k => ({ key: k, name: formatX(k, spec.x?.grain) })),
  }
  const sheet = buildSheet(sheetBase, edits)
  const applied = applySheet(spec, resolved, sheet, edits, { ...userLayout(), ...(prefs.format ?? {}) })
  const withCalc = applied.spec
  // The user's default layout completes the chart's own (the chart wins).
  const effective = applyReading(withCalc, { ...prefs, format: { ...userLayout(), ...(prefs.format ?? {}) } })

  const allResolved = applied.resolved
  const series = (withCalc.series ?? []).map((s, i) => ({ value: s.id, label: allResolved[i]?.label ?? s.id }))
  const keys = allKeys
  const hidden = new Set(prefs.hidden ?? [])
  const shown = keys.filter(k => !hidden.has(k))
  const labelOn = effective.series.find(s => s.labels !== 'none')?.id ?? series[0]?.value
  const cagrs = prefs.cagrs ?? []
  // Categories are written as on the axis ("Q2 '23", not "2023-Q2").
  const nameOf = k => formatX(k, spec.x?.grain)

  // ── API (menu and format bar) ──────────────────────────────────────────
  const api = {
    prefs, palette: paletteFor(spec), series, keys,
    setSeries: (id, patch) => update('series', cur => ({ ...(cur ?? {}), [id]: { ...(cur?.[id] ?? {}), ...patch } })),
    toggleHidden: key => {
      const next = new Set(latest().hidden ?? [])
      if (next.has(key)) next.delete(key)
      // The last visible category is never hidden.
      else if (keys.filter(k => !next.has(k)).length > 1) next.add(key)
      setPref('hidden', [...next])
    },
    // Labels on EVERY series (a stacked chart with a number in each segment).
    setLabels: (id, mode) => update('labelsBy', cur => ({ ...(cur ?? {}), [id]: mode })),
    setCagr: (i, end, key) => {
      const now = latest().cagrs ?? []
      const next = Array.from({ length: Math.max(now.length, i + 1) }, (_, j) => ({ ...(now[j] ?? { from: '', to: '' }) }))
      next[i][end] = key
      setPref('cagrs', next.filter(c => c.from || c.to))
    },
    setAverage: id => setPref('average', id),
    // The color of ONE segment (select the segment, then Fill).
    setPointColor: (id, key, color) => update('series', all => {
      const cur = all?.[id] ?? {}
      return { ...(all ?? {}), [id]: { ...cur, points: { ...(cur.points ?? {}), [key]: color } } }
    }),
    reset,
    // ── Data sheet ──
    sheetOpen, setSheetOpen, sheet, edits, sheetBase,
    // Effective series for the chart (null: the host's, unchanged).
    sheetResolved: sheet.edited ? applied.resolved : null,
    sheetEdited: hasEdits(edits),
    applyEdits: fn => setPref('sheet', fn(edits)),
    resetSheet: () => setPref('sheet', emptyEdits()),
    styleOf: id => effective.series.find(s => s.id === id)?.style ?? {},
    axisOf: id => effective.series.find(s => s.id === id)?.axis ?? 'left',
    decimals: Number.isInteger(prefs.decimals) ? prefs.decimals : null,
    markOf: id => effective.series.find(s => s.id === id)?.mark,
    stackOf: id => effective.series.find(s => s.id === id)?.stack ?? null,
    colorOf: id => effective.series.find(s => s.id === id)?.style?.color,
    labelsOf: id => (effective.series.find(s => s.id === id)?.labels ?? 'none'),
    update, latest,
  }

  // ── What the wheel also reads, to offer only what makes sense ──
  api.setPref = setPref
  api.grain = spec.x?.grain
  // Scale group set by the host (charts on the same page): "Same scale" by default.
  api.scaleGroup = spec.scaleGroup ?? null
  api.shown = shown
  api.hidden = hidden
  api.nameOf = nameOf
  api.barCount = effective.series.filter(s => s.mark === 'bar').length
  api.bars = effective.bars ?? 'clustered'
  api.labelOn = labelOn
  // Per-object formatting: a path ("yAxis.left.min") and its value;
  // null or '' removes the setting (back to default).
  api.fmt = prefs.format ?? {}
  api.setFmt = (path, value) => update('format', cur => {
    const keys = path.split('.')
    const next = structuredClone(cur ?? {})
    let at = next
    for (const k of keys.slice(0, -1)) at = at[k] = { ...(at[k] ?? {}) }
    const last = keys.at(-1)
    if (value == null || value === '') delete at[last]
    else at[last] = value
    return next
  })
  // Undo a reset: the previous state, written back as is.
  api.snapshot = () => structuredClone(latest())
  api.restore = snap => { for (const [k, v] of Object.entries(snap ?? {})) setPref(k, v) }
  api.hasRight = effective.series.some(s => s.axis === 'right')
  api.hasBars = effective.series.some(s => s.mark === 'bar')
  api.hasLines = effective.series.some(s => s.mark !== 'bar')
  api.magnitude = ['k', 'M', 'B'].includes(prefs.magnitude) ? prefs.magnitude : null
  // An amount in currency (unit 'M'): the only number whose magnitude changes.
  api.hasMoney = allResolved.some(r => (r?.unit ?? 'M') === 'M')
  // Magnitude applies to every number that is neither a % nor a multiple.
  api.hasMagnitude = allResolved.some(r => !['pct', 'x', 'calc%', 'calcx', '%'].includes(r?.unit ?? 'M'))
  // A spacer column the host already places before this category.
  const rawKeys = (spec.x?.keys ?? []).map(String)
  api.gapBefore = k => { const i = rawKeys.indexOf(String(k)); return i > 0 && rawKeys[i - 1].startsWith('_') }
  api.hasAreas = effective.series.some(s => s.mark === 'area')
  // Forecast bars (can be hatched with patterns).
  api.hasForecast = allResolved.some(r => (r?.points ?? []).some(p => p?.type === 'forecast'))
  // series: the difference arrow of ONE series (level difference); without it, the column totals.
  api.setDiff = (from, to, series) => { setPref('diffFrom', from); setPref('diffTo', to); setPref('diffSeries', series ?? '') }
  api.setValueLine = (value, label) => {
    setPref('valueLine', value == null ? '' : String(value))
    if (label !== undefined) setPref('valueLineLabel', label)
  }
  // The CAGR arrows set, with their index (the wheel adds them, handles adjust them).
  api.cagrs = cagrs
  api.removeCagr = i => update('cagrs', cur => (cur ?? []).filter((_, j) => j !== i))
  // As many CAGR arrows as wanted (several arrows, over successive pairs).
  api.addCagr = (from, to) => update('cagrs', cur => (from && to && from !== to && !(cur ?? []).some(c => c.from === from && c.to === to) ? [...(cur ?? []), { from, to }] : cur))
  // One arrow per successive pair of the given categories (in axis order).
  api.addCagrPairs = ks => {
    const sorted = [...new Set(ks.map(String))].filter(k => shown.includes(k)).sort((a, b) => shown.indexOf(a) - shown.indexOf(b))
    update('cagrs', cur => {
      const next = [...(cur ?? [])]
      for (let i = 1; i < sorted.length; i++) if (!next.some(c => c.from === sorted[i - 1] && c.to === sorted[i])) next.push({ from: sorted[i - 1], to: sorted[i] })
      return next
    })
  }
  // Several difference arrows: format.diffs, each
  // { from: { key, series? }, to: { key, series? }, level? }; level: the level arrow, alongside.
  const listOf = name => (prefs.format?.[name] ?? [])
  const setList = (name, fn) => update('format', cur => {
    const next = fn([...(cur?.[name] ?? [])]).filter(Boolean)
    const out = { ...(cur ?? {}) }
    if (next.length) out[name] = next
    else delete out[name]
    return out
  })
  api.diffs = listOf('diffs')
  api.addDiff = d => setList('diffs', l => [...l, d])
  api.setDiffAt = (i, patch) => setList('diffs', l => l.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  api.removeDiff = i => setList('diffs', l => l.filter((_, j) => j !== i))
  // Several value lines: format.valueLines, each { value, label?, side?, dash? }.
  api.valueLines = listOf('valueLines')
  api.addValueLine = v => setList('valueLines', l => [...l, v])
  api.setValueLineAt = (i, patch) => setList('valueLines', l => l.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  api.removeValueLine = i => setList('valueLines', l => l.filter((_, j) => j !== i))
  // Totals of the visible columns (bars, otherwise the first series): a new
  // value line starts at their mean, when added as on double-click.
  api.unitOf = id => allResolved[(withCalc.series ?? []).findIndex(s => s.id === id)]?.unit ?? 'M'
  api.columnTotals = (side = null) => {
    const bars = (withCalc.series ?? []).map((s, i) => ({ s, r: allResolved[i], e: effective.series[i] }))
      // One axis: only its series (a combo chart does not mix left and right).
      .filter(b => !side || (b.e?.axis ?? 'left') === side)
    const pool = bars.filter(b => (b.e?.mark ?? b.s.mark ?? 'bar') === 'bar')
    const use = pool.length ? pool : bars.slice(0, 1)
    // Stacked: the stack height; clustered: the tallest bar of the column.
    const stackedNow = effective.bars === 'stacked'
    const at = (b, k) => b.r?.points?.find(p => String(p.x) === k)?.y ?? 0
    return shown.map(k => (stackedNow ? use.reduce((t, b) => t + at(b, k), 0) : Math.max(...use.map(b => at(b, k))))).filter(v => v)
  }
  api.meanOfTotals = () => {
    const t = api.columnTotals()
    return t.length ? Number((t.reduce((a, v) => a + v, 0) / t.length).toPrecision(3)) : 0
  }
  // A suggested break ("Add Break"): below the outlier column
  // if one column dwarfs the others, otherwise in the middle of the axis.
  api.suggestBreak = (side = 'left') => {
    // A 100% column axis or a logarithmic axis is not broken.
    if (effective.bars === 'stacked100' || prefs.format?.yAxis?.[side]?.log) return null
    const t = [...api.columnTotals(side)].sort((a, b) => b - a)
    if (t.length < 2 || t[0] <= 0) return null
    const r = v => Number(v.toPrecision(2))
    // An outlier column: the break goes above the others. Otherwise, below the
    // smallest: the common base is compressed, the differences stay readable.
    const min = t.at(-1)
    return t[0] > 1.6 * t[1] ? { from: r(t[1] * 1.15), to: r(t[0] * 0.8) } : min > 0 ? { from: r(min * 0.2), to: r(min * 0.8) } : null
  }
  // The value of a series' visible points (to place a value line at their mean).
  api.valuesOf = id => {
    const i = (withCalc.series ?? []).findIndex(s => s.id === id)
    return (allResolved[i]?.points ?? []).filter(p => !hidden.has(String(p.x))).map(p => p.y).filter(Number.isFinite)
  }
  return [effective, api]
}
