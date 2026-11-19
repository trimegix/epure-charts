// Every view in edit mode carries the format button (top right); read-only, none.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import WaterfallView from './WaterfallView.jsx'
import ChartView from './ChartView.jsx'

const BTN = /class="chart-opts-btn"/
const bridge = { unit: 'M', steps: [
  { key: 'start', label: 'Entry', kind: 'anchor', value: 200, tone: 'anchor' },
  { key: 'growth', label: 'Growth', kind: 'delta', value: 40, tone: 'positive' },
  { key: 'end', label: 'Exit', kind: 'total', value: 0, tone: 'anchor' },
] }
const wf = { id: 'btn-wf', title: 'Bridge' }

test('waterfall without a host api: its own settings, the format button in edit mode', () => {
  assert.match(renderToString(h(WaterfallView, { spec: wf, bridge, width: 480 })), BTN, 'with its header')
  const bare = renderToString(h(WaterfallView, { spec: wf, bridge, width: 480, bare: true }))
  assert.match(bare, /chart-engine-float-menu/, 'bare: in the plot corner')
  assert.match(bare, BTN)
  assert.doesNotMatch(renderToString(h(WaterfallView, { spec: wf, bridge, width: 480, bare: true, floatMenu: false })), BTN, 'floatMenu: false hides it')
  assert.doesNotMatch(renderToString(h(WaterfallView, { spec: wf, bridge, width: 480, readOnly: true })), BTN, 'read-only: none')
  assert.doesNotMatch(renderToString(h(WaterfallView, { spec: wf, bridge, width: 480, readOnly: true, applyPrefs: true })), BTN)
})

test('cartesian chart: the format button with a header, and bare', () => {
  const spec = { id: 'btn-c', title: 'Sales', x: { grain: 'year' }, series: [{ id: 'a', mark: 'bar' }] }
  const resolved = [{ label: 'A', unit: 'M', points: [{ x: '2024', y: 1, type: 'actual' }, { x: '2025', y: 2, type: 'actual' }] }]
  assert.match(renderToString(h(ChartView, { spec, resolved, width: 480 })), BTN)
  assert.match(renderToString(h(ChartView, { spec, resolved, width: 480, bare: true })), BTN)
  assert.doesNotMatch(renderToString(h(ChartView, { spec, resolved, width: 480, readOnly: true })), BTN)
})
