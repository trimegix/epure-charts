// Horizontal bars: extra value columns (spec.columns) right of the bars.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { buildBarhScene } from './barhScene.js'
import BarhFigure from './BarhFigure.jsx'

const rows = [
  { key: 'a', label: 'Alpha', values: { v: 50 }, columns: { n: 12 } },
  { key: 'b', label: 'Beta', values: { v: 30 }, columns: { n: 7 } },
  { key: 'c', label: 'Gamma', values: { v: 20 }, columns: { n: 'n/a' } },
]
const spec = { series: [{ id: 'v', label: 'Revenue' }], sort: 'desc', columns: [{ key: 'share', value: 'share' }, { key: 'cum', value: 'cumShare' }, { key: 'n', label: 'Clients', format: v => `${v} clients` }] }
const cells = (sc, key) => sc.columns.find(c => c.key === key).cells.map(c => c.text)

test('share, cumulated share in the drawn order, and a host value', () => {
  const sc = buildBarhScene(spec, rows, { width: 600 })
  assert.deepEqual(cells(sc, 'share'), ['50%', '30%', '20%'])
  assert.deepEqual(cells(sc, 'cum'), ['50%', '80%', '100%'])
  assert.deepEqual(cells(sc, 'n'), ['12 clients', '7 clients', 'n/a'], 'a string is written as is')
  assert.deepEqual(sc.columns.map(c => c.header.text), ['Share', 'Cumulative share', 'Clients'])
  // The columns sit right of the bars and their figures, each cell on its row.
  const maxBarEnd = Math.max(...sc.bars.map(b => b.x + b.width))
  assert.ok(sc.columns[0].x - 30 > maxBarEnd)
  assert.ok(sc.columns[0].x < sc.columns[1].x && sc.columns[2].x <= 600)
  assert.equal(sc.columns[0].cells[1].y, sc.labels.find(l => l.key === 'b|v').y)
  assert.ok(sc.columns[0].header.y < sc.plot.top)
})

test('French, decimals, drawn, and in the accessible table', () => {
  const sc = buildBarhScene({ ...spec, locale: 'fr', columns: [{ key: 's', value: 'share', decimals: 1 }] }, rows, { width: 600 })
  assert.deepEqual(cells(sc, 's'), ['50,0 %', '30,0 %', '20,0 %'])
  assert.equal(sc.columns[0].header.text, 'Part')
  const html = renderToString(h(BarhFigure, { scene: buildBarhScene(spec, rows, { width: 600 }), dataTable: true }))
  assert.match(html, /chart-engine-columns/)
  assert.match(html, /<th scope="col">Cumulative share<\/th>/)
  assert.match(html, /<td>80%<\/td>/)
})

test('no columns: the scene is unchanged', () => {
  const a = buildBarhScene({ series: spec.series }, rows, { width: 600 })
  assert.deepEqual(a.columns, [])
  assert.equal(a.plot.right, buildBarhScene({ series: spec.series, columns: [] }, rows, { width: 600 }).plot.right)
})
