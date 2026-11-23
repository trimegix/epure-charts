// ─── epure-charts · default decimals ─────────────────────────────────────────
// How many decimals a figure prints when neither the spec (numberFormat.decimals,
// decimals) nor the reading settings set them: the same rule for every figure, static
// or live, so a step of 0.6 never reads '1'. Pure: no React, no DOM.

/**
 * Decimals (0 to `max`) that write every figure with at least two significant digits,
 * unless the figure is exact with fewer (6 stays '6', not '6.0'):
 * 0.6 → 1, 7.4 → 1, 22 → 0, 117 → 0, 2.1 → 1, 0.123 → 2. One count for all the
 * figures given (a chart prints its figures alike: 7.4 next to 8.0). Figures under 1 % of
 * the largest are ignored: a rounding residue does not set the chart's precision.
 * @param {Iterable<number>} values the figures as printed (a percentage as 12.5, not 0.125)
 * @param {number} [max] the cap (2)
 */
export function autoDecimals(values, max = 2) {
  const vals = [...(values ?? [])].map(v => Math.abs(Number(v))).filter(v => Number.isFinite(v) && v > 0)
  if (!vals.length) return 0
  const top = Math.max(...vals)
  let d = 0
  for (const v of vals) {
    if (v < top * 0.01) continue
    // Digits after the point for two significant digits (7.4 → 1, 0.6 → 1, 0.123 → 2).
    const need = Math.max(0, 1 - Math.floor(Math.log10(v)))
    // Exact with fewer: the fewest that write it as it is (6 → 0, 0.5 → 1).
    let exact = need
    for (let k = 0; k < need; k++) if (Math.abs(Number(v.toFixed(k)) - v) < 1e-9 * Math.max(1, v)) { exact = k; break }
    d = Math.max(d, exact)
  }
  return Math.min(max, d)
}

/** autoDecimals per unit: { M: 1, pct: 0 } (percentages counted in points, ×100). */
export function autoDecimalsByUnit(series) {
  const by = new Map()
  for (const s of series ?? []) {
    const k = s?.unit ?? ''
    const scale = k === 'pct' ? 100 : 1
    if (!by.has(k)) by.set(k, [])
    for (const p of s?.points ?? []) if (Number.isFinite(p?.y)) by.get(k).push(p.y * scale)
  }
  return Object.fromEntries([...by].map(([k, vs]) => [k, autoDecimals(vs)]))
}
