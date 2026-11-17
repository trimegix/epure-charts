// Server rendering: the figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import BarhFigure from './BarhFigure.jsx'
import BarhView from './BarhView.jsx'
import { buildBarhScene } from './barhScene.js'
import { NBSP } from './locale.js'

const spec = { title: 'Revenue by unit', source: 'Company data', series: [{ id: 'v', label: 'Revenue', color: 'cat-1' }] }
const rows = [{ key: 'a', label: 'North', values: { v: 40 } }, { key: 'b', label: 'South', values: { v: 35 } }, { key: 'c', label: 'West', values: { v: 25 } }]

test('BarhFigure renders a complete SVG on the server', () => {
  const scene = buildBarhScene(spec, rows, { width: 720 })
  const html = renderToString(h(BarhFigure, { scene }))
  assert.match(html, new RegExp(`^<svg[^>]*viewBox="0 0 720 ${scene.height}"`))
  assert.match(html, /<title>Revenue by unit<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<rect /g) ?? []).length >= 6)
  assert.match(html, /North/)
  assert.match(html, /<\/svg>$/)
})

test('BarhFigure: responsive and hidden data table, ranges with a marker', () => {
  const scene = buildBarhScene({ rangeMarker: 'median', rangeMarkerLabel: 'Median' }, [
    { key: 'dcf', label: 'DCF', range: [90, 120], points: [90, 100, 104, 120] },
    { key: 'cmp', label: 'Comparables', points: [80, 95, 110] },
  ], { width: 500 })
  const html = renderToString(h(BarhFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<circle /)
  assert.match(html, /Median €102M/)
  assert.match(html, /<table[^>]*>.*Marker.*DCF.*<\/table>/)
})

test('BarhView with a width renders the chart on the server', () => {
  const html = renderToString(h(BarhView, { id: 'ssr', spec, rows, width: 600, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 /)
  assert.match(html, /North/)
  assert.doesNotMatch(html, /chart-opts-btn/)
})

test('BarhView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(BarhView, { id: 'ssr2', spec, rows, width: 600 }))
  assert.match(html, /<svg[^>]*viewBox/)
  assert.match(html, /chart-opts-btn/)
})

test('locale fr and single accent (rows)', () => {
  const sc = buildBarhScene({ ...spec, locale: 'fr', accent: 'single', emphasis: ['b'] }, rows, { width: 600, format: v => `€${v.toFixed(1)}M` })
  assert.deepEqual(sc.bars.map(b => b.color), ['chart-neutral', 'chart-accent', 'chart-neutral'])
  assert.ok(sc.labels.some(l => l.text === `35,0${NBSP}M€`), sc.labels.map(l => l.text).join('|'))
  assert.equal(sc.meta.figure, 'barh')
  assert.equal(sc.meta.locale, 'fr')
  // 100 % bars: the shares in French punctuation, ink readable on the accent.
  const pc = buildBarhScene({ locale: 'fr', stacked100: true, accent: 'single', emphasis: ['x'], series: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] },
    [{ key: 'r', label: 'R', values: { x: 30, y: 10 } }], { width: 600 })
  assert.ok(pc.labels.some(l => l.text === `75${NBSP}%` && l.color === 'white'), pc.labels.map(l => `${l.text}/${l.color}`).join('|'))
  assert.equal(buildBarhScene({}, [], {}).meta.figure, 'barh')
})
