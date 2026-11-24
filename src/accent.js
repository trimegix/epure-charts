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

// A neutral the author picked for a de-emphasized series: kept, so several series can stay
// apart in distinct grays (the accent still goes to the emphasized ones only).
const NEUTRAL_RE = /^(gray-\d+|black|chart-neutral)$/
export const isNeutralToken = c => typeof c === 'string' && NEUTRAL_RE.test(c)

/**
 * A series' color in single-accent mode: the accent when emphasized; otherwise its own style
 * color when that is a gray (distinct grays), else the neutral. Unchanged with the palette.
 */
export function accentSeriesColor(spec, key, color, own) {
  if (!singleAccent(spec)) return color
  if (emphasisOf(spec).has(String(key))) return ACCENT
  return isNeutralToken(own) ? own : NEUTRAL
}

/**
 * Emphasized categories (point keys) in single-accent mode: `emphasis` entries that name no
 * series, drawn in the accent on every series (one column put forward on a one-series chart).
 */
export function accentPoints(spec, seriesIds) {
  if (!singleAccent(spec)) return {}
  const ids = new Set([...seriesIds].map(String))
  return Object.fromEntries([...emphasisOf(spec)].filter(k => !ids.has(k)).map(k => [k, ACCENT]))
}

/** Ink for text drawn inside a mark colored by accentColor (null: keep the scene's own). */
export function accentInk(spec, color) {
  if (!singleAccent(spec)) return null
  return color === NEUTRAL ? 'gray-800' : 'white'
}
