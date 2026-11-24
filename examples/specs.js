// ─── epure-charts · example specs, on fictional data ──────────────────────────
// The charts of the gallery (demo/Gallery.jsx) and of the static / live parity test
// (src/parity.test.mjs): every spec here is drawn the same by the static entry
// (build*Scene) and by the live view in readOnly + applyPrefs. Pure data, no React.

export const columns = {
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
export const forecast = {
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
export const bridge = {
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
export const navLine = (id, title, pairs) => ({
  spec: { id, version: 1, title, scope: 'shared', kind: 'cartesian', x: { grain: 'category' },
    series: [{ id: 'nav', ref: { metric: 'nav', source: 'actual' }, mark: 'line', labels: 'last', style: { color: 'cat-2', marker: true } }] },
  resolved: [{ label: 'NAV', unit: 'M', role: 'actual', points: pairs.map(([x, y]) => ({ x, y })) }],
})
export const navA = navLine('demo-nav-a', 'Portfolio NAV, Fund I', [['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-01-31', 141], ['2025-06-30', 150]])
export const navB = navLine('demo-nav-b', 'Portfolio NAV, Fund II', [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2025-12-31', 75], ['2026-03-31', 79]])
// Two-series bridge: actuals stacked, budget as net lines (one stroke at its level on each column).
// Click a stroke, then right-click: "Show Budget as segments"; the datasheet keeps both columns.
export const bridgeBudget = {
  spec: { id: 'demo-bridge-budget', version: 1, title: 'EBITDA bridge, actual vs budget', scope: 'shared', kind: 'waterfall', bridge: { id: 'demo-budget' }, netLines: ['budget'] },
  bridge: { unit: 'M', steps: [
    { key: 'ly', label: 'Last year', value: 30, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 30 }, { key: 'budget', label: 'Budget', value: 30 }] },
    { key: 'vol', label: 'Volume', value: 6, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', label: 'Actual', value: 6 }, { key: 'budget', label: 'Budget', value: 8 }] },
    { key: 'price', label: 'Price', value: 4, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', label: 'Actual', value: 4 }, { key: 'budget', label: 'Budget', value: 3 }] },
    { key: 'cost', label: 'Cost inflation', value: -3, kind: 'delta', tone: 'negative', parts: [{ key: 'actual', label: 'Actual', value: -3 }, { key: 'budget', label: 'Budget', value: -2 }] },
    { key: 'ty', label: 'This year', value: 37, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', label: 'Actual', value: 37 }, { key: 'budget', label: 'Budget', value: 39 }] },
  ] },
}
export const ranking = {
  spec: { series: [{ id: 'v', label: 'Gross MOIC', color: 'cat-2' }], labels: 'end', sort: 'desc', annotations: [{ type: 'valueLine', value: 2.0, label: 'Hurdle 2.0x', tone: 'gold', dash: 'dash', side: 'right' }] },
  rows: [['Alpha', 2.4], ['Beta', 1.8], ['Gamma', 3.1], ['Delta', 1.2], ['Epsilon', 2.0]].map(([label, v]) => ({ key: label, label, values: { v } })),
}
// Valuation summary ("football field"): one floating bar per method, enterprise value in €M.
export const football = {
  spec: { series: [{ id: 'ev', label: 'Enterprise value', color: 'cat-2' }], labels: 'end', annotations: [{ type: 'valueLine', value: 520, label: 'Offer', tone: 'gold', dash: 'dash', side: 'right' }] },
  rows: [
    ['52-week trading range', 380, 470], ['Trading comparables', 420, 560], ['Precedent transactions', 480, 640],
    ['DCF (WACC 8 to 10%)', 450, 610], ['LBO (20 to 25% IRR)', 400, 520],
  ].map(([label, lo, hi]) => ({ key: label, label, range: [lo, hi], values: {} })),
}
// Stacked columns with a CAGR per series, an explicit CAGR on the total and the column totals.
export const stacked = {
  spec: { id: 'demo-stacked', title: 'Revenue by segment', x: { grain: 'year', range: 'all' }, bars: 'stacked',
    series: [{ id: 'sw', mark: 'bar', labels: 'all' }, { id: 'sv', mark: 'bar', labels: 'all' }, { id: 'hw', mark: 'bar' }],
    annotations: [{ type: 'cagr', series: 'sw' }, { type: 'cagr', from: { key: '2021' }, to: { key: '2025' } }, { type: 'totals' }] },
  resolved: [
    { label: 'Software', unit: 'M', points: [['2021', 40.5], ['2022', 47], ['2023', 52.25], ['2024', 58], ['2025', 61]].map(([x, y]) => ({ x, y })) },
    { label: 'Services', unit: 'M', points: [['2021', 22], ['2022', 24], ['2023', 25.5], ['2024', 28], ['2025', 31]].map(([x, y]) => ({ x, y })) },
    { label: 'Hardware', unit: 'M', points: [['2021', 9], ['2022', 8.5], ['2023', 8], ['2024', 7.2], ['2025', 6.4]].map(([x, y]) => ({ x, y })) },
  ],
}
// Clustered columns with two difference arrows (one on a series, one on the column totals) and a CAGR.
export const grouped = {
  spec: { id: 'demo-grouped', title: 'Revenue: plan vs actual', x: { grain: 'year', range: 'all' },
    series: [{ id: 'act', mark: 'bar', labels: 'all' }, { id: 'plan', mark: 'bar' }],
    annotations: [{ type: 'diff', from: '2023', to: '2025', series: 'act' }, { type: 'diff', from: '2024', to: '2025', mode: 'pct' }, { type: 'cagr', series: 'act' }] },
  resolved: [
    { label: 'Actual', unit: 'M', points: [['2023', 112], ['2024', 124], ['2025', 136.5]].map(([x, y]) => ({ x, y })) },
    { label: 'Plan', unit: 'M', points: [['2023', 110], ['2024', 125], ['2025', 140]].map(([x, y]) => ({ x, y })) },
  ],
}
// A bridge as a host passes it: no version nor kind, the data alongside.
export const bridgeMinimal = {
  spec: { bridge: { id: 'p' }, labels: 'all', locale: 'fr' },
  bridge: { unit: 'M', steps: [
    { key: 'a', label: 'Start', kind: 'anchor', value: 7.4, tone: 'anchor' },
    { key: 'b', label: 'Lever', kind: 'delta', value: 0.6, tone: 'positive' },
    { key: 'c', label: 'Headwind', kind: 'delta', value: -0.3, tone: 'negative' },
    { key: 'd', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
  ] },
}
