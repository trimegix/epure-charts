// Waterfall: dragged connectors and the data table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bridgeLevels, buildWaterfallScene } from './waterfallScene.js'

const fmt = v => String(Math.round(v))
const B = {
  unit: 'M',
  steps: [
    { key: 'start', label: 'Start', kind: 'anchor', value: 100, tone: 'anchor' },
    { key: 'a', label: 'A', kind: 'delta', value: 20, tone: 'positive' },
    { key: 'b', label: 'B', kind: 'delta', value: -10, tone: 'negative' },
    { key: 'c', label: 'C', kind: 'delta', value: 5, tone: 'positive' },
    { key: 'end', label: 'End', kind: 'total', value: 0, tone: 'anchor' },
  ],
}

test('a linked step restarts from the source column level, the total follows', () => {
  const plain = bridgeLevels(B.steps)
  assert.equal(plain.at(-1).to, 115)
  const linked = bridgeLevels(B.steps, { links: { c: 'start' } })
  assert.deepEqual([linked[3].from, linked[3].to], [100, 105])
  assert.equal(linked.at(-1).to, 105)
})
test('a dragged connector starts from the source; a neighbour or forward link is ignored', () => {
  const sc = buildWaterfallScene({ links: { c: 'start' } }, B, { width: 600, height: 280, format: fmt })
  const c = sc.connectors.find(k => k.to === 'c')
  assert.equal(c.from, 'start')
  assert.equal(c.linked, true)
  assert.ok(!sc.connectors.some(k => k.from === 'b' && k.to === 'c'))
  const bad = buildWaterfallScene({ links: { c: 'b', a: 'end' } }, B, { width: 600, height: 280, format: fmt })
  assert.deepEqual(bad.links, {})
})
test('data table: values move below the axis, one cell per column', () => {
  const sc = buildWaterfallScene({ table: 'running' }, B, { width: 600, height: 280, format: fmt })
  assert.equal(sc.labels.length, 0)
  assert.deepEqual(sc.table.heads.map(h => h.text), ['Value', 'Running total'])
  assert.equal(sc.table.rows.filter(r => r.row === 'value').length, 5)
  assert.equal(sc.table.rows.find(r => r.key === 'running|c').full, '115')
  assert.ok(sc.table.top > sc.plot.bottom)
  const off = buildWaterfallScene({}, B, { width: 600, height: 280, format: fmt })
  assert.ok(off.labels.length > 0 && !off.table)
})

test('an anchor typed off the running total gets a bent connector', () => {
  const S = { unit: 'M', steps: [...B.steps.slice(0, 4), { key: 'cur', label: 'Current', kind: 'anchor', value: 120, tone: 'anchor' }] }
  const sc = buildWaterfallScene({}, S, { width: 600, height: 280, format: fmt })
  const c = sc.connectors.find(k => k.to === 'cur')
  assert.equal(c.distorted, true)
  assert.equal(c.gap, 5)
  assert.ok(c.y2 < c.y)
  const ok = buildWaterfallScene({}, { unit: 'M', steps: [...B.steps.slice(0, 4), { key: 'cur', label: 'Current', kind: 'anchor', value: 115, tone: 'anchor' }] }, { width: 600, height: 280, format: fmt })
  assert.ok(!ok.connectors.some(k => k.distorted))
})
test('value line on a waterfall: the start by default, or a set value', () => {
  const sc = buildWaterfallScene({ valueLine: true }, B, { width: 600, height: 280, format: fmt })
  assert.equal(sc.valueLine.value, 100)
  assert.ok(Math.abs(sc.yInvert(sc.valueLine.y) - 100) < 1e-6)
  const sc2 = buildWaterfallScene({ valueLine: 110 }, B, { width: 600, height: 280, format: fmt })
  assert.equal(sc2.valueLine.auto, false)
  assert.ok(sc2.valueLine.y < sc.valueLine.y)
})
