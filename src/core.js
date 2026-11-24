// ─── epure-charts/core · the pure engine ─────────────────────────────────────
// Specs, scenes, number formats, the data sheet model and its formulas: no React,
// no DOM, no CSS. Import it from Node (tests, servers, build scripts) as
// `epure-charts/core`; the main entry re-exports all of it.

export * from './spec.js'
export { withDefaults, defaultsFor } from './defaults.js'
export { autoDecimals } from './decimals.js'
export { buildScene, formatX, defaultFormat, estimateWidth, yearsBetween, ROLE_TOKEN, FORECAST_TOKEN, DASH_ARRAY } from './scene.js'
export { buildWaterfallScene, bridgeLevels, wrapLabel, axisLabels, TONE_TOKEN } from './waterfallScene.js'
export { buildBarhScene } from './barhScene.js'
export { buildPieScene, pieSlices } from './pieScene.js'
export { buildScatterScene } from './scatterScene.js'
export { buildMekkoScene, MEKKO_OTHER, mekkoOtherFromY } from './mekkoScene.js'
export { buildTableScene, checkOf, harveyOf, iconOf, inferType, CELL_TYPES } from './tableScene.js'
export { buildGanttScene, formatDate, isoWeek, markerPath, barPath, ganttTiers, insertRow, duplicateRow, deleteRow, moveRow, indentRow, patchRow, patchItem, addItem, removeItem, addUnits, snapDate } from './ganttScene.js'
export { applyBridgeEdits, canHide } from './bridgeEdits.js'
export { readingDefaults, applyReading, parseNumber, SCHEMES, layerPrefs, prunePrefs } from './reading.js'
export { styleNumber, makeFormatter, SEPARATORS, separatorOf } from './numberStyle.js'
export * from './sheetModel.js'
export * from './formula.js'
export { colorName } from './colorNames.js'
export { resolveCollisions } from './labelLayout.js'

// Theme, language, accent, figure metadata
export { tok, fs, fsNote, SEMANTIC_TOKENS, baseToken } from './customStyle.js'
export { LIGHT_TOKENS, DARK_TOKENS, TYPE_TOKENS, resolveVars } from './tokens.js'
export { setDefaultLocale, getDefaultLocale, localeOf, t, addWords, hasWord, localizeNumber, localizedFormat, declarativeFormat, asFormatter, NBSP, NNBSP } from './locale.js'
export { accentColor, accentInk, singleAccent, emphasisOf } from './accent.js'
export { sceneMeta, describe, FIGURES } from './figureMeta.js'

// New forms (static) and small multiples
export { buildSlopeScene } from './slopeScene.js'
export { buildFunnelScene } from './funnelScene.js'
export { smallMultiples, sharedDomain } from './smallMultiples.js'
export { ganttLang } from './ganttScene.js'
