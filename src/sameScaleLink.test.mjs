// "Set same scale" on the X axis: a chart is linked to the chosen charts, the state can be read,
// and the density (px per day) is the same whatever the width of the cards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, snapDateLo } from './scene.js'
import { publishDomain, withdrawDomain, sameRangeFor, offerX, xPartners, linkX, unlinkX, linkedTitles, linkGroup, fitSameScene } from './sameScale.js'

// A registered chart: its group lives in an object (like format.xAxis.same in its preferences).
const chart = (id, title, kind = 'date', g = null) => {
  const st = { g }
  const off = offerX(id, { kind, title, group: () => st.g, link: v => { st.g = v } })
  return { st, off }
}

test('"Set same scale with NAV, Fund B": a single gesture links the two charts, and only them', () => {
  const a = chart('a|x', 'NAV, Fund A'), b = chart('b|x', 'NAV, Fund B'), c = chart('c|x', 'Pipeline'), n = chart('n|x', 'Headcount', 'num')
  // A's menu lists the other date-axis charts, not the numeric axis.
  assert.deepEqual(xPartners('date', 'a|x').map(p => p.title), ['NAV, Fund B', 'Pipeline'])
  const g = linkX('a|x', ['b|x'])
  assert.ok(typeof g === 'string' && g)
  assert.equal(a.st.g, g); assert.equal(b.st.g, g); assert.equal(c.st.g, null)
  // The state reads the same from both sides.
  assert.deepEqual(linkedTitles('a|x'), ['NAV, Fund B'])
  assert.deepEqual(linkedTitles('b|x'), ['NAV, Fund A'])
  assert.deepEqual(xPartners('date', 'a|x').map(p => [p.title, p.linked]), [['NAV, Fund B', true], ['Pipeline', false]])
  // A third chart joins the existing group.
  linkX('c|x', ['a|x'])
  assert.equal(c.st.g, g)
  assert.deepEqual(linkedTitles('a|x').sort(), ['NAV, Fund B', 'Pipeline'])
  // Removing a chart: the other two stay linked; removing the second-to-last also unlinks the last.
  unlinkX('c|x')
  assert.equal(c.st.g, null); assert.equal(a.st.g, g)
  unlinkX('a|x')
  assert.equal(a.st.g, null); assert.equal(b.st.g, null)
  assert.deepEqual(linkedTitles('b|x'), [])
  for (const x of [a, b, c, n]) x.off()
  assert.deepEqual(xPartners('date', 'a|x'), [])
})

test('the group set: an existing named group, otherwise a new one (never a reused old name)', () => {
  assert.equal(linkGroup('page-3', null, () => 'new'), 'page-3')
  assert.equal(linkGroup(null, 'page-2', () => 'new'), 'page-2')
  assert.equal(linkGroup(true, null, () => 'new'), true)
  assert.equal(linkGroup(null, null, () => 'new'), 'new')
  const a = chart('p|x', 'A'), b = chart('q|x', 'B')
  const g1 = linkX('p|x', ['q|x']); unlinkX('p|x')
  const g2 = linkX('p|x', ['q|x'])
  assert.notEqual(g1, g2)
  a.off(); b.off()
})

// The two NAV charts of the gallery, as ChartView draws them (published width = drawn plot).
const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs) => ({ label, unit: 'M', role: 'actual', points: pts(pairs) })
const spec = format => ({ id: 't', version: 1, kind: 'cartesian', scope: 'shared', 
  x: { grain: 'category', range: 'all' }, series: [{ id: 's', ref: { metric: 'nav', source: 'actual' }, mark: 'line' }], format })
const A = [['2024-01-15', 120], ['2024-04-30', 128], ['2024-09-30', 134], ['2025-01-31', 141], ['2025-06-30', 150]]
const B = [['2024-07-01', 62], ['2024-12-31', 66], ['2025-06-30', 71], ['2025-12-31', 75], ['2026-03-31', 79]]
const ppd = sc => sc.plot.width / (sc.axes.x.drawn[1] - sc.axes.x.drawn[0])

test('same px per day whatever the width of the two cards', () => {
  for (const [WA, WB] of [[475, 475], [467, 475], [700, 400], [400, 700], [1000, 467], [320, 900], [1352, 1352]]) {
    const O = W => ({ width: W, height: Math.round(Math.min(320, Math.max(220, W * 0.4))), format: v => `€${v}M` })
    const data = [[A, WA], [B, WB]]
    const nat = data.map(([d, W]) => buildScene(spec({}), [res('N', d)], O(W)))
    nat.forEach((s, i) => publishDomain(`w${i}`, 'x|w|date', ...s.axes.x.domain, null, Math.round(s.plot.width * 100) / 100))
    const out = data.map(([d, W], i) => fitSameScene(
      r => buildScene(spec({ xAxis: { min: r[0], max: r[1] } }), [res('N', d)], O(W)),
      w => sameRangeFor('x|w|date', w, (lo, hi) => snapDateLo(lo, hi), nat[i].axes.x.domain),
      Math.round(nat[i].plot.width * 100) / 100))
    nat.forEach((_, i) => withdrawDomain(`w${i}`))
    assert.ok(Math.abs(ppd(out[0]) - ppd(out[1])) < 1e-9, `${WA}/${WB} : ${ppd(out[0])} vs ${ppd(out[1])}`)
    // Each fits its whole range.
    assert.ok(out[0].axes.x.drawn[1] >= Date.parse('2025-06-30') / 864e5 && out[1].axes.x.drawn[1] >= Date.parse('2026-03-31') / 864e5)
  }
})

test('the range follows the width actually drawn (margins that move with the range)', () => {
  // A fake scene whose plot loses 20 px as soon as the range exceeds 100 days.
  const buildAt = r => ({ plot: { width: r[1] - r[0] > 100 ? 380 : 400 }, r })
  const rangeAt = w => [0, w * 0.5]
  const sc = fitSameScene(buildAt, rangeAt, 400)
  assert.equal(sc.plot.width, 380)
  assert.deepEqual(sc.r, [0, 190])
})

test('Ctrl + click groups: unique names, a group left with one chart dissolves, "whole page" stays', async () => {
  const { newXGroup } = await import('./sameScale.js')
  const names = new Set(Array.from({ length: 50 }, () => newXGroup()))
  assert.equal(names.size, 50)
  assert.ok([...names].every(n => !/^page-\d+$/.test(n)), 'never "page-N"')
  // Value axis: two charts linked by Ctrl + click, one leaves → so does the other.
  const a = chart('a|y', 'A', 'y', 'x-old-1'), b = chart('b|y', 'B', 'y', 'x-old-1'), c = chart('c|y', 'C', 'y', 'x-other')
  unlinkX('a|y')
  assert.equal(a.st.g, null); assert.equal(b.st.g, null); assert.equal(c.st.g, 'x-other')
  // "Whole page" group (true): it does not dissolve.
  const d = chart('d|y', 'D', 'y', true), e = chart('e|y', 'E', 'y', true)
  unlinkX('d|y')
  assert.equal(d.st.g, null); assert.equal(e.st.g, true)
  for (const x of [a, b, c, d, e]) x.off()
})
