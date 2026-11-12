import { ChartView } from '../src/index.js'
import '../styles/tokens.css'   // default colors and fonts (skip it if you define your own)
import '../styles/charts.css'  // toolbar, menus and data sheet

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

import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')).render(<App />)
