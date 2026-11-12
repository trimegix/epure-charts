// Adjustable value axis on the waterfall and horizontal bars (min, max, step, tick labels, format).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWaterfallScene } from './waterfallScene.js'
import { buildBarhScene } from './barhScene.js'

const fmt = v => String(Math.round(v))
const B = {
  unit: 'M',
  steps: [
    { key: 'start', label: 'Start', kind: 'anchor', value: 100, tone: 'anchor' },
    { key: 'a', label: 'A', kind: 'delta', value: 20, tone: 'positive' },
    { key: 'end', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
  ],
}

test('waterfall: set min, max and step give the exact ticks', () => {
  const sc = buildWaterfallScene({ yAxis: { min: 0, max: 150, step: 50 } }, B, { width: 600, height: 280, format: fmt })
  assert.deepEqual(sc.axes.left.ticks.map(t => t.value), [0, 50, 100, 150])
})

test('waterfall: a max below the data clips the bar inside the plot', () => {
  const sc = buildWaterfallScene({ yAxis: { max: 60 } }, B, { width: 600, height: 280, format: fmt })
  for (const b of sc.bars) assert.ok(b.y >= sc.plot.top - 1, `${b.key} stays inside the plot`)
})

test('waterfall: hidden tick labels, gridlines removed (zero stays), axis format', () => {
  const off = buildWaterfallScene({ yAxis: { labels: false, grid: 'none' } }, B, { width: 600, height: 280, format: fmt })
  assert.ok(off.axes.left.ticks.every(t => t.label === ''))
  assert.ok(off.gridlines.length <= 1)
  const own = buildWaterfallScene({}, B, { width: 600, height: 280, format: fmt, axisFormat: v => `${v}u` })
  assert.ok(own.axes.left.ticks.filter(t => t.value !== 0).every(t => t.label.endsWith('u')))
})

test('horizontal bars: set scale (min, max, step)', () => {
  const sc = buildBarhScene({ series: [{ id: 'v', label: 'V', color: 'green' }], scale: { min: 0, max: 20, step: 5 } },
    [{ key: 'a', label: 'A', values: { v: 5 } }, { key: 'b', label: 'B', values: { v: 12 } }], { width: 600, format: fmt })
  assert.deepEqual(sc.axis.ticks.map(t => t.value), [0, 5, 10, 15, 20])
  const b = sc.bars.find(x => x.key === 'b')
  assert.ok(Math.abs(b.x + b.width - (sc.plot.left + sc.plot.width * 12 / 20)) < 1)
})
