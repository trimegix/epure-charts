// Server rendering: the table figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import TableFigure from './TableFigure.jsx'
import TableView from './TableView.jsx'
import { buildTableScene } from './tableScene.js'

const columns = [
  { key: 'rev', label: 'Revenue', type: 'number' },
  { key: 'fit', label: 'Fit', type: 'harvey' },
  { key: 'ok', label: 'Approved', type: 'check' },
  { key: 'trend', label: 'Trend', type: 'icon' },
]
const rows = [
  { key: 'a', label: 'North', cells: { rev: 1234.5, fit: 0.75, ok: true, trend: 'up' } },
  { key: 'b', label: 'South', cells: { rev: 980, fit: 0.25, ok: false, trend: 'down' } },
]

test('TableFigure renders a complete SVG on the server', () => {
  const scene = buildTableScene({ title: 'Regions', source: 'Company data' }, columns, rows, { width: 718 })
  const html = renderToString(h(TableFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 86"/)
  assert.match(html, /^<svg[^>]*role="table"/)
  assert.match(html, /<title>Regions<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.match(html, /North/)
  assert.match(html, /Revenue/)
  assert.match(html, /1,234\.5/)
  assert.ok((html.match(/role="cell"/g) ?? []).length >= 10)
  assert.match(html, /<\/svg>$/)
  assert.equal(scene.meta.figure, 'table')
})

test('TableFigure: responsive and hidden data table', () => {
  const scene = buildTableScene({}, columns, rows, { width: 600 })
  const html = renderToString(h(TableFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*<th scope="col">Revenue<\/th>.*<th scope="row">North<\/th>.*75%.*<\/table>/)
})

test('empty scene is stamped and draws nothing', () => {
  const scene = buildTableScene({}, [], [], { width: 600 })
  assert.equal(scene.meta.figure, 'table')
  assert.equal(renderToString(h(TableFigure, { scene })), '')
})

test('TableView with a width renders the table on the server', () => {
  const html = renderToString(h(TableView, { id: 'ssr', columns, rows, width: 600, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 /)
  assert.match(html, /North/)
  assert.doesNotMatch(html, /chart-opts-btn/)
  assert.doesNotMatch(html, /chart-engine-clickable/)
})

test('TableView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(TableView, { id: 'ssr2', columns, rows, width: 600 }))
  assert.match(html, /<svg[^>]*viewBox/)
  assert.match(html, /chart-opts-btn/)
  assert.match(html, /chart-engine-clickable chart-table__cell/)
  assert.match(html, /chart-table__resize/)
})

test('locale fr: cell numbers and totals', () => {
  const scene = buildTableScene({ locale: 'fr', totals: true }, columns, rows, { width: 600 })
  const texts = scene.cells.map(c => c.text).filter(Boolean)
  assert.ok(texts.includes('1\u202f234,5'), texts.join('|'))
  assert.ok(texts.includes('2\u202f214,5'), texts.join('|'))
  assert.equal(scene.rows.find(r => r.kind === 'total').label, 'Total')
  assert.equal(scene.meta.locale, 'fr')
  const en = buildTableScene({ totals: true }, columns, rows, { width: 600 })
  assert.ok(en.cells.some(c => c.text === '2,214.5'))
})

test('single accent: emphasized rows take the accent on their marks', () => {
  const scene = buildTableScene({ accent: 'single', emphasis: ['b'] }, columns, rows, { width: 600 })
  const at = (r, c) => scene.cells.find(x => x.row === r && x.col === c)
  assert.equal(at('b', 'fit').color, 'chart-accent')
  assert.equal(at('b', 'ok').color, 'chart-accent')
  assert.equal(at('b', 'trend').icon.color, 'chart-accent')
  assert.equal(at('a', 'fit').color, 'chart-neutral')
  assert.equal(at('a', 'trend').icon.color, 'chart-neutral')
  // Text keeps its ink; the emphasized row stays bold.
  assert.equal(at('b', 'rev').color, undefined)
  assert.ok(scene.rows.find(r => r.key === 'b').bold)
  const html = renderToString(h(TableFigure, { scene }))
  assert.match(html, /var\(--chart-accent, var\(--gold\)\)/)
})
