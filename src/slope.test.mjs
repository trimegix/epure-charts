import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSlopeScene } from './slopeScene.js'
import { estimateWidth } from './scene.js'

const items = [
  { key: 'a', label: 'Alpha', before: 10, after: 18 },
  { key: 'b', label: 'Beta', before: 12, after: 11 },
  { key: 'c', label: 'Gamma', before: 11.5, after: 11.2 },
  { key: 'd', label: 'Delta', before: 4, after: 9 },
]
const OPTS = { width: 600, height: 320 }
const sp = s => s.replace(/[\u00a0\u202f]/g, ' ')

const boxes = labels => labels.map(l => {
  const w = estimateWidth(l.text, 11)
  const x0 = l.anchor === 'end' ? l.x - w : l.x
  return { side: l.side, x0, x1: x0 + w, y0: l.y - 11, y1: l.y + 2 }
})

test('one segment per item, one scale for both columns', () => {
  const sc = buildSlopeScene({}, items, OPTS)
  assert.equal(sc.meta.figure, 'slope')
  assert.equal(sc.lines.length, 4)
  assert.deepEqual(sc.domain, [4, 18])
  const a = sc.lines.find(l => l.key === 'a'), d = sc.lines.find(l => l.key === 'd')
  assert.ok(Math.abs(a.y2 - sc.plot.top) < 0.01, 'the maximum on top')
  assert.ok(Math.abs(d.y1 - sc.plot.bottom) < 0.01, 'the minimum at the bottom')
  // The same value sits at the same height in both columns.
  const b = sc.lines.find(l => l.key === 'b')
  const sc2 = buildSlopeScene({}, [...items, { key: 'e', label: 'Eps', before: 11, after: 12 }], OPTS)
  assert.ok(Math.abs(sc2.lines.find(l => l.key === 'b').y2 - sc2.lines.find(l => l.key === 'e').y1) < 0.01)
  assert.ok(b.x1 < b.x2)
  assert.deepEqual(sc.axes.map(x => x.label), ['Before', 'After'])
})

test('labels "name value" on both sides, spread without overlap', () => {
  const sc = buildSlopeScene({ before: '2023', after: '2025' }, items, OPTS)
  assert.deepEqual(sc.axes.map(x => x.label), ['2023', '2025'])
  assert.equal(sc.labels.length, 8)
  assert.ok(sc.labels.some(l => l.side === 'L' && l.text === 'Alpha 10.0'))
  assert.ok(sc.labels.some(l => l.side === 'R' && l.text === '18.0 Alpha'))
  for (const side of ['L', 'R']) {
    const bs = boxes(sc.labels.filter(l => l.side === side))
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      assert.ok(bs[i].y1 <= bs[j].y0 || bs[j].y1 <= bs[i].y0, `${side}: labels ${i} and ${j} overlap`)
    }
  }
  // Beta, Gamma close together: at least one was moved and carries a leader.
  assert.ok(sc.leaders.length >= 1)
  assert.equal(sc.noRoom, 0)
})

test('labels "end" and "none"', () => {
  const end = buildSlopeScene({ labels: 'end' }, items, OPTS)
  assert.ok(end.labels.filter(l => l.side === 'L').every(l => !/[A-Z][a-z]/.test(l.text)))
  assert.ok(end.labels.some(l => l.side === 'R' && /Alpha/.test(l.text)))
  const none = buildSlopeScene({ labels: 'none' }, items, OPTS)
  assert.equal(none.labels.length, 0)
})

test('change at the end of the line: relative % by default, points for a pct unit', () => {
  const sc = buildSlopeScene({ change: true }, items, OPTS)
  const a = sc.labels.find(l => l.key === 'a|R')
  assert.equal(a.change, '+80%')
  assert.match(a.text, /Alpha {2}\+80%$/)
  assert.equal(sc.lines.find(l => l.key === 'b').change, '−8%')
  const pct = buildSlopeScene({ change: true, unit: 'pct' }, [{ key: 'm', label: 'Margin', before: 0.12, after: 0.155 }], OPTS)
  assert.equal(pct.lines[0].change, '+3.5 pts')
})

test('a crowded column keeps what fits, emphasized first', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, label: `Item ${i}`, before: i % 3, after: i % 5 }))
  const sc = buildSlopeScene({ emphasis: ['k39'] }, many, { width: 500, height: 160 })
  assert.ok(sc.noRoom > 0)
  assert.ok(sc.labels.some(l => l.key === 'k39|R'))
  const right = sc.labels.filter(l => l.side === 'R').sort((p, q) => p.y - q.y)
  for (let i = 1; i < right.length; i++) assert.ok(right[i].y - right[i - 1].y >= 11 + 3 - 1e-9)
  for (const l of right) assert.ok(l.y <= 160 && l.y - 11 >= 0)
})

test('scale set by hand, single accent, locale fr, empty', () => {
  const sc = buildSlopeScene({ scale: { min: 0, max: 40 }, accent: 'single', emphasis: ['d'], locale: 'fr', change: true }, items, OPTS)
  assert.deepEqual(sc.domain, [0, 40])
  assert.equal(sc.lines.find(l => l.key === 'd').color, 'chart-accent')
  assert.ok(sc.lines.filter(l => l.key !== 'd').every(l => l.color === 'chart-neutral'))
  assert.equal(sc.lines.at(-1).key, 'd', 'the emphasized line is drawn last')
  assert.deepEqual(sc.axes.map(x => x.label), ['Avant', 'Après'])
  assert.ok(sc.labels.some(l => sp(l.text) === 'Alpha 10,0'), sc.labels.map(l => l.text).join('|'))
  assert.equal(sp(sc.lines.find(l => l.key === 'd').change), '+125 %')
  assert.match(sc.lines.find(l => l.key === 'd').change, /125\u00a0%/)
  const empty = buildSlopeScene({ title: 'T' }, [], OPTS)
  assert.ok(empty.empty)
  assert.equal(empty.meta.figure, 'slope')
})
