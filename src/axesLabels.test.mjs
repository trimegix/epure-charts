// Labels and axes of cartesian charts: snapped manual bound, frame, label dropped into
// its bar, % + series, italic / underline, log "!", date axis by unit, KPI rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { dateAxisTicks, dowOf } from './dateTicks.js'
import { publishDomain, withdrawDomain, breakFor } from './sameScale.js'
import { useChartPrefs, beginStep, endStep, undoLast } from './chartPrefs.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y, type: 'actual' }))
const res = (label, pairs, unit = 'M') => ({ label, unit, role: 'actual', points: pts(pairs) })
const spec = (series, format = {}, x = { grain: 'year', range: 'all' }) => ({ id: 't', version: 1, kind: 'cartesian', scope: 'shared', x, series, format })
const S = (id, mark, extra = {}) => ({ id, ref: { metric: 'ebitda', source: 'actual' }, mark, ...extra })
const OPTS = { width: 640, height: 300 }
const REV = [['2020', 112], ['2021', 124], ['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]]
const EB = [['2020', 18], ['2021', 21], ['2022', 24], ['2023', 27], ['2024', 30], ['2025', 33]]

test('manual max: the bound wins, no gridline within half a step (no 160 / 165 crowding)', () => {
  const sc = buildScene(spec([S('a', 'bar')], { yAxis: { left: { max: 165 } } }), [res('Rev', REV)], OPTS)
  const v = sc.axes.left.allTicks.map(t => t.value)
  assert.equal(v.at(-1), 165)
  const st = sc.axes.left.step
  for (let i = 1; i < v.length; i++) assert.ok(v[i] - v[i - 1] >= st * 0.5 - 1e-9, `${v[i - 1]} / ${v[i]} trop proches`)
})

test('axis frame: from max to min in pixels, a max set below the data stays the limit', () => {
  const sc = buildScene(spec([S('a', 'bar'), S('p', 'line')], { yAxis: { left: { max: 150 } } }), [res('Rev', REV), res('Plan', REV)], OPTS)
  const [top, bot] = sc.axes.left.frame
  assert.ok(top < bot)
  assert.equal(Math.round(top), Math.round(sc.axes.left.allTicks.find(t => t.value === 150).y))
  // Some line points go above the frame: the render clip cuts them.
  assert.ok(sc.lines[0].points.some(p => p.y < top))
})

test('label dropped at the center of its bar: inside, contrasted, no leader line', () => {
  const base = buildScene(spec([S('a', 'bar', { labels: 'all' })]), [res('Rev', REV)], OPTS)
  const l = base.labels.find(x => x.key === 'a|2023')
  const b = base.bars.find(x => x.key === '2023')
  const dy = Math.round(b.y + b.height / 2 + l.size * 0.36 - l.y)
  const sc = buildScene(spec([S('a', 'bar', { labels: 'all' })], { labels: { offsets: { 'a|2023': { dx: 0, dy } } } }), [res('Rev', REV)], OPTS)
  const m = sc.labels.find(x => x.key === 'a|2023')
  assert.equal(m.inBar, true)
  assert.equal(m.color, 'white')
  // Outside the bar: it stays an ordinary moved label.
  const out = buildScene(spec([S('a', 'bar', { labels: 'all' })], { labels: { offsets: { 'a|2023': { dx: 0, dy: -40 } } } }), [res('Rev', REV)], OPTS)
  assert.ok(!out.labels.find(x => x.key === 'a|2023').inBar)
})

test('"Series + %" content: the series name and its share of the column', () => {
  const sc = buildScene({ ...spec([S('a', 'bar', { labels: 'all' }), S('b', 'bar', { labels: 'all' })], { labels: { content: 'seriesShare' } }), bars: 'stacked' },
    [res('Rev', [['2024', 75]]), res('Other', [['2024', 25]])], OPTS)
  assert.equal(sc.labels.find(x => x.key === 'a|2024').text, 'Rev 75%')
})

test('italic and underline: for all, then label by label; a label\'s bold holds', () => {
  const f = { labels: { italic: true, styles: { 'a|2024': { underline: true, italic: false, bold: false } } } }
  const sc = buildScene(spec([S('a', 'bar', { labels: 'all' })], f), [res('Rev', REV)], OPTS)
  const one = sc.labels.find(x => x.key === 'a|2024'), other = sc.labels.find(x => x.key === 'a|2023')
  assert.equal(other.italic, true)
  assert.equal(other.underline, false)
  assert.equal(one.italic, false)
  assert.equal(one.underline, true)
  assert.equal(one.weight, 400)
  assert.equal(other.weight, 600)
  const xl = buildScene(spec([S('a', 'bar', { labels: 'all' })], { labels: { styles: { 'a|2024': { size: 'xlarge' } } } }), [res('Rev', REV)], OPTS)
  assert.ok(xl.labels.find(x => x.key === 'a|2024').size > xl.labels.find(x => x.key === 'a|2023').size)
})

test('log: zero and negatives on the base, marked "!"; the scale stays logarithmic', () => {
  const sc = buildScene(spec([S('a', 'line')], { yAxis: { left: { log: true } } }), [res('A', [['2021', 10], ['2022', -5], ['2023', 100], ['2024', 0]])], OPTS)
  assert.equal(sc.axes.left.log, true)
  const flags = sc.labels.filter(l => l.logFlag)
  assert.deepEqual(flags.map(l => l.key).sort(), ['logflag|a|2022', 'logflag|a|2024'])
  assert.ok(flags.every(l => l.text === '!' && Math.abs(l.y - (sc.axes.left.frame[1] - 4)) < 1e-6))
})

test('date axis: ticks by month, by week (chosen first day), by year', () => {
  const day = s => Date.parse(`${s}T00:00:00Z`) / 864e5
  assert.equal(dowOf(day('2025-01-06')), 0, '6 January 2025 is a Monday')
  const m = dateAxisTicks(day('2025-01-15'), day('2025-05-02'), 'month')
  assert.deepEqual(m.map(t => t.label), ['Feb 25', 'Mar 25', 'Apr 25', 'May 25'])
  const w = dateAxisTicks(day('2025-01-01'), day('2025-01-31'), 'week', 0)
  assert.deepEqual(w.map(t => t.label), ['6 Jan', '13 Jan', '20 Jan', '27 Jan'])
  const ws = dateAxisTicks(day('2025-01-01'), day('2025-01-31'), 'week', 6)
  assert.equal(ws[0].label, '5 Jan', 'Sunday week')
  assert.deepEqual(dateAxisTicks(day('2023-03-01'), day('2025-02-01'), 'year').map(t => t.label), ['2024', '2025'])
  assert.deepEqual(dateAxisTicks(day('2024-02-01'), day('2024-08-01'), 'quarter').map(t => t.label), ['Q2 24', 'Q3 24'])
  // In the scene: ticks replace the dates on a date axis (lines only).
  const pairs = [['2025-01-02', 1], ['2025-01-20', 3], ['2025-02-10', 2], ['2025-03-03', 4]]
  const sc = buildScene(spec([S('a', 'line')], { xAxis: { dateUnit: 'week' } }, { grain: 'category', range: 'all' }), [res('A', pairs)], OPTS)
  // The axis start snaps to the week of the first point (Thursday 2 → Monday 30 Dec).
  assert.equal(sc.axes.x.ticks[0].label, '30 Dec')
  assert.ok(sc.axes.x.ticks.every((t, i, a) => i === 0 || t.x > a[i - 1].x))
})

test('KPI rows under the columns: growth and margin, read from the data, with their row header', () => {
  const f = { kpiRows: [{ kind: 'growth', of: 'a' }, { kind: 'ratio', of: 'b', over: 'a' }] }
  const sc = buildScene(spec([S('a', 'bar'), S('b', 'bar')], f), [res('Revenue', REV), res('EBITDA', EB)], OPTS)
  const t21 = sc.axes.x.ticks.find(t => t.key === '2021')
  assert.deepEqual(t21.sub.map(l => l.text), ['11%', '17%'])
  assert.equal(sc.axes.x.ticks.find(t => t.key === '2020').sub[0].text, '–', 'no growth in the first year')
  assert.deepEqual(sc.axes.x.tableHeads.map(h => h.text), ['Revenue growth', 'EBITDA / Revenue'])
  // The sheet changes, the row follows.
  const sc2 = buildScene(spec([S('a', 'bar'), S('b', 'bar')], f), [res('Revenue', REV), res('EBITDA', EB.map(([k, v]) => [k, k === '2021' ? 62 : v]))], OPTS)
  assert.equal(sc2.axes.x.ticks.find(t => t.key === '2021').sub[1].text, '50%')
})

test('same scale: a member\'s break propagates to the group', () => {
  publishDomain('c1', 'g|M', 0, 200, { from: 40, to: 120 })
  publishDomain('c2', 'g|M', 0, 50)
  assert.deepEqual(breakFor('g|M'), { from: 40, to: 120 })
  assert.equal(breakFor('h|M'), null)
  withdrawDomain('c1')
  assert.equal(breakFor('g|M'), null)
  withdrawDomain('c2')
})

test('undo: a whole drag (even a long one) is a single step', async () => {
  // Outside the browser: a server render exposes the writer that useChartPrefs returns.
  let api
  const React = await import('react')
  const { renderToString } = await import('react-dom/server')
  // eslint-disable-next-line react-hooks/globals -- test probe: captures the hook's API outside React
  const Probe = () => { api = useChartPrefs('t-undo', { format: {} }); return null }
  renderToString(React.createElement(Probe))
  const [, setPref, , , latest] = api
  setPref('x', 0)
  await new Promise(r => setTimeout(r, 450))
  beginStep()
  setPref('x', 1)
  await new Promise(r => setTimeout(r, 450))
  setPref('x', 2)
  endStep()
  assert.equal(latest().x, 2)
  undoLast()
  assert.equal(latest().x, 0)
})
