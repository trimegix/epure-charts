// ─── epure-charts · reading settings for a bridge ────────────────────────────
// useWaterfallPrefs(spec, ctx) → [specEffective, sections, api]: the shared
// spec stays fixed; what the user adjusts is a VIEW preference, per browser,
// under the chart's key (epure-chart-opts-<id>).
//
// On a waterfall:
//   · colors per family (anchors, value creation, losses, upside) and the
//     color of a single bar;
//   · subtotal after any step (computed);
//   · levers grouped into "Other levers" (the bridge always closes);
//   · labels, connectors, upside scenario, difference arrow between two levels;
//   · dragged connector (links: a movement restarts from an earlier column);
//   · data table below the axis (table: 'values' | 'running');
//   · the steps table (double-click or menu), Copy to Excel;
//   · reset.
// `api` feeds the click format bar (WaterfallView): same preferences.
import { useMemo, useState } from 'react'
import { useChartPrefs, check } from './chartPrefs'
import { useCharts } from './useCharts'
import { applyBridgeEdits, canHide } from './bridgeEdits'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec'

const TONES = [['anchor', 'Anchors'], ['positive', 'Value created'], ['negative', 'Drag'], ['upside', 'Upside to exit']]

export function useWaterfallPrefs(spec, { currentId, scope, context, bridge: given } = {}) {
  const defaults = {
    connectors: spec.connectors ?? true,
    labels: (spec.labels ?? 'all') === 'all',
    diff: false, diffFrom: 'cost', diffTo: 'current',
    whiskers: spec.whiskers ?? false,
    hiddenSteps: [], subtotals: [], toneColors: {}, stepColors: {},
    direction: spec.direction ?? null, backCalc: !!spec.backCalc, partOrder: null, connectorsOff: [], toBaseline: [], toBaselineTop: [], diffBase: null, labelContent: null, pctBase: null,
    links: {}, table: null, valueLine: null, netLines: spec.netLines ?? [],
    // Value axis: scale { min, max, step }, ticks, gridlines, format.
    yAxis: {}, axisDec: null, axisMag: null, axisNum: {},
  }
  const [prefs, setPref, reset, update] = useChartPrefs(`epure-chart-opts-${spec.id}`, defaults)
  const [sheetOpen, setSheetOpen] = useState(false)
  const charts = useCharts()
  // A bridge passed in by the host takes precedence over host resolution.
  const bridge = useMemo(() => given ?? charts.resolveBridge(spec, { currentId, scope, ...context }), [given, spec, currentId, scope, context, charts])
  const edits = { hiddenSteps: prefs.hiddenSteps ?? [], subtotals: prefs.subtotals ?? [] }
  const edited = applyBridgeEdits(bridge, edits)

  // A difference arrow links two LEVELS (anchors, totals, subtotals), never a movement.
  const levels = edited.steps.filter(s => s.kind !== 'delta')
  const has = k => levels.some(s => s.key === k)
  const from = has(prefs.diffFrom) ? prefs.diffFrom : levels[0]?.key
  const to = has(prefs.diffTo) && prefs.diffTo !== from ? prefs.diffTo : levels.find(s => s.key !== from)?.key
  // In difference mode the start is zero: a % difference makes no sense there.
  const canDiff = levels.length >= 2 && spec.axis !== 'gap'
  const canWhisker = bridge.steps.some(s => s.high != null)
  const palette = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]

  const effective = {
    ...spec,
    connectors: !!prefs.connectors,
    labels: prefs.labels ? 'all' : 'none',
    whiskers: canWhisker && !!prefs.whiskers,
    hiddenSteps: edits.hiddenSteps,
    subtotals: edits.subtotals,
    toneColors: prefs.toneColors ?? {},
    stepColors: prefs.stepColors ?? {},
    // Bridge direction, start computed backwards, segment order within a step,
    // connectors removed one by one, steps forced to the baseline, base of the % difference.
    direction: prefs.direction ?? spec.direction ?? null,
    backCalc: !!prefs.backCalc,
    partOrder: prefs.partOrder ?? null,
    connectorsOff: prefs.connectorsOff ?? [],
    toBaseline: prefs.toBaseline ?? [],
    toBaselineTop: prefs.toBaselineTop ?? [],
    diffBase: prefs.diffBase ?? null,
    labelContent: prefs.labelContent ?? spec.labelContent ?? null,
    pctBase: prefs.pctBase ?? null,
    links: prefs.links ?? {},
    table: prefs.table ?? null,
    valueLine: prefs.valueLine ?? null,
    // Series as net lines: outside the stack, a line at their level.
    netLines: prefs.netLines ?? [],
    yAxis: prefs.yAxis ?? {},
    annotations: [
      ...(spec.annotations ?? []).filter(a => a.type !== 'diff'),
      ...(canDiff && prefs.diff ? [{ type: 'diff', from, to }] : []),
    ],
  }

  const toggleIn = (name, key) => {
    const set = new Set(prefs[name] ?? [])
    if (set.has(key)) set.delete(key); else set.add(key)
    setPref(name, [...set])
  }
  const api = {
    prefs, palette, sheetOpen, setSheetOpen, reset, edited, canHide,
    // A raw setting (custom style: font, size, named scheme).
    setPref,
    setToneColor: (tone, c) => setPref('toneColors', { ...(prefs.toneColors ?? {}), [tone]: c }),
    setStepColor: (key, c) => setPref('stepColors', { ...(prefs.stepColors ?? {}), [key]: c }),
    toggleHidden: key => toggleIn('hiddenSteps', key),
    toggleSubtotal: key => toggleIn('subtotals', key),
    setDiffEnd: (end, key) => { setPref(end === 'from' ? 'diffFrom' : 'diffTo', key); setPref('diff', true) },
    toggle: name => setPref(name, !prefs[name]),
    // A value-axis setting (null: automatic).
    setAxis: (k, v) => update('yAxis', cur => { const next = { ...(cur ?? {}) }; if (v == null) delete next[k]; else next[k] = v; return next }),
    autoScale: () => update('yAxis', cur => { const next = { ...(cur ?? {}) }; delete next.min; delete next.max; delete next.step; return next }),
    setAxisNum: (k, v) => update('axisNum', cur => { const n = { ...(cur ?? {}) }; if (v == null || v === '') delete n[k]; else n[k] = v; return n }),
    toggleConnector: key => toggleIn('connectorsOff', key),
    toggleBaseline: key => toggleIn('toBaseline', key),
    toggleBaselineTop: key => toggleIn('toBaselineTop', key),
    toggleNetLine: key => toggleIn('netLines', key),
    // Link a movement to an earlier column (null: back to the previous bar).
    setLink: (key, src) => {
      const next = { ...(prefs.links ?? {}) }
      if (src == null) delete next[key]; else next[key] = src
      setPref('links', next)
    },
  }

  const tonesShown = TONES.filter(([t]) => bridge.steps.some(s => s.tone === t))
  const options = levels.map(s => ({ value: s.key, label: s.label }))
  const deltas = bridge.steps.filter(canHide)
  // What the settings panel (BridgeWheel) reads to show only what makes sense.
  Object.assign(api, {
    hasParts: bridge.steps.some(s => Array.isArray(s.parts) && s.parts.length),
    setPref, canDiff, canWhisker, diffFrom: from, diffTo: to, levelOptions: options,
    tones: tonesShown,
    // One row per lever: "shown" (if groupable) and "subtotal after".
    levers: bridge.steps.slice(0, -1).filter(s => s.kind === 'delta').map(s => ({
      key: s.key, label: s.label, hideable: deltas.length > 1 && canHide(s),
    })),
  })
  const sections = [
    { label: 'Data', kind: 'checks', items: [{ key: 'sheet', label: 'Data sheet (double-click the chart)', on: sheetOpen, onToggle: () => setSheetOpen(o => !o) }] },
    {
      label: 'Show on chart', kind: 'checks',
      items: [
        check(prefs, setPref, 'labels', 'Value labels'),
        check(prefs, setPref, 'connectors', 'Connector lines'),
        ...(canWhisker ? [check(prefs, setPref, 'whiskers', 'High scenario')] : []),
        ...(canDiff ? [check(prefs, setPref, 'diff', 'Difference arrow')] : []),
      ],
    },
    {
      label: 'Difference between', kind: 'fields',
      items: canDiff && prefs.diff ? [
        { key: 'diffFrom', label: 'From', type: 'select', value: from, options, onChange: v => setPref('diffFrom', v) },
        { key: 'diffTo', label: 'To', type: 'select', value: to, options: options.filter(o => o.value !== from), onChange: v => setPref('diffTo', v) },
      ] : [],
    },
    {
      // Unchecking a lever moves it into "Other levers": the total does not change.
      label: 'Levers shown', kind: 'checks',
      items: deltas.length > 1 ? deltas.map(s => ({ key: `h-${s.key}`, label: s.label, on: !(prefs.hiddenSteps ?? []).includes(s.key), onToggle: () => api.toggleHidden(s.key) })) : [],
    },
    {
      label: 'Subtotal after', kind: 'checks',
      items: bridge.steps.slice(0, -1).filter(s => s.kind === 'delta').map(s => ({ key: `s-${s.key}`, label: s.label, on: (prefs.subtotals ?? []).includes(s.key), onToggle: () => api.toggleSubtotal(s.key) })),
    },
    ...tonesShown.map(([t, l]) => ({
      label: `Color · ${l}`, kind: 'swatches',
      items: palette.map(c => ({ key: `${t}-${c}`, color: c, on: (prefs.toneColors?.[t]) === c, onToggle: () => api.setToneColor(t, c) })),
    })),
    { label: 'Reset', kind: 'checks', items: [{ key: 'reset', label: 'Back to the original chart', on: false, onToggle: reset }] },
  ]
  return [effective, sections, api]
}
