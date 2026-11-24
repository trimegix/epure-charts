// ─── epure-charts · reading settings ──────────────────────────────────────────
// One rule: a chart's settings icon ALWAYS carries its reading settings; the
// pencil, only on a user-owned chart, edits its content. Clicking a series opens
// the same reading settings in place (SeriesToolbar).
//
// What the reading settings control:
//   · the visible categories (hide 2019, 2021…)
//   · per series: shape (bars / line / area), fill, outline (color, dash,
//     weight, none), marker, smoothed line, left / right axis, and the color
//     of a single segment
//   · bar layout (clustered / stacked / 100%), category sort, number decimals
//   · value labels (none / last / all) on the chosen series
//   · CAGR arrows (as many as wanted), between any two categories, each on its series
//   · a series average, a difference arrow between two columns
//   · stack totals, a named value line
//
// A per-browser VIEW preference: layered over the spec, it never modifies it,
// so a shared chart stays frozen. Annotations the host sets itself (targets,
// thresholds, markers…) pass through untouched: the reading only replaces what
// it owns (CAGR, average, difference, totals, and ITS value line, flagged `user`).
//   readingDefaults(spec) → the settings the spec carries originally
//   applyReading(spec, prefs) → the spec to draw
// Pure, tested under node --test.

// Series properties the reading may layer over the spec.
const STYLE_KEYS = ['color', 'stroke', 'weight', 'dash', 'markerShape', 'smooth', 'step']
const BAR_MODES = ['clustered', 'stacked', 'stacked100']

/** Color schemes: applied in series order, repeating past the end; a hand-picked color is kept. */
export const SCHEMES = {
  categorical: ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8'],
  accent: ['gold', 'gray-600', 'gray-400', 'gray-300'],
  gray: ['gray-800', 'gray-600', 'gray-400', 'gray-300'],
  blue: ['blue-chart', 'cat-7', 'gray-400', 'gray-300'],
}

/** Colors of the chosen scheme: a built-in scheme, or the user's named scheme (format.customScheme). */
export function schemeColors(format) {
  if (format?.scheme === 'custom') return format.customScheme?.colors?.length ? format.customScheme.colors : null
  return SCHEMES[format?.scheme] ?? null
}

const withoutKeys = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

// A spec CAGR as a reading setting: its bounds, and the series of each end (a.series is both ends').
const cagrPref = a => {
  const fs = a.from.series ?? a.series
  const ts = a.to.series ?? a.series
  return { from: String(a.from.key), to: String(a.to.key), ...(fs ? { fromSeries: fs } : {}), ...(ts ? { toSeries: ts } : {}) }
}
const sameCagr = (a, c) => { const p = cagrPref(a); return p.from === c.from && p.to === c.to && (p.fromSeries ?? '') === (c.fromSeries ?? '') && (p.toSeries ?? '') === (c.toSeries ?? '') }

const OWNED = new Set(['cagr', 'totals', 'average', 'diff'])
const owned = a => OWNED.has(a?.type) || (a?.type === 'valueLine' && a.user)
// The reading settings hold ONE difference arrow (the first of the spec, editable from the
// menus); the spec's other arrows are kept as they are, so the live view draws them all, like
// the static one.
const extraDiffs = anns => anns.filter(a => a?.type === 'diff').slice(1)

/** The reading settings a spec carries originally. */
export function readingDefaults(spec) {
  const series = spec?.series ?? []
  const labelled = series.find(s => (s.labels ?? 'none') !== 'none')
  const anns = spec?.annotations ?? []
  const vl = anns.find(a => a.type === 'valueLine' && a.user)
  const cagrs = anns.filter(a => a.type === 'cagr')
  const diff = anns.find(a => a.type === 'diff')
  return {
    labels: labelled?.labels ?? 'none',
    labelSeries: labelled?.id ?? series[0]?.id ?? '',
    // Every series that carries labels keeps them (a stacked chart with a number in each segment).
    labelsBy: Object.fromEntries(series.filter(s => (s.labels ?? 'none') !== 'none').map(s => [s.id, s.labels])),
    // A series "first to last actual" CAGR (no bounds) is kept as is.
    cagr: cagrs.find(a => !a.from)?.series ?? '',
    // Every explicit CAGR, with the series of each end when the spec names one.
    cagrs: cagrs.filter(a => a.from && a.to).map(cagrPref),
    totals: anns.some(a => a.type === 'totals'),
    // A first-to-last CAGR of the stacked column total ({ type: 'cagr', of: 'total' }).
    cagrTotal: cagrs.some(a => !a.from && a.of === 'total'),
    average: anns.find(a => a.type === 'average')?.series ?? '',
    diffFrom: diff ? String(diff.from) : '',
    diffTo: diff ? String(diff.to) : '',
    // The arrow of ONE series (level difference), as the spec sets it.
    diffSeries: diff?.series ?? '',
    hidden: [...(spec?.x?.hidden ?? [])].map(String),
    series: {},
    bars: '',
    sort: '',
    decimals: null,
    // Magnitude of an amount: null (the host's), 'k', 'M', 'B'.
    magnitude: null,
    // Per-object formatting (axes, labels, legend, gridlines…): see scene.js `spec.format`.
    // The spec's difference arrow mode ('both', 'pct', 'pctEnd') is the chart's starting mode:
    // the menu and the double-click change it from there.
    format: diff?.mode && diff.mode !== 'abs' ? { diffMode: diff.mode } : {},
    // Label side of the value line set by the reading.
    valueLineSide: 'right',
    // The datasheet (sheetModel): typed edits, never the source data.
    sheet: null,
    // Kept as text: the field accepts "3." or "-" while typing.
    valueLine: vl ? String(vl.value) : '',
    valueLineLabel: vl?.label ?? '',
  }
}

/** Number read from an input (comma accepted); null when empty or incomplete. */
export function parseNumber(raw) {
  const t = String(raw ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** The spec to draw: `spec` with the reading `prefs` layered over it. */
export function applyReading(spec, prefs) {
  const series = spec?.series ?? []
  const ids = new Set(series.map(s => s.id))
  const labelSeries = ids.has(prefs.labelSeries) ? prefs.labelSeries : series[0]?.id
  const extra = new Set(extraDiffs(spec.annotations ?? []))
  const keep = (spec.annotations ?? []).filter(a => !owned(a) || extra.has(a))
  const vl = parseNumber(prefs.valueLine)
  const time = spec.x?.grain !== 'category'
  const over = prefs.series ?? {}
  const cagrs = (prefs.cagrs ?? []).filter(c => c?.from && c?.to && c.from !== c.to)
  // The spec's original CAGRs keep their target series when their bounds did not move.
  const origin = (spec.annotations ?? []).filter(a => a.type === 'cagr' && a.from && a.to)
  // The spec's difference arrow keeps its own fields (level, label…) while its bounds do not move;
  // its mode is the reading's (format.diffMode, seeded by readingDefaults).
  const diffOrigin = (spec.annotations ?? []).find(a => a.type === 'diff'
    && String(a.from) === prefs.diffFrom && String(a.to) === prefs.diffTo)
  return {
    ...spec,
    x: { ...spec.x, hidden: [...(prefs.hidden ?? [])], ...(!time && (prefs.sort === 'desc' || prefs.sort === 'asc') ? { sort: prefs.sort } : {}) },
    ...(BAR_MODES.includes(prefs.bars) ? { bars: prefs.bars } : {}),
    ...(Number.isInteger(prefs.decimals) ? { numberFormat: { ...(spec.numberFormat ?? {}), decimals: prefs.decimals } } : {}),
    format: { ...(spec.format ?? {}), ...(prefs.format ?? {}) },
    ...(prefs.format?.endLabels === false ? { endLabels: false } : {}),
    series: series.map((s, si) => {
      const o = over[s.id] ?? {}
      const scheme = schemeColors(prefs.format)
      const style = { ...(s.style ?? {}), ...(scheme ? { color: scheme[si % scheme.length] } : {}) }
      for (const k of STYLE_KEYS) if (o[k] != null) style[k] = o[k]
      if (o.points && Object.keys(o.points).length) style.points = { ...(style.points ?? {}), ...o.points }
      return {
        ...s,
        ...(o.mark ? { mark: o.mark } : {}),
        ...(o.axis === 'left' || o.axis === 'right' ? { axis: o.axis } : {}),
        // Stack group (clustered-stacked columns); null = the main stack.
        ...(o.stack !== undefined ? { stack: o.stack } : {}),
        style,
        // Per series first (labelsBy), then the legacy single-series setting.
        labels: prefs.labelsBy?.[s.id] ?? (s.id === labelSeries ? (prefs.labels ?? 'none') : 'none'),
      }
    }),
    annotations: [
      ...keep,
      ...(ids.has(prefs.cagr) && time ? [{ type: 'cagr', series: prefs.cagr }] : []),
      ...cagrs.map((c, i) => {
        // Same bounds and series: the spec's own arrow (its duration, label, tone).
        const o = origin.find(a => sameCagr(a, c)) ?? origin.find(a => String(a.from.key) === c.from && String(a.to.key) === c.to && !c.fromSeries && !c.toSeries)
        if (o) return o
        const end = (key, sid) => ({ key, ...(ids.has(sid) ? { series: sid } : {}) })
        return { type: 'cagr', from: end(c.from, c.fromSeries), to: end(c.to, c.toSeries), tone: i ? 'gray-700' : 'gray-500' }
      }),
      ...(prefs.cagrTotal && time ? [{ type: 'cagr', of: 'total' }] : []),
      ...(prefs.totals && (BAR_MODES.includes(prefs.bars) ? prefs.bars : spec.bars) === 'stacked' ? [{ type: 'totals' }] : []),
      ...(ids.has(prefs.average) ? [{ type: 'average', series: prefs.average }] : []),
      ...(prefs.diffFrom && prefs.diffTo && prefs.diffFrom !== prefs.diffTo
        ? [{ ...(diffOrigin ? withoutKeys(diffOrigin, ['mode', 'series']) : {}), type: 'diff', from: prefs.diffFrom, to: prefs.diffTo, ...(ids.has(prefs.diffSeries) ? { series: prefs.diffSeries } : {}) }] : []),
      ...(vl != null ? [{ type: 'valueLine', user: true, value: vl, labelAt: prefs.valueLineSide === 'left' ? 'left' : 'right', ...(prefs.valueLineLabel ? { label: prefs.valueLineLabel } : {}) }] : []),
    ],
  }
}
