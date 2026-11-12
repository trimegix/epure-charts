// ─── epure-charts · reading settings for horizontal bars ─────────────────────
// useBarhPrefs(spec, rows, id) → [specEffective, rowsEffective, api]: the host's
// spec stays fixed; what the user adjusts is a VIEW preference, stored per
// browser (epure-chart-barh-<id>). Same gestures as the other charts
// (BarhBar): sort, colors (per series, per bar), values, axis, gridlines,
// legend, bar thickness, number format, value line.
import { useChartPrefs } from './chartPrefs'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec'

const DEFAULTS = {
  mode: null,
  sort: null, labels: null, axis: null, grid: null, legend: null, thickness: null,
  seriesColors: {}, rowColors: {}, valueLine: '', valueLineLabel: '',
  decimals: null, magnitude: null, num: {},
  // Value-axis scale { min, max, step } (empty: automatic).
  scale: {},
}

/** Reading preferences for a horizontal bar chart: returns [spec, rows, api]. */
export function useBarhPrefs(spec, rows = [], id = 'barh') {
  const [prefs, setPref, reset, update, latest] = useChartPrefs(`epure-chart-barh-${id}`, DEFAULTS)
  const vl = Number(String(prefs.valueLine ?? '').replace(',', '.'))
  const hasVl = String(prefs.valueLine ?? '').trim() !== '' && Number.isFinite(vl)
  const rowH = { compact: 22, wide: 36 }[prefs.thickness] ?? spec.rowHeight ?? 28

  // Bar type: bars, stacked, 100%, clustered, butterfly or profile.
  const modeSpec = prefs.mode === 'stacked' ? { stacked: true, stacked100: false, butterfly: false }
    : prefs.mode === 'stacked100' ? { stacked100: true, butterfly: false }
    : prefs.mode === 'clustered' ? { stacked: false, stacked100: false, butterfly: false }
    : prefs.mode === 'butterfly' ? { butterfly: true, stacked: false, stacked100: false }
    : prefs.mode === 'profile' ? { profile: true, stacked: false, stacked100: false, butterfly: false } : {}
  const effective = {
    ...spec,
    ...modeSpec,
    ...(prefs.sort === 'desc' || prefs.sort === 'asc' ? { sort: prefs.sort } : {}),
    ...(prefs.labels ? { labels: prefs.labels } : {}),
    ...(prefs.axis != null ? { axis: prefs.axis } : {}),
    ...(prefs.grid ? { grid: prefs.grid } : {}),
    ...(prefs.legend != null ? { legend: prefs.legend } : {}),
    rowHeight: rowH,
    ...(prefs.scale && Object.keys(prefs.scale).length ? { scale: prefs.scale } : {}),
    series: (spec.series ?? []).map(s => ({ ...s, ...(prefs.seriesColors?.[s.id] ? { color: prefs.seriesColors[s.id] } : {}), ...(prefs.seriesPatterns?.[s.id] !== undefined ? { pattern: prefs.seriesPatterns[s.id] } : {}) })),
    annotations: [
      ...(spec.annotations ?? []),
      ...(hasVl ? [{ type: 'valueLine', value: vl, label: prefs.valueLineLabel || null, tone: 'gray-700', dash: 'dash', side: 'right', user: true }] : []),
    ],
  }
  // Reverse sheet order; the color of a single bar.
  const ordered = prefs.sort === 'reverse' ? [...rows].reverse() : rows
  const effectiveRows = ordered.map(r => (prefs.rowColors?.[r.key] ? { ...r, color: prefs.rowColors[r.key] } : r))

  const api = {
    prefs, setPref, reset, update, latest,
    palette: [...COLOR_TOKENS, ...NEUTRAL_TOKENS],
    series: (spec.series ?? []).map(s => ({ value: s.id, label: s.label, color: prefs.seriesColors?.[s.id] ?? s.color })),
    rows: rows.map(r => ({ key: r.key, label: r.label })),
    multi: (spec.series ?? []).length > 1,
    stacked: !!spec.stacked,
    mode: prefs.mode ?? (spec.profile ? 'profile' : spec.butterfly ? 'butterfly' : spec.stacked100 ? 'stacked100' : spec.stacked ? 'stacked' : 'clustered'),
    setSeriesColor: (sid, c) => update('seriesColors', cur => ({ ...(cur ?? {}), [sid]: c })),
    // Series pattern; null = solid.
    setSeriesPattern: (sid, p) => update('seriesPatterns', cur => ({ ...(cur ?? {}), [sid]: p })),
    patternOf: sid => prefs.seriesPatterns?.[sid] ?? (spec.series ?? []).find(s => s.id === sid)?.pattern ?? null,
    setRowColor: (key, c) => update('rowColors', cur => ({ ...(cur ?? {}), [key]: c })),
    setScale: (k, v) => update('scale', cur => { const n = { ...(cur ?? {}) }; if (v == null) delete n[k]; else n[k] = v; return n }),
    autoScale: () => setPref('scale', {}),
    manualScale: ['min', 'max', 'step'].some(k => Number.isFinite(prefs.scale?.[k])),
    setNum: (k, v) => update('num', cur => { const n = { ...(cur ?? {}) }; if (v == null || v === '') delete n[k]; else n[k] = v; return n }),
    snapshot: () => structuredClone(latest()),
    restore: snap => { for (const [k, v] of Object.entries(snap ?? {})) setPref(k, v) },
    rowHeight: rowH,
    valueLineOn: hasVl,
    legendShown: (prefs.legend ?? spec.legend) !== false,
    // Mean of row totals: where a new value line is placed first.
    meanOfRows: () => {
      const t = rows.map(r => (r.range ? r.range[1] : Object.values(r.values ?? {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0))).filter(Number.isFinite)
      return t.length ? Number((t.reduce((a, v) => a + v, 0) / t.length).toPrecision(3)) : 0
    },
  }
  return [effective, effectiveRows, api]
}
