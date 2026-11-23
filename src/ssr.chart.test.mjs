// Server rendering: the cartesian figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import ChartFigure from './ChartFigure.jsx'
import ChartView from './ChartView.jsx'
import { buildScene, buildProfileScene } from './scene.js'
import { withDefaults } from './defaults.js'

const pts = (pairs, type = 'actual') => pairs.map(([x, y]) => ({ x, y, type }))
const res = (label, pairs, extra = {}) => ({ label, unit: 'M', nature: 'flow', role: 'actual', points: pts(pairs), ...extra })
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'sales', source: 'actual' }, mark, ...extra })
const specOf = (series, extra = {}) => ({ id: 'ssr', version: 1, kind: 'cartesian', scope: 'shared', x: { grain: 'year', range: 'all' }, series, ...extra })

const series = [S('north', 'bar', { labels: 'all' }), S('south', 'bar', { labels: 'all' }), S('plan', 'line', { labels: 'last' })]
const resolved = [
  res('North', [['2022', 40.5], ['2023', 52.25], ['2024', 61]]),
  res('South', [['2022', 22], ['2023', 25.5], ['2024', 31]]),
  res('Plan', [['2022', 60], ['2023', 75], ['2024', 95]], { role: 'plan' }),
]
const spec = specOf(series, { title: 'Sales by region', source: 'Company data', bars: 'stacked', annotations: [{ type: 'cagr', series: 'north' }] })

test('ChartFigure renders a complete SVG on the server', () => {
  const scene = buildScene(withDefaults(spec, resolved), resolved, { width: 720, height: 360 })
  assert.equal(scene.meta.figure, 'chart')
  const html = renderToString(h(ChartFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Sales by region<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<rect /g) ?? []).length >= 6, 'the bars')
  assert.match(html, /North/)
  assert.match(html, /CAGR \+/)
  assert.match(html, /clipPath id="chart-[a-z0-9]+-clip"/)
  // Semantic role tokens keep their palette fallback.
  assert.match(html, /var\(--chart-plan, var\(--gold\)\)/)
  assert.doesNotMatch(html, /chart-engine-clickable|chart-engine-handle/)
  assert.match(html, /<\/svg>$/)
})

test('ChartFigure: responsive, hidden data table, stable scope', () => {
  const scene = buildScene(withDefaults(spec, resolved), resolved, { width: 480, height: 260 })
  const html = renderToString(h(ChartFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*North.*South.*<\/table>/)
  assert.equal(renderToString(h(ChartFigure, { scene })), renderToString(h(ChartFigure, { scene })))
})

test('ChartFigure draws the profile scene', () => {
  const lines = [S('a', 'line', { labels: 'all' }), S('b', 'line')]
  const r = [res('Alpha', [['2022', 1], ['2023', 3]]), res('Beta', [['2022', 2], ['2023', 2.5]])]
  const scene = buildProfileScene(specOf(lines, { title: 'Profile' }), r, { width: 500, height: 300 })
  assert.equal(scene.meta.figure, 'chart')
  assert.equal(scene.meta.variant, 'profile')
  const html = renderToString(h(ChartFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 500 300"/)
  assert.match(html, /Alpha/)
  assert.match(html, /<\/svg>$/)
})

test('ChartView with a width renders the chart on the server (read-only)', () => {
  const html = renderToString(h(ChartView, { spec, resolved, width: 600, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 240"/)
  assert.match(html, /North/)
  assert.doesNotMatch(html, /chart-opts-btn|chart-engine-clickable/)
})

test('ChartView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(ChartView, { spec, resolved, width: 600 }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 240"/)
  assert.match(html, /chart-engine-clickable/)
  assert.match(html, /chart-opts-btn/)
})

test('locale fr: numbers, CAGR and engine words', () => {
  const s = withDefaults({ ...spec, locale: 'fr', numberFormat: { decimals: 1 }, format: { grandTotal: true } }, resolved)
  const scene = buildScene(s, resolved, { width: 720, height: 360 })
  assert.equal(scene.meta.locale, 'fr')
  const texts = scene.labels.map(l => l.text)
  assert.ok(texts.includes('52,3') || texts.includes('52,2'), texts.join('|'))
  assert.ok(texts.some(t => /^Total /.test(t)), texts.join('|'))
  assert.ok(scene.axes.left.ticks.some(t => /^\d+$/.test(t.label)) && !scene.axes.left.ticks.some(t => /€/.test(t.label)), scene.axes.left.ticks.map(t => t.label).join('|'))
  const cagr = scene.annotations.find(a => a.type === 'cagr')
  assert.match(cagr.text, /^TCAM \+\d+,\d\u00a0%$/)
  // 'Other' series (small segments grouped) in French.
  const three = [S('a', 'bar'), S('b', 'bar'), S('c', 'bar')]
  const r3 = [res('A', [['2024', 80]]), res('B', [['2024', 10]]), res('C', [['2024', 10]])]
  const other = buildScene(withDefaults(specOf(three, { locale: 'fr', bars: 'stacked', format: { otherBelow: 20 } }), r3), r3, { width: 720, height: 360 })
  assert.ok(other.legend.some(it => it.label === 'Autres'), other.legend.map(it => it.label).join('|'))
})

test('single accent: the emphasized series in the accent, the rest neutral', () => {
  const s = withDefaults({ ...spec, accent: 'single', emphasis: ['south'], annotations: [] }, resolved)
  const scene = buildScene(s, resolved, { width: 720, height: 360 })
  assert.ok(scene.bars.filter(b => b.seriesId === 'south').every(b => b.color === 'chart-accent'))
  assert.ok(scene.bars.filter(b => b.seriesId === 'north').every(b => b.color === 'chart-neutral'))
  assert.equal(scene.lines[0].color, 'chart-neutral')
  // Text in a neutral series reads in the neutral ink, not the pale fill.
  assert.ok(scene.labels.filter(l => l.key.startsWith('plan|')).every(l => l.color === 'chart-neutral-ink'))
  // A number inside a neutral segment: dark ink; inside the accent: white.
  const inside = scene.labels.filter(l => l.on)
  assert.ok(inside.filter(l => l.on === 'chart-neutral').every(l => l.color === 'gray-800'))
  assert.ok(inside.filter(l => l.on === 'chart-accent').every(l => l.color === 'white'))
  const html = renderToString(h(ChartFigure, { scene }))
  assert.match(html, /var\(--chart-accent, var\(--gold\)\)/)
})

test('default rendering: role tokens, unchanged meaning', () => {
  const scene = buildScene(withDefaults(specOf([S('a', 'bar')]), [res('A', [['2023', 10]])]), [res('A', [['2023', 10]])], { width: 400, height: 240 })
  assert.equal(scene.bars[0].color, 'chart-actual')
  assert.equal(scene.meta.locale, 'en')
})
