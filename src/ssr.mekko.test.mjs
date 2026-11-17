// Server rendering: the figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import MekkoFigure from './MekkoFigure.jsx'
import MekkoView from './MekkoView.jsx'
import { buildMekkoScene } from './mekkoScene.js'
import { NBSP } from './locale.js'

const series = [{ id: 'x', label: 'Leader' }, { id: 'y', label: 'Challenger' }, { id: 'z', label: 'Niche' }]
const columns = [
  { key: 'eu', label: 'Europe', values: { x: 50, y: 30, z: 20 } },
  { key: 'us', label: 'Americas', values: { x: 40, y: 40, z: 2 } },
]
const spec = { title: 'Market shares', source: 'Company data', series }

test('MekkoFigure renders a complete SVG on the server', () => {
  const scene = buildMekkoScene(spec, columns, { width: 720, height: 360 })
  const html = renderToString(h(MekkoFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Market shares<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<rect /g) ?? []).length >= 6)
  assert.match(html, /Europe/)
  assert.match(html, /Challenger/)
  assert.match(html, /<\/svg>$/)
})

test('MekkoFigure: responsive and hidden data table', () => {
  const scene = buildMekkoScene({ series }, columns, { width: 400, height: 240 })
  const html = renderToString(h(MekkoFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Leader.*Europe.*<\/table>/)
})

test('MekkoView with a width renders the chart on the server', () => {
  const html = renderToString(h(MekkoView, { id: 'ssr', spec, columns, width: 600, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 320"/)
  assert.doesNotMatch(html, /chart-opts-btn/)
})

test('MekkoView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(MekkoView, { id: 'ssr2', spec, columns, width: 600 }))
  assert.match(html, /<svg[^>]*viewBox/)
  assert.match(html, /chart-opts-btn/)
  assert.match(html, /chart-mekko-other/)
})

test('locale fr: "Other", shares and total in French', () => {
  const sc = buildMekkoScene({ series, locale: 'fr', toOther: ['z'], grandTotal: true }, columns, { width: 600, height: 320 })
  assert.ok(sc.legend.some(l => l.label === 'Autres'))
  assert.ok(sc.segments.some(s => s.label === 'Autres'))
  assert.ok(sc.labels.some(l => l.text === `50${NBSP}%`), sc.labels.map(l => l.text).join('|'))
  assert.ok(sc.axes.y.ticks.some(t => t.label === `100${NBSP}%`))
  assert.match(sc.grandTotal.text, /^Total /)
  assert.equal(sc.meta.figure, 'mekko')
  assert.equal(sc.meta.locale, 'fr')
})

test('single accent: one series (or one segment) in the accent', () => {
  const sc = buildMekkoScene({ series, accent: 'single', emphasis: ['y'] }, columns, { width: 600, height: 320 })
  assert.deepEqual([...new Set(sc.segments.filter(s => s.seriesId === 'y').map(s => s.color))], ['chart-accent'])
  assert.deepEqual([...new Set(sc.segments.filter(s => s.seriesId !== 'y').map(s => s.color))], ['chart-neutral'])
  assert.equal(sc.legend.find(l => l.key === 'y').color, 'chart-accent')
  assert.ok(sc.labels.filter(l => !l.total).every(l => l.color === 'white' || l.color === 'gray-800'))
  const one = buildMekkoScene({ series, accent: 'single', emphasis: ['eu|x'] }, columns, { width: 600, height: 320 })
  assert.deepEqual(one.segments.filter(s => s.color === 'chart-accent').map(s => s.key), ['eu|x'])
  assert.equal(buildMekkoScene({}, [], {}).meta.figure, 'mekko')
})
