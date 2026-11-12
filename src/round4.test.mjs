// A step's value label keeps its margin around a net-line stroke (budget),
// without jumping over a stroke that does not touch it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWaterfallScene } from './waterfallScene.js'

const spec = { id: 'x', version: 1, kind: 'waterfall', netLines: ['budget'] }
const bridge = budgetPrice => ({ unit: 'M', steps: [
  { key: 'ly', label: 'Last year', value: 30, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', value: 30 }, { key: 'budget', label: 'Budget', value: 30 }] },
  { key: 'price', label: 'Price', value: 4, kind: 'delta', tone: 'positive', parts: [{ key: 'actual', value: 4 }, { key: 'budget', label: 'Budget', value: budgetPrice }] },
  { key: 'ty', label: 'This year', value: 34, kind: 'anchor', tone: 'anchor', parts: [{ key: 'actual', value: 34 }, { key: 'budget', label: 'Budget', value: 33 }] },
] })
const O = { width: 520, height: 240 }
const at = (sc, key) => ({ lab: sc.labels.find(l => l.key === key), net: sc.netLines.find(n => n.stepKey === key), bar: sc.bars.find(b => b.key === key) })

test('budget stroke just above the top: the label moves above it, with at least 5 px clearance', () => {
  for (const b of [4.05, 4.2, 4.5, 5]) {
    const { lab, net } = at(buildWaterfallScene(spec, bridge(b), O), 'price')
    assert.ok(net.y < at(buildWaterfallScene(spec, bridge(b), O), 'price').bar.y, `budget ${b} above the bar`)
    // Label box: baseline + 2; stroke: 2.5 px thick.
    const gap = (net.y - 1.25) - lab.y
    const over = (lab.y - lab.size) - (net.y + 1.25)
    assert.ok(gap >= 5 || over >= 4, `budget ${b}: gap ${gap.toFixed(1)} / ${over.toFixed(1)}`)
  }
})

test('budget stroke inside the bar, near the top: the label stays above the bar', () => {
  const { lab, net, bar } = at(buildWaterfallScene(spec, bridge(3), O), 'price')
  assert.ok(net.y > bar.y)
  assert.equal(lab.y, bar.y - 5)
})

test('budget stroke far above: the label does not jump', () => {
  const { lab, net, bar } = at(buildWaterfallScene(spec, bridge(14), O), 'price')
  assert.ok(net.y < bar.y - 20, `${net.y} ${bar.y}`)
  assert.equal(lab.y, bar.y - 5)
})
