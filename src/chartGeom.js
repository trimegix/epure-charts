// ─── epure-charts · small drawing helpers of the cartesian chart ─────────────
// Shared by ChartFigure (the drawing) and ChartView (its editing layer, the tooltip).
// Pure: no React, no DOM.
import { colorId } from './customStyle.js'

/** Arrowhead oriented along the segment (xa,ya) → (xb,yb), placed at (xb,yb). */
export function arrowHead(xa, ya, xb, yb, size = 6) {
  const a = Math.atan2(yb - ya, xb - xa)
  const p = (da, r) => `${xb - r * Math.cos(a + da)},${yb - r * Math.sin(a + da)}`
  return `M${xb},${yb} L${p(0.45, size)} L${p(-0.45, size)} Z`
}

// Fill patterns: <PatternDefs> (patterns.jsx) defines one
// <pattern> per pattern × color pair; its id follows `${scope}-pt-${pattern}-${color}`.
export const patternId = (scope, name, color) => `${scope}-pt-${name}-${colorId(color)}`

/**
 * A stable id scope for a figure drawn without one (server rendering, static pages):
 * a hash of what its clip path and patterns depend on. Two figures with the same
 * hash define identical <clipPath> / <pattern> elements, so sharing the id is harmless.
 */
export function sceneScope(scene, clip) {
  const key = JSON.stringify([scene.width, scene.height, clip, scene.meta?.title ?? null, scene.bars?.length ?? 0, scene.lines?.length ?? 0])
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return `chart-${h.toString(36)}`
}
