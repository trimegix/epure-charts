// Server rendering: the waterfall figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import WaterfallFigure from './WaterfallFigure.jsx'
import WaterfallView from './WaterfallView.jsx'
import WaterfallChart from './WaterfallChart.jsx'
import { buildWaterfallScene } from './waterfallScene.js'

const bridge = {
  unit: 'M',
  steps: [
    { key: 'start', label: 'Entry value', kind: 'anchor', value: 200, tone: 'anchor' },
    { key: 'growth', label: 'Revenue growth', kind: 'delta', value: 40, tone: 'positive' },
    { key: 'margin', label: 'Margin', kind: 'delta', value: 1250.5, tone: 'positive' },
    { key: 'debt', label: 'Net debt', kind: 'delta', value: -26, tone: 'negative' },
    { key: 'end', label: 'Exit value', kind: 'total', value: 0, tone: 'anchor' },
  ],
}
const small = { unit: 'M', steps: [bridge.steps[0], bridge.steps[1], { ...bridge.steps[3] }, bridge.steps[4]] }
const spec = { id: 'ssr-wf', title: 'Value bridge', source: 'Company data' }

test('WaterfallFigure renders a complete SVG on the server', () => {
  const scene = buildWaterfallScene(spec, bridge, { width: 720, height: 360 })
  assert.equal(scene.meta.figure, 'waterfall')
  const html = renderToString(h(WaterfallFigure, { scene }))
  assert.match(html, /^<svg[^>]*viewBox="0 0 720 360"/)
  assert.match(html, /<title>Value bridge<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.ok((html.match(/<rect /g) ?? []).length >= 5)
  assert.match(html, /Revenue growth|Revenue/)
  assert.match(html, /\+€40M/)
  // Semantic tokens with their palette fallbacks.
  assert.match(html, /var\(--chart-pos, var\(--green\)\)/)
  assert.match(html, /<\/svg>$/)
})

test('WaterfallFigure: responsive and hidden data table', () => {
  const scene = buildWaterfallScene({}, small, { width: 400, height: 240 })
  const html = renderToString(h(WaterfallFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Entry value.*<\/table>/)
})

test('semantic tone tokens', () => {
  const scene = buildWaterfallScene({}, bridge, { width: 720, height: 360 })
  const color = k => scene.bars.find(b => b.key === k).color
  assert.deepEqual(['start', 'growth', 'debt'].map(color), ['chart-anchor', 'chart-pos', 'chart-neg'])
  assert.deepEqual(scene.legend.map(l => l.color), ['chart-anchor', 'chart-pos', 'chart-neg'])
  const hyp = buildWaterfallScene({}, { unit: 'M', steps: [bridge.steps[0], { ...bridge.steps[1], hypothesis: true }, bridge.steps[4]] }, { width: 600, height: 300 })
  assert.equal(hyp.bars.find(b => b.key === 'growth').color, 'chart-hypothesis')
  assert.equal(hyp.labels.find(l => l.key === 'growth').color, 'chart-hypothesis-text')
})

test('WaterfallView with a width renders the chart on the server', () => {
  const html = renderToString(h(WaterfallView, { spec, bridge, width: 600, height: 280, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 280"/)
  assert.doesNotMatch(html, /chart-opts-btn/)
})

test('WaterfallChart, editable, with a width also renders on the server', () => {
  const html = renderToString(h(WaterfallChart, { spec, bridge, width: 600, height: 280 }))
  assert.match(html, /<svg[^>]*viewBox="0 0 600 280"/)
  assert.match(html, /chart-opts-btn/)
  const ro = renderToString(h(WaterfallChart, { spec, bridge, width: 600, height: 280, readOnly: true }))
  assert.match(ro, /<svg[^>]*viewBox/)
  assert.doesNotMatch(ro, /chart-opts-btn/)
})

test('locale fr: engine words and number punctuation', () => {
  const scene = buildWaterfallScene({ locale: 'fr', table: 'running', annotations: [{ type: 'diff', from: 'start', to: 'end' }] }, bridge, { width: 900, height: 360 })
  assert.equal(scene.meta.locale, 'fr')
  assert.deepEqual(scene.legend.map(l => l.label), ['Ancrage', 'Création de valeur', 'Destruction de valeur'])
  assert.deepEqual(scene.table.heads.map(x => x.text), ['Valeur', 'Cumul'])
  const cell = scene.table.rows.find(r => r.key === 'value|growth').full
  assert.equal(cell, '+40 M€')
  // Axis ticks above a billion: '€1.5B' → '1,5 Md€'.
  assert.ok(scene.axes.left.ticks.some(x => /Md€$/.test(x.label)), scene.axes.left.ticks.map(x => x.label).join('|'))
  assert.match(scene.annotations[0].text, /\(\+\d+\u00a0%\)$/)
})

test('single accent: neutral bars but the emphasized steps', () => {
  const scene = buildWaterfallScene({ accent: 'single', emphasis: ['margin'] }, bridge, { width: 720, height: 360 })
  const color = k => scene.bars.find(b => b.key === k).color
  assert.deepEqual(['start', 'growth', 'margin', 'debt', 'end'].map(color), ['chart-neutral', 'chart-neutral', 'chart-accent', 'chart-neutral', 'chart-neutral'])
  assert.equal(scene.labels.find(l => l.key === 'margin').color, 'black')
  assert.equal(scene.labels.find(l => l.key === 'growth').color, 'chart-neutral-ink')
  assert.ok(!scene.legend.some(l => l.kind === 'swatch'))
})

test('indexed to 100: same proportions, no absolute figure', () => {
  const abs = buildWaterfallScene({ annotations: [{ type: 'diff', from: 'start', to: 'end' }] }, small, { width: 600, height: 300 })
  const idx = buildWaterfallScene({ index: 100, annotations: [{ type: 'diff', from: 'start', to: 'end' }], table: 'running' }, small, { width: 600, height: 300 })
  assert.equal(idx.indexed, true)
  assert.equal(idx.indexIgnored, undefined)
  // Bars keep their relative heights (the axis rounds differently, the ratios hold).
  const hOf = (sc, k) => sc.bars.find(b => b.key === k).height
  assert.ok(Math.abs(hOf(abs, 'growth') / hOf(abs, 'start') - hOf(idx, 'growth') / hOf(idx, 'start')) < 0.02)
  assert.ok(Math.abs(hOf(abs, 'debt') / hOf(abs, 'end') - hOf(idx, 'debt') / hOf(idx, 'end')) < 0.02)
  const idxLabels = buildWaterfallScene({ index: 100 }, small, { width: 600, height: 300 }).labels.map(l => l.text)
  assert.deepEqual(idxLabels, ['100', '+20', '−13', '107'])
  const all = [...idxLabels, ...idx.axes.left.ticks.map(x => x.label), ...idx.annotations.map(a => a.text), ...idx.table.rows.map(r => r.full)]
  assert.ok(all.every(x => !/[€$£]|M\b/.test(x)), all.join('|'))
  assert.match(idx.annotations[0].text, /^\+7 \(\+7%\)$/)
  // A start of zero (or no starting anchor): the option is ignored, and said so.
  const zero = buildWaterfallScene({ index: 100 }, { unit: 'M', steps: [{ ...small.steps[0], value: 0 }, ...small.steps.slice(1)] }, { width: 600, height: 300 })
  assert.equal(zero.indexIgnored, true)
  assert.equal(zero.indexed, false)
  assert.ok(zero.labels.some(l => /€/.test(l.text)))
})
