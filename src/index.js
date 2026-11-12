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

// Formatting UI (format bars, menus, building blocks)
export { ChartWheel, ChartWheelButton, Seg, Check, Line, Swatches, Field, ActionMenu, NumberFormatFields } from './ChartWheel.jsx'
export { BridgeBar, BridgeBarButton } from './BridgeBar.jsx'
export { BarhBar, BarhBarButton } from './BarhBar.jsx'
export { ChartMenu } from './chartMenu.jsx'

// Reading preferences (per browser)
export { useChartPrefs, check } from './chartPrefs.js'
export { useReadingPrefs, paletteFor } from './useReadingPrefs.js'
export { useWaterfallPrefs } from './useWaterfallPrefs.js'
export { useBarhPrefs } from './useBarhPrefs.js'
export { useMenuSlot } from './useMenuSlot.js'
export { useViewPrefs } from './useViewPrefs.js'
export { useFormatPick } from './useFormatPick.js'

// Pure core (no React, tested under node --test)
export * from './spec.js'
export { withDefaults, defaultsFor } from './defaults.js'
export { buildScene, formatX, defaultFormat, estimateWidth, yearsBetween, ROLE_TOKEN, FORECAST_TOKEN, DASH_ARRAY } from './scene.js'
export { buildWaterfallScene, bridgeLevels, wrapLabel, axisLabels, TONE_TOKEN } from './waterfallScene.js'
export { buildBarhScene } from './barhScene.js'
export { buildPieScene, pieSlices } from './pieScene.js'
export { buildScatterScene } from './scatterScene.js'
export { buildMekkoScene, MEKKO_OTHER, mekkoOtherFromY } from './mekkoScene.js'
export { buildTableScene, checkOf, harveyOf, iconOf, inferType, CELL_TYPES } from './tableScene.js'
export { buildGanttScene, formatDate, isoWeek, markerPath, barPath, ganttTiers, insertRow, duplicateRow, deleteRow, moveRow, indentRow, patchRow, patchItem, addItem, removeItem, addUnits, snapDate } from './ganttScene.js'
export { applyBridgeEdits, canHide } from './bridgeEdits.js'
export { readingDefaults, applyReading, parseNumber, SCHEMES } from './reading.js'
export { styleNumber, makeFormatter, SEPARATORS, separatorOf } from './numberStyle.js'
export * from './sheetModel.js'
export * from './formula.js'
export { colorName } from './colorNames.js'
export { undoLast, redoLast, canUndo } from './chartPrefs.js'
