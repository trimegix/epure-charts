// ─── epure-charts · single-accent mode ──────────────────────────────────────
// spec.accent === 'single': every mark is neutral but those `spec.emphasis` names, drawn
// in the one accent color (the consulting rule: de-emphasize everything else).
// Pure: no React, no DOM.

export const NEUTRAL = 'chart-neutral'
export const ACCENT = 'chart-accent'

/** True when the spec asks for a single accent. */
export const singleAccent = spec => spec?.accent === 'single'

/** The set of emphasized keys (rows, series, steps, slices…). */
export const emphasisOf = spec => new Set((Array.isArray(spec?.emphasis) ? spec.emphasis : []).map(String))

/**
 * The color of a mark in the chart's accent mode: unchanged with the palette; in
 * single-accent mode, the accent if `key` is emphasized, the neutral otherwise.
 */
export function accentColor(spec, key, color) {
  if (!singleAccent(spec)) return color
  return emphasisOf(spec).has(String(key)) ? ACCENT : NEUTRAL
}

/** Ink for text drawn inside a mark colored by accentColor (null: keep the scene's own). */
export function accentInk(spec, color) {
  if (!singleAccent(spec)) return null
  return color === NEUTRAL ? 'gray-800' : 'white'
}
