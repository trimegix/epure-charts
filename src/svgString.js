// ─── epure-charts · a scene as an SVG string ────────────────────────────────
// sceneToSVGString(scene, { tokens }) → a standalone SVG: every var(--…) resolved
// (against `tokens`, then the default light theme), so it reads the same in a file,
// an e-mail or a slide. The figure is picked from scene.meta.figure (set by every
// build*Scene). Runs in Node and in the browser.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveVars } from './tokens.js'
import ChartFigure from './ChartFigure.jsx'
import WaterfallFigure from './WaterfallFigure.jsx'
import BarhFigure from './BarhFigure.jsx'
import PieFigure from './PieFigure.jsx'
import ScatterFigure from './ScatterFigure.jsx'
import MekkoFigure from './MekkoFigure.jsx'
import GanttFigure from './GanttFigure.jsx'
import TableFigure from './TableFigure.jsx'
import SlopeFigure from './SlopeFigure.jsx'
import FunnelFigure from './FunnelFigure.jsx'

export const FIGURE_OF = Object.freeze({
  chart: ChartFigure, waterfall: WaterfallFigure, barh: BarhFigure, pie: PieFigure, scatter: ScatterFigure,
  mekko: MekkoFigure, gantt: GanttFigure, table: TableFigure, slope: SlopeFigure, funnel: FunnelFigure,
})

/**
 * @param {object} scene a scene from any build*Scene
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.tokens] token values ('chart-pos': '#0a7', '--font': 'Inter'), over the light theme
 * @param {string} [opts.figure] the figure kind, when the scene carries no meta
 * @param {boolean} [opts.responsive] width="100%" instead of the scene's px width
 * @returns {string} '<svg …>…</svg>' ('' for an empty scene)
 */
export function sceneToSVGString(scene, opts = {}) {
  const kind = opts.figure ?? scene?.meta?.figure
  const Figure = FIGURE_OF[kind]
  if (!Figure) throw new Error(`sceneToSVGString: unknown figure '${kind}' (scene.meta.figure)`)
  const html = renderToStaticMarkup(createElement(Figure, { scene, responsive: !!opts.responsive }))
  return resolveVars(html, opts.tokens)
}
