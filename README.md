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
npm install github:trimegix/epure-charts
```

The package builds itself on install (`prepare`). Pin a release with `github:trimegix/epure-charts#v0.1.0`.

```jsx
import { ChartView } from 'epure-charts'
import 'epure-charts/theme.css'   // default colors and fonts (skip it if you define your own)
import 'epure-charts/styles.css'  // toolbar, menus and data sheet

const spec = {
  id: 'revenue',
  version: 1,
  kind: 'cartesian',
  title: 'Revenue and EBITDA',
  x: { grain: 'year', range: 'all' },
  series: [
    { id: 'rev', ref: { metric: 'revenue', source: 'actual' }, mark: 'bar', labels: 'all' },
    { id: 'ebitda', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar' },
    { id: 'plan', ref: { metric: 'revenue', source: 'plan' }, mark: 'line' },
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

## Theming

All colors and fonts are CSS custom properties (`--cat-1` … `--cat-7`, `--gray-*`, `--font`, `--font-mono`, …). Import `epure-charts/theme.css` for the defaults, or define the same variables in your own stylesheet: your values win. Light and dark themes are supported (`prefers-color-scheme` or `data-theme="dark"`).

## Persistence

Formatting choices and data sheet edits are stored per chart `id` in the browser (`localStorage`). The source data you pass in is never modified: edits are an overlay that the user can reset.

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
