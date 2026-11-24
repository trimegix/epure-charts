// The live bridge reads the spec the static one reads: one validation, version and kind filled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import WaterfallView from './WaterfallView.jsx'
import WaterfallChart from './WaterfallChart.jsx'
import { buildWaterfallScene } from './waterfallScene.js'
import { validateBridgeSpec, withBridgeDefaults } from './spec.js'

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

test('the reported repro: WaterfallChart with { bridge, labels, locale } and its data', () => {
  const spec = { bridge: { id: 'p' }, labels: 'all', locale: 'fr' }
  const html = renderToString(h(WaterfallChart, { spec, bridge, width: 600, readOnly: true, applyPrefs: true }))
  assert.doesNotMatch(html, /invalid|version: must be|x: required object|series: required array/)
  assert.match(html, /<svg/)
  assert.deepEqual(buildWaterfallScene(spec, bridge, { width: 600, height: 300 }).errors, [])
  assert.deepEqual(withBridgeDefaults(spec), { version: 1, kind: 'waterfall', ...spec })
  const full = { id: 'x', version: 1, kind: 'waterfall' }
  assert.equal(withBridgeDefaults(full), full, 'a complete spec is returned unchanged')
})
