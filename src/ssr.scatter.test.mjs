// Server rendering: the scatter figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import ScatterFigure from './ScatterFigure.jsx'
import ScatterView from './ScatterView.jsx'
import { buildScatterScene } from './scatterScene.js'

const points = [
  { key: 'a', label: 'Alpha', x: 1.5, y: 2.1, size: 10, group: 'North' },
  { key: 'b', label: 'Beta', x: 2.5, y: 4.3, size: 40, group: 'North' },
  { key: 'c', label: 'Gamma', x: 3.5, y: 5.8, size: 90, group: 'South' },
  { key: 'd', label: 'Delta', x: 4.5, y: 8.2, size: 30, group: 'South' },
]

test('ScatterFigure renders a complete SVG on the server', () => {
  const spec = { title: 'Growth vs margin', source: 'Company data', bubble: true, trend: true, trendLabel: 'both', partitions: { x: 3 }, x: { title: 'Growth' } }
  const scene = buildScatterScene(spec, points, { width: 720, height: 360 })
  const html = renderToString(h(ScatterFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Growth vs margin<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<circle /g) ?? []).length >= 4)
  assert.match(html, /Alpha/)
  assert.match(html, /R² = /)
  assert.match(html, /clipPath id="scatter-clip-/)
  assert.doesNotMatch(html, /chart-engine-knob|chart-engine-clickable/)
  assert.match(html, /<\/svg>$/)
})

test('ScatterFigure: responsive and hidden data table', () => {
  const scene = buildScatterScene({}, points, { width: 400, height: 240 })
  const html = renderToString(h(ScatterFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Gamma.*<\/table>/)
})

test('ScatterView with a width renders the chart on the server', () => {
  const html = renderToString(h(ScatterView, { id: 'ssr', points, width: 600, readOnly: true, spec: { x: { same: true } } }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 320"/)
  assert.match(html, /Beta/)
  assert.doesNotMatch(html, /chart-opts-btn/)
})

test('ScatterView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(ScatterView, { id: 'ssr2', points, width: 600, spec: { partitions: [{ key: 'l', axis: 'line', from: { x: 1, y: 2 }, to: { x: 4, y: 8 } }] } }))
  assert.match(html, /<svg[^>]*viewBox/)
  assert.match(html, /chart-opts-btn/)
  assert.match(html, /chart-engine-knob/)
})

test('locale fr: ticks, labels, trend equation and R²', () => {
  const scene = buildScatterScene({ locale: 'fr', trend: true, trendLabel: 'both', labelContent: ['name', 'x'] }, points, { width: 600, height: 320 })
  assert.equal(scene.meta.locale, 'fr')
  assert.equal(scene.meta.figure, 'scatter')
  assert.ok(scene.axes.x.ticks.some(t => /^\d+,\d+\sM€$/.test(t.label)), scene.axes.x.ticks.map(t => t.label).join('|'))
  assert.ok(scene.labels.some(l => /^Alpha \(1,5\sM€\)$/.test(l.text)), scene.labels.map(l => l.text).join('|'))
  assert.match(scene.trend.label.lines.join(' '), /R² = 0,\d{3}/)
  assert.doesNotMatch(scene.trend.equation, /\d\.\d/)
  // English stays unchanged.
  const en = buildScatterScene({ trend: true, trendLabel: 'r2', labelContent: ['name', 'x'] }, points, { width: 600, height: 320 })
  assert.ok(en.labels.some(l => l.text === 'Alpha (€1.5M)'))
  assert.match(en.trend.label.text, /^R² = 0\.\d{3}$/)
})

test('single accent: by point key or by group', () => {
  const byKey = buildScatterScene({ accent: 'single', emphasis: ['c'] }, points, { width: 600, height: 320 })
  assert.deepEqual(Object.fromEntries(byKey.points.map(p => [p.key, p.color])), { a: 'chart-neutral', b: 'chart-neutral', c: 'chart-accent', d: 'chart-neutral' })
  const byGroup = buildScatterScene({ accent: 'single', emphasis: ['North'] }, points, { width: 600, height: 320 })
  assert.deepEqual(Object.fromEntries(byGroup.points.map(p => [p.key, p.color])), { a: 'chart-accent', b: 'chart-accent', c: 'chart-neutral', d: 'chart-neutral' })
  assert.deepEqual(byGroup.legend.map(l => l.color), ['chart-accent', 'chart-neutral'])
})

test('the empty scene is stamped too', () => {
  const scene = buildScatterScene({ title: 'Nothing' }, [], { width: 400, height: 240 })
  assert.equal(scene.empty, true)
  assert.equal(scene.meta.figure, 'scatter')
  assert.equal(renderToString(h(ScatterFigure, { scene })), '')
})
