// Default decimals: two significant digits on every figure, the same static and live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { autoDecimals } from './decimals.js'
import { buildWaterfallScene } from './waterfallScene.js'
import { buildScene } from './scene.js'
import { buildBarhScene } from './barhScene.js'
import { buildPieScene } from './pieScene.js'
import WaterfallChart from './WaterfallChart.jsx'
import BarhView from './BarhView.jsx'
import ChartView from './ChartView.jsx'

const text = html => html.replace(/<[^>]+>/g, '|')

test('autoDecimals: two significant digits, exact figures keep fewer, residues ignored', () => {
  assert.equal(autoDecimals([7.4, 0.6]), 1)
  assert.equal(autoDecimals([78, 22, 14, -6, 9, 117]), 0, '6 stays 6, not 6.0')
  assert.equal(autoDecimals([3.8, 0.03]), 1, 'a residue under 1 % of the largest is ignored')
  assert.equal(autoDecimals([1.234, 0.123]), 2)
  assert.equal(autoDecimals([2.1, 1.4]), 1)
  assert.equal(autoDecimals([0.004]), 2, 'capped at 2')
  assert.equal(autoDecimals([]), 0)
})

const bridge = { unit: 'M', steps: [
  { key: 'a', label: 'Start', kind: 'anchor', value: 7.4, tone: 'anchor' },
  { key: 'b', label: 'Lever', kind: 'delta', value: 0.6, tone: 'positive' },
  { key: 'c', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
] }

test('bridge: a step of 0.6 reads 0.6, static and live alike', () => {
  const spec = { bridge: { id: 'p' }, labels: 'all' }
  const sc = buildWaterfallScene(spec, bridge, { width: 600, height: 300 })
  assert.deepEqual(sc.labels.map(l => l.text), ['7.4', '+0.6', '8.0'])
  const live = text(renderToString(h(WaterfallChart, { spec, bridge, width: 600, readOnly: true, applyPrefs: true })))
  for (const t of ['7.4', '+0.6', '8.0']) assert.ok(live.includes(`|${t}|`), `${t} in ${live}`)
  // A host formatter receives the decimals as its third argument.
  const eur = buildWaterfallScene({ ...spec, locale: 'fr' }, bridge, { width: 600, height: 300, format: (v, u, d) => `${v.toFixed(d)} M€` })
  assert.deepEqual(eur.labels.map(l => l.text.replace(/\s/g, ' ')), ['7,4 M€', '+0,6 M€', '8,0 M€'])
  assert.deepEqual(buildWaterfallScene({ ...spec, numberFormat: { decimals: 0 } }, bridge, { width: 600, height: 300 }).labels.map(l => l.text), ['7', '+1', '8'], 'numberFormat.decimals still wins')
})

test('columns, horizontal bars and pie: the same rule', () => {
  const resolved = [{ label: 'A', unit: 'M', points: [{ x: '2024', y: 7.4 }, { x: '2025', y: 0.6 }] }]
  const spec = { id: 'c', series: [{ id: 'a', mark: 'bar', labels: 'all' }], x: { grain: 'year', range: 'all' } }
  assert.deepEqual(buildScene(spec, resolved, { width: 600, height: 300 }).labels.map(l => l.text), ['7.4', '0.6'])
  const live = text(renderToString(h(ChartView, { spec, resolved, width: 600, height: 300, readOnly: true, applyPrefs: true })))
  assert.ok(live.includes('|0.6|'), live)
  const rows = [{ key: 'a', label: 'Alpha', values: { v: 2.1 } }, { key: 'b', label: 'Beta', values: { v: 1.4 } }]
  const bspec = { series: [{ id: 'v', label: 'MOIC' }], labels: 'end' }
  const bs = buildBarhScene(bspec, rows, { width: 600 })
  assert.deepEqual(bs.labels.map(l => l.text).sort(), ['1.4', '2.1'])
  const bl = text(renderToString(h(BarhView, { spec: bspec, rows, width: 600, readOnly: true, applyPrefs: true })))
  for (const t of bs.axis.ticks.map(x => x.label)) assert.ok(bl.includes(`|${t}|`), `live tick ${t}`)
  const pie = buildPieScene({ content: 'value' }, [{ key: 'a', label: 'A', value: 7.4 }, { key: 'b', label: 'B', value: 2.6 }], { width: 400, height: 300 })
  assert.ok(JSON.stringify(pie).includes('"7.4"') || JSON.stringify(pie).includes('7.4'))
})
