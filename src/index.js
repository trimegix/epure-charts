// ─── epure-charts · public API ───────────────────────────────────────────────
// A React chart engine: select an object to get its format bar, right-click for
// its action menu, drag handles to adjust it directly.
// See README.md.

// Host application wiring
export { default as ChartsProvider } from './ChartsProvider.jsx'
export { useCharts } from './useCharts.js'
export { default as ChartHeader } from './ChartHeader.jsx'

// Views
export { default as ChartView } from './ChartView.jsx'
export { default as WaterfallView } from './WaterfallView.jsx'
export { default as WaterfallChart } from './WaterfallChart.jsx'
export { default as BarhView } from './BarhView.jsx'
export { default as DataSheet } from './DataSheet.jsx'
export { default as PieView } from './PieView.jsx'
export { default as ScatterView } from './ScatterView.jsx'
export { default as MekkoView } from './MekkoView.jsx'
export { default as GanttView } from './GanttView.jsx'
export { default as FormatBar } from './FormatBar.jsx'
export { default as TableView } from './TableView.jsx'
export { HarveyBall, CheckMark } from './HarveyBall.jsx'
export { default as SmallMultiplesView } from './SmallMultiplesView.jsx'

// Figures: drawing only, no hooks (also in `epure-charts/static`)
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
export { sceneToSVGString } from './svgString.js'

// Formatting UI (format bars, menus, building blocks)
export { ChartWheel, ChartWheelButton, Seg, Check, Line, Swatches, Field, ActionMenu, NumberFormatFields } from './ChartWheel.jsx'
export { BridgeBar, BridgeBarButton } from './BridgeBar.jsx'
export { BarhBar, BarhBarButton } from './BarhBar.jsx'
export { ChartMenu } from './chartMenu.jsx'

// Reading preferences (per browser)
export { useChartPrefs, check, configurePrefs, snapshotPrefs } from './chartPrefs.js'
export { useReadingPrefs, paletteFor } from './useReadingPrefs.js'
export { useWaterfallPrefs } from './useWaterfallPrefs.js'
export { useBarhPrefs } from './useBarhPrefs.js'
export { useMenuSlot } from './useMenuSlot.js'
export { useViewPrefs } from './useViewPrefs.js'
export { useFormatPick } from './useFormatPick.js'

// Pure core (no React, no DOM): also published alone as `epure-charts/core`
export * from './core.js'

// Undo across every chart of the page
export { undoLast, redoLast, canUndo } from './chartPrefs.js'
