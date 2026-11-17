// Server rendering: the funnel figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import FunnelFigure from './FunnelFigure.jsx'
import { buildFunnelScene } from './funnelScene.js'

const stages = [
  { key: 'all', label: 'Universe', value: 1250 },
  { key: 'size', label: 'Size screen', value: 180, filter: 'EBITDA > €5M' },
  { key: 'short', label: 'Shortlist', value: 3, filter: 'Strategic fit' },
]

test('FunnelFigure renders a complete SVG on the server', () => {
  const scene = buildFunnelScene({ title: 'Target screening', source: 'Deal team', rates: true }, stages, { width: 720, height: 360 })
  const html = renderToString(h(FunnelFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Target screening<\/title>/)
  assert.match(html, /<desc>Source: Deal team<\/desc>/)
  assert.equal((html.match(/<rect /g) ?? []).length, 3)
  assert.match(html, /Universe/)
  assert.match(html, /1,250/)
  assert.match(html, /Filter: EBITDA &gt; €5M/)
  assert.match(html, /→ 14%/)
  assert.match(html, /<\/svg>$/)
})

test('FunnelFigure: responsive, hidden data table, part and children', () => {
  const scene = buildFunnelScene({ rates: true }, stages, { width: 400, height: 240 })
  const html = renderToString(h(FunnelFigure, { scene, responsive: true, dataTable: true, part: (kind, it) => (kind === 'stage' ? { 'data-k': it.key } : null) }, h('g', { id: 'over' })))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Pass rate.*Universe.*<\/table>/)
  assert.match(html, /data-k="size"/)
  assert.match(html, /<g id="over"><\/g><\/svg>/)
  assert.equal(renderToString(h(FunnelFigure, { scene: buildFunnelScene({}, [], {}) })), '')
})

test('locale fr and single accent', () => {
  const scene = buildFunnelScene({ locale: 'fr', rates: true, accent: 'single', emphasis: ['short'] }, stages, { width: 600, height: 300 })
  const html = renderToString(h(FunnelFigure, { scene }))
  assert.match(html, /1\u202f250/)
  assert.match(html, /14\u00a0%/)
  assert.match(html, /var\(--chart-accent/)
  assert.match(html, /var\(--chart-neutral/)
  assert.equal(scene.meta.locale, 'fr')
})
