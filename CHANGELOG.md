# Changelog

## Unreleased

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
