// Server rendering: the figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import PieFigure from './PieFigure.jsx'
import PieView from './PieView.jsx'
import { buildPieScene } from './pieScene.js'

const slices = [{ key: 'a', label: 'North', value: 40 }, { key: 'b', label: 'South', value: 35 }, { key: 'c', label: 'West', value: 25 }]

test('PieFigure renders a complete SVG on the server', () => {
  const scene = buildPieScene({ title: 'Sales by region', source: 'Company data' }, slices, { width: 720, height: 360 })
  const html = renderToString(h(PieFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Sales by region<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<path /g) ?? []).length >= 3)
  assert.match(html, /North/)
  assert.match(html, /<\/svg>$/)
})

test('PieFigure: responsive and hidden data table', () => {
  const scene = buildPieScene({}, slices, { width: 400, height: 240 })
  const html = renderToString(h(PieFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*North.*<\/table>/)
})

test('PieView with a width renders the chart on the server', () => {
  const html = renderToString(h(PieView, { id: 'ssr', slices, width: 600, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 280"/)
  assert.doesNotMatch(html, /chart-opts-btn/)
})

test('PieView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(PieView, { id: 'ssr2', slices, width: 600 }))
  assert.match(html, /<svg[^>]*viewBox/)
  assert.match(html, /chart-opts-btn/)
})

test('locale fr and single accent', () => {
  const scene = buildPieScene({ locale: 'fr', accent: 'single', emphasis: ['b'], decimals: 1 }, slices, { width: 600, height: 300 })
  assert.deepEqual(scene.arcs.map(a => a.color), ['chart-neutral', 'chart-accent', 'chart-neutral'])
  assert.ok(scene.labels.some(l => l.text === '35,0 %'), scene.labels.map(l => l.text).join('|'))
  assert.equal(scene.meta.locale, 'fr')
})
