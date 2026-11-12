// ─── epure-charts · gallery: every chart type, on fictional data ───────────────
// Serves as the demo (README) and as a test bench: every chart can be formatted
// in place (click, right-click, settings button).
import { ChartView, WaterfallChart, BarhView, PieView, ScatterView, MekkoView, GanttView, ChartHeader } from '../src/index.js'
import { TableView } from '../src/index.js'

const card = { minWidth: 0, background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius, 12px)', padding: '18px 20px', position: 'relative' }
// The host formatter honours the requested decimals (an axis imposes a single value for all its ticks).
const fmt = (v, unit, dec) => `€${v.toFixed(dec ?? (Math.abs(v) >= 100 ? 0 : 1))}M`

const columns = {
  spec: { id: 'demo-columns', version: 1, title: 'Revenue and EBITDA', scope: 'shared', kind: 'cartesian', x: { grain: 'year', range: 'all' },
    series: [
      { id: 'rev', ref: { metric: 'sales', source: 'actual' }, mark: 'bar', labels: 'all', style: { color: 'gray-700' } },
      { id: 'ebitda', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar', style: { color: 'cat-2' } },
      { id: 'plan', ref: { metric: 'sales', source: 'bp' }, mark: 'line' },
    ] },
  resolved: [
    { label: 'Revenue', unit: 'M', role: 'actual', points: [['2020', 112], ['2021', 124], ['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]].map(([x, y]) => ({ x, y })) },
    { label: 'EBITDA', unit: 'M', role: 'actual', points: [['2020', 18], ['2021', 21], ['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]].map(([x, y]) => ({ x, y })) },
    { label: 'Plan', unit: 'M', role: 'plan', points: [['2020', 110], ['2021', 125], ['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]].map(([x, y]) => ({ x, y })) },
  ],
}
// Actuals then forecast (fictional data): forecast bars can be hatched
// (click a bar, then Fill, then "Hatch forecast bars").
const forecast = {
  spec: { id: 'demo-forecast', version: 1, title: 'EBITDA: actuals and management case', scope: 'shared', kind: 'cartesian', x: { grain: 'year', range: 'all' },
    series: [
      { id: 'ebitda', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar', labels: 'all', style: { color: 'cat-2' } },
      { id: 'capex', ref: { metric: 'capex', source: 'actual' }, mark: 'bar', style: { color: 'gray-600' } },
    ] },
  resolved: [
    { label: 'EBITDA', unit: 'M', role: 'actual', points: [['2021', 21, 'actual'], ['2022', 24, 'actual'], ['2023', 27, 'actual'], ['2024', 30, 'actual'], ['2025', 34, 'forecast'], ['2026', 38, 'forecast'], ['2027', 42, 'forecast']].map(([x, y, type]) => ({ x, y, type })) },
    { label: 'Capex', unit: 'M', role: 'actual', points: [['2021', 6, 'actual'], ['2022', 7, 'actual'], ['2023', 7, 'actual'], ['2024', 8, 'actual'], ['2025', 9, 'forecast'], ['2026', 9, 'forecast'], ['2027', 10, 'forecast']].map(([x, y, type]) => ({ x, y, type })) },
  ],
}
const bridge = {
  spec: { id: 'demo-bridge', version: 1, title: 'EBITDA bridge, 2023 to 2025', scope: 'shared', kind: 'waterfall', bridge: { id: 'demo' } },
  bridge: { unit: 'M', steps: [
    { key: 'entry', label: '2023', value: 78, kind: 'anchor', tone: 'anchor' },
    { key: 'growth', label: 'Revenue growth', value: 22, kind: 'delta', tone: 'positive' },
    { key: 'margin', label: 'Pricing', value: 14, kind: 'delta', tone: 'positive' },
    { key: 'multiple', label: 'FX', value: -6, kind: 'delta', tone: 'negative' },
    { key: 'debt', label: 'Cost savings', value: 9, kind: 'delta', tone: 'positive' },
    { key: 'today', label: '2025', value: 117, kind: 'anchor', tone: 'anchor' },
  ] },
}
// Two line charts on a date axis (fictional data), with different ranges: right-click the
// X axis and choose "Set same scale as other charts" on both, or click one X axis then
// Ctrl + click the other; both then cover the same date range.
const navLine = (id, title, pairs) => ({
  spec: { id, version: 1, title, scope: 'shared', kind: 'cartesian', x: { grain: 'category' },
    series: [{ id: 'nav', ref: { metric: 'nav', source: 'actual' }, mark: 'line', labels: 'last', style: { color: 'cat-2', marker: true } }] },
  resolved: [{ label: 'NAV', unit: 'M', role: 'actual', points: pairs.map(([x, y]) => ({ x, y })) }],
})
const navA = navLine('demo-nav-a', 'Portfolio NAV, Fund I', [['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-01-31', 141], ['2025-06-30', 150]])
const navB = navLine('demo-nav-b', 'Portfolio NAV, Fund II', [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2025-12-31', 75], ['2026-03-31', 79]])
// Two-series bridge: actuals stacked, budget as net lines (one stroke at its level on each column).
// Click a stroke, then right-click: "Show Budget as segments"; the datasheet keeps both columns.
const bridgeBudget = {
  spec: { id: 'demo-bridge-budget', version: 1, title: 'EBITDA bridge, actual vs budget', scope: 'shared', kind: 'waterfall', bridge: { id: 'demo-budget' }, netLines: ['budget'] },
  bridge: { unit: 'M', steps: [
    { key: 'ly', label: 'Last year', value: 30, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 30 }, { key: 'budget', label: 'Budget', value: 30 }] },
    { key: 'vol', label: 'Volume', value: 6, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', label: 'Actual', value: 6 }, { key: 'budget', label: 'Budget', value: 8 }] },
    { key: 'price', label: 'Price', value: 4, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', label: 'Actual', value: 4 }, { key: 'budget', label: 'Budget', value: 3 }] },
    { key: 'cost', label: 'Cost inflation', value: -3, kind: 'delta', tone: 'negative', parts: [{ key: 'actual', label: 'Actual', value: -3 }, { key: 'budget', label: 'Budget', value: -2 }] },
    { key: 'ty', label: 'This year', value: 37, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 37 }, { key: 'budget', label: 'Budget', value: 39 }] },
  ] },
}
const ranking = {
  spec: { series: [{ id: 'v', label: 'Gross MOIC', color: 'cat-2' }], labels: 'end', sort: 'desc', annotations: [{ type: 'valueLine', value: 2.0, label: 'Hurdle 2.0x', tone: 'gold', dash: 'dash', side: 'right' }] },
  rows: [['Alpha', 2.4], ['Beta', 1.8], ['Gamma', 3.1], ['Delta', 1.2], ['Epsilon', 2.0]].map(([label, v]) => ({ key: label, label, values: { v } })),
}
// Valuation summary ("football field"): one floating bar per method, enterprise value in €M.
const football = {
  spec: { series: [{ id: 'ev', label: 'Enterprise value', color: 'cat-2' }], labels: 'end', annotations: [{ type: 'valueLine', value: 520, label: 'Offer', tone: 'gold', dash: 'dash', side: 'right' }] },
  rows: [
    ['52-week trading range', 380, 470], ['Trading comparables', 420, 560], ['Precedent transactions', 480, 640],
    ['DCF (WACC 8 to 10%)', 450, 610], ['LBO (20 to 25% IRR)', 400, 520],
  ].map(([label, lo, hi]) => ({ key: label, label, range: [lo, hi], values: {} })),
}
const slices = [['Industrials', 42], ['Healthcare', 27], ['Software', 18], ['Consumer', 9], ['Other', 4]].map(([label, value]) => ({ key: label, label, value }))
const points = [
  ['Alpha', 8, 18, 120, 'Region A'], ['Beta', 12, 22, 80, 'Region A'], ['Gamma', 5, 11, 60, 'Region B'], ['Delta', 15, 25, 150, 'Region B'],
  ['Epsilon', 3, 9, 40, 'Region A'], ['Zeta', 10, 14, 90, 'Region B'], ['Eta', 7, 20, 70, 'Region A'],
].map(([label, x, y, size, group]) => ({ key: label, label, x, y, size, group }))
const mekko = {
  spec: { series: [{ id: 'us', label: 'Our company' }, { id: 'c1', label: 'Competitor 1' }, { id: 'c2', label: 'Competitor 2' }, { id: 'rest', label: 'Rest of market' }], totals: true },
  columns: [
    { key: 'fr', label: 'France', values: { us: 35, c1: 25, c2: 15, rest: 25 } },
    { key: 'de', label: 'Germany', values: { us: 20, c1: 40, c2: 10, rest: 30 } },
    { key: 'uk', label: 'UK', values: { us: 10, c1: 15, c2: 20, rest: 15 } },
    { key: 'es', label: 'Spain', values: { us: 12, c1: 4, c2: 6, rest: 8 } },
  ],
}
// Mekko in units: the width comes from its own row (market size), the height from sales.
const mekkoUnits = {
  spec: { mode: 'units', series: [{ id: 'us', label: 'Our company' }, { id: 'c1', label: 'Competitor 1' }, { id: 'c2', label: 'Competitor 2' }], segmentOrder: 'desc', ridges: true, xLabels: 'value', toOther: ['c2'] },
  columns: [
    { key: 'fr', label: 'France', extent: 420, values: { us: 35, c1: 25, c2: 15 } },
    { key: 'de', label: 'Germany', extent: 610, values: { us: 20, c1: 40, c2: 10 } },
    { key: 'uk', label: 'UK', extent: 300, values: { us: 10, c1: 15, c2: 20 } },
    { key: 'es', label: 'Spain', extent: 180, values: { us: 12, c1: 4, c2: 6 } },
  ],
}
const gantt = [
  { key: 'it', label: 'IT migration', group: 'Phase 1', responsible: 'CIO', status: 0.75, remark: 'Legacy shutdown Q2', items: [{ key: 'it1', start: '2025-01-06', end: '2025-03-28', label: 'Separation', done: 0.7 }] },
  { key: 'pr', label: 'Pricing', group: 'Phase 1', responsible: 'CCO', status: 0.5, items: [{ key: 'pr1', start: '2025-02-03', end: '2025-05-30', label: 'Repricing wave 1', done: 0.4, shape: 'pentagon' }, { key: 'pr2', after: 'pr1', duration: 60, label: 'Wave 2', shape: 'chevron' }] },
  { key: 'ma', label: 'Partnerships', group: 'Phase 2', responsible: 'CFO', status: 0.25, items: [] },
  { key: 'ma-s', label: 'Screening', level: 1, group: 'Phase 2', responsible: 'BizDev', status: 1, items: [{ key: 'ma1', start: '2025-03-03', end: '2025-06-30', label: 'Partner screening' }] },
  { key: 'ma-d', label: 'Negotiation', level: 1, group: 'Phase 2', responsible: 'BizDev', status: 0, remark: 'Two partners', items: [{ key: 'ma3', after: 'ma1', duration: 90, label: 'Terms' }, { key: 'ma2', after: 'ma3', kind: 'milestone', label: 'Signing', line: true }] },
  { key: 'ex', label: 'Launch', group: 'Phase 2', responsible: 'CEO', status: 0, items: [{ key: 'exb', kind: 'bracket', start: '2026-01-05', end: '2026-03-31', label: 'Prep' }, { key: 'ex1', start: '2026-04-01', end: '2026-06-30', label: 'Rollout' }] },
]
const ganttSpec = {
  groups: true, today: '2025-04-15', fiscalStart: 4, columns: ['responsible', 'status', 'remark'],
  shades: [{ from: '2025-07-14', to: '2025-08-31', label: 'Summer' }],
  events: [{ date: '2025-06-26', label: 'Board' }, { date: '2025-12-11', label: 'Budget' }],
}
const sprint = [
  { key: 'd', label: 'Data request', responsible: 'CFO', status: true, items: [{ key: 'd1', start: '2025-03-03', end: '2025-03-07', label: 'Request' }] },
  { key: 'm', label: 'Model', responsible: 'Analyst', status: null, items: [{ key: 'm1', after: 'd1', duration: 6, label: 'Build' }] },
  { key: 'r', label: 'Review', responsible: 'Manager', status: false, items: [{ key: 'r1', after: 'm1', kind: 'milestone', label: 'Investment committee', marker: 'triangle' }] },
]

// Scorecard: Harvey balls, checkboxes and value-driven icons (fictional data).
const scoreCols = [
  { key: 'ebitda', label: 'EBITDA (€M)', type: 'number', decimals: 1 },
  { key: 'growth', label: 'Growth', type: 'icon' },
  { key: 'progress', label: 'Value plan', type: 'harvey' },
  { key: 'esg', label: 'ESG maturity', type: 'harvey' },
  { key: 'report', label: 'Board pack', type: 'check' },
  { key: 'risk', label: 'Covenant', type: 'icon' },
  { key: 'note', label: 'Comment', type: 'text' },
]
const scoreRows = [
  ['alpha', 'Alpha', 18.4, 'up', 3, 2, true, 'green', 'Pricing wave 1 done'],
  ['beta', 'Beta', 9.2, 'down', 1, 1, false, 'amber', 'Late monthly report'],
  ['gamma', 'Gamma', 24.0, 'up', 4, 3, true, 'green', 'Launch prep'],
  ['delta', 'Delta', 6.7, 'flat', 2, 0, 'empty', 'red', 'Supplier dispute'],
  ['epsilon', 'Epsilon', 12.1, 'up', 2, 4, true, 'green', ''],
].map(([key, label, ebitda, growth, progress, esg, report, risk, note]) => ({ key, label, cells: { ebitda, growth, progress, esg, report, risk, note } }))

export default function Gallery() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, fontFamily: 'var(--font)', background: 'var(--gray-50, transparent)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.01em' }}>Epure Charts</h1>
        <a href="https://github.com/trimegix/epure-charts" style={{ color: 'var(--gray-600)', fontSize: 14 }}>GitHub</a>
      </header>
      <p style={{ margin: 0, color: 'var(--gray-600)', fontSize: 15 }}>The charts of a pitch book, a board deck or a strategy review, live in your React app. Click any part of a chart to format it, right-click to add annotations, double-click to edit the numbers.</p>
      <div className="card chart-card" style={card}><ChartView spec={columns.spec} resolved={columns.resolved} format={fmt} /></div>
      <div className="card chart-card" style={card}><ChartView spec={forecast.spec} resolved={forecast.resolved} format={fmt} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="EBITDA bridge, 2023 to 2025" /><WaterfallChart spec={bridge.spec} bridge={bridge.bridge} bare /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card chart-card" style={card}><ChartView spec={navA.spec} resolved={navA.resolved} format={fmt} /></div>
        <div className="card chart-card" style={card}><ChartView spec={navB.spec} resolved={navB.resolved} format={fmt} /></div>
      </div>
      <div className="card chart-card" style={card}><ChartHeader title="EBITDA bridge, actual vs budget (budget as net lines)" /><WaterfallChart spec={bridgeBudget.spec} bridge={bridgeBudget.bridge} bare /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Valuation summary (football field)" /><BarhView id="demo-football" spec={football.spec} rows={football.rows} format={v => `€${Math.round(v)}M`} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Gross MOIC by deal" /><BarhView id="demo-ranking" spec={ranking.spec} rows={ranking.rows} unit="x" format={v => `${v.toFixed(1)}x`} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card chart-card" style={card}><ChartHeader title="Portfolio by sector" /><PieView id="demo-pie" slices={slices} spec={{ donut: 0.55, total: true }} format={v => `€${v}M`} /></div>
        <div className="card chart-card" style={card}><ChartHeader title="Peer benchmarking: growth vs margin" /><ScatterView id="demo-scatter" points={points} spec={{ bubble: true, x: { title: 'Revenue growth (%)' }, y: { title: 'EBITDA margin (%)' } }} format={v => `${v}%`} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card chart-card" style={card}><ChartHeader title="Revenue mix (counter-clockwise, moved label)" /><PieView id="demo-pie-2" slices={slices} spec={{ donut: 0.4, centerTitle: 'Group', direction: 'ccw', start: 90, content: 'nameShare', labelOffsets: { Software: { dx: 18, dy: -14 } }, explode: ['Healthcare'] }} format={v => `€${v}M`} /></div>
        <div className="card chart-card" style={card}><ChartHeader title="Growth vs margin (quadrants, trend)" /><ScatterView id="demo-scatter-2" points={points}
          spec={{ markers: 'group', labelContent: ['name', 'y'], trend: 'poly2', trendLabel: 'both', partitions: [{ key: 'gx', axis: 'x', value: 9 }, { key: 'gy', axis: 'y', value: 16 }],
            zones: { tr: { fill: 'green', label: 'Stars' }, bl: { fill: 'red', label: 'Watch list' } }, x: { title: 'Revenue growth (%)' }, y: { title: 'EBITDA margin (%)' } }} format={v => `${v}%`} /></div>
      </div>
      <div className="card chart-card" style={card}><ChartHeader title="Target screening: growth, margin and size" /><ScatterView id="demo-scatter-3" height={340}
        points={points.map(p => (p.key === 'Delta' ? { ...p, color: 'cat-4' } : p))}
        spec={{ bubble: true, sizeBy: 'diameter', label2: ['size'], front: ['Zeta'], trend: 'exp', trendFill: 'below', trendFillColor: 'cat-3',
          partitions: [{ key: 'diag', axis: 'line', from: { x: 3, y: 9 }, to: { x: 15, y: 25 } }], zones: { 'above:diag': { fill: 'cat-2', label: 'Outperform' } },
          x: { title: 'Revenue growth (%)' }, y: { title: 'EBITDA margin (%)' } }} format={v => `${v}%`} formatSize={v => `€${v}M`} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Market map: share by country (Mekko)" /><MekkoView id="demo-mekko" spec={mekko.spec} columns={mekko.columns} format={v => `€${v}M`} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Market size × share (Mekko in units)" /><MekkoView id="demo-mekko-units" spec={mekkoUnits.spec} columns={mekkoUnits.columns} format={v => `€${v}M`} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="100-day plan" /><GanttView id="demo-gantt" rows={gantt} spec={ganttSpec} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Due diligence timeline (days, weekends shaded)" /><GanttView id="demo-gantt-days" rows={sprint} spec={{ scale: 'day', weekends: 'shaded', columns: ['responsible', 'status'], status: 'checkbox', dateLabels: 'start' }} /></div>
      <div className="card chart-card" style={card}><ChartHeader title="Portfolio review (Harvey balls, check marks)" /><TableView id="demo-table" columns={scoreCols} rows={scoreRows}
        spec={{ labelHeader: 'Unit', stripes: 'rows', totals: true, harveyMax: { progress: 4, esg: 4 }, emphasis: ['gamma'] }} /></div>
    </div>
  )
}
