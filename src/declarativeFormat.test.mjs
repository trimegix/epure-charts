// A declarative `format` ({ prefix, suffix, unit, decimals }): the host says what the number
// carries, the engine writes it in the chart's language. No English round trip to remember.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { declarativeFormat, asFormatter } from './locale.js'
import { makeFormatter } from './numberStyle.js'
import { buildWaterfallScene } from './waterfallScene.js'
import { buildScene } from './scene.js'
import { buildBarhScene } from './barhScene.js'
import ChartView from './ChartView.jsx'
import WaterfallChart from './WaterfallChart.jsx'
import BarhView from './BarhView.jsx'

const sp = s => s.replace(/[\u00a0\u202f]/g, ' ')
const text = html => sp(html.replace(/<[^>]+>/g, '|'))
const bridge = { unit: 'M', steps: [
  { key: 'a', label: 'Start', kind: 'anchor', value: 7.4, tone: 'anchor' },
  { key: 'b', label: 'Lever', kind: 'delta', value: 0.6, tone: 'positive' },
  { key: 'c', label: 'End', kind: 'total', value: 1234.5, tone: 'anchor' },
] }

test('the formatter: prefix, suffix, unit, decimals; pct and x keep their sign', () => {
  const f = declarativeFormat({ unit: 'M€' })
  assert.equal(f(7.4, 'M', 1), '7.4 M€')
  assert.equal(f(-1234.5, 'M', 1), '−1,234.5 M€')
  assert.equal(declarativeFormat({ prefix: '€', suffix: 'M', decimals: 2 })(7.4, 'M', 0), '€7.40M', 'decimals set wins')
  assert.equal(f(0.125, 'pct', 1), '12.5%')
  assert.equal(f(2.5, 'x', null), '2.5x')
  assert.equal(asFormatter(f), f)
  assert.equal(asFormatter(undefined), undefined)
})

test('bridge in French: « 7,4 M€ », static and live, the engine decimals', () => {
  const spec = { bridge: { id: 'p' }, labels: 'all', locale: 'fr' }
  const both = { ...bridge, steps: bridge.steps.slice(0, 2).concat({ key: 'c', label: 'End', kind: 'total', value: 0, tone: 'anchor' }) }
  const sc = buildWaterfallScene(spec, both, { width: 600, height: 300, format: { unit: 'M€' } })
  assert.deepEqual(sc.labels.map(l => sp(l.text)), ['7,4 M€', '+0,6 M€', '8,0 M€'])
  const live = text(renderToString(h(WaterfallChart, { spec, bridge: both, width: 600, readOnly: true, applyPrefs: true })))
  assert.ok(live.includes('|7,4|') || live.includes('7,4'), live)
  const en = buildWaterfallScene({ ...spec, locale: 'en' }, both, { width: 600, height: 300, format: { unit: 'M€' } })
  assert.deepEqual(en.labels.map(l => l.text), ['7.4 M€', '+0.6 M€', '8.0 M€'])
})

test('columns: French thousands and comma, live view with reading decimals', () => {
  const resolved = [{ label: 'A', unit: 'M', points: [{ x: '2024', y: 1234.5 }, { x: '2025', y: 1500.25 }] }]
  const spec = { id: 'c', locale: 'fr', series: [{ id: 'a', mark: 'bar', labels: 'all' }], x: { grain: 'year', range: 'all' }, numberFormat: { decimals: 1 } }
  const sc = buildScene(spec, resolved, { width: 600, height: 300, format: { prefix: '€', suffix: 'M' } })
  assert.deepEqual(sc.labels.map(l => sp(l.text)), ['1 234,5 M€', '1 500,3 M€'])
  const live = text(renderToString(h(ChartView, { spec, resolved, format: { unit: 'M€' }, width: 600, height: 300, readOnly: true, applyPrefs: true })))
  assert.ok(live.includes('1 234,5 M€'), live)
  // The format bar's decimals rewrite a declarative format like any other.
  assert.equal(makeFormatter({ unit: 'M€' }, 2, null, null)(7.4, 'M', 0), '7.40 M€')
})

test('horizontal bars: an object format, static and live', () => {
  const rows = [{ key: 'a', label: 'Alpha', values: { v: 2.1 } }, { key: 'b', label: 'Beta', values: { v: 1.4 } }]
  const spec = { series: [{ id: 'v', label: 'MOIC' }], labels: 'end', locale: 'fr' }
  const sc = buildBarhScene(spec, rows, { width: 600, format: { suffix: 'x' } })
  assert.deepEqual(sc.labels.map(l => sp(l.text)).sort(), ['1,4x', '2,1x'])
  const live = text(renderToString(h(BarhView, { spec, rows, width: 600, format: { suffix: 'x' }, readOnly: true, applyPrefs: true })))
  assert.ok(live.includes('2,1x'), live)
})
