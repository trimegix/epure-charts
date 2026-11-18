<h1 align="center">Epure Charts</h1>

<p align="center">
  <strong>The charts of a pitch book, a board deck or a strategy review, live in your React app.</strong><br />
  Waterfalls, Mekko, Gantt, football-field-ready bars, Harvey balls. Click to format, right-click to annotate, double-click to edit the numbers.
</p>

<p align="center">
  <a href="https://trimegix.github.io/epure-charts/"><strong>Live demo</strong></a> ·
  <a href="#who-it-is-for">Who it is for</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#chart-types">Chart types</a> ·
  <a href="#interaction-model">Interaction model</a>
</p>

<p align="center">
  <a href="https://github.com/trimegix/epure-charts/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/trimegix/epure-charts/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-436%20passing-brightgreen.svg" />
</p>

---

*Épure* (French): a precise working drawing, stripped of everything that is not needed.

Bankers, consultants and investors spend their nights on charts: an EBITDA bridge that must foot to the dollar, a CAGR arrow over the right years, a market map, a 100-day plan, a deal timeline. Those charts live in slides. Epure Charts brings them, with the same precision and the same speed of editing, into web applications: deal platforms, portfolio monitoring tools, financial dashboards, data rooms, client portals.

- **Select, then format.** Click a bar, a label, an axis or the legend: a mini toolbar appears next to it with only the controls that make sense for that object.
- **Right-click for analysis.** Difference arrows, CAGR arrows that count the real number of years, value and average lines, totals, axis breaks, a KPI row under the columns (growth, margin).
- **A data sheet behind every chart.** Double-click opens a spreadsheet with about 80 Excel functions. Edit a cell, the chart redraws; the source data is never overwritten.
- **Finance-grade number formats.** Millions and billions, negatives in brackets, consistent rounding so that the parts add up to the total, fiscal years, quarters.
- **Layout that survives the review.** Labels avoid each other, the lines and the axis ticks; annotations stack; nothing leaves the frame, even at 72 pt.
- **Safe for confidential data.** Pure SVG, no network request, no telemetry: the numbers never leave the browser.

## Who it is for

| You are | You get |
|---|---|
| **Investment banker** | Trading comparables and valuation ranges as ranked bars, revenue and EBITDA bridges, deal timelines, share price charts on a common time scale |
| **Strategy consultant** | Mekko market maps, growth vs margin matrices with quadrants, 100-day plans and Gantt charts, scorecards with Harvey balls |
| **Private equity investor** | Value creation bridges, actual vs budget with net lines, MOIC by deal, portfolio reviews, forecast bars hatched apart from actuals |
| **CFO, FP&A, corporate finance** | Actual vs plan vs forecast, variance bridges, KPI rows under the chart, consistent rounding |
| **Developer of a finance or consulting product** | All of the above as React components, themable with CSS variables, MIT licensed |

## Quick start

```bash
npm install https://github.com/trimegix/epure-charts/releases/download/v0.3.0/epure-charts-0.3.0.tgz
```

Each release attaches the ready-built package: installing it runs no script and needs no git access (npm 12 blocks both for git dependencies). Installing from the repository (`github:trimegix/epure-charts#v0.3.0`) still works where git dependencies and their `prepare` script are allowed: the package then builds itself.

The pure engine (specs, scenes, number formats, data sheet model) is also available alone, with no React or CSS import, for Node scripts and tests:

```js
import { validateSpec, buildWaterfallScene } from 'epure-charts/core'
```

```jsx
import { ChartView } from 'epure-charts'
import 'epure-charts/theme.css'   // default colors and fonts (skip it if you define your own)
import 'epure-charts/styles.css'  // toolbar, menus and data sheet: the only stylesheet needed

const spec = {
  id: 'revenue',                  // stable: formatting and sheet edits are kept under it
  title: 'Revenue and EBITDA',
  x: { grain: 'year', range: 'all' },
  series: [
    { id: 'rev', mark: 'bar', labels: 'all' },
    { id: 'ebitda', mark: 'bar' },
    { id: 'plan', mark: 'line' },
  ],
}

const pts = rows => rows.map(([x, y]) => ({ x, y }))
const data = [
  { label: 'Revenue', unit: 'M', role: 'actual', points: pts([['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]]) },
  { label: 'EBITDA', unit: 'M', role: 'actual', points: pts([['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]]) },
  { label: 'Plan', unit: 'M', role: 'plan', points: pts([['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]]) },
]

export default function App() {
  return <ChartView spec={spec} resolved={data} format={v => `$${v}M`} />
}
```

That chart is already fully interactive: click a bar, right-click it, double-click it.

No bundler setting is needed, server rendering included (Astro, Next.js, Remix): the package imports no CSS from JavaScript, and the data sheet (its spreadsheet grid is the heaviest part) loads on its first opening, so a page of read-only charts never downloads it. A spec with series passed in (`resolved`) needs no `version`, `kind` or `ref`: those belong to a host catalog (`ChartsProvider`).

## Chart types

| Component | Charts |
|---|---|
| `ChartView` | Columns (clustered, stacked, 100 %), lines, areas, combinations, profile charts, horizontal bars |
| `WaterfallChart` | Waterfalls / bridges, with subtotals, net lines and draggable connectors |
| `BarhView` | Ranked bars, valuation summaries (football field), butterfly charts |
| `PieView` | Pies and doughnuts |
| `ScatterView` | Scatter and bubble charts, quadrants, trend lines, partitions |
| `MekkoView` | Mekko charts (in % or in units) |
| `GanttView` | Gantt charts with calendar, milestones, anchors, shades and brackets |
| `TableView` | Tables with Harvey balls, check marks, arrows and conditional fills |

Every chart has a data sheet (`DataSheet`) and the same interaction model.

## Interaction model

| Gesture | Effect |
|---|---|
| Click | Selects the object under the pointer and shows its mini toolbar |
| Shift / Ctrl + click | Extends the selection |
| Ctrl + A (repeat) | Selects the series, then every series |
| Right-click | Context menu: add or remove arrows, lines, totals, labels, axis breaks |
| Double-click | Opens the data sheet on the clicked cell |
| Drag | Moves labels, axis bounds, value lines, connectors, Gantt bars |
| Type | Replaces the text of the selected label |
| Tab / Alt + arrows | Moves the selection to the next element of the same kind |
| Ctrl + Z | Undo |

**Annotations.** Difference arrows (between any two points, or to a value line), level differences, CAGR arrows that know the real number of years even when some are hidden, value and average lines, totals, error bars, connectors.

**Axes.** Drag the bounds, axis breaks, log scale, date axes in years, quarters, months or weeks, the same scale across several charts.

**Formatting.** Number formats (prefixes, decimals, separators, scaling), date formats, label content and position, colors (palette or any hex color), patterns and hatching for forecasts, fonts and sizes, named color schemes you can export and import as JSON.

## Static rendering

Every view draws through a **figure**: a component without hooks that renders a scene
(plain, laid-out JSON) to SVG. Use the figures to render on the server, in a static site
or to a file, without the editor:

```jsx
import { buildWaterfallScene, WaterfallFigure, sceneToSVGString } from 'epure-charts/static'

const scene = buildWaterfallScene(spec, bridge, { width: 720, height: 360 })
renderToString(<WaterfallFigure scene={scene} responsive />) // complete <svg>, no DOM needed
sceneToSVGString(scene, { tokens: { 'chart-pos': '#117a65' } }) // standalone SVG, CSS variables resolved
```

`epure-charts/static` exports the scene builders and the figures (`ChartFigure`,
`WaterfallFigure`, `BarhFigure`, `PieFigure`, `ScatterFigure`, `MekkoFigure`, `GanttFigure`,
`TableFigure`, `SlopeFigure`, `FunnelFigure`). It imports neither the data sheet nor the
icons nor the editing CSS.

Figure props: `scene`, `responsive` (width="100%", ratio kept), `dataTable` (the numbers as
a visually hidden table, for screen readers), `label`. Every SVG has a `viewBox`, and a
`<title>` and `<desc>` taken from the spec.

The interactive views take the same options, plus:

| Prop | |
|---|---|
| `width` | fixed drawing width: no measuring, so the chart renders on the server; also the first width on hydration |
| `readOnly` | the figure only: no format bar, menus, data sheet or per-browser preferences |
| `responsive`, `dataTable` | passed to the figure |

**Provenance.** A spec can carry `source`, `note` and `base` (`{ sample, period, scope }`).
The figure does not draw them; they travel in `scene.meta.provenance` for the page (title
and footer) or a deck exporter. See [docs/scenes.md](docs/scenes.md) for the scene
conventions and [docs/scene-shapes.md](docs/scene-shapes.md) for every field.

**Language.** `spec.locale: 'fr'` (or `setDefaultLocale('fr')` for the page): engine words in
French, decimal comma, no-break space before % and units (« 12,5 % », « 1 234 M€ »).

**Single accent.** `spec.accent: 'single'` with `spec.emphasis: [keys]`: everything neutral
but the emphasized series, steps, rows or slices.

**More forms.** `buildSlopeScene` (before / after for N items), `buildFunnelScene`
(selection funnel with named filters and pass rates), `spec.index: 100` on a waterfall (a
bridge indexed to 100: orders of magnitude without the figures), range markers on
horizontal bars (`spec.rangeMarker: 'median' | 'mean'`, or `marker` per row), and
`smallMultiples(build, panels, { columns, same })` to share one scale across several scenes.

## Theming

All colors and fonts are CSS custom properties (`--cat-1` … `--cat-7`, `--gray-*`, `--font`, `--font-mono`, …). Import `epure-charts/theme.css` for the defaults, or define the same variables in your own stylesheet: your values win. Light and dark themes are supported (`prefers-color-scheme` or `data-theme="dark"`). A page that stays light whatever the system theme imports `epure-charts/theme-light.css` instead.

Semantic tokens name what a color means (`--chart-pos`, `--chart-neg`, `--chart-accent`, `--chart-neutral`, `--chart-actual`, `--chart-plan`, `--chart-hypothesis`…); each falls back on a palette color, so define only the ones you change. `--chart-fs` and `--chart-fs-note` scale the text the figures draw.

## Persistence

Formatting choices and data sheet edits are stored per chart `id` in the browser (`localStorage`). The source data you pass in is never modified: edits are an overlay that the user can reset.

To publish them instead (an author formats a chart, readers see that format), configure the store once, before the first render:

```js
import { configurePrefs } from 'epure-charts'

// The author: the published state, every change sent to your backend.
configurePrefs({ seed: published, local: false, onChange: (key, prefs) => save(key, prefs) })
// Readers: the published state only.
configurePrefs({ seed: published, local: false })
```

Readers then draw the views with `readOnly` and `applyPrefs`: the published settings and sheet edits, without any editing control. `snapshotPrefs()` returns the current state of every chart of the page.

## Development

```bash
npm install
npm run dev      # the gallery on http://localhost:5173
npm test         # 436 scene and model tests (node --test)
npm run check    # forbidden words, lint, tests and build
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
