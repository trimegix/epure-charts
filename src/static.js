// ─── epure-charts/static · figures without the editor ──────────────────────
// The pure scenes and the hook-free figures that draw them: render on the server
// (renderToString, static site generators), in a browser without the editing layer,
// or to a standalone SVG string (exports, decks). Imports neither the data sheet
// (jspreadsheet, jsuites), nor the icons, nor the editing CSS.
//
//   import { buildWaterfallScene, WaterfallFigure } from 'epure-charts/static'
//   renderToString(<WaterfallFigure scene={buildWaterfallScene(spec, data, { width: 720, height: 360 })} />)

export * from './core.js'

export { default as FigureSvg } from './FigureSvg.jsx'
export { default as ChartFigure } from './ChartFigure.jsx'
export { default as WaterfallFigure } from './WaterfallFigure.jsx'
export { default as BarhFigure } from './BarhFigure.jsx'
export { default as PieFigure } from './PieFigure.jsx'
export { default as ScatterFigure } from './ScatterFigure.jsx'
export { default as MekkoFigure } from './MekkoFigure.jsx'
export { default as GanttFigure } from './GanttFigure.jsx'
export { default as TableFigure } from './TableFigure.jsx'
export { default as SlopeFigure } from './SlopeFigure.jsx'
export { default as FunnelFigure } from './FunnelFigure.jsx'

export { sceneToSVGString, FIGURE_OF } from './svgString.js'
