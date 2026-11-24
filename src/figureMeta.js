// ─── epure-charts · what a scene says about itself ──────────────────────────
// Every build*Scene stamps its scene with `meta`: which figure draws it, the
// accessible title and description, the language and the provenance. A figure
// (or sceneToSVGString, or a deck exporter) then needs nothing but the scene.
// Pure: no React, no DOM.
import { provenanceOf } from './spec.js'
import { localeOf, t } from './locale.js'

export const FIGURES = ['chart', 'waterfall', 'barh', 'pie', 'scatter', 'mekko', 'gantt', 'table', 'slope', 'funnel']

/** The description read by a screen reader: the spec's own, else its provenance line. */
export function describe(spec) {
  if (typeof spec?.description === 'string' && spec.description) return spec.description
  const p = provenanceOf(spec)
  const base = p.base ? Object.values(p.base).join(', ') : ''
  const L = localeOf(spec)
  // French puts a non-breaking space before the colon (« Source : … »).
  const source = p.source && `${t('Source', L)}${L === 'fr' ? '\u00a0:' : ':'} ${p.source}`
  return [source, base, p.note].filter(Boolean).join('. ') || null
}

/** scene.meta for a figure kind and its spec. */
export function sceneMeta(figure, spec, extra = {}) {
  return {
    figure,
    title: typeof spec?.title === 'string' && spec.title ? spec.title : null,
    desc: describe(spec),
    locale: localeOf(spec),
    provenance: provenanceOf(spec),
    ...extra,
  }
}

/** Stamps a scene (returns it, for chaining): scene.meta = sceneMeta(figure, spec). */
export function stamp(scene, figure, spec, extra) {
  if (scene && typeof scene === 'object') scene.meta = sceneMeta(figure, spec, extra)
  return scene
}
