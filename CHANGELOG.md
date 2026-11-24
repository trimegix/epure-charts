# Changelog

## Unreleased

- **Small multiples, one settings bar.** `SmallMultiplesView` draws a block of cartesian
  panels with a single settings icon; its settings apply to every panel, a click on a panel
  formats that panel alone. `readOnly` + `applyPrefs` draws both layers.
- `useReadingPrefs(spec, resolved, { base })`: layered view settings. The chart stores only
  what it changes over `base` (`api.own`); `layerPrefs` / `prunePrefs` are exported.
- `ChartView`: `basePrefs` (passed to `useReadingPrefs` as `base`) and `settingsButton={false}`
  (no settings icon; a click on the chart still formats it).
- The settings bar hides its data sheet entries when the api has no `setSheetOpen`.

## 0.3.1

- **CAGR arrows on short year keys.** A category axis written `'22'`, `'FY24'`, `"'23"` or
  `'24E'` now counts its years (`yearOfKey`, exported); before, the arrow was silently
  dropped. Between columns that name no year at all (`'H1'`, `'Wave 2'`), an arrow asked for
  counts one period per column instead of disappearing.
- The data sheet's arrow ends show the same year count ("3 yrs") for these keys.

## 0.3.0

- **Publishable preferences.** `configurePrefs({ seed, local, onChange })` sets where the
  formatting and the data sheet edits live: a published state (`seed`) that wins over the
  browser's copy, `local: false` to leave `localStorage` alone, `onChange(key, prefs)` after
  every change (undo and redo included) for the host to save it. `snapshotPrefs(prefix)`
  returns the current state. Default behavior unchanged (per browser).
- Views: `applyPrefs` with `readOnly` draws the stored settings and sheet edits, still without
  any editing control (`ChartView`, `BarhView`, `TableView`).
- Views: `applyPrefs` on `PieView`, `ScatterView`, `MekkoView`, `GanttView` and
  `WaterfallView` as well.
- **Clean install, no bundler setting.** `epure-charts/styles.css` is now built
  (`dist/styles.css`) and includes the data sheet grid styles (Jspreadsheet CE, jSuites):
  the package no longer imports CSS from JavaScript, so server renderers (Astro, Next.js)
  load it as is. Import `epure-charts/styles.css`, as before; nothing else.
- The data sheet grid loads on its first opening (its own chunk): read-only pages never
  download it. `DataSheet` keeps its props; it shows a short loading state.
- `epure-charts/theme-light.css`: the default tokens, light only, for pages that do not
  follow the system theme.
- Series passed in (`ChartView` `resolved`): the spec needs no `version`, `kind` or `ref`
  (`withDataDefaults`, also exported), and gets no grain subtitle ("By company",
  "Annual"), which describes a catalog chart.
- `spec.subtitle` overrides the subtitle derived from the grain; `''` or `false` removes it.
- **Install from the release archive.** Each version tag attaches the ready-built package to
  its GitHub release (`epure-charts-X.Y.Z.tgz`): no install script, no git access, so it
  installs under npm 12, which blocks both for git dependencies.
- Server rendering under React 18: no `useLayoutEffect` warning (layout effects run in the
  browser only).
- Numbers drawn above an accent-colored bar or line read in black, like on a bridge (the
  accent is a fill color, often too light for text).

## 0.2.0

- **Static rendering.** Every view draws through a hook-free figure (`ChartFigure`,
  `WaterfallFigure`, `BarhFigure`, `PieFigure`, `ScatterFigure`, `MekkoFigure`, `GanttFigure`,
  `TableFigure`) that renders on the server. New entry `epure-charts/static`: scenes and
  figures, without the data sheet, icons or editing CSS.
- Views: `width` (no measuring; server rendering and hydration), `readOnly`, `responsive`,
  `dataTable` props.
- Server rendering fixes: `useSyncExternalStore` gets its server snapshot (same scale), and
  per-browser preferences are read only when `window` exists.
- Every SVG has a `viewBox`, a `<title>` and a `<desc>` from the spec; optional hidden data table.
- Specs: `source`, `note`, `base` (provenance, carried in `scene.meta.provenance`, never drawn),
  `locale`, `accent`, `emphasis`, `description`.
- `locale: 'fr'` on every chart: engine words, decimal comma, no-break spaces.
- Single-accent mode (`accent: 'single'` + `emphasis`).
- Semantic color tokens `--chart-*` with palette fallbacks; font size tokens `--chart-fs`,
  `--chart-fs-note`. **Changed values:** `ROLE_TOKEN`, `FORECAST_TOKEN` and the waterfall's
  `TONE_TOKEN` now hold semantic tokens (`chart-actual`, `chart-pos`…); they render the same
  colors unless the host themes them. Code that compared those strings must compare
  `baseToken(token)`.
- New forms: slope chart (`buildSlopeScene`, `SlopeFigure`), selection funnel
  (`buildFunnelScene`, `FunnelFigure`), waterfall indexed to 100 (`spec.index: 100`), range
  marker on horizontal bars (`rangeMarker`), `smallMultiples` / `sharedDomain`.
- `sceneToSVGString(scene, { tokens })`: a standalone SVG with every CSS variable resolved.
- Docs: the scene conventions (`docs/scenes.md`) and every scene field (`docs/scene-shapes.md`).

## 0.1.1

- `epure-charts/core`: the pure engine (specs, scenes, number formats, data sheet model) as its
  own entry, with no React, DOM or CSS import, so that it loads under Node.
- `resolveCollisions` (label layout) is exported.
- `jsuites` is declared as a dependency (it was only installed through `jspreadsheet-ce`).

## 0.1.0

First public release: column, line, area, combination, profile, waterfall, horizontal bar,
butterfly, pie, doughnut, scatter, bubble, Mekko, Gantt and table charts, each with a mini
toolbar, context menus and a data sheet.
