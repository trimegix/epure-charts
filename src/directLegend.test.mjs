// format.legend: 'direct' on stacked columns: each series named right of its segment in the
// last column, the names never overlapping, no legend on top.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { estimateWidth } from './scene.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y }))
const resolved = [
  { label: 'Software', unit: 'M', points: pts([['2023', 40], ['2024', 52], ['2025', 61]]) },
  { label: 'Services', unit: 'M', points: pts([['2023', 22], ['2024', 25], ['2025', 31]]) },
  { label: 'Hardware', unit: 'M', points: pts([['2023', 3], ['2024', 2], ['2025', 1.5]]) },
  { label: 'Licences', unit: 'M', points: pts([['2023', 2], ['2024', 2], ['2025', 1]]) },
]
const series = ['sw', 'sv', 'hw', 'li'].map(id => ({ id, mark: 'bar' }))
const spec = legend => ({ id: 'd', bars: 'stacked', x: { grain: 'year', range: 'all' }, series, format: legend ? { legend } : {} })

test("legend 'direct': names right of the last column, at their segment, no legend on top", () => {
  const sc = buildScene(spec('direct'), resolved, { width: 720, height: 360 })
  assert.equal(sc.legend.length, 0, 'no legend on top')
  assert.deepEqual(sc.endLabels.map(e => e.seriesId).sort(), ['hw', 'li', 'sv', 'sw'])
  const last = sc.bars.filter(b => b.key === '2025')
  const right = Math.max(...last.map(b => b.x + b.width))
  for (const e of sc.endLabels) {
    assert.ok(e.x > right, 'right of the last column')
    const b = last.find(x => x.seriesId === e.seriesId)
    // The name sits at its segment unless it had to move to avoid a neighbour.
    if (b.height > 14) assert.ok(Math.abs(e.anchorY - (b.y + b.height / 2)) < 0.5)
  }
  // Never overlapping (two thin segments at the bottom would otherwise collide).
  const ys = sc.endLabels.map(e => e.y).sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 12, `gap ${ys[i] - ys[i - 1]}`)
  for (const e of sc.endLabels) assert.ok(e.x + estimateWidth(e.text, 11) <= 720 + 0.5, 'inside the card')
})

test("'series' stays an alias; without it the legend stays on top", () => {
  const a = buildScene(spec('direct'), resolved, { width: 720, height: 360 })
  const b = buildScene(spec('series'), resolved, { width: 720, height: 360 })
  assert.deepEqual(a.endLabels, b.endLabels)
  const top = buildScene(spec(null), resolved, { width: 720, height: 360 })
  assert.equal(top.legend.length, 4)
  assert.equal(top.endLabels.length, 0)
})
