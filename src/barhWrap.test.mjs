// Horizontal bars: a long row label wraps onto two lines before it is shortened, the rows grow.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { buildBarhScene } from './barhScene.js'
import { estimateWidth } from './scene.js'
import BarhFigure from './BarhFigure.jsx'

const rows = [
  { key: 'a', label: 'Business services and logistics', values: { v: 42 } },
  { key: 'b', label: 'Retail', values: { v: 30 } },
]
const spec = { series: [{ id: 'v', label: 'Value' }], labels: 'end' }

test('mobile width: two lines, no ellipsis, taller rows', () => {
  const wide = buildBarhScene(spec, rows, { width: 900 })
  assert.equal(wide.rows[0].lines, undefined, 'room enough: one line')
  const sc = buildBarhScene(spec, rows, { width: 360 })
  const r = sc.rows[0]
  assert.equal(r.lines.length, 2)
  assert.ok(!r.lines.join(' ').includes('…'), r.lines.join(' | '))
  assert.equal(r.lines.join(' '), r.full)
  const gutter = sc.plot.left
  for (const l of r.lines) assert.ok(estimateWidth(l, 11) <= gutter, `${l} fits the gutter`)
  assert.ok(r.y1 - r.y0 >= 36, 'the row holds two lines')
  assert.equal(sc.rows[1].lines, undefined, 'a short label stays on one line')
  const html = renderToString(h(BarhFigure, { scene: sc }))
  assert.equal((html.match(/<tspan/g) ?? []).length, 2)
})

test('longer than two lines: the second line is shortened', () => {
  const long = [{ key: 'a', label: 'Industrial automation, robotics, machine vision and factory software', values: { v: 42 } }]
  const r = buildBarhScene(spec, long, { width: 360 }).rows[0]
  assert.equal(r.lines.length, 2)
  assert.match(r.lines[1], /…$/)
})
