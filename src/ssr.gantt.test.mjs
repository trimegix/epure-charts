// Server rendering: the Gantt figure draws a complete SVG under Node, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import GanttFigure from './GanttFigure.jsx'
import GanttView from './GanttView.jsx'
import { buildGanttScene } from './ganttScene.js'
import { setDefaultLocale } from './locale.js'

const rows = [
  { key: 'design', label: 'Design', items: [{ key: 'd1', start: '2025-01-06', end: '2025-02-14', label: 'Mockups', done: 0.5 }] },
  { key: 'build', label: 'Build', items: [{ key: 'b1', start: '2025-02-17', end: '2025-04-30', label: 'Development' }] },
  { key: 'launch', label: 'Launch', items: [{ key: 'm1', start: '2025-05-05', kind: 'milestone', label: 'Go live' }] },
]

test('GanttFigure renders a complete SVG on the server', () => {
  const scene = buildGanttScene({ title: 'Project plan', source: 'Company data' }, rows, { width: 720 })
  const html = renderToString(h(GanttFigure, { scene }))
  assert.match(html, new RegExp(`^<svg[^>]*viewBox="0 0 720 ${scene.height}"`))
  assert.match(html, /<title>Project plan<\/title>/)
  assert.match(html, /<desc>Source: Company data<\/desc>/)
  assert.match(html, /Design/)
  assert.match(html, /Development/)
  assert.match(html, /Go live/)
  assert.match(html, /<\/svg>$/)
  assert.equal(scene.meta.figure, 'gantt')
})

test('GanttFigure: responsive and hidden data table', () => {
  const scene = buildGanttScene({}, rows, { width: 600 })
  const html = renderToString(h(GanttFigure, { scene, responsive: true, dataTable: true }))
  assert.match(html, /<svg[^>]*width="100%"/)
  assert.match(html, /<table[^>]*>.*Design · Mockups.*2025-01-06.*50%.*<\/table>/)
})

test('empty scene: stamped, nothing drawn', () => {
  const scene = buildGanttScene({ title: 'Empty' }, [], { width: 600 })
  assert.equal(scene.meta.figure, 'gantt')
  assert.equal(renderToString(h(GanttFigure, { scene })), '')
})

test('GanttView with a width renders the chart on the server (read-only)', () => {
  const html = renderToString(h(GanttView, { id: 'ssr', rows, width: 640, readOnly: true }))
  assert.match(html, /<svg[^>]*viewBox="0 0 640 /)
  assert.match(html, /Mockups/)
  assert.doesNotMatch(html, /chart-opts-btn/)
  assert.doesNotMatch(html, /chart-engine-clickable/)
})

test('GanttView, editable, with a width also renders on the server', () => {
  const html = renderToString(h(GanttView, { id: 'ssr2', rows, width: 640 }))
  assert.match(html, /<svg[^>]*viewBox="0 0 640 /)
  assert.match(html, /chart-opts-btn/)
  assert.match(html, /data-gantt-key="design\|d1"/)
  assert.match(html, /chart-engine-handle/)
})

test('locale fr: month names, titles and durations follow the chart locale', () => {
  const sc = buildGanttScene({ locale: 'fr', scale: 'month', columns: ['remark'], dateLabels: 'duration' }, rows, { width: 900 })
  assert.equal(sc.lang, 'fr')
  assert.equal(sc.meta.locale, 'fr')
  assert.ok(sc.header.some(x => /janv/i.test(x.text)), sc.header.map(x => x.text).join('|'))
  assert.ok(sc.colHeads.some(x => x.text === 'Remarque'))
  assert.ok(sc.labels.some(l => /\d+ j\b/.test(l.text)), sc.labels.map(l => l.text).join('|'))
  // spec.lang stays first.
  const de = buildGanttScene({ locale: 'fr', lang: 'de', columns: ['remark'] }, rows, { width: 900 })
  assert.ok(de.colHeads.some(x => x.text === 'Bemerkung'))
})

test('locale fr from the page-wide default', () => {
  setDefaultLocale('fr')
  try {
    const sc = buildGanttScene({ columns: ['remark'] }, rows, { width: 900 })
    assert.equal(sc.lang, 'fr')
    const html = renderToString(h(GanttFigure, { scene: sc, dataTable: true }))
    assert.match(html, /50\u00a0%/)
  } finally { setDefaultLocale('en') }
  assert.equal(buildGanttScene({}, rows, { width: 900 }).lang, 'en')
})

test('single accent: emphasized rows or tasks in the accent, the rest neutral', () => {
  const sc = buildGanttScene({ accent: 'single', emphasis: ['build', 'm1'] }, rows, { width: 900 })
  assert.deepEqual(sc.bars.map(b => b.color), ['chart-neutral', 'chart-accent'])
  assert.equal(sc.milestones[0].color, 'chart-accent')
  const inside = sc.labels.filter(l => l.inside)
  assert.ok(inside.length > 0)
  assert.ok(inside.every(l => ['gray-800', 'white'].includes(l.color)))
  assert.ok(inside.some(l => l.key === 'design|d1' && l.color === 'gray-800'), JSON.stringify(sc.labels))
  // Without the accent: the scene's own colors.
  const plain = buildGanttScene({}, rows, { width: 900 })
  assert.deepEqual(plain.bars.map(b => b.color), ['cat-2', 'cat-2'])
})
