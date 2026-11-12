// Forced axis max below the data, label dragged into a bar, Gantt scale frozen
// during a drag, start date in front of the first bar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene } from './scene.js'
import { buildGanttScene } from './ganttScene.js'

const pts = pairs => pairs.map(([x, y]) => ({ x, y }))
const SPEC = format => ({
  id: 'r3', version: 1, kind: 'cartesian', scope: 'shared', x: { grain: 'year', range: 'all' },
  series: [
    { id: 'rev', ref: { metric: 'sales', source: 'actual' }, mark: 'bar', labels: 'all', style: { color: 'gray-700' } },
    { id: 'plan', ref: { metric: 'sales', source: 'bp' }, mark: 'line' },
  ],
  format,
})
const RES = [
  { label: 'Revenue', unit: 'M', role: 'actual', points: pts([['2022', 136], ['2023', 149], ['2024', 161], ['2025', 173]]) },
  { label: 'Plan', unit: 'M', role: 'plan', points: pts([['2022', 140], ['2023', 155], ['2024', 170], ['2025', 185]]) },
]
const OPTS = { width: 640, height: 300 }

test('forced max: no gridline within half a step of the bound', () => {
  const sc = buildScene(SPEC({ yAxis: { left: { max: 150 } } }), RES, OPTS)
  const vals = sc.axes.left.ticks.map(t => t.value)
  assert.equal(vals.at(-1), 150)
  const stepV = vals[1] - vals[0]
  assert.ok(150 - vals.at(-2) > stepV / 2, `crowded gridlines: ${vals.join(', ')}`)
})

test('forced max: bars cut at the frame, cut mark, labels above the frame and visible', () => {
  const sc = buildScene(SPEC({ yAxis: { left: { max: 150 } } }), RES, OPTS)
  const top = sc.axes.left.frame[0]
  const cut = sc.bars.filter(b => b.cut)
  assert.deepEqual(cut.map(b => b.key), ['2024', '2025'])
  for (const b of cut) assert.ok(Math.abs(b.y - top) < 0.5, 'the bar stops at the top of the frame')
  const marks = sc.annotations.filter(a => a.type === 'overflowCut')
  assert.deepEqual(marks.map(a => a.key), ['2024', '2025'])
  for (const a of marks) assert.ok(a.y > top && a.y < top + 20, 'the cut mark sits at the top of the bar')
  for (const k of ['2024', '2025']) {
    const l = sc.labels.find(x => x.key === `rev|${k}`)
    assert.ok(l && l.y <= top && l.y - l.size >= 0, `label ${k} visible just above the frame`)
  }
  // A bar below the bound is not marked.
  assert.ok(!sc.bars.find(b => b.key === '2022').cut)
})

test('forced max: the name of a clipped line stays inside the frame', () => {
  const sc = buildScene(SPEC({ yAxis: { left: { max: 150 } } }), RES, OPTS)
  const e = sc.endLabels.find(x => x.seriesId === 'plan')
  assert.ok(e.y >= sc.axes.left.frame[0], '"Plan" name below the top of the frame')
  // In automatic mode nothing changes: no bar is cut.
  const auto = buildScene(SPEC({}), RES, OPTS)
  assert.equal(auto.bars.filter(b => b.cut).length, 0)
  assert.equal(auto.annotations.filter(a => a.type === 'overflowCut').length, 0)
})

test('label dragged into a bar: automatic contrast against the fill', () => {
  const dark = buildScene(SPEC({ labels: { offsets: { 'rev|2023': { dx: 0, dy: 100 } } } }), RES, OPTS)
  const l = dark.labels.find(x => x.key === 'rev|2023')
  assert.equal(l.inBar, true)
  assert.equal(l.color, 'white')
  assert.equal(l.on, 'gray-700')
  // On a light series, the number turns black.
  const light = SPEC({ labels: { offsets: { 'rev|2023': { dx: 0, dy: 100 } } } })
  light.series[0].style.color = 'gray-200'
  const l2 = buildScene(light, RES, OPTS).labels.find(x => x.key === 'rev|2023')
  assert.equal(l2.color, 'black')
})

const GR = [
  { key: 'r', label: 'Valuation sprint', items: [{ key: 'a', start: '2025-03-03', end: '2025-03-07', label: 'Request' }, { key: 'b', start: '2025-03-10', end: '2025-04-18', label: 'Build' }] },
  { key: 's', label: 'Separation', items: [{ key: 'c', start: '2025-03-17', end: '2025-05-30', label: 'Separation' }] },
]

test('Gantt: start date with no room before the first bar, the scale does not widen', () => {
  // The "Valuation sprint" sample (scale in days).
  const SPRINT = [
    { key: 'd', label: 'Data request', items: [{ key: 'd1', start: '2025-03-03', end: '2025-03-07', label: 'Request' }] },
    { key: 'm', label: 'Model', items: [{ key: 'm1', after: 'd1', duration: 6, label: 'Build' }] },
  ]
  const sp = { scale: 'day', weekends: 'shaded', columns: ['responsible', 'status'], status: 'checkbox' }
  const sc = buildGanttScene({ ...sp, dateLabels: 'start' }, SPRINT, { width: 560 })
  const bar = sc.bars.find(b => b.key === 'd|d1')
  const d = sc.labels.find(l => l.key === 'd|d1|date')
  assert.equal(d.text, '3 Mar')
  assert.ok(d.x >= bar.x, 'inside the bar or after it, never in front of the plot')
  // The scale matches a chart without start date: no empty week for a label.
  assert.deepEqual(sc.range, buildGanttScene(sp, SPRINT, { width: 560 }).range)
  assert.equal(sc.range.from, '2025-03-03')
  assert.deepEqual(buildGanttScene({ dateLabels: 'start' }, GR, { width: 900 }).range, buildGanttScene({}, GR, { width: 900 }).range)
  // A long enough bar without a label: the date is written inside it.
  const bare = buildGanttScene({ dateLabels: 'start', scale: 'day' }, [{ key: 'q', label: 'q', items: [{ key: 'z', start: '2025-03-03', end: '2025-03-14' }] }], { width: 900 })
  const dz = bare.labels.find(l => l.key === 'q|z|date')
  assert.equal(dz.color, 'white')
  assert.ok(dz.x > bare.bars[0].x && dz.x < bare.bars[0].x + bare.bars[0].width)
})

test('Gantt: scale frozen (frame) during a drag, recomputed without it', () => {
  const sc = buildGanttScene({}, GR, { width: 900 })
  const moved = GR.map(r => (r.key === 's' ? { ...r, items: [{ ...r.items[0], start: '2025-08-04', end: '2025-10-17' }] } : r))
  const frozen = buildGanttScene({}, moved, { width: 900, frame: sc.frame })
  assert.deepEqual(frozen.range, sc.range)
  assert.equal(frozen.scale, sc.scale)
  assert.deepEqual(frozen.header.map(h => h.x), sc.header.map(h => h.x))
  const free = buildGanttScene({}, moved, { width: 900 })
  assert.notDeepEqual(free.range, sc.range)
})
