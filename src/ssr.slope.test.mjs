// Server rendering: the slope figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import SlopeFigure from './SlopeFigure.jsx'
import { buildSlopeScene } from './slopeScene.js'

const items = [
  { key: 'a', label: 'North', before: 10, after: 18 },
  { key: 'b', label: 'South', before: 12, after: 11 },
  { key: 'c', label: 'West', before: 6, after: 9 },
]

test('SlopeFigure renders a complete SVG on the server', () => {
  const scene = buildSlopeScene({ title: 'Margin by region', source: 'Company data', before: '2023', after: '2025', change: true }, items, { width: 720, height: 360 })
  const html = renderToString(h(SlopeFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Margin by region<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.equal((html.match(/<line /g) ?? []).length, 3 + 2)
  assert.match(html, /North/)
  assert.match(html, /2025/)
  assert.match(html, /<tspan[^>]*> {2}\+80%<\/tspan>/)
  assert.match(html, /<\/svg>$/)
})

test('SlopeFigure: responsive, hidden data table, part and children', () => {
  const scene = buildSlopeScene({ change: true }, items, { width: 400, height: 240 })
  const html = renderToString(h(SlopeFigure, { scene, responsive: true, dataTable: true, part: (kind, it) => (kind === 'line' ? { 'data-k': it.key } : null) }, h('g', { id: 'over' })))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Change.*North.*<\/table>/)
  assert.match(html, /data-k="a"/)
  assert.match(html, /<g id="over"><\/g><\/svg>/)
  assert.equal(renderToString(h(SlopeFigure, { scene: buildSlopeScene({}, [], {}) })), '')
})

test('locale fr and single accent', () => {
  const scene = buildSlopeScene({ locale: 'fr', accent: 'single', emphasis: ['c'] }, items, { width: 600, height: 300 })
  const html = renderToString(h(SlopeFigure, { scene }))
  assert.match(html, /Avant/)
  assert.match(html, /North 10</)
  assert.match(html, /var\(--chart-accent/)
  assert.match(html, /var\(--chart-neutral/)
  assert.equal(scene.meta.locale, 'fr')
})
