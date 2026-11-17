import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sharedDomain, smallMultiples } from './smallMultiples.js'
import { buildScene } from './scene.js'
import { buildBarhScene } from './barhScene.js'
import { buildSlopeScene } from './slopeScene.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pts(pairs) })
const cart = { id: 't', version: 1, kind: 'cartesian', x: { grain: 'quarter', range: 'all' }, series: [{ id: 'a', mark: 'bar' }] }

test('sharedDomain: numbers, arrays, nested arrays; zero and rounding', () => {
  assert.deepEqual(sharedDomain([1, [5, -2], [[9]], null, NaN], v => v), [-2, 9])
  assert.deepEqual(sharedDomain([{ v: [3, 7] }, { v: [4, 12] }], o => o.v, { zero: true }), [0, 12])
  assert.deepEqual(sharedDomain([3, 97], v => v, { nice: 5 }), [0, 100])
  assert.equal(sharedDomain([], v => v), null)
})

test('cartesian panels share the value axis', () => {
  const panels = [
    { key: 'p1', spec: cart, data: [res('A', [['2023-Q1', 10], ['2023-Q2', 20]])] },
    { key: 'p2', spec: cart, data: [res('A', [['2023-Q1', 80], ['2023-Q2', 140]])] },
    { key: 'p3', spec: cart, data: [res('A', [['2023-Q1', 5], ['2023-Q2', 7]])] },
  ]
  const grid = smallMultiples(buildScene, panels, { width: 900, height: 300, columns: 3, gap: 12 })
  assert.equal(grid.cells.length, 3)
  assert.equal(grid.rows, 1)
  assert.deepEqual(grid.cells.map(c => [c.x, c.y, c.w, c.h]), [[0, 0, 292, 300], [304, 0, 292, 300], [608, 0, 292, 300]])
  const doms = grid.cells.map(c => c.scene.axes.left.domain)
  assert.ok(doms.every(d => d[0] === doms[0][0] && d[1] === doms[0][1]), JSON.stringify(doms))
  assert.equal(doms[0][0], 0)
  assert.ok(doms[0][1] >= 140)
  // A value of 10 has the same height in every panel.
  const perUnit = c => { const b = c.scene.bars.find(b2 => b2.key === '2023-Q1'); return b.height / b.value }
  const ks = grid.cells.map(perUnit)
  assert.ok(ks.every(k => Math.abs(k - ks[0]) < 1e-6), JSON.stringify(ks))
  // Without "same": each panel keeps its own axis.
  const free = smallMultiples(buildScene, panels, { width: 900, height: 300, columns: 3, same: 'none' })
  assert.notDeepEqual(free.cells[0].scene.axes.left.domain, free.cells[1].scene.axes.left.domain)
})

test('horizontal bars share the value axis (spec.scale)', () => {
  const sp = { series: [{ id: 'v', label: 'V', color: 'gray-700' }] }
  const rows = vals => vals.map((v, i) => ({ key: `r${i}`, label: `Row ${i}`, values: { v } }))
  const panels = [{ spec: sp, data: rows([5, 12]) }, { spec: sp, data: rows([40, 8, 33]) }, { spec: sp, data: rows([-6, 2]) }]
  const grid = smallMultiples(buildBarhScene, panels, { width: 960, columns: 2 })
  assert.equal(grid.rows, 2)
  assert.deepEqual(grid.domains.value, [-10, 40])
  for (const c of grid.cells) {
    const ticks = c.scene.axis.ticks.map(t => t.value)
    assert.equal(Math.min(...ticks), -10)
    assert.equal(Math.max(...ticks), 40)
  }
  // The same value spans the same share of each plot.
  const share = (c, key) => { const b = c.scene.bars.find(x => x.key === key); return b.width / c.scene.plot.width }
  assert.ok(Math.abs(share(grid.cells[0], 'r0') / 5 - share(grid.cells[1], 'r1') / 8) < 1e-9)
})

test('slope panels and an explicit adapter', () => {
  const a = [{ key: 'x', label: 'X', before: 1, after: 3 }]
  const b = [{ key: 'x', label: 'X', before: 10, after: 2 }]
  const grid = smallMultiples(buildSlopeScene, [{ spec: {}, data: a }, { spec: {}, data: b }], { width: 600, height: 240, columns: 2 })
  assert.deepEqual(grid.cells.map(c => c.scene.domain), [[1, 10], [1, 10]])
  const calls = []
  const custom = { domains: sc => ({ v: sc.domain }), force: (spec, key, d) => { calls.push(key); return { ...spec, scale: { min: d[0] - 1, max: d[1] + 1 } } } }
  const g2 = smallMultiples(buildSlopeScene, [{ spec: {}, data: a }, { spec: {}, data: b }], { width: 600, scale: custom })
  assert.deepEqual(calls, ['v', 'v'])
  assert.deepEqual(g2.cells[0].scene.domain, [0, 11])
  assert.ok(g2.height > 0)
  assert.deepEqual(smallMultiples(buildSlopeScene, [], { width: 300 }).cells, [])
})
