// The preference store: published state (seed), local storage on or off, onChange.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const mem = new Map()
globalThis.window = { localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } }

const { useChartPrefs, configurePrefs, snapshotPrefs, undoLast } = await import('./chartPrefs.js')

/** Renders a component using the hook; returns what it read and its setter. */
function probe(key, defaults) {
  let out
  const C = () => { const [prefs, setPref] = useChartPrefs(key, defaults); out = { prefs, setPref }; return null }
  renderToString(createElement(C))
  return out
}

test('by default: localStorage, no callback', () => {
  configurePrefs()
  probe('epure-chart-read-a', { labels: true }).setPref('labels', false)
  assert.deepEqual(JSON.parse(mem.get('epure-chart-read-a')), { labels: false })
  assert.equal(probe('epure-chart-read-a', { labels: true }).prefs.labels, false)
})

test('seed wins over this browser, local off neither reads nor writes', () => {
  const seen = []
  configurePrefs({ seed: { 'epure-chart-read-a': { labels: true, grid: 'none' } }, local: false, onChange: (k, v) => seen.push([k, v]) })
  const p = probe('epure-chart-read-a', { labels: false, grid: 'major' })
  assert.deepEqual(p.prefs, { labels: true, grid: 'none' })
  mem.clear()
  p.setPref('grid', 'major')
  assert.equal(mem.size, 0)
  // Only what differs from the defaults is saved: grid is back to its default.
  assert.deepEqual(seen, [['epure-chart-read-a', { labels: true }]])
  assert.deepEqual(snapshotPrefs(), { 'epure-chart-read-a': { labels: true } })
})

test('undo reaches the host too', async () => {
  const seen = []
  configurePrefs({ local: false, onChange: (k, v) => seen.push(v) })
  const p = probe('epure-chart-read-b', { n: 0 })
  p.setPref('n', 1)
  await new Promise(r => setTimeout(r, 450)) // a separate undo step
  p.setPref('n', 2)
  assert.equal(undoLast(), true)
  assert.deepEqual(seen.map(v => v.n), [1, 2, 1])
})

test('a failing host callback never breaks the chart', () => {
  configurePrefs({ local: false, onChange: () => { throw new Error('offline') } })
  const p = probe('epure-chart-read-c', { n: 0 })
  assert.doesNotThrow(() => p.setPref('n', 3))
  assert.equal(probe('epure-chart-read-c', { n: 0 }).prefs.n, 3)
  configurePrefs()
})

test('readOnly + applyPrefs draws the published settings, without controls', async () => {
  const { createElement: h } = await import('react')
  const E = await import('./index.js')
  const fmt = (v, _u, d) => v.toFixed(d ?? 0)
  const chart = extra => h(E.ChartView, { width: 440, readOnly: true, ...extra, spec: { id: 'pub', x: { grain: 'category' }, series: [{ id: 'v', labels: 'all' }], format: { legend: 'none' } }, resolved: [{ label: 'v', points: [{ x: 'a', y: 1 }, { x: 'b', y: 3 }] }], format: fmt })
  const barh = extra => h(E.BarhView, { id: 'pubh', width: 440, readOnly: true, ...extra, spec: { series: [{ id: 'v', label: 'v' }] }, rows: [{ key: 'a', label: 'A', values: { v: 3 } }], format: v => v.toFixed(0) })
  configurePrefs({ local: false, seed: { 'epure-chart-read-pub': { decimals: 2 }, 'epure-chart-barh-pubh': { decimals: 2 } } })
  const out = el => renderToString(h(E.ChartsProvider, { value: {} }, el))
  assert.match(out(chart({ applyPrefs: true })), />3\.00</)
  assert.doesNotMatch(out(chart({})), />3\.00</)
  assert.doesNotMatch(out(chart({ applyPrefs: true })), /chart-opts-btn/)
  assert.match(out(barh({ applyPrefs: true })), /3[.,]00/)
  assert.doesNotMatch(out(barh({})), /3[.,]00/)
  configurePrefs()
})

test('spec.subtitle overrides the grain subtitle', async () => {
  const { createElement: h } = await import('react')
  const E = await import('./index.js')
  const series = [{ label: 'v', points: [{ x: 'a', y: 1 }] }]
  const view = (subtitle, data = true) => renderToString(h(E.ChartsProvider, { value: { resolveSeries: () => series } }, h(E.ChartView, { width: 400, spec: { id: 'sub', version: 1, kind: 'cartesian', x: { grain: 'category' }, ...(subtitle !== undefined ? { subtitle } : {}), series: [{ id: 'v', ref: { metric: 'v', source: 'd' } }] }, ...(data ? { resolved: series } : {}), format: v => String(v) })))
  assert.match(view(undefined, false), /By company/) // a catalog chart keeps its grain subtitle
  assert.doesNotMatch(view(undefined), /By company/) // series passed in: none
  assert.doesNotMatch(view(false, false), /By company/)
  assert.match(view('Revenue by region'), /Revenue by region/)
})

test('series passed in: a minimal spec is enough (no version, kind or ref)', async () => {
  const { createElement: h } = await import('react')
  const E = await import('./index.js')
  const out = renderToString(h(E.ChartView, { width: 400, spec: { id: 'min', x: { grain: 'category' }, series: [{ id: 'v', labels: 'all' }] }, resolved: [{ label: 'v', points: [{ x: 'a', y: 7 }] }], format: v => String(v) }))
  assert.doesNotMatch(out, /invalid/)
  assert.match(out, />7</)
  assert.deepEqual(E.withDataDefaults({ series: [{ id: 'v' }] }).series[0].ref, { metric: 'v', source: 'data' })
  const full = { version: 1, kind: 'cartesian', series: [{ id: 'v', ref: { metric: 'm', source: 's' } }] }
  assert.equal(E.withDataDefaults(full), full)
})

test('only the changes are stored: a spec arrow added later still shows', () => {
  const seen = []
  configurePrefs({ local: false, onChange: (k, v) => seen.push(v) })
  const before = { decimals: null, cagrs: [] }
  probe('epure-chart-read-d', before).setPref('decimals', 1)
  assert.deepEqual(seen.at(-1), { decimals: 1 }, 'the defaults are not published')
  // Published, then the spec gains a CAGR: the reader sees it, with the author's decimals.
  configurePrefs({ local: false, seed: { 'epure-chart-read-d': seen.at(-1) } })
  const after = probe('epure-chart-read-d', { decimals: null, cagrs: [{ from: '22', to: '25' }] }).prefs
  assert.deepEqual(after, { decimals: 1, cagrs: [{ from: '22', to: '25' }] })
  configurePrefs()
})

test('reset stores nothing; two charts on one key keep their own defaults', () => {
  const seen = []
  configurePrefs({ local: false, onChange: (k, v) => seen.push(v) })
  const p = probe('epure-chart-read-e', { n: 0, m: 'a' })
  p.setPref('n', 2)
  probe('epure-chart-read-e', { n: 0, m: 'a' })
  const C = () => { const [, , reset] = useChartPrefs('epure-chart-read-e', { n: 0, m: 'a' }); reset(); return null }
  renderToString(createElement(C))
  assert.deepEqual(seen.at(-1), {})
  assert.equal(probe('epure-chart-read-e', { n: 0, m: 'b' }).prefs.m, 'b')
  assert.equal(probe('epure-chart-read-e', { n: 0, m: 'a' }).prefs.m, 'a')
  configurePrefs()
})

test('a whole object saved by an earlier version still applies, and shrinks at the next write', () => {
  const seen = []
  configurePrefs({ local: false, seed: { 'epure-chart-read-f': { n: 0, m: 'x', k: 1 } }, onChange: (k, v) => seen.push(v) })
  const p = probe('epure-chart-read-f', { n: 0, m: 'a', k: 0 })
  assert.deepEqual(p.prefs, { n: 0, m: 'x', k: 1 })
  p.setPref('k', 2)
  assert.deepEqual(seen.at(-1), { m: 'x', k: 2 })
  configurePrefs()
})
