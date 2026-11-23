// Small multiples: one settings icon for the block, block settings on every panel,
// a panel's own settings on that panel only (useReadingPrefs `base`, layerPrefs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import SmallMultiplesView from './SmallMultiplesView.jsx'
import { useReadingPrefs } from './useReadingPrefs.js'
import { configurePrefs, snapshotPrefs } from './chartPrefs.js'
import { layerPrefs, prunePrefs } from './reading.js'

const spec = { id: 'panel', x: { grain: 'year' }, series: [{ id: 'a', mark: 'bar', labels: 'all' }] }
const keys = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
const resolvedOf = i => [{ label: 'Sales', unit: 'M', points: [['2022', 10.25 + i], ['2023', 12.5 + i], ['2024', 15.75 + i]].map(([x, y]) => ({ x, y, type: 'actual' })) }]
const panels = keys.map((key, i) => ({ key, spec, resolved: resolvedOf(i), title: `Region ${i + 1}` }))
const format = (v, unit, d) => v.toFixed(d ?? 1)
const block = props => renderToString(h(SmallMultiplesView, { id: 'blk', title: 'Sales by region', panels, columns: 4, width: 960, format, ...props }))
// The panel figures: 4 columns of (960 - 3 × 16) / 4 = 228 px (the settings icon is an SVG too).
const svgs = html => (html.match(/<svg[\s\S]*?<\/svg>/g) ?? []).filter(s => /^<svg[^>]*viewBox="0 0 228 /.test(s))

/** The api of a chart's settings, as its hook returns it. */
function apiOf(s, resolved, opts) {
  let out
  const C = () => { out = useReadingPrefs(s, resolved, opts)[1]; return null }
  renderToString(h(C))
  return out
}

test('layerPrefs / prunePrefs: deltas over a base', () => {
  const base = { decimals: 2, format: { scheme: 'gray', yAxis: { left: { min: 0 } } }, cagrs: [{ from: '2022', to: '2024' }] }
  const own = { decimals: 0, format: { yAxis: { left: { max: 50 } } } }
  assert.deepEqual(layerPrefs({ decimals: null, format: {} }, base, own), {
    decimals: 0, format: { scheme: 'gray', yAxis: { left: { min: 0, max: 50 } } }, cagrs: [{ from: '2022', to: '2024' }],
  })
  assert.equal(prunePrefs({ scheme: 'gray' }, { scheme: 'gray' }), undefined)
  assert.deepEqual(prunePrefs({ scheme: 'gray', num: { sep: ' ' } }, { scheme: 'gray' }), { num: { sep: ' ' } })
  assert.deepEqual(prunePrefs([], [{ from: '2022', to: '2024' }]), [])
})

test('a block of 8 panels shows one settings icon; the panels stay clickable', () => {
  configurePrefs({ local: false })
  const html = block()
  assert.equal((html.match(/chart-opts-btn/g) ?? []).length, 1)
  assert.match(html, /Sales by region/)
  for (let i = 1; i <= 8; i++) assert.match(html, new RegExp(`Region ${i}<`))
  assert.match(html, /chart-engine-clickable/)
  // Read-only: no icon at all.
  assert.doesNotMatch(block({ readOnly: true }), /chart-opts-btn/)
})

test('block settings reach every panel; a panel setting reaches only its panel', () => {
  configurePrefs({ local: false })
  const b = apiOf({ ...spec, id: 'blk' }, resolvedOf(0), { base: {} })
  b.setPref('decimals', 2)
  b.addCagr('2022', '2024')
  b.setSeries('a', { color: 'cat-3' })
  // The panel p3: its own decimals, over the block's.
  const p3 = apiOf({ ...spec, id: 'blk-p3' }, resolvedOf(3), { base: apiOf({ ...spec, id: 'blk' }, resolvedOf(0), { base: {} }).own })
  assert.equal(p3.decimals, 2)
  p3.setPref('decimals', 0)
  // Stored: deltas only.
  const snap = snapshotPrefs()
  assert.deepEqual(snap['epure-chart-read-blk-p3'], { decimals: 0 })
  assert.equal(snap['epure-chart-read-blk'].decimals, 2)

  const check = (html, color = 'cat-3') => {
    const figs = svgs(html)
    assert.equal(figs.length, 8)
    figs.forEach((svg, i) => {
      assert.match(svg, /CAGR/, `panel ${i}: block CAGR arrow`)
      assert.match(svg, new RegExp(`var\\(--${color}\\)`), `panel ${i}: block color`)
      if (i === 3) {
        assert.match(svg, />13</, 'panel 3: its own decimals (0)')
        assert.doesNotMatch(svg, /13\.25/)
      } else assert.match(svg, new RegExp(`>${(10.25 + i).toFixed(2)}<`), `panel ${i}: block decimals (2)`)
    })
  }
  // Editable and published (readOnly + applyPrefs) draw the same settings.
  check(block())
  check(block({ readOnly: true, applyPrefs: true }))
  // A later block change still reaches the panel that has its own decimals.
  b.setSeries('a', { color: 'cat-5' })
  assert.match(svgs(block({ readOnly: true, applyPrefs: true }))[3], /var\(--cat-5\)/)
  // Published: the same state as a seed, for readers.
  configurePrefs({ seed: snapshotPrefs(), local: false })
  check(block({ readOnly: true, applyPrefs: true }), 'cat-5')
  // Without applyPrefs, readOnly draws the spec as given.
  assert.doesNotMatch(block({ readOnly: true }), /CAGR/)
  configurePrefs()
})
