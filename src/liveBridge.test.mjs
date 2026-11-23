// The live bridge reads the spec the static one reads: one validation, same default decimals.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import WaterfallView from './WaterfallView.jsx'
import { buildWaterfallScene, autoDecimals } from './waterfallScene.js'
import { validateBridgeSpec } from './spec.js'

const steps = (...vs) => ({ unit: 'M', steps: vs.map((value, i) => ({ key: `s${i}`, label: `S${i}`, kind: i === 0 ? 'anchor' : 'delta', value, tone: i === 0 ? 'anchor' : value >= 0 ? 'positive' : 'negative' })) })
const bridge = { unit: 'M', steps: [
  { key: 'a', label: 'Start', kind: 'anchor', value: 7.4, tone: 'anchor' },
  { key: 'b', label: 'Lever', kind: 'delta', value: 0.6, tone: 'positive' },
  { key: 'c', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
] }

test('a minimal bridge spec with its data: valid, live and static alike', () => {
  const spec = { id: 'b', labels: 'all' }
  assert.deepEqual(validateBridgeSpec(spec, { bridge }), [])
  assert.deepEqual(buildWaterfallScene(spec, bridge, { width: 600, height: 300 }).errors, [])
  const html = renderToString(h(WaterfallView, { spec, bridge, width: 600 }))
  assert.doesNotMatch(html, /chart definition is invalid/)
  assert.doesNotMatch(html, /x: required object|series: required array/)
})

test('bridge messages speak of a bridge', () => {
  assert.deepEqual(validateBridgeSpec({ id: 'b', kind: 'cartesian' }), ["kind: a bridge is kind 'waterfall', not 'cartesian'"])
  assert.match(validateBridgeSpec({ id: 'b' }).join(' '), /pass the bridge's data/)
  assert.match(validateBridgeSpec({ id: 'b', labels: 'some' }, { bridge }).join(' '), /labels: one of none, all/)
  assert.ok(buildWaterfallScene({ labels: 'some' }, bridge, { width: 600, height: 300 }).errors.length, 'the static entry says it too')
})

test('default decimals: no figure written more than 5 % off', () => {
  assert.equal(autoDecimals(steps(7.4, 0.6)), 1)
  assert.equal(autoDecimals(steps(100, 10, -5, 20)), 0)
  assert.equal(autoDecimals(steps(3.8, 0.03)), 1, 'a residue under 1 % of the largest is ignored')
  assert.equal(autoDecimals(steps(1.234, 0.123)), 2)
  const sc = buildWaterfallScene({ labels: 'all' }, bridge, { width: 600, height: 300 })
  assert.deepEqual(sc.labels.map(l => l.text), ['7.4', '+0.6', '8.0'])
  assert.deepEqual(buildWaterfallScene({ labels: 'all', numberFormat: { decimals: 0 } }, bridge, { width: 600, height: 300 }).labels.map(l => l.text), ['7', '+1', '8'], 'numberFormat.decimals still wins')
})

test('labels on every bar: no value axis nor gridlines by default (zero stays)', () => {
  const sc = buildWaterfallScene({}, bridge, { width: 600, height: 300 })
  assert.ok(sc.axes.left.ticks.every(t => t.label === ''))
  assert.ok(sc.gridlines.every(g => Math.abs(g.y - sc.axes.left.ticks.find(t => t.value === 0).y) < 0.01))
  const asked = buildWaterfallScene({ yAxis: { labels: true, grid: 'solid' } }, bridge, { width: 600, height: 300 })
  assert.ok(asked.axes.left.ticks.some(t => t.label !== '' && t.value !== 0))
  assert.ok(asked.gridlines.length > 1)
  const noLabels = buildWaterfallScene({ labels: 'none' }, bridge, { width: 600, height: 300 })
  assert.ok(noLabels.axes.left.ticks.some(t => t.label !== '' && t.value !== 0), 'without figures, the axis is back')
})
