import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBridgeEdits, canHide } from './bridgeEdits.js'
import { bridgeLevels, buildWaterfallScene } from './waterfallScene.js'

const bridge = { unit: 'M', steps: [
  { key: 'cost', label: 'Cost', value: 100, kind: 'anchor', tone: 'anchor' },
  { key: 'addOns', label: 'Add-ons', value: 10, kind: 'delta', tone: 'positive' },
  { key: 'margin', label: 'Margin', value: 20, kind: 'delta', tone: 'positive' },
  { key: 'multiple', label: 'Multiple', value: -5, kind: 'delta', tone: 'negative' },
  { key: 'current', label: 'Current', value: 125, kind: 'anchor', tone: 'anchor' },
] }

test('hiding levers groups them into "Other levers": the bridge still closes', () => {
  const b = applyBridgeEdits(bridge, { hiddenSteps: ['addOns', 'multiple'] })
  assert.deepEqual(b.steps.map(s => s.key), ['cost', 'other', 'margin', 'current'])
  const other = b.steps.find(s => s.key === 'other')
  assert.equal(other.value, 5)
  assert.deepEqual(other.members, ['Add-ons', 'Multiple'])
  assert.equal(bridgeLevels(b.steps).at(-2).level, 125, 'lands back on the current value')
})

test('an anchor or an unreconciled gap is never hidden', () => {
  assert.equal(canHide(bridge.steps[0]), false)
  assert.equal(canHide({ kind: 'delta', tone: 'gap' }), false)
  assert.deepEqual(applyBridgeEdits(bridge, { hiddenSteps: ['cost'] }).steps.map(s => s.key), bridge.steps.map(s => s.key))
})

test('subtotal after a lever: the running total reached, computed', () => {
  const b = applyBridgeEdits(bridge, { subtotals: ['margin'] })
  const i = b.steps.findIndex(s => s.key === 'sub:margin')
  assert.equal(b.steps[i - 1].key, 'margin')
  assert.equal(bridgeLevels(b.steps)[i].level, 130)
  const sc = buildWaterfallScene({ labels: 'all' }, b, { width: 700, height: 280 })
  assert.equal(sc.labels.find(l => l.key === 'sub:margin').text, '130')
})

test('colors: per family, then per bar', () => {
  const sc = buildWaterfallScene({ toneColors: { positive: 'cat-2' }, stepColors: { margin: 'gold' } }, bridge, { width: 700, height: 280 })
  assert.equal(sc.bars.find(b => b.key === 'addOns').color, 'cat-2')
  assert.equal(sc.bars.find(b => b.key === 'margin').color, 'gold')
  assert.equal(sc.legend.find(l => l.key === 'positive').color, 'cat-2')
})

test('downward bridge: a movement is subtracted', () => {
  const lv = bridgeLevels([{ key: 'a', kind: 'anchor', value: 100 }, { key: 'b', kind: 'delta', value: 30 }, { key: 'c', kind: 'total', value: 0 }], { down: true })
  assert.equal(lv[2].to, 70)
})
test('start computed backwards from the last anchor', () => {
  const lv = bridgeLevels([{ key: 'a', kind: 'anchor', value: 0 }, { key: 'b', kind: 'delta', value: 30 }, { key: 'c', kind: 'anchor', value: 100 }], { backCalc: true })
  assert.equal(lv[0].to, 70)
})
test('step with several segments of mixed signs', () => {
  const steps = [{ key: 'a', label: 'A', kind: 'anchor', value: 100, tone: 'anchor' },
    { key: 'b', label: 'B', kind: 'delta', value: 10, tone: 'positive', parts: [{ key: 'p', value: 25 }, { key: 'q', value: -15 }] },
    { key: 'c', label: 'C', kind: 'total', value: 0, tone: 'anchor' }]
  const sc = buildWaterfallScene({}, { unit: 'M', steps }, { width: 500, height: 260 })
  assert.equal(sc.bars.filter(b => b.key === 'b').length, 2)
})

test('bridge labels as % of the base ("percent of 100%")', async () => {
  const { buildWaterfallScene } = await import('./waterfallScene.js')
  const bridge = { steps: [
    { key: 'a', label: 'Start', kind: 'anchor', value: 100 },
    { key: 'd', label: 'Up', kind: 'delta', value: 25 },
    { key: 't', label: 'End', kind: 'total', value: 125 },
  ] }
  const sc = buildWaterfallScene({ labelContent: 'pct' }, bridge, { width: 500, height: 260 })
  const texts = sc.labels.map(l => l.text)
  assert.ok(texts.includes('100%') && texts.includes('+25%') && texts.includes('125%'), texts.join(','))
})

test('bridge: a movement hanging below the baseline (force top to baseline)', async () => {
  const { bridgeLevels } = await import('./waterfallScene.js')
  const lv = bridgeLevels([{ key: 'a', kind: 'anchor', value: 100 }, { key: 'd', kind: 'delta', value: 20 }, { key: 't', kind: 'total' }], { toBaselineTop: ['d'] })
  assert.deepEqual([lv[1].from, lv[1].to, lv[2].to], [0, -20, 120])
})
