// A bridge whose steps all carry their figure draws neither value axis nor gridlines by default.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWaterfallScene } from './waterfallScene.js'

const bridge = { unit: 'M', steps: [
  { key: 'a', label: 'Start', kind: 'anchor', value: 7.4, tone: 'anchor' },
  { key: 'b', label: 'Lever', kind: 'delta', value: 0.6, tone: 'positive' },
  { key: 'c', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
] }
const O = { width: 600, height: 300 }
const zeroY = sc => sc.axes.left.ticks.find(t => t.value === 0).y

test("labels: 'all' (the default): no tick labels, no gridlines but the zero line", () => {
  for (const spec of [{}, { labels: 'all' }]) {
    const sc = buildWaterfallScene(spec, bridge, O)
    assert.ok(sc.axes.left.ticks.every(t => t.label === ''))
    assert.ok(sc.gridlines.every(g => Math.abs(g.y - zeroY(sc)) < 0.01))
  }
})

test('yAxis.labels / yAxis.grid bring them back; without figures the axis is back', () => {
  const asked = buildWaterfallScene({ yAxis: { labels: true, grid: 'solid' } }, bridge, O)
  assert.ok(asked.axes.left.ticks.some(t => t.label !== '' && t.value !== 0))
  assert.ok(asked.gridlines.length > 1)
  const ticksOnly = buildWaterfallScene({ yAxis: { labels: true } }, bridge, O)
  assert.ok(ticksOnly.axes.left.ticks.some(t => t.label !== '' && t.value !== 0))
  assert.ok(ticksOnly.gridlines.length <= 1, 'gridlines stay off unless asked')
  const noLabels = buildWaterfallScene({ labels: 'none' }, bridge, O)
  assert.ok(noLabels.axes.left.ticks.some(t => t.label !== '' && t.value !== 0))
  assert.ok(noLabels.gridlines.length > 1)
})
