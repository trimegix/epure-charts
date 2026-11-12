// ─── epure-charts · default styles ───────────────────────────────────────────
// defaultsFor(resolved[]) → { bars, series: [{ mark, axis, style, labels }] }
// in the order of the received series. Whatever the spec leaves out comes from here:
//   actual → bars · plan → solid line · investment case → dashes · budget → dots
//   a second unit goes on the right axis
//   a ratio never goes into stacked bars (and stays a line next to an amount)
// Pure, no data, no DOM.

const BY_ROLE = {
  actual: { mark: 'bar',  dash: 'solid' },
  plan:   { mark: 'line', dash: 'solid' },
  ic:     { mark: 'line', dash: 'dash' },
  budget: { mark: 'line', dash: 'dot' },
}

/** Default marks, axes and styles for the resolved series, in order. */
export function defaultsFor(resolved = []) {
  const leftUnit = resolved.find(r => r?.unit)?.unit ?? null
  const hasAmountBar = resolved.some(r => (r?.role ?? 'actual') === 'actual' && r?.nature !== 'ratio')
  const seen = {}
  const series = resolved.map(r => {
    const role = r?.role ?? 'actual'
    // The first series of a role takes the role color, the next ones the categorical palette.
    const k = (seen[role] = (seen[role] ?? -1) + 1)
    const base = BY_ROLE[role] ?? BY_ROLE.actual
    let mark = base.mark
    // A ratio bar next to an amount bar would read as an amount.
    if (mark === 'bar' && r?.nature === 'ratio' && hasAmountBar) mark = 'line'
    return {
      mark,
      axis: r?.unit && leftUnit && r.unit !== leftUnit ? 'right' : 'left',
      style: { color: k === 0 ? role : `cat-${(k % 8) + 1}`, dash: base.dash, marker: false },
      labels: 'none',
    }
  })
  // Several actual bars: side by side. Stacking is an explicit choice of the
  // spec, never a default (it adds values up).
  return { bars: 'clustered', series }
}

/**
 * Completes a spec: every field missing from a series takes its default. A ratio
 * bar inside a stack falls back to a line (validation reports it).
 */
export function withDefaults(spec, resolved) {
  const d = defaultsFor(resolved)
  const bars = spec.bars ?? d.bars
  const stacking = bars === 'stacked' || bars === 'stacked100'
  return {
    ...spec,
    bars,
    series: (spec.series ?? []).map((s, i) => {
      const def = d.series[i] ?? d.series[0]
      let mark = s.mark ?? def.mark
      if (stacking && mark === 'bar' && resolved[i]?.nature === 'ratio') mark = 'line'
      return {
        ...s,
        mark,
        axis: s.axis ?? def.axis,
        labels: s.labels ?? def.labels,
        style: { ...def.style, ...(s.style ?? {}) },
      }
    }),
  }
}
