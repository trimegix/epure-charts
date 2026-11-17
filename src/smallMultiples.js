// ─── epure-charts · small multiples on a common scale ───────────────────────
// Pure helpers (no React, no hooks, no shared store): a grid of panels drawn by the same scene
// builder, every panel on the same value scale, so the panels compare at a glance.
//
//   sharedDomain(items, accessor, { zero?, nice? }) → [lo, hi] | null
//     the extent of every number accessor(item) returns (a number, an array, nested arrays).
//
//   smallMultiples(build, panels, { width, height, columns, gap, same, scale }) →
//     { width, height, columns, rows, domains, cells: [{ key, x, y, w, h, scene }] }
//   · build(spec, data, opts): a scene builder (buildScene, buildBarhScene, buildSlopeScene…);
//   · panels: [{ key?, spec, data, opts? }];
//   · width: the grid's width; height: the grid's height (default: rows × 0.6 × cell width);
//     columns (default: ceil(√n)), gap (px, default 16);
//   · same: 'y' (default) | 'x' | 'both' | 'none': the axes put on a common scale;
//   · scale: how a scene's domain is read and forced. Detected from the first natural scene
//     (cartesian, horizontal bars, slope), or named ('cartesian' | 'barh' | 'slope'), or given
//     as { domains(scene, panel, axes) → { [axisKey]: [lo, hi] }, force(spec, axisKey, [lo, hi]) → spec,
//     nice?: tick count to round the union to }.
//
// How the scale is forced, per scene (read only, the builders are not changed):
//   · cartesian (buildScene): spec.format.yAxis.left / .right { min, max } (a manual scale: no
//     rounding, the bounds read as ticks); the natural domain is read from scene.axes.<side>.domain,
//     each side on its own common scale. 'x' applies to a numeric or date X axis only
//     (spec.format.xAxis { min, max }, which can only widen the range; category axes are left alone).
//   · horizontal bars (buildBarhScene): spec.scale { min, max } (a manual scale, clamped). The
//     scene does not expose its domain, so it is computed from the rows (zero included, stacks
//     summed by sign, ranges, value lines) and rounded like the scene's own axis. Its value axis is
//     horizontal: 'x' and 'y' both name it.
//   · slope (buildSlopeScene): spec.scale { min, max }, read from scene.domain.
// Two passes: each panel is built once at its natural scale, the union is taken per axis, then each
// panel is built again with the common scale forced.
import { scaleLinear } from 'd3-scale'

const flat = v => (Array.isArray(v) ? v.flatMap(flat) : [v])

/** The common extent [lo, hi] of the numbers accessor(item) returns (null when there are none). */
export function sharedDomain(items = [], accessor = v => v, { zero = false, nice = 0 } = {}) {
  let lo = Infinity, hi = -Infinity
  for (const it of items ?? []) {
    for (const v of flat(accessor(it))) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  }
  if (!Number.isFinite(lo)) return null
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  if (lo === hi) return [lo, hi]
  return nice > 0 ? scaleLinear().domain([lo, hi]).nice(nice).domain() : [lo, hi]
}

// ── Scale adapters ────────────────────────────────────────────────────────────
const CARTESIAN = {
  domains(scene, panel, axes) {
    const out = {}
    if (axes.y) for (const side of ['left', 'right']) { const d = scene?.axes?.[side]?.domain; if (d) out[`y:${side}`] = d }
    if (axes.x && scene?.axes?.x?.drawn) out.x = scene.axes.x.drawn
    return out
  },
  force(spec, key, [lo, hi]) {
    const F = spec?.format ?? {}
    if (key === 'x') return { ...spec, format: { ...F, xAxis: { ...F.xAxis, min: lo, max: hi } } }
    const side = key.slice(2)
    return { ...spec, format: { ...F, yAxis: { ...F.yAxis, [side]: { ...F.yAxis?.[side], min: lo, max: hi } } } }
  },
}

/** The natural value extent of horizontal bars, as buildBarhScene computes it. */
function barhValues(spec, rows = []) {
  const series = (spec?.series ?? [{ id: 'value' }]).filter(s => spec?.profile || (spec?.series ?? []).length < 2 || s.mark !== 'line')
  const lines = (spec?.series ?? []).length > 1 && !spec?.profile ? spec.series.filter(s => s.mark === 'line') : []
  const live = rows.filter(r => r && (r.range || Object.values(r.values ?? {}).some(Number.isFinite)))
  const vals = []
  if (!live.every(r => r.range) && !spec?.profile) vals.push(0)
  for (const r of live) {
    if (r.range) { vals.push(r.range[0], r.range[1]); continue }
    if (spec?.stacked || spec?.stacked100) {
      let pos = 0, neg = 0
      for (const s of series) { const v = r.values?.[s.id]; if (Number.isFinite(v)) { if (v >= 0) pos += v; else neg += v } }
      vals.push(pos, neg)
    } else for (const s of series) vals.push(r.values?.[s.id])
    for (const s of lines) vals.push(r.values?.[s.id])
  }
  for (const a of spec?.annotations ?? []) if (a?.type === 'valueLine') vals.push(a.value)
  return vals
}
const BARH = {
  domains(scene, panel, axes) {
    if (!axes.x && !axes.y) return {}
    // 100 % bars share their scale by construction (each row sums to 1).
    if (panel.spec?.stacked100 || panel.spec?.butterfly) return {}
    const d = sharedDomain([panel.data], rows => barhValues(panel.spec, rows))
    return d ? { value: d } : {}
  },
  force: (spec, key, [lo, hi]) => ({ ...spec, scale: { ...spec?.scale, min: lo, max: hi } }),
  // The union is rounded like the scene's own axis (x.nice(5)).
  nice: 5,
}
const SLOPE = {
  domains: (scene, panel, axes) => (axes.y && scene?.domain ? { value: scene.domain } : {}),
  force: (spec, key, [lo, hi]) => ({ ...spec, scale: { ...spec?.scale, min: lo, max: hi } }),
}
const ADAPTERS = { cartesian: CARTESIAN, barh: BARH, slope: SLOPE }

function detect(scene) {
  const fig = scene?.meta?.figure
  if (ADAPTERS[fig]) return ADAPTERS[fig]
  if (fig === 'chart' || scene?.axes?.left || scene?.axes?.right) return CARTESIAN
  if (Array.isArray(scene?.rows) && Array.isArray(scene?.bars)) return BARH
  if (Array.isArray(scene?.lines) && scene?.domain) return SLOPE
  return null
}

/** A grid of panels built by `build`, on a common scale (see the head of the file). */
export function smallMultiples(build, panels = [], { width = 960, height, columns, gap = 16, same = 'y', scale } = {}) {
  const n = panels.length
  const cols = Math.max(1, Math.min(n || 1, Math.round(columns ?? Math.ceil(Math.sqrt(n || 1)))))
  const rows = Math.max(1, Math.ceil(n / cols))
  const w = Math.max(0, (width - gap * (cols - 1)) / cols)
  const h = Number.isFinite(height) ? Math.max(0, (height - gap * (rows - 1)) / rows) : Math.round(w * 0.6)
  const totalH = Number.isFinite(height) ? height : rows * h + gap * (rows - 1)
  const out = { width, height: totalH, columns: cols, rows, domains: {}, cells: [] }
  if (!n) return out

  const axes = { y: same === 'y' || same === 'both', x: same === 'x' || same === 'both' }
  const optsOf = p => ({ ...p.opts, width: w, height: h })
  const natural = panels.map(p => build(p.spec, p.data, optsOf(p)))
  const adapter = typeof scale === 'object' && scale ? scale : ADAPTERS[scale] ?? detect(natural.find(Boolean))

  // The union of the natural domains, per axis key.
  if (adapter && (axes.x || axes.y)) {
    const per = natural.map((sc, i) => (sc && !sc.empty ? adapter.domains(sc, panels[i], axes) ?? {} : {}))
    const keys = [...new Set(per.flatMap(d => Object.keys(d)))]
    for (const k of keys) {
      const d = sharedDomain(per, d2 => d2[k] ?? null, { nice: adapter.nice ?? 0 })
      if (d && d[0] < d[1]) out.domains[k] = d
    }
  }
  const forced = Object.keys(out.domains).length > 0
  panels.forEach((p, i) => {
    let spec = p.spec
    if (forced) for (const [k, d] of Object.entries(out.domains)) spec = adapter.force(spec, k, d)
    const scene = forced ? build(spec, p.data, optsOf(p)) : natural[i]
    out.cells.push({ key: p.key ?? String(i), x: (i % cols) * (w + gap), y: Math.floor(i / cols) * (h + gap), w, h, scene })
  })
  return out
}
