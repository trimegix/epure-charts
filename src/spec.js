// Chart engine, layer 1: the chart format.
// A spec says WHAT to show, never HOW to draw it (scene.js) nor WHERE to read the
// data (the host's series resolver). It is JSON-serializable, so it can be stored
// and shared as is.
//
// validateSpec(spec) returns a list of errors (empty array = valid) and never
// throws: a malformed chart renders as such, it does not break the page.
// Pure: no data, React or DOM import (tested under node --test).

export const SPEC_VERSION = 1

// A free user color (customStyle.js): '#rrggbb'.
const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)

export const KINDS = ['cartesian', 'waterfall', 'scatter']
export const GRAINS = ['month', 'quarter', 'year', 'category']
export const BAR_MODES = ['clustered', 'stacked', 'stacked100']
export const MARKS = ['bar', 'line', 'area']
export const AXES = ['left', 'right']
export const DASHES = ['solid', 'dash', 'dot']
// 'some': only the chosen categories (format.labelKeys[series]).
export const LABEL_MODES = ['none', 'last', 'all', 'some']
export const MARKER_SHAPES = ['none', 'circle', 'square', 'diamond', 'triangle']
// Role names that can also be used as a series color (resolved by scene.js ROLE_TOKEN).
export const ROLES = ['actual', 'plan', 'ic', 'budget']
export const COLOR_TOKENS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
// Neutral and semantic tokens. Accepted in any spec; the editor palette may still
// choose to offer only the categorical tokens.
export const NEUTRAL_TOKENS = ['black', 'gray-800', 'gray-700', 'gray-600', 'gray-500', 'gray-400', 'gray-300', 'gold', 'blue-chart', 'green', 'red', 'amber', 'yellow-chart']
// Semantic tokens (customStyle.js SEMANTIC_TOKENS): themable by the host as --chart-*.
export const SEMANTIC_COLOR_TOKENS = ['chart-pos', 'chart-neg', 'chart-accent', 'chart-hypothesis', 'chart-hypothesis-text', 'chart-anchor', 'chart-upside', 'chart-gap', 'chart-actual', 'chart-plan', 'chart-ic', 'chart-budget', 'chart-forecast', 'chart-neutral', 'chart-neutral-ink']
// Languages of the engine's own words and number punctuation (locale.js).
export const LOCALES = ['en', 'fr']
// 'single': everything neutral but what `emphasis` names (the consulting default).
export const ACCENT_MODES = ['palette', 'single']
export const ANNOTATION_TYPES = ['diff', 'cagr', 'valueLine', 'totals', 'xMarker', 'extremes', 'band', 'callout', 'average']

// 'level': the axis reads amounts; 'gap': zero is the starting point, the axis reads signed gaps.
export const WATERFALL_AXES = ['level', 'gap']

/**
 * Default mapping from a series source (`ref.source`, a free string) to its
 * visual role. Override or extend it with `opts.sourceRoles` in validateSpec,
 * or by passing a table to roleOfRef.
 */
export const DEFAULT_SOURCE_ROLES = Object.freeze({
  actual: 'actual',
  plan: 'plan',
  bp: 'plan',
  budget: 'plan',
  forecast: 'forecast',
})

/**
 * Validates a waterfall: `bridge.id` names a bridge in the host's catalog (the
 * engine only requires a non-empty string), plus reading settings: connectors,
 * labels, whiskers, axis mode.
 */
function validateWaterfall(spec, err) {
  if (!isObj(spec.bridge)) err('bridge', 'required object')
  else if (typeof spec.bridge.id !== 'string' || !spec.bridge.id) err('bridge.id', 'a non-empty string')
  if (spec.x != null) err('x', "not allowed on a 'waterfall'")
  if (spec.bars != null) err('bars', "not allowed on a 'waterfall'")
  if (spec.connectors != null && typeof spec.connectors !== 'boolean') err('connectors', 'boolean')
  if (spec.whiskers != null && typeof spec.whiskers !== 'boolean') err('whiskers', 'boolean')
  if (spec.labels != null && !oneOf(['none', 'all'], spec.labels)) err('labels', 'one of none, all')
  if (spec.axis != null && !oneOf(WATERFALL_AXES, spec.axis)) err('axis', `one of ${WATERFALL_AXES.join(', ')}`)
}

/**
 * A bridge spec as the engine reads it: `version` and `kind: 'waterfall'` filled when left out
 * (a bridge has no other kind), as withDataDefaults does for a chart whose series are passed in.
 * A spec that already carries them is returned unchanged.
 */
export function withBridgeDefaults(spec) {
  if (!isObj(spec) || (spec.version != null && spec.kind != null)) return spec
  return { version: SPEC_VERSION, kind: 'waterfall', ...spec }
}

/**
 * Validates the spec of a bridge: the one validation of the live (WaterfallView,
 * WaterfallChart) and the static (buildWaterfallScene → scene.errors) entries. `version` and
 * `kind` may be left out (withBridgeDefaults); with the bridge's data passed in (`bridge`), the
 * spec needs no catalog reference (spec.bridge) nor id. Messages speak of a bridge, never of an
 * x axis or series.
 */
export function validateBridgeSpec(spec, { bridge = null } = {}) {
  if (!isObj(spec)) return ['spec: not an object']
  if (spec.kind != null && spec.kind !== 'waterfall') return [`kind: a bridge is kind 'waterfall', not '${spec.kind}'`]
  const full = withBridgeDefaults(spec)
  const errors = validateSpec(bridge != null ? { id: 'bridge', ...full, bridge: full.bridge ?? { id: 'data' } } : full)
  return bridge == null ? errors.map(e => (e.startsWith('bridge:') ? "bridge: pass the bridge's data (bridge prop), or spec.bridge.id for the host's catalog" : e)) : errors
}

/**
 * Returns the visual role of a series reference, looked up from its source.
 * @param {{ source?: string }} ref
 * @param {Record<string, string>} [sourceRoles] source → role table (defaults to DEFAULT_SOURCE_ROLES)
 * @returns {string|null} the role, or null for an unknown source
 */
export function roleOfRef(ref, sourceRoles = DEFAULT_SOURCE_ROLES) {
  const src = ref?.source
  if (typeof src !== 'string' || !Object.prototype.hasOwnProperty.call(sourceRoles, src)) return null
  return sourceRoles[src] ?? null
}

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v)
const isStr = v => typeof v === 'string' && v.length > 0
const oneOf = (list, v) => list.includes(v)
const tokenOk = t => oneOf(COLOR_TOKENS, t) || oneOf(NEUTRAL_TOKENS, t) || oneOf(SEMANTIC_COLOR_TOKENS, t) || oneOf(ROLES, t) || isHex(t)

// The base of a figure: sample (n = 42 deals), period, scope (perimeter).
export const BASE_KEYS = ['sample', 'period', 'scope']

/** The provenance of a spec, as the page or a deck will print it: { source, note, base } (null fields left out). */
export function provenanceOf(spec) {
  const out = {}
  if (isStr(spec?.source)) out.source = spec.source
  if (isStr(spec?.note)) out.note = spec.note
  if (isObj(spec?.base)) { const b = Object.fromEntries(Object.entries(spec.base).filter(([k, v]) => oneOf(BASE_KEYS, k) && v != null && v !== '')); if (Object.keys(b).length) out.base = b }
  return out
}

// A range bound: 'YYYY', 'YYYY-Qn' or 'YYYY-MM' (time grain).
const BOUND_RE = /^\d{4}(-Q[1-4]|-\d{2})?$/

/**
 * Validates a spec. Never throws.
 * @param {object} spec
 * @param {object} [opts]
 * @param {Array} [opts.resolved] resolved series, in spec.series order: enables the
 *   checks that depend on a series' nature (a ratio is never stacked). Without it,
 *   only shape checks run.
 * @param {Record<string, string>} [opts.sourceRoles] extra or overriding source → role
 *   entries, merged over DEFAULT_SOURCE_ROLES.
 * @returns {string[]} errors as 'path: message'; empty when valid
 */
/**
 * A spec for a chart whose series are passed in (ChartView `resolved`): fills what only a
 * catalog needs (version, kind, a `ref` per series, here the series itself). A spec that
 * already carries them is returned unchanged.
 */
export function withDataDefaults(spec) {
  if (!spec || typeof spec !== 'object') return spec
  const series = Array.isArray(spec.series) ? spec.series : []
  const needs = spec.version == null || spec.kind == null || series.some(s => s && typeof s === 'object' && s.ref == null)
  if (!needs) return spec
  return {
    version: SPEC_VERSION, kind: 'cartesian', ...spec,
    series: series.map(s => (s && typeof s === 'object' && s.ref == null ? { ...s, ref: { metric: String(s.id), source: 'data' } } : s)),
  }
}

/**
 * Validates the spec of a chart whose series are passed in (`resolved`), as ChartView and
 * buildScene read it: the one validation of the live and the static entries (scene.errors).
 */
export function validateChartSpec(spec, { resolved = null, ...opts } = {}) {
  return validateSpec(resolved ? withDataDefaults(spec) : spec, { ...opts, ...(resolved ? { resolved } : {}) })
}

export function validateSpec(spec, opts = {}) {
  const errors = []
  const err = (path, msg) => errors.push(`${path}: ${msg}`)
  const sourceRoles = opts.sourceRoles ? { ...DEFAULT_SOURCE_ROLES, ...opts.sourceRoles } : DEFAULT_SOURCE_ROLES

  if (!isObj(spec)) return ['spec: not an object']

  if (!isStr(spec.id)) err('id', 'required string')
  if (spec.version !== SPEC_VERSION) err('version', `must be ${SPEC_VERSION}`)
  if (spec.title != null && typeof spec.title !== 'string') err('title', 'must be a string')
  if (spec.subtitle != null && spec.subtitle !== false && typeof spec.subtitle !== 'string') err('subtitle', 'must be a string or false')

  // Host metadata: optional, free values, only their type is checked.
  if (spec.scope != null && typeof spec.scope !== 'string') err('scope', 'must be a string')
  if (spec.owner != null && typeof spec.owner !== 'string') err('owner', 'must be a string')
  if (spec.subject != null && !isObj(spec.subject)) err('subject', 'must be an object')

  // Provenance: travels with the data, never drawn by the figure (the page writes the
  // title and the footer from it, a deck exporter too).
  if (spec.source != null && typeof spec.source !== 'string') err('source', 'must be a string')
  if (spec.note != null && typeof spec.note !== 'string') err('note', 'must be a string')
  if (spec.base != null) {
    if (!isObj(spec.base)) err('base', 'an object { sample?, period?, scope? }')
    else for (const k of Object.keys(spec.base)) {
      if (!oneOf(BASE_KEYS, k)) err(`base.${k}`, `unknown (one of ${BASE_KEYS.join(', ')})`)
      else if (spec.base[k] != null && typeof spec.base[k] !== 'string' && !Number.isFinite(spec.base[k])) err(`base.${k}`, 'a string or a number')
    }
  }
  if (spec.description != null && typeof spec.description !== 'string') err('description', 'must be a string')

  // Reading: language, single accent.
  if (spec.locale != null && !oneOf(LOCALES, spec.locale)) err('locale', `one of ${LOCALES.join(', ')}`)
  if (spec.accent != null && !oneOf(ACCENT_MODES, spec.accent)) err('accent', `one of ${ACCENT_MODES.join(', ')}`)
  if (spec.emphasis != null && !Array.isArray(spec.emphasis)) err('emphasis', 'an array of keys (series, steps, rows…)')

  if (!oneOf(KINDS, spec.kind)) err('kind', `one of ${KINDS.join(', ')}`)

  const waterfall = spec.kind === 'waterfall'
  if (waterfall) validateWaterfall(spec, err)

  if (waterfall) { /* a bridge has no time axis and no series: its catalog carries them */ }
  else if (!isObj(spec.x)) err('x', 'required object')
  else {
    if (!oneOf(GRAINS, spec.x.grain)) err('x.grain', `one of ${GRAINS.join(', ')}`)
    const r = spec.x.range
    if (spec.x.keys != null && (spec.x.grain !== 'category' || !Array.isArray(spec.x.keys))) err('x.keys', "an array, on a 'category' axis only")
    if (spec.x.sub != null && (typeof spec.x.sub !== 'object' || Array.isArray(spec.x.sub))) err('x.sub', 'an object { key: text }')
    if (spec.x.hidden != null && !Array.isArray(spec.x.hidden)) err('x.hidden', 'an array of axis keys')
    if (spec.x.sort != null && !oneOf(['desc', 'asc'], spec.x.sort)) err('x.sort', 'desc or asc')
    if (spec.x.grain === 'category') {
      // Category axis: categories come from the points (or x.keys), not from a range.
      if (r != null) err('x.range', "not allowed on a 'category' axis")
    } else if (r !== 'all') {
      if (!isObj(r)) err('x.range', "'all' or { from, to }")
      else {
        if (!BOUND_RE.test(String(r.from ?? ''))) err('x.range.from', "'YYYY', 'YYYY-Qn' or 'YYYY-MM'")
        if (!BOUND_RE.test(String(r.to ?? ''))) err('x.range.to', "'YYYY', 'YYYY-Qn' or 'YYYY-MM'")
        if (BOUND_RE.test(String(r.from)) && BOUND_RE.test(String(r.to)) && String(r.from) > String(r.to)) {
          err('x.range', 'from after to')
        }
      }
    }
  }

  if (spec.bars != null && !oneOf(BAR_MODES, spec.bars)) err('bars', `one of ${BAR_MODES.join(', ')}`)

  const series = Array.isArray(spec.series) ? spec.series : null
  if (waterfall) { if (spec.series != null) err('series', "not allowed on a 'waterfall' (its bridge carries the steps)") }
  else if (!series) err('series', 'required array')
  else {
    if (!series.length) err('series', 'at least one series')
    const ids = new Set()
    series.forEach((s, i) => {
      const p = `series[${i}]`
      if (!isObj(s)) { err(p, 'not an object'); return }
      if (!isStr(s.id)) err(`${p}.id`, 'required string')
      else if (ids.has(s.id)) err(`${p}.id`, `duplicate '${s.id}'`)
      else ids.add(s.id)
      if (!isObj(s.ref)) err(`${p}.ref`, 'required object')
      else {
        if (!isStr(s.ref.metric)) err(`${p}.ref.metric`, 'required string')
        if (!isStr(s.ref.source)) err(`${p}.ref.source`, 'required string')
      }
      if (s.mark != null && !oneOf(MARKS, s.mark)) err(`${p}.mark`, `one of ${MARKS.join(', ')}`)
      if (s.axis != null && !oneOf(AXES, s.axis)) err(`${p}.axis`, `one of ${AXES.join(', ')}`)
      if (s.labels != null && !oneOf(LABEL_MODES, s.labels)) err(`${p}.labels`, `one of ${LABEL_MODES.join(', ')}`)
      if (s.style != null) {
        if (!isObj(s.style)) err(`${p}.style`, 'must be an object')
        else {
          const c = s.style.color
          // A hex '#rrggbb' is accepted wherever a token is.
          if (c != null && !tokenOk(c)) {
            err(`${p}.style.color`, 'a token (cat-1…cat-8, a neutral), a hex #rrggbb or a role (actual, plan, ic, budget)')
          }
          if (s.style.dash != null && !oneOf(DASHES, s.style.dash)) err(`${p}.style.dash`, `one of ${DASHES.join(', ')}`)
          if (s.style.marker != null && typeof s.style.marker !== 'boolean') err(`${p}.style.marker`, 'boolean')
          // 'hollow': dashed outline; 'hatch': hatching in the series color.
          if (s.style.forecast != null && s.style.forecast !== 'hollow' && s.style.forecast !== 'hatch') err(`${p}.style.forecast`, "'hollow' or 'hatch'")
          if (s.style.stroke != null && s.style.stroke !== 'none' && !tokenOk(s.style.stroke)) err(`${p}.style.stroke`, "a token, a hex or 'none'")
          if (s.style.weight != null && !(Number.isFinite(s.style.weight) && s.style.weight >= 0.5 && s.style.weight <= 6)) err(`${p}.style.weight`, 'a number 0.5..6')
          if (s.style.markerShape != null && !oneOf(MARKER_SHAPES, s.style.markerShape)) err(`${p}.style.markerShape`, `one of ${MARKER_SHAPES.join(', ')}`)
          if (s.style.smooth != null && typeof s.style.smooth !== 'boolean') err(`${p}.style.smooth`, 'boolean')
          if (s.style.step != null && s.style.step !== 'lines' && s.style.step !== 'steps') err(`${p}.style.step`, "'lines' or 'steps'")
          if (s.style.points != null) {
            if (!isObj(s.style.points)) err(`${p}.style.points`, 'an object { key: token }')
            else for (const t of Object.values(s.style.points)) if (!tokenOk(t)) err(`${p}.style.points`, `'${t}' is not a token or a hex`)
          }
        }
      }
    })

    // Stacking only makes sense between series of one role (actuals on actuals):
    // stacking actuals on a plan adds up two different things. An unknown source
    // counts as its own role.
    if (spec.bars === 'stacked' || spec.bars === 'stacked100') {
      const barSeries = series.filter(s => isObj(s) && (s.mark ?? 'bar') === 'bar')
      const roles = new Set(barSeries.map(s => roleOfRef(s.ref, sourceRoles) ?? s.ref?.source))
      if (roles.size > 1) err('bars', `'${spec.bars}' needs bar series of one role (got ${[...roles].join(', ')})`)
      const res = opts.resolved
      if (Array.isArray(res)) {
        series.forEach((s, i) => {
          if (isObj(s) && (s.mark ?? 'bar') === 'bar' && res[i]?.nature === 'ratio') {
            err(`series[${i}]`, `a ratio is never stacked ('${spec.bars}')`)
          }
        })
      }
    }
  }

  if (spec.annotations != null) {
    if (!Array.isArray(spec.annotations)) err('annotations', 'must be an array')
    else spec.annotations.forEach((a, i) => {
      if (!isObj(a) || !oneOf(ANNOTATION_TYPES, a.type)) { err(`annotations[${i}].type`, `one of ${ANNOTATION_TYPES.join(', ')}`); return }
      if (a.type === 'cagr') {
        const ids = Array.isArray(spec.series) ? spec.series.map(x => x?.id) : []
        if (waterfall) err(`annotations[${i}]`, "a CAGR belongs on a cartesian chart")
        else if (a.from != null || a.to != null) {
          if (!isObj(a.from) || a.from.key == null || !isObj(a.to) || a.to.key == null) err(`annotations[${i}]`, 'from and to need a key')
          if (a.periods != null && !(a.periods > 0)) err(`annotations[${i}].periods`, 'a positive number of years')
          for (const end of [a.from, a.to]) if (isObj(end) && (end.series ?? a.series) != null && !ids.includes(end.series ?? a.series)) err(`annotations[${i}]`, 'from / to must name a series of the chart')
        } else if (!ids.includes(a.series)) err(`annotations[${i}].series`, 'must name a series of the chart')
      }
      if (a.type === 'valueLine') {
        if (!Number.isFinite(a.value)) err(`annotations[${i}].value`, 'a number')
        if (a.axis != null && !oneOf(AXES, a.axis)) err(`annotations[${i}].axis`, `one of ${AXES.join(', ')}`)
        if (a.label != null && typeof a.label !== 'string') err(`annotations[${i}].label`, 'a string')
      }
      if (a.type === 'valueLine' && a.dash != null && !oneOf(DASHES, a.dash)) err(`annotations[${i}].dash`, `one of ${DASHES.join(', ')}`)
      if (a.type === 'band' && !(Number.isFinite(a.from) && Number.isFinite(a.to))) err(`annotations[${i}]`, 'a band needs numeric from and to')
      if (a.type === 'average' && (!Array.isArray(spec.series) || !spec.series.some(x => x?.id === a.series))) err(`annotations[${i}].series`, 'must name a series of the chart')
      if (a.type === 'callout' && (a.key == null || !Array.isArray(spec.series) || !spec.series.some(x => x?.id === a.series))) err(`annotations[${i}]`, 'a callout needs a key and a series of the chart')
      if (a.type === 'xMarker' && !isStr(a.key)) err(`annotations[${i}].key`, 'required axis key')
      if (a.type === 'extremes' && (!Array.isArray(spec.series) || !spec.series.some(x => x?.id === a.series))) err(`annotations[${i}].series`, 'must name a series of the chart')
      if (a.type === 'totals' && !waterfall && spec.bars !== 'stacked') err(`annotations[${i}]`, "stack totals need bars: 'stacked'")
      if (a.type === 'diff' && waterfall) {
        if (!isStr(a.from)) err(`annotations[${i}].from`, 'required step key')
        if (!isStr(a.to)) err(`annotations[${i}].to`, 'required step key')
        if (isStr(a.from) && a.from === a.to) err(`annotations[${i}]`, 'from and to must differ')
      }
    })
  }

  if (spec.numberFormat != null) {
    if (!isObj(spec.numberFormat)) err('numberFormat', 'must be an object')
    else if (spec.numberFormat.decimals != null
      && !(Number.isInteger(spec.numberFormat.decimals) && spec.numberFormat.decimals >= 0 && spec.numberFormat.decimals <= 4)) {
      err('numberFormat.decimals', 'integer 0..4')
    }
  }

  return errors
}
