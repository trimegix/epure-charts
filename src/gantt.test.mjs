import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGanttScene, formatDate } from './ganttScene.js'

const R = [
  { key: 'a', label: 'Carve-out', group: 'Phase 1', items: [{ key: 'x', start: '2025-01-06', end: '2025-03-28', label: 'IT separation', done: 0.6 }] },
  { key: 'b', label: 'Pricing', group: 'Phase 1', items: [{ key: 'y', start: '2025-02-03', end: '2025-06-30', label: 'Repricing' }] },
  { key: 'c', label: 'Exit', group: 'Phase 2', items: [{ key: 'z', start: '2025-09-15', label: 'Signing', kind: 'milestone' }] },
]
test('one bar per task, one diamond per milestone', () => {
  const sc = buildGanttScene({}, R, { width: 800 })
  assert.equal(sc.bars.length, 2)
  assert.equal(sc.milestones.length, 1)
})
test('a longer task is wider', () => {
  const sc = buildGanttScene({}, R, { width: 800 })
  assert.ok(sc.bars[1].width > sc.bars[0].width)
})
test('group bands are interleaved', () => {
  const sc = buildGanttScene({ groups: true }, R, { width: 800 })
  assert.equal(sc.rows.filter(r => r.group).length, 2)
})
test('"today" line within the window', () => {
  assert.ok(buildGanttScene({ today: '2025-05-01' }, R, { width: 800 }).today)
  assert.equal(buildGanttScene({ today: '2030-01-01' }, R, { width: 800 }).today, null)
})
test('two-level header', () => {
  const sc = buildGanttScene({ scale: 'month' }, R, { width: 800 })
  assert.ok(sc.header.some(h => h.level === 0) && sc.header.some(h => h.level === 1))
})
test('day scale: one header per day, months above', () => {
  const rows = [{ key: 'r', label: 'Sprint', items: [{ key: 'a', start: '2025-03-03', end: '2025-03-14' }] }]
  const sc = buildGanttScene({}, rows, { width: 900 })
  assert.equal(sc.scale, 'day')
  assert.equal(sc.header.filter(h => h.level === 1).length, 14)
  assert.ok(sc.header.some(h => h.level === 0 && /Mar/.test(h.text)))
  const wd = buildGanttScene({ dayLabel: 'weekday' }, rows, { width: 900 })
  assert.equal(wd.header.find(h => h.level === 1).text, 'M')
})
test('weekends shaded or removed from the scale', () => {
  const rows = [{ key: 'r', label: 'Sprint', items: [{ key: 'a', start: '2025-03-03', end: '2025-03-16' }] }]
  const sh = buildGanttScene({ weekends: 'shaded', scale: 'day' }, rows, { width: 900 })
  assert.equal(sh.weekends.length, 2)
  const hid = buildGanttScene({ weekends: 'hidden', scale: 'day' }, rows, { width: 900 })
  assert.equal(hid.header.filter(h => h.level === 1).length, 10)
  // Monday → Friday of the same week: same width as the whole week minus the weekend
  const days = hid.header.filter(h => h.level === 1)
  assert.ok(Math.abs((days[0].x1 - days[0].x0) - (days[5].x1 - days[5].x0)) < 1e-6)
  assert.equal(hid.invert(days[5].x0 + 1), '2025-03-10')
})
test('first day of the week', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-03-05', end: '2025-04-20' }] }]
  const sun = buildGanttScene({ scale: 'week', weekStart: 6 }, rows, { width: 900 })
  assert.equal(new Date(+sun.header.find(h => h.level === 1).key.slice(1)).getUTCDay(), 0)
  const num = buildGanttScene({ scale: 'week', weekLabel: 'number' }, rows, { width: 900 })
  assert.equal(num.header.find(h => h.level === 1).text, 'W10')
})
test('fiscal year: FY years and shifted quarters', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-04-01', end: '2026-03-31' }] }]
  const sc = buildGanttScene({ scale: 'quarter', fiscalStart: 4 }, rows, { width: 900 })
  const top = sc.header.filter(h => h.level === 0)
  assert.deepEqual(top.map(h => h.text), ['FY26'])
  assert.deepEqual(sc.header.filter(h => h.level === 1).map(h => h.text), ['Q1', 'Q2', 'Q3', 'Q4'])
})
test('month and date labels', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-01-06', end: '2025-04-30', label: 'Build' }] }]
  assert.equal(buildGanttScene({ scale: 'month', monthLabel: 'letter' }, rows, { width: 900 }).header.find(h => h.level === 1).text, 'J')
  assert.equal(buildGanttScene({ scale: 'month', monthLabel: 'number' }, rows, { width: 900 }).header.find(h => h.level === 1).text, '01')
  const sc = buildGanttScene({ dateLabels: 'range', dateFormat: 'dd/mm' }, rows, { width: 900 })
  assert.ok(sc.labels.some(l => l.text === '06/01 – 30/04'))
  assert.equal(formatDate('2025-03-09', 'mmm yy'), 'Mar 25')
  const d = buildGanttScene({ dateLabels: 'duration' }, rows, { width: 900 })
  assert.ok(d.labels.some(l => l.text === '115 d'))
})
test('process arrows: pentagon and chevron', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-01-06', end: '2025-04-30', shape: 'chevron' }, { key: 'b', start: '2025-05-01', end: '2025-06-30' }] }]
  const sc = buildGanttScene({ shape: 'pentagon' }, rows, { width: 900 })
  assert.equal(sc.bars[0].shape, 'chevron')
  assert.equal(sc.bars[1].shape, 'pentagon')
  assert.match(sc.bars[1].path, /^M/)
  assert.equal(buildGanttScene({}, rows, { width: 900 }).bars[1].path, null)
})
test('brace over a period', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-01-06', end: '2025-04-30' }] }, { key: 'b', label: 'Phase', items: [{ key: 'br', kind: 'bracket', start: '2025-01-06', end: '2025-02-28', label: 'Diagnostic' }] }]
  const sc = buildGanttScene({}, rows, { width: 900 })
  assert.equal(sc.brackets.length, 1)
  assert.ok(sc.brackets[0].x1 > sc.brackets[0].x0)
  assert.equal(sc.milestones.length, 0)
})
test('shaded periods', () => {
  const sc = buildGanttScene({ shades: [{ from: '2025-07-14', to: '2025-08-31', label: 'Summer' }, { from: '2031-01-01', to: '2031-02-01' }] }, R, { width: 800 })
  assert.equal(sc.shades.length, 1)
  assert.ok(sc.shades[0].x1 > sc.shades[0].x0)
})
test('linked dates: the task follows its predecessor, arrow drawn', () => {
  const rows = [
    { key: 'r1', label: 'Design', items: [{ key: 'd', start: '2025-01-06', end: '2025-01-31' }] },
    { key: 'r2', label: 'Build', items: [{ key: 'b', after: 'd', duration: 28 }] },
    { key: 'r3', label: 'Launch', items: [{ key: 'l', after: 'b', kind: 'milestone', lag: 2 }] },
  ]
  const sc = buildGanttScene({}, rows, { width: 900 })
  assert.equal(sc.bars[1].start, '2025-02-01')
  assert.equal(sc.bars[1].end, '2025-02-28')
  assert.equal(sc.milestones[0].date, '2025-03-02')
  assert.equal(sc.links.length, 2)
  assert.equal(buildGanttScene({ links: false }, rows, { width: 900 }).links.length, 0)
  // cycle: ignored without crashing
  const cyc = [{ key: 'a', label: 'a', items: [{ key: 'x', start: '2025-01-01', end: '2025-01-10', after: 'y' }] }, { key: 'b', label: 'b', items: [{ key: 'y', after: 'x', duration: 3 }] }]
  assert.equal(buildGanttScene({}, cyc, { width: 900 }).bars.length, 2)
})
test('hierarchy: indent and summary bar', () => {
  const rows = [
    { key: 'p', label: 'Workstream', items: [] },
    { key: 'c1', label: 'Task 1', level: 1, items: [{ key: 'a', start: '2025-01-06', end: '2025-02-28' }] },
    { key: 'c2', label: 'Task 2', level: 1, items: [{ key: 'b', start: '2025-03-01', end: '2025-05-30' }] },
  ]
  const sc = buildGanttScene({}, rows, { width: 900 })
  assert.ok(sc.rows[0].parent)
  assert.equal(sc.rows[1].indent, 12)
  assert.equal(sc.summaries.length, 1)
  assert.equal(sc.summaries[0].start, '2025-01-06')
  assert.equal(sc.summaries[0].end, '2025-05-30')
})
test('label columns: owner, status (Harvey ball / checkbox), remark', () => {
  const rows = [
    { key: 'a', label: 'IT', responsible: 'CIO', remark: 'On track', status: 0.5, items: [{ key: 'x', start: '2025-01-06', end: '2025-03-28' }] },
    { key: 'b', label: 'HR', responsible: 'HRD', status: 3, items: [{ key: 'y', start: '2025-02-06', end: '2025-03-28' }] },
  ]
  const sc = buildGanttScene({ columns: ['responsible', 'status', 'remark'] }, rows, { width: 900 })
  assert.equal(sc.colHeads.length, 4)
  assert.equal(sc.cells.filter(c => c.col === 'status')[1].harvey, 0.75)
  assert.ok(sc.plot.right < 900 - 8 && sc.plot.left > sc.columns.activity.x1)
  const cb = buildGanttScene({ columns: ['status'], status: 'checkbox' }, [{ ...rows[0], status: true }, { ...rows[1], status: null }], { width: 900 })
  assert.deepEqual(cb.cells.map(c => c.check), ['yes', 'empty'])
})
test('key dates: vertical line and "Key dates" row', () => {
  const sc = buildGanttScene({ events: [{ date: '2025-06-30', label: 'Board' }] }, R, { width: 800 })
  assert.equal(sc.events.length, 1)
  assert.equal(sc.rows.at(-1).label, 'Key dates')
  assert.ok(sc.events[0].y2 > sc.events[0].y1)
})
test('milestone markers and separators', () => {
  const sc = buildGanttScene({ marker: 'circle', gridlines: 'none', rowStyle: 'lines' }, R, { width: 800 })
  assert.equal(sc.milestones[0].marker, 'circle')
  assert.equal(sc.gridlines.length, 0)
  assert.ok(sc.rows.every(r => r.separator))
  const maj = buildGanttScene({ gridlines: 'major', scale: 'month' }, R, { width: 800 })
  assert.ok(maj.gridlines.length > 0 && maj.gridlines.every(g => g.strong))
})
test('end-to-end dependency: vertical arrow', () => {
  const rows = [
    { key: 'a', label: 'a', items: [{ key: 'x', start: '2025-03-03', end: '2025-03-07' }] },
    { key: 'b', label: 'b', items: [{ key: 'y', after: 'x', duration: 4 }] },
  ]
  const l = buildGanttScene({ scale: 'day' }, rows, { width: 900 }).links[0]
  assert.equal(l.points.length, 2)
  assert.equal(l.points[0][0], l.points[1][0])
  assert.ok(l.points[1][1] > l.points[0][1])
})
test('milestone linked to the end of a bar: vertical arrow at the milestone center', () => {
  const rows = [
    { key: 'a', label: 'a', items: [{ key: 'x', start: '2025-03-03', end: '2025-03-07' }] },
    { key: 'b', label: 'b', items: [{ key: 'm', after: 'x', kind: 'milestone' }] },
  ]
  const sc = buildGanttScene({ scale: 'day' }, rows, { width: 900 })
  assert.equal(sc.links[0].points[0][0], sc.milestones[0].x)
})

// ─── Plan editing ──────────────────────────────────────────────────────────
import { insertRow, duplicateRow, deleteRow, moveRow, indentRow, patchRow, patchItem, addItem, removeItem, addUnits, snapDate, unitsBetween, ganttTiers } from './ganttScene.js'
const T = [
  { key: 'p', label: 'WS', items: [] },
  { key: 'c1', label: 'T1', level: 1, items: [{ key: 'a', start: '2025-01-06', end: '2025-02-28' }] },
  { key: 'c2', label: 'T2', level: 1, items: [{ key: 'b', start: '2025-03-01', end: '2025-05-30' }] },
  { key: 'q', label: 'Other', items: [{ key: 'm', start: '2025-06-02', kind: 'milestone' }] },
]
const keys = rs => rs.map(r => r.key).join(',')
test('insert above / below (after the children), at the same level', () => {
  assert.equal(keys(insertRow(T, 'c1', 'above')), 'p,row-1,c1,c2,q')
  assert.equal(insertRow(T, 'c1', 'above')[1].level, 1)
  assert.equal(keys(insertRow(T, 'p', 'below')), 'p,c1,c2,row-1,q')
})
test('duplicate, delete (children move up)', () => {
  const d = duplicateRow(T, 'c2')
  assert.equal(keys(d), 'p,c1,c2,c2-1,q')
  assert.equal(d[3].items[0].start, '2025-03-01')
  const x = deleteRow(T, 'p')
  assert.equal(keys(x), 'c1,c2,q')
  assert.equal(x[0].level, 0)
})
test('move a row up / down with its children', () => {
  assert.equal(keys(moveRow(T, 'q', -1)), 'q,p,c1,c2')
  assert.equal(keys(moveRow(T, 'p', 1)), 'q,p,c1,c2')
  assert.equal(keys(moveRow(T, 'c2', -1)), 'p,c2,c1,q')
  assert.equal(keys(moveRow(T, 'c1', -1)), keys(T)) // no same-level neighbour above
  assert.equal(keys(moveRow(T, 'c2', 1)), keys(T))
})
test('indent / outdent: the summary follows', () => {
  const a = indentRow(T, 'q', 1)
  assert.equal(a[3].level, 1)
  assert.equal(indentRow(T, 'c2', 1)[2].level, 2)
  assert.equal(indentRow(indentRow(T, 'c2', 1), 'c2', 1)[2].level, 2) // never more than one level below the previous row
  assert.equal(indentRow(T, 'p', 1), T)
  const sc = buildGanttScene({}, a, { width: 900 })
  assert.equal(sc.summaries[0].end, '2025-06-02')
  const o = indentRow(T, 'p', -1)
  assert.equal(o, T)
  assert.equal(buildGanttScene({}, indentRow(T, 'c1', -1), { width: 900 }).rows[1].parent, true)
})
test('edit rows and tasks', () => {
  assert.equal(patchRow(T, 'q', { label: 'Exit', bold: true })[3].bold, true)
  assert.equal(patchRow(T, 'q', { remark: null })[3].remark, undefined)
  assert.equal(patchItem(T, 'c1', 'a', { end: '2025-03-31' })[1].items[0].end, '2025-03-31')
  const ad = addItem(T, 'p', { start: '2025-01-01', end: '2025-01-31' })
  assert.equal(ad[0].items[0].key, 'item-1')
  assert.equal(removeItem(T, 'c1', 'a')[1].items.length, 0)
})
test('dragged dates: shift and snap to the unit', () => {
  assert.equal(addUnits('2025-03-31', 1, 'month', true), '2025-04-30')
  assert.equal(addUnits('2025-01-31', 1, 'month'), '2025-02-28')
  assert.equal(addUnits('2025-01-06', 2, 'week'), '2025-01-20')
  assert.equal(addUnits('2025-01-01', 1, 'quarter'), '2025-04-01')
  assert.equal(snapDate('2025-02-20', 'month'), '2025-03-01')
  assert.equal(snapDate('2025-02-10', 'month'), '2025-02-01')
  assert.equal(snapDate('2025-03-06', 'week'), '2025-03-03')
  assert.equal(snapDate('2025-05-10', 'quarter', { fiscalStart: 4 }), '2025-04-01')
  assert.equal(unitsBetween('2025-01-01', '2025-03-03', 'month'), 2)
})
test('per-row style: color, shape, bold', () => {
  const rows = patchRow(T, 'c1', { color: 'cat-4', shape: 'chevron', bold: true })
  const sc = buildGanttScene({}, rows, { width: 900 })
  assert.equal(sc.bars[0].color, 'cat-4')
  assert.equal(sc.bars[0].shape, 'chevron')
  assert.equal(sc.bars[1].color, 'cat-2')
  assert.equal(sc.rows[1].bold, true)
})
test('chosen scale levels and scale labels', () => {
  assert.deepEqual(ganttTiers({ tiers: ['week', 'month', 'year', 'day'] }), ['year', 'month', 'week'])
  assert.deepEqual(ganttTiers({ scale: 'quarter' }), ['year', 'quarter'])
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-01-06', end: '2025-04-30' }] }]
  const sc = buildGanttScene({ tiers: ['quarter', 'month', 'week'], scaleLabels: true }, rows, { width: 1200 })
  assert.deepEqual([...new Set(sc.header.map(h => h.level))], [0, 1, 2])
  assert.equal(sc.plot.top, 52)
  assert.equal(sc.scale, 'week')
  assert.ok(sc.header.some(h => h.level === 0 && h.text === 'Q1 2025'))
  assert.deepEqual(sc.tierLabels.map(t => t.text), ['Quarter', 'Month', 'Week'])
  assert.ok(sc.tierLabels.every(t => t.x < sc.plot.left))
  const fy = buildGanttScene({ tiers: ['year', 'quarter'], scaleLabels: { quarter: 'Qtr' }, fiscalStart: 4 }, rows, { width: 900 })
  assert.deepEqual(fy.tierLabels.map(t => t.text), ['FY', 'Qtr'])
  // strong separators fall at the start of each month (the level above weeks)
  assert.ok(sc.gridlines.filter(g => g.strong).length >= 4)
})

// ─── Calendar, anchors, labels, language ───────────────────────────────────
import { moveRowTo, moveItem, ganttSnapUnit, calendarWeeks, calendarMove, calendarRange } from './ganttScene.js'

test('calendar: weeks of the month, out-of-month days flagged, first day of week', () => {
  const w = calendarWeeks(2025, 2, 0) // March 2025, week starts Monday
  assert.equal(w[0][0].iso, '2025-02-24')
  assert.ok(w[0][0].out && !w[0][5].out)
  assert.ok(w.every(x => x.length === 7))
  assert.ok(w.flat().some(d => d.iso === '2025-03-31'))
  assert.equal(calendarWeeks(2025, 2, 6)[0][0].iso, '2025-02-23') // Sunday
})
test('calendar: keyboard navigation and range', () => {
  assert.equal(calendarMove('2025-03-31', 'ArrowRight'), '2025-04-01')
  assert.equal(calendarMove('2025-03-05', 'ArrowUp'), '2025-02-26')
  assert.equal(calendarMove('2025-03-31', 'PageDown'), '2025-04-30')
  assert.equal(calendarMove('2025-03-05', 'PageUp', { shift: true }), '2024-03-05')
  assert.equal(calendarMove('2025-03-05', 'Home'), '2025-03-03')
  assert.deepEqual(calendarRange('2025-05-01', '2025-04-01'), ['2025-04-01', '2025-05-01'])
})
test('elements outside the window: neither drawn nor labelled', () => {
  const rows = [{ key: 'r', label: 'A', items: [{ key: 'in', start: '2025-03-01', end: '2025-03-20', label: 'Visible' }, { key: 'out', start: '2025-08-01', end: '2025-08-10', label: 'Secret' }, { key: 'm', start: '2025-09-01', kind: 'milestone', label: 'Hidden ms' }] }]
  const sc = buildGanttScene({ from: '2025-03-01', to: '2025-04-30' }, rows, { width: 800 })
  assert.equal(sc.bars.length, 1)
  assert.equal(sc.milestones.length, 0)
  assert.ok(!sc.labels.some(l => /Secret|Hidden/.test(l.text)))
  assert.deepEqual(sc.hidden, ['r|out', 'r|m'])
})
test('free text in the scale and column titles', () => {
  const sc0 = buildGanttScene({ scale: 'month', columns: ['responsible'] }, R, { width: 800 })
  const k = sc0.header.find(h => h.level === 1).key
  const sc = buildGanttScene({ scale: 'month', columns: ['responsible'], scaleTexts: { [k]: 'Kick-off*' }, colTitles: { responsible: 'Owner' } }, R, { width: 800 })
  assert.equal(sc.header.find(h => h.key === k).text, 'Kick-off*')
  assert.ok(sc.colHeads.some(h => h.text === 'Owner'))
})
test('language: months, quarters and titles translated', () => {
  const sc = buildGanttScene({ scale: 'month', lang: 'fr', columns: ['remark'], events: [{ date: '2025-05-01', label: 'X' }] }, R, { width: 900 })
  assert.ok(sc.header.some(h => /janv|févr/.test(h.text)))
  assert.ok(sc.colHeads.some(h => h.text === 'Remarque'))
  assert.ok(sc.rows.some(r => r.label === 'Dates clés'))
  assert.equal(formatDate('2025-03-07', 'd mmm', false, 'de'), '7 Mär')
})
test('date format codes', () => {
  assert.equal(formatDate('2025-03-07', 'dddd d mmmm yyyy'), 'Friday 7 March 2025')
  assert.equal(formatDate('2025-03-07', '"W"ww yy'), 'W10 25')
  assert.equal(formatDate('2025-03-07', '"Q"q yyyy'), 'Q1 2025')
  assert.equal(formatDate('2025-03-07', 'dd.mm.yy'), '07.03.25')
})
test('anchors: start to start, finish to finish, across rows', () => {
  const rows = [
    { key: 'a', label: 'A', items: [{ key: 'x', start: '2025-03-03', end: '2025-03-14' }] },
    { key: 'b', label: 'B', items: [{ key: 'y', after: 'x', link: 'ss', lag: 2, duration: 3 }] },
    { key: 'c', label: 'C', items: [{ key: 'z', after: 'a|x', link: 'ff', duration: 5 }] },
  ]
  const sc = buildGanttScene({}, rows, { width: 900 })
  const y = sc.bars.find(b => b.itemKey === 'y'), z = sc.bars.find(b => b.itemKey === 'z')
  assert.equal(y.start, '2025-03-05'); assert.equal(y.end, '2025-03-07')
  assert.equal(z.end, '2025-03-14'); assert.equal(z.start, '2025-03-10')
  assert.equal(sc.links.length, 2)
  assert.deepEqual(sc.links.map(l => l.link).sort(), ['ff', 'ss'])
})
test('milestone: label on the previous day', () => {
  const rows = [{ key: 'r', label: 'A', items: [{ key: 'b', start: '2025-03-03', end: '2025-03-14' }, { key: 'm', start: '2025-03-15', kind: 'milestone', prevDay: true }] }]
  const sc = buildGanttScene({ dateLabels: 'range', dateFormat: 'iso' }, rows, { width: 900 })
  assert.ok(sc.labels.some(l => l.text === '2025-03-14'))
})
test('label spanning several rows, with a brace', () => {
  const rows = ['a', 'b', 'c'].map(k => ({ key: k, label: k, responsible: k === 'a' ? 'CFO' : 'CEO', items: [{ key: `${k}1`, start: '2025-03-03', end: '2025-03-14' }] }))
  const sc = buildGanttScene({ columns: ['responsible'], labelSpans: { 'responsible|a': { rows: 2, bracket: true } } }, rows, { width: 900 })
  const cells = sc.cells.filter(c => c.col === 'responsible')
  assert.deepEqual(cells.map(c => c.text), ['CFO', 'CEO'])
  assert.equal(cells[0].span, 2)
  assert.equal(sc.labelBrackets.length, 1)
  assert.ok(cells[0].y > sc.rows[0].cy)
})
test('shade with a brace anchored below the plot', () => {
  const sc = buildGanttScene({ shades: [{ from: '2025-04-01', to: '2025-04-20', label: 'Easter', bracket: true }] }, R, { width: 800 })
  assert.ok(sc.shades[0].bracket.path)
  assert.ok(sc.height > sc.plot.bottom + 20)
})
test('outline, two-line labels', () => {
  const rows = [{ key: 'r', label: 'A', items: [{ key: 'b', start: '2025-03-03', end: '2025-03-05', label: 'Line one\nLine two', outline: 'black' }] }]
  const tall = buildGanttScene({ rowHeight: 34 }, rows, { width: 900 })
  assert.equal(tall.bars[0].outline, 'black')
  assert.deepEqual(tall.labels[0].lines, ['Line one', 'Line two'])
  const flat = buildGanttScene({}, rows, { width: 900 })
  assert.ok(!flat.labels[0].lines && flat.labels[0].text === 'Line one Line two')
})
test('drag a row, move a task to another row, step by zoom', () => {
  const rows = [{ key: 'a', items: [{ key: 'x', start: '2025-01-01' }] }, { key: 'b', level: 0, items: [] }, { key: 'b1', level: 1, items: [] }, { key: 'c', items: [] }]
  assert.deepEqual(moveRowTo(rows, 'b', 'a').map(r => r.key), ['b', 'b1', 'a', 'c'])
  assert.deepEqual(moveRowTo(rows, 'a', null).map(r => r.key), ['b', 'b1', 'c', 'a'])
  assert.equal(moveRowTo(rows, 'b', 'b1'), rows)
  const m = moveItem(rows, 'a', 'x', 'c', { start: '2025-02-01' })
  assert.equal(m[0].items.length, 0); assert.deepEqual(m[3].items[0], { key: 'x', start: '2025-02-01' })
  assert.deepEqual(duplicateRow(rows, 'c', 'above').map(r => r.key), ['a', 'b', 'b1', 'c-1', 'c'])
  assert.equal(ganttSnapUnit(10), 'day'); assert.equal(ganttSnapUnit(2), 'week'); assert.equal(ganttSnapUnit(0.5), 'month'); assert.equal(ganttSnapUnit(0.05), 'quarter')
})
test('sheet: the anchor type is read and written in After (SS / FF)', async () => {
  const { ganttSheet, parseGanttAfter } = await import('./sheetAdapters.js')
  const { buildSheet } = await import('./sheetModel.js')
  const rows = [
    { key: 'a', label: 'A', items: [{ key: 'x', start: '2025-03-03', end: '2025-03-14', label: 'Build' }] },
    { key: 'b', label: 'B', items: [{ key: 'y', start: '2025-03-20', end: '2025-03-25' }] },
  ]
  assert.deepEqual(parseGanttAfter('Build SS +2', rows), { after: 'x', lag: 2, link: 'ss' })
  assert.equal(parseGanttAfter('Build FS', rows).link, undefined)
  // An anchor set on the chart goes through the sheet, then back to the plan.
  const base = ganttSheet.toBase(rows, [])
  const plan = patchItem(rows, 'b', 'y', { after: 'x', link: 'ff', start: null, end: null, duration: 6 })
  const edits = ganttSheet.fromPlan(plan, [], base)
  assert.equal(edits.cells['b~y|after'], 'Build FF')
  const d = ganttSheet.fromSheet(buildSheet(base, edits), rows, [])
  const y = d.rows[1].items[0]
  assert.equal(y.link, 'ff'); assert.equal(y.after, 'x'); assert.equal(y.end, undefined)
  const sc = buildGanttScene({}, d.rows, { width: 800 })
  assert.equal(sc.bars.find(b => b.itemKey === 'y').end, '2025-03-14')
  assert.equal(sc.bars.find(b => b.itemKey === 'y').start, '2025-03-09')
})
test('scale handles: the date under the pointer, beyond the window', () => {
  const sc = buildGanttScene({ from: '2025-03-01', to: '2025-03-31', scale: 'month' }, R, { width: 800 })
  assert.equal(sc.dateAt(sc.plot.left), '2025-03-01')
  assert.ok(sc.dateAt(sc.plot.right + sc.plot.width) > '2025-04-25')
  assert.ok(sc.dateAt(sc.plot.left - sc.plot.width / 2) < '2025-02-20')
})
test('process arrows grow with the text, heights equalized', () => {
  const rows = [
    { key: 'a', label: 'A', items: [{ key: 'p', start: '2025-03-03', end: '2025-03-12', shape: 'chevron', label: 'Due diligence review' }] },
    { key: 'b', label: 'B', items: [{ key: 'q', start: '2025-03-13', end: '2025-03-28', shape: 'pentagon', label: 'Go' }, { key: 'r', start: '2025-04-01', end: '2025-04-20', label: 'Plain bar' }] },
  ]
  const sc = buildGanttScene({ rowHeight: 34 }, rows, { width: 700 })
  const p = sc.bars.find(b => b.itemKey === 'p'), q = sc.bars.find(b => b.itemKey === 'q'), r = sc.bars.find(b => b.itemKey === 'r')
  assert.ok(sc.arrowTall)
  assert.equal(p.height, q.height)
  assert.ok(p.height > r.height)
  assert.deepEqual(sc.labels.find(l => l.key === 'a|p').lines, ['Due diligence', 'review'])
  const short = buildGanttScene({ rowHeight: 34 }, [rows[1]], { width: 700 })
  assert.ok(!short.arrowTall && short.bars[0].height === short.bars[1].height)
})
test('inserted row: copies the anchored structure of its neighbour', () => {
  const rows = [
    { key: 'a', label: 'A', items: [{ key: 'x', start: '2025-03-03', end: '2025-03-14' }] },
    { key: 'b', label: 'B', items: [{ key: 'y', after: 'x', duration: 5, label: 'Build' }, { key: 'z', after: 'y', kind: 'milestone', label: 'Done' }] },
  ]
  const out = insertRow(rows, 'b', 'below')
  const nr = out[2]
  assert.equal(nr.items.length, 2)
  assert.deepEqual(nr.items.map(it => [it.after, it.label]), [['x', undefined], [nr.items[0].key, undefined]])
  assert.equal(nr.items[1].kind, 'milestone')
  assert.equal(insertRow(rows, 'a', 'below')[1].items.length, 0) // neighbour without anchors: empty row
  const sc = buildGanttScene({}, out, { width: 800 })
  assert.equal(sc.bars.find(b => b.rowKey === nr.key).start, '2025-03-15')
})
test('start date: placed before the bar (left), the end after it', () => {
  const rows = [{ key: 'r', label: 'x', items: [{ key: 'a', start: '2025-03-03', end: '2025-03-07', label: 'Request' }] }]
  const opts = { width: 900 }
  const sc = buildGanttScene({ from: '2025-02-01', to: '2025-04-30', dateLabels: 'start' }, rows, opts)
  const bar = sc.bars[0]
  const d = sc.labels.find(l => l.key === 'r|a|date')
  assert.equal(d.text, '3 Mar')
  assert.equal(d.anchor, 'end')
  assert.ok(d.x <= bar.x)
  const e = buildGanttScene({ from: '2025-02-01', to: '2025-04-30', dateLabels: 'end' }, rows, opts)
  const de = e.labels.find(l => l.key === 'r|a|date') ?? e.labels.find(l => String(l.text).includes('7 Mar'))
  assert.ok(de.x >= bar.x + bar.width)
  // No room before the plot (bar at the very start): never after the bar (it would read
  // as an end). Inside the bar, before its label; otherwise in place of the label; otherwise above.
  const after = sc => sc.labels.filter(l => String(l.text).includes('3 Mar') && l.x >= sc.bars[0].x + sc.bars[0].width - 1)
  const edge = buildGanttScene({ from: '2025-03-03', to: '2025-04-30', dateLabels: 'start' }, rows, opts)
  const de2 = edge.labels.find(l => l.key === 'r|a|date')
  assert.equal(after(edge).length, 0)
  assert.ok(de2.x >= edge.bars[0].x && de2.x < edge.bars[0].x + edge.bars[0].width)
  // 69 px bar: the date fits, "Request" after it does not, so the label goes after the bar.
  const lab = edge.labels.find(l => l.key === 'r|a')
  assert.equal(de2.color, 'white')
  assert.ok(lab.x >= edge.bars[0].x + edge.bars[0].width)
  // Wide bar: the date then the label, both inside the bar.
  const wide = buildGanttScene({ from: '2025-03-03', to: '2025-04-30', dateLabels: 'start' }, rows, { width: 1400 })
  const dw = wide.labels.find(l => l.key === 'r|a|date'), lw = wide.labels.find(l => l.key === 'r|a')
  assert.equal(after(wide).length, 0)
  assert.ok(dw.color === 'white' && lw.color === 'white' && lw.x > dw.x + 20 && lw.x < wide.bars[0].x + wide.bars[0].width)
  // Bar too short even for the date: above, aligned on the start.
  const tight = buildGanttScene({ from: '2025-03-03', to: '2025-12-31', dateLabels: 'start' }, rows, opts)
  const dt = tight.labels.find(l => l.key === 'r|a|date')
  assert.equal(after(tight).length, 0)
  assert.ok(dt.y < tight.bars[0].y && dt.x === tight.bars[0].x)
})

// A task label that fits neither in its bar nor after it (another bar follows, or the
// card edge) is placed above its bar, in full, in a band added to its row.
test('Gantt: label above the bar rather than truncated ("Rep…", "Dua…")', () => {
  const rows = [
    { key: 'it', label: 'IT carve-out', items: [{ key: 'it1', start: '2025-01-06', end: '2025-03-28', label: 'Separation' }] },
    { key: 'pr', label: 'Pricing', items: [{ key: 'pr1', start: '2025-02-03', end: '2025-05-30', label: 'Repricing wave 1', shape: 'pentagon' }, { key: 'pr2', after: 'pr1', duration: 60, label: 'Wave 2', shape: 'chevron' }] },
    { key: 'ex', label: 'Exit', items: [{ key: 'ex1', start: '2026-04-01', end: '2026-06-30', label: 'Dual track' }] },
  ]
  for (const labelPt of [null, 24, 36]) for (const width of [1100, 640]) {
    const sc = buildGanttScene({ labelPt }, rows, { width })
    for (const key of ['pr|pr1', 'ex|ex1']) {
      const l = sc.labels.find(q => q.key === key)
      const bar = sc.bars.find(b => b.key === key)
      if (!l || l.text.endsWith('…')) {
        // Truncated only if even above it does not fit in the card.
        assert.ok(l?.above, `${labelPt}/${width} ${key} truncated without moving above`)
        continue
      }
      if (l.above) {
        assert.ok(l.y < bar.y, `${key} above its bar`)
        const row = sc.rows.find(r => r.key === bar.rowKey)
        assert.ok(l.y - (labelPt ? labelPt * 4 / 3 * 0.75 : 9) >= row.y0 - 0.5, `${key} stays within its row`)
        // The label still covers its bar (it starts before the bar ends).
        assert.ok(l.x <= bar.x + bar.width)
      }
    }
    assert.ok(sc.labels.some(q => q.key === 'pr|pr1' && q.text === 'Repricing wave 1'), `${labelPt}/${width}: "Repricing wave 1" in full`)
    // The other rows keep their height: only the row that needs it grows.
    const h = r => r.y1 - r.y0
    const it = sc.rows.find(r => r.key === 'it'), pr = sc.rows.find(r => r.key === 'pr')
    if (sc.labels.find(q => q.key === 'pr|pr1')?.above) assert.ok(h(pr) > h(it))
  }
})
