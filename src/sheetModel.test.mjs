import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSheet, toGrid, editsFromGrid, emptyEdits, hasEdits, parseTSV, toTSV } from './sheetModel.js'

const base = {
  rows: [
    { id: 'a', name: 'Sales', points: { 2023: { y: 100.004 }, 2024: { y: 110 } } },
    { id: 'b', name: 'BP', points: { 2023: { y: 95 }, 2024: { y: 105 } } },
  ],
  cols: [{ key: '2023', name: '2023' }, { key: '2024', name: '2024' }],
}

test('no edits: the sheet shows the source data, rounded to hundredths on screen', () => {
  const sh = buildSheet(base, emptyEdits())
  assert.equal(sh.edited, false)
  const g = toGrid(sh)
  assert.deepEqual(g.matrix, [['', '2023', '2024'], ['Sales', '100', '110'], ['BP', '95', '105']])
  const back = editsFromGrid(base, g.matrix, g.rowIds, g.colKeys)
  assert.equal(hasEdits(back.edits), false, 'display rounding is not an edit')
})

test('edit, rename, insert a column and a row, A1 formulas: the grid becomes edits', () => {
  const g = toGrid(buildSheet(base, emptyEdits()))
  const m = g.matrix.map(r => [...r])
  m[1][2] = '120'                       // C2: Sales 2024
  m[0][1] = 'FY23'                      // B1: rename 2023
  m.forEach((r, i) => r.push(i === 0 ? '2025' : ''))   // a trailing column
  m[1][3] = '=C2*1.1'                   // D2: formula
  m.push(['Gap', '=B2-B3', '=C2-C3', ''])               // a trailing row
  const { edits } = editsFromGrid(base, m, [...g.rowIds, null], [...g.colKeys, null])
  assert.equal(edits.cells['a|2024'], '120')
  assert.equal(edits.colNames['2023'], 'FY23')
  assert.deepEqual(edits.addedCols, [{ key: 'col1', after: '2024' }])
  assert.deepEqual(edits.addedRows, [{ id: 'row1', after: 'b' }])
  const sh = buildSheet(base, edits)
  assert.equal(sh.cols[0].name, 'FY23')
  assert.ok(Math.abs(sh.rows[0].cells[2].value - 132) < 1e-9, 'D2 = C2 × 1,1')
  assert.ok(Math.abs(sh.rows[2].cells[0].value - 5.004) < 1e-9, 'B4 = B2 − B3')
  assert.equal(sh.rows[2].name, 'Gap')
})

test('delete a base row and column; insert at the start', () => {
  const g = toGrid(buildSheet(base, emptyEdits()))
  const m = [['', '2024'], ['', ''], ['BP', '105']]
  const { edits } = editsFromGrid(base, m, [null, 'b'], ['2024'])
  assert.deepEqual(edits.removedRows, ['a'])
  assert.deepEqual(edits.removedCols, ['2023'])
  assert.deepEqual(buildSheet(base, edits).rows.map(r => r.id), ['row1', 'b'])
  assert.ok(g)
})

test('circular reference and text in a number cell: flagged, never thrown', () => {
  const sh = buildSheet(base, { ...emptyEdits(), cells: { 'a|2023': '=C2', 'a|2024': '=B2', 'b|2023': 'abc' } })
  assert.equal(sh.rows[0].cells[0].error, '#CYCLE')
  assert.equal(sh.rows[1].cells[0].error, '#VALUE')
})

test('TSV: paste from Excel, copy to Excel', () => {
  assert.deepEqual(parseTSV('a\tb\r\n1\t2\n'), [['a', 'b'], ['1', '2']])
  assert.ok(toTSV(buildSheet(base, emptyEdits())).startsWith('\t2023\t2024\nSales'))
})

test('automatic years: a column added after 2024 is named 2025', async () => {
  const { insertCol } = await import('./sheetModel.js')
  const sh = buildSheet(base, insertCol(emptyEdits(), '2024').edits)
  assert.equal(sh.cols.at(-1).name, '2025')
})

test('typed columns: text and date keep their input, an invalid date is flagged', () => {
  const b = { rows: [{ id: 'p', name: 'Alpha', points: { x: { y: 12 }, grp: { text: 'Software' }, d: { text: '2025-03-01' } } }],
    cols: [{ key: 'x', name: 'Growth' }, { key: 'grp', name: 'Group', type: 'text' }, { key: 'd', name: 'Start', type: 'date' }] }
  const sh = buildSheet(b, emptyEdits())
  assert.deepEqual(sh.rows[0].cells.map(c => c.value), [12, 'Software', '2025-03-01'])
  const g = toGrid(sh)
  assert.deepEqual(g.matrix[1], ['Alpha', '12', 'Software', '2025-03-01'])
  const m = g.matrix.map(r => [...r]); m[1][3] = '1er mars'
  const res = editsFromGrid(b, m, g.rowIds, g.colKeys)
  assert.deepEqual(Object.keys(res.edits.cells), ['p|d'])
  assert.equal(buildSheet(b, res.edits).rows[0].cells[2].error, '#DATE')
})

test('formatted input: %, currencies, separators, negatives in parentheses, typographic minus', async () => {
  const { parseCell } = await import('./sheetModel.js')
  assert.equal(parseCell('12.5%'), 0.125)
  assert.equal(parseCell('€1,234.5'), 1234.5)
  assert.equal(parseCell('(12)'), -12)
  assert.equal(parseCell('−3'), -3)
})

test('strict dates: "2025-13-40" is an error, not a rollover to the next month', () => {
  const b = { rows: [{ id: 'r', name: 'R', points: {} }], cols: [{ key: 'd', name: 'End', type: 'date' }] }
  assert.equal(buildSheet(b, { ...emptyEdits(), cells: { 'r|d': '2025-13-40' } }).rows[0].cells[0].error, '#DATE')
  assert.equal(buildSheet(b, { ...emptyEdits(), cells: { 'r|d': '2025-02-29' } }).rows[0].cells[0].error, '#DATE')
  assert.equal(buildSheet(b, { ...emptyEdits(), cells: { 'r|d': '2024-02-29' } }).rows[0].cells[0].value, '2024-02-29')
})

test('typed dates: common formats, optional time, format remembered; impossible dates rejected', async () => {
  const { parseDateInput } = await import('./sheetModel.js')
  assert.deepEqual(parseDateInput('2025-03-01'), { iso: '2025-03-01', pattern: 'iso' })
  assert.deepEqual(parseDateInput('01/03/2025'), { iso: '2025-03-01', pattern: 'dmy' })
  assert.deepEqual(parseDateInput('03/01/2025', 'mdy'), { iso: '2025-03-01', pattern: 'mdy' })
  assert.deepEqual(parseDateInput('1 Mar 2025'), { iso: '2025-03-01', pattern: 'd mmm yyyy' })
  assert.deepEqual(parseDateInput('Mar 1, 2025 14:30'), { iso: '2025-03-01T14:30', pattern: 'mmm d yyyy' })
  assert.equal(parseDateInput('2025-02-29'), null)
  assert.equal(parseDateInput('31/04/2025'), null)
  assert.equal(parseDateInput('2025-03-01 25:00'), null)
})

test('formulas: column A (names) and row 1 (headers) are readable by lookups', () => {
  const e = { ...emptyEdits(), cells: { 'b|2024': '=VLOOKUP("sales",A2:C2,3,FALSE)-5', 'b|2023': '=SUMIF(A2:A3,"S*",C2:C2)+COUNTIF(A2:A3,"bp")' } }
  const sh = buildSheet(base, e)
  assert.equal(sh.rows[1].cells[1].value, 105)
  assert.equal(sh.rows[1].cells[0].value, 111)
  const e2 = { ...emptyEdits(), cells: { 'b|2024': '=HLOOKUP("2023",B1:C2,2,FALSE)' } }
  assert.equal(buildSheet(base, e2).rows[1].cells[1].value, 100.004)
})

test('sheet width: clamped to 280 px and to the card, full width at the edge', async () => {
  const { clampSheetWidth } = await import('./sheetModel.js')
  assert.equal(clampSheetWidth(500.4, 900), 500)
  assert.equal(clampSheetWidth(100, 900), 280)
  assert.equal(clampSheetWidth(1200, 900), null)
  assert.equal(clampSheetWidth(600, undefined), 600)
})

test('auto-fill: a trailing column continues the headers', async () => {
  const { nextInSeries } = await import('./sheetModel.js')
  assert.equal(nextInSeries(['2024', '2025']), '2026')
  assert.equal(nextInSeries(['2025E']), '2026E')
  assert.equal(nextInSeries(['FY23', 'FY24']), 'FY25')
  assert.equal(nextInSeries(['2020', '2022']), '2024')
  assert.equal(nextInSeries(['Q1', 'Q2']), 'Q3')
  assert.equal(nextInSeries(['North', 'South']), null)
  assert.equal(nextInSeries(['Q4']), null)
  const base = { rows: [{ id: 'a', name: 'Sales', points: {} }], cols: [{ key: '2024', name: '2024' }, { key: '2025', name: '2025' }] }
  const sh = buildSheet(base, { ...emptyEdits(), addedCols: [{ key: 'col1', after: '2025' }, { key: 'col2', after: 'col1' }] })
  assert.deepEqual(sh.cols.map(c => c.name), ['2024', '2025', '2026', '2027'])
})

test('typing in the first empty grid column creates a category', async () => {
  const { growIds } = await import('./sheetModel.js')
  const base = { rows: [{ id: 'a', name: 'Sales', points: { 2024: { y: 1 }, 2025: { y: 2 } } }], cols: [{ key: '2024', name: '2024' }, { key: '2025', name: '2025' }] }
  const g = toGrid(buildSheet(base))
  const m = g.matrix.map(r => [...r, ''])
  m[1][3] = '190'
  const ids = growIds(m, g.rowIds, g.colKeys)
  assert.deepEqual(ids.colKeys, ['2024', '2025', null])
  assert.deepEqual(ids.rowIds, ['a'])
  const { edits } = editsFromGrid(base, m, ids.rowIds, ids.colKeys)
  const sh = buildSheet(base, edits)
  assert.equal(sh.cols[2].name, '2026')
  assert.equal(sh.rows[0].cells[2].value, 190)
  // An empty grid column adds nothing.
  assert.deepEqual(growIds(g.matrix.map(r => [...r, '']), g.rowIds, g.colKeys).colKeys, ['2024', '2025'])
})
