import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTableScene, checkOf, harveyOf, iconOf, nextInsertKey, LABEL_COL, TOTAL_ROW } from './tableScene.js'

const COLS = [
  { key: 'ebitda', label: 'EBITDA', type: 'number', unit: 'M' },
  { key: 'vcp', label: 'VCP progress', type: 'harvey' },
  { key: 'board', label: 'Board pack', type: 'check' },
  { key: 'trend', label: 'Trend', type: 'icon' },
  { key: 'note', label: 'Comment' },
]
const ROWS = [
  { key: 'a', label: 'Alpha', cells: { ebitda: 12.5, vcp: 0.75, board: true, trend: 'up', note: 'On plan' } },
  { key: 'b', label: 'Beta', cells: { ebitda: 8, vcp: 0.25, board: false, trend: 'down', note: 'Covenant watch' } },
  { key: 'c', label: 'Gamma', cells: { ebitda: 20, vcp: 1, board: null, trend: 'flat', note: '' } },
]
const cellOf = (sc, r, c) => sc.cells.find(x => x.row === r && x.col === c)

test('the value drives cell content', () => {
  const sc = buildTableScene({}, COLS, ROWS, { width: 720 })
  assert.equal(cellOf(sc, 'a', 'vcp').type, 'harvey')
  assert.equal(cellOf(sc, 'a', 'vcp').harvey, 0.75)
  assert.equal(cellOf(sc, 'a', 'board').check, 'yes')
  assert.equal(cellOf(sc, 'b', 'board').check, 'no')
  assert.equal(cellOf(sc, 'c', 'board').check, 'empty')
  assert.equal(cellOf(sc, 'b', 'trend').icon.shape, 'down')
  assert.equal(cellOf(sc, 'a', 'ebitda').text, '12.5')
})
test('auto type: inferred from the value', () => {
  const sc = buildTableScene({}, [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }], [{ key: 'r', label: 'R', cells: { x: 3, y: true } }], { width: 400 })
  assert.equal(cellOf(sc, 'r', 'x').type, 'number')
  assert.equal(cellOf(sc, 'r', 'y').type, 'check')
})
test('reading checkboxes and Harvey balls', () => {
  assert.equal(checkOf('✓'), 'yes'); assert.equal(checkOf('x'), 'no'); assert.equal(checkOf(''), 'empty'); assert.equal(checkOf(0), 'empty')
  assert.equal(harveyOf(2, 4), 0.5); assert.equal(harveyOf('50%'), 0.5); assert.equal(harveyOf(7, 4), 1); assert.equal(harveyOf(null), null)
  assert.equal(iconOf(-3).shape, 'down'); assert.equal(iconOf('red').color, 'red'); assert.equal(iconOf('nope'), null)
})
test('Harvey scale in quarters: auto when a value exceeds 1, or forced', () => {
  const rows = [{ key: 'a', label: 'A', cells: { h: 3 } }, { key: 'b', label: 'B', cells: { h: 1 } }]
  const sc = buildTableScene({}, [{ key: 'h', label: 'H', type: 'harvey' }], rows, { width: 300 })
  assert.equal(cellOf(sc, 'a', 'h').harvey, 0.75)
  assert.equal(cellOf(sc, 'b', 'h').harvey, 0.25)
  const sc1 = buildTableScene({ harveyMax: { h: 1 } }, [{ key: 'h', label: 'H', type: 'harvey' }], [{ key: 'a', label: 'A', cells: { h: 0.5 } }], { width: 300 })
  assert.equal(cellOf(sc1, 'a', 'h').harvey, 0.5)
})
test('type per cell and per column (preferences)', () => {
  const sc = buildTableScene({ cellTypes: { 'a|ebitda': 'text' }, colTypes: { note: 'icon' } }, COLS, ROWS, { width: 720 })
  assert.equal(cellOf(sc, 'a', 'ebitda').type, 'text')
  assert.equal(cellOf(sc, 'b', 'ebitda').type, 'number')
  // A value that is not an icon falls back to text.
  assert.equal(cellOf(sc, 'a', 'note').type, 'text')
})
test('number format: host formatter, decimals and magnitude', () => {
  const sc = buildTableScene({ decimals: { ebitda: 1 } }, COLS, ROWS, { width: 720, format: v => `€${v}M` })
  assert.equal(cellOf(sc, 'b', 'ebitda').text, '€8.0M')
  const sc2 = buildTableScene({ magnitude: { ebitda: 'k' } }, COLS, ROWS, { width: 720, format: v => `€${v}M` })
  assert.equal(cellOf(sc2, 'b', 'ebitda').text, '€8,000k')
})
test('row and column headers, default alignment', () => {
  const sc = buildTableScene({}, COLS, ROWS, { width: 720 })
  assert.equal(sc.rows[0].kind, 'header')
  assert.equal(sc.cols[0].key, LABEL_COL)
  assert.equal(sc.cols.find(c => c.key === 'ebitda').align, 'right')
  assert.equal(sc.cols.find(c => c.key === 'vcp').align, 'center')
  assert.equal(sc.cols.find(c => c.key === 'note').align, 'left')
  const bare = buildTableScene({ headerRow: false, headerCol: false }, COLS, ROWS, { width: 720 })
  assert.equal(bare.rows[0].kind, 'data')
  assert.equal(bare.cols[0].key, 'ebitda')
  assert.equal(buildTableScene({ align: { ebitda: 'center' } }, COLS, ROWS, { width: 720 }).cols.find(c => c.key === 'ebitda').align, 'center')
})
test('widths: the table fills its box, a manual width holds', () => {
  const sc = buildTableScene({}, COLS, ROWS, { width: 720 })
  assert.ok(Math.abs(sc.width - 720) < 1e-6)
  const m = buildTableScene({ widths: { vcp: 150 } }, COLS, ROWS, { width: 720 })
  assert.equal(m.cols.find(c => c.key === 'vcp').w, 150)
  assert.ok(m.cols.find(c => c.key === 'vcp').manual)
  // Too narrow: auto columns share the space without overflowing.
  const n = buildTableScene({}, COLS, ROWS, { width: 300 })
  assert.ok(n.width <= 300 + 1e-6)
  // Columns follow each other without gaps.
  for (let i = 1; i < sc.cols.length; i++) assert.ok(Math.abs(sc.cols[i].x - (sc.cols[i - 1].x + sc.cols[i - 1].w)) < 1e-6)
})
test('stripes by row or by column', () => {
  const r = buildTableScene({ stripes: 'rows' }, COLS, ROWS, { width: 720 })
  assert.equal(r.stripes.length, 1)
  assert.equal(r.stripes[0].y, r.rows.find(x => x.key === 'b').y)
  const c = buildTableScene({ stripes: 'cols' }, COLS, ROWS, { width: 720 })
  assert.equal(c.stripes.length, 2)
})
test('rules: under the header by default, all rows, columns', () => {
  assert.equal(buildTableScene({}, COLS, ROWS, { width: 720 }).lines.length, 1)
  assert.equal(buildTableScene({ rowLines: 'all' }, COLS, ROWS, { width: 720 }).lines.length, 1 + ROWS.length)
  assert.equal(buildTableScene({ rowLines: 'none', colLines: true }, COLS, ROWS, { width: 720 }).lines.filter(l => l.vertical).length, COLS.length)
})
test('bold row and totals row', () => {
  const sc = buildTableScene({ emphasis: ['b'], totals: true }, COLS, ROWS, { width: 720 })
  assert.ok(sc.rows.find(r => r.key === 'b').bold)
  assert.ok(!sc.rows.find(r => r.key === 'a').bold)
  const t = sc.rows.at(-1)
  assert.equal(t.key, TOTAL_ROW); assert.equal(t.kind, 'total'); assert.ok(t.bold)
  assert.equal(cellOf(sc, TOTAL_ROW, 'ebitda').text, '40.5')
  assert.ok(Math.abs(cellOf(sc, TOTAL_ROW, 'vcp').harvey - 2 / 3) < 1e-9)
  assert.equal(cellOf(sc, TOTAL_ROW, 'board').text, '1/3')
  assert.ok(sc.lines.some(l => l.key === `t-${TOTAL_ROW}` && l.strong))
})
test('insert and delete rows and columns', () => {
  const sc = buildTableScene({
    insRows: [{ key: 'row-1', after: 'a' }, { key: 'row-2', after: null }], hideRows: ['c'],
    insCols: [{ key: 'col-1', after: 'ebitda', label: 'New' }], hideCols: ['trend'], text: { 'row-1|col-1': 'hello', 'row-1|__label__': 'Inserted' },
  }, COLS, ROWS, { width: 720 })
  assert.deepEqual(sc.rows.filter(r => r.kind === 'data').map(r => r.key), ['row-2', 'a', 'row-1', 'b'])
  assert.deepEqual(sc.cols.map(c => c.key), [LABEL_COL, 'ebitda', 'col-1', 'vcp', 'board', 'note'])
  assert.equal(cellOf(sc, 'row-1', 'col-1').text, 'hello')
  assert.equal(cellOf(sc, 'row-1', LABEL_COL).text, 'Inserted')
  assert.equal(cellOf(sc, 'a', 'col-1').text, '')
  assert.equal(nextInsertKey(['row-1', 'row-2'], 'row'), 'row-3')
})
test('empty: no columns or no rows', () => {
  assert.ok(buildTableScene({}, [], ROWS).empty)
  assert.ok(buildTableScene({}, COLS, []).empty)
})
test('density: row height', () => {
  const a = buildTableScene({ density: 'compact' }, COLS, ROWS, { width: 720 })
  const b = buildTableScene({ density: 'roomy' }, COLS, ROWS, { width: 720 })
  assert.ok(b.height > a.height)
  assert.equal(a.height, a.rowH * (ROWS.length + 1))
})

// ── Colors: fill, ink, mark background, stripes (Fill, Font color, Stripe color 1 / 2) ──
test('colors per cell, row and column: the cell wins', () => {
  const sc = buildTableScene({ fills: { '*|ebitda': 'gray-100', 'a|*': 'cat-1', 'a|ebitda': 'green-bg' }, colors: { 'b|note': 'red' }, markFills: { '*|board': 'amber-bg' } }, COLS, ROWS, { width: 720 })
  assert.equal(cellOf(sc, 'a', 'ebitda').fill, 'green-bg')
  assert.equal(cellOf(sc, 'a', 'note').fill, 'cat-1')
  assert.equal(cellOf(sc, 'a', LABEL_COL).fill, 'cat-1')
  assert.equal(cellOf(sc, 'b', 'ebitda').fill, 'gray-100')
  assert.equal(cellOf(sc, 'b', 'vcp').fill, undefined)
  assert.equal(cellOf(sc, 'b', 'note').color, 'red')
  assert.equal(cellOf(sc, 'c', 'board').markFill, 'amber-bg')
  // The header does not take the column style.
  assert.equal(cellOf(sc, '__head__', 'ebitda').fill, undefined)
})
test('the sheet fill colors the table cell', async () => {
  const { tableSheet } = await import('./sheetAdapters.js')
  const { buildSheet, emptyEdits, setFill } = await import('./sheetModel.js')
  const base = tableSheet.toBase(COLS, ROWS)
  const d = tableSheet.fromSheet(buildSheet(base, setFill(emptyEdits(), [['b', 'note'], ['c', '*']], 'cat-3')), COLS, ROWS)
  const sc = buildTableScene({}, d.columns, d.rows, { width: 720 })
  assert.equal(cellOf(sc, 'b', 'note').fill, 'cat-3')
  assert.equal(cellOf(sc, 'c', 'ebitda').fill, 'cat-3')
  assert.equal(cellOf(sc, 'a', 'note').fill, undefined)
  // A preference set on the table wins over the sheet.
  assert.equal(buildTableScene({ fills: { 'b|note': 'gray-50' } }, d.columns, d.rows, { width: 720 }).cells.find(x => x.row === 'b' && x.col === 'note').fill, 'gray-50')
})
test('stripes: color 2 on odd rows, optional color 1 on even rows', () => {
  const sc = buildTableScene({ stripes: 'rows', stripeColors: ['cat-1', 'cat-2'] }, COLS, ROWS, { width: 720 })
  assert.equal(sc.stripes.length, 3)
  assert.deepEqual(sc.stripes.map(s => s.fill), ['cat-1', 'cat-2', 'cat-1'])
  const only2 = buildTableScene({ stripes: 'cols', stripeColors: [null, 'amber-bg'] }, COLS, ROWS, { width: 720 })
  assert.deepEqual(only2.stripes.map(s => s.fill), ['amber-bg', 'amber-bg'])
})
test('vertical alignment per column', () => {
  const sc = buildTableScene({ density: 'roomy', valign: { note: 'top', ebitda: 'bottom' } }, COLS, ROWS, { width: 720 })
  const a = cellOf(sc, 'a', 'note'), b = cellOf(sc, 'a', 'ebitda'), m = cellOf(sc, 'a', 'vcp')
  assert.ok(a.cy < m.cy && m.cy < b.cy)
  assert.equal(m.cy, m.y + m.h / 2)
})

// ── Harvey balls and checkboxes from the keyboard ──
test('Harvey ball: + / -, digits 0-8, eighths beyond 8 sectors', async () => {
  const { harveyKey, harveySectors } = await import('./tableScene.js')
  assert.equal(harveySectors(1), 4); assert.equal(harveySectors(4), 4); assert.equal(harveySectors(10), 10)
  assert.equal(harveyKey(0.5, '+', 1), 0.75)
  assert.equal(harveyKey(1, '+', 1), 1)
  assert.equal(harveyKey(0, '-', 1), 0)
  assert.equal(harveyKey(2, '-', 4), 1)
  assert.equal(harveyKey(null, '3', 4), 3)
  assert.equal(harveyKey(0, '3', 1), 0.75)
  assert.equal(harveyKey(0, '8', 4), 4)
  assert.equal(harveyKey(0, '4', 16), 8)
  assert.equal(harveyKey(0, '9', 4), null)
  assert.equal(harveyKey(0, 'a', 4), null)
})
test('double-click: the Harvey ball gains a sector then wraps to empty, the checkbox cycles', async () => {
  const { harveyCycle, checkCycle } = await import('./tableScene.js')
  assert.equal(harveyCycle(0.25, 1), 0.5)
  assert.equal(harveyCycle(1, 1), 0)
  assert.equal(harveyCycle(4, 4), 0)
  assert.equal(checkCycle('yes'), 'no'); assert.equal(checkCycle('no'), 'empty'); assert.equal(checkCycle('empty'), 'yes')
})
test('checkbox: v / 1, x / 2, space / 0; what is written to the sheet', async () => {
  const { checkKey, checkRaw, markEdit } = await import('./tableScene.js')
  assert.equal(checkKey('v'), 'yes'); assert.equal(checkKey('1'), 'yes')
  assert.equal(checkKey('X'), 'no'); assert.equal(checkKey('2'), 'no')
  assert.equal(checkKey(' '), 'empty'); assert.equal(checkKey('0'), 'empty'); assert.equal(checkKey('q'), null)
  assert.equal(checkRaw('yes', true), '1'); assert.equal(checkRaw('no', true), '-1'); assert.equal(checkRaw('no', false), 'no'); assert.equal(checkRaw('empty', true), '')
  const sc = buildTableScene({ totals: true }, COLS, ROWS, { width: 720 })
  assert.equal(markEdit(cellOf(sc, 'a', 'vcp'), '+'), '1')
  assert.equal(markEdit(cellOf(sc, 'b', 'board'), 'v'), '1')
  assert.equal(markEdit(cellOf(sc, 'b', 'board'), 'v', { numeric: false }), 'yes')
  assert.equal(markEdit(cellOf(sc, 'c', 'board'), null, { dbl: true }), '1')
  assert.equal(markEdit(cellOf(sc, 'a', 'note'), 'v'), null)
  assert.equal(markEdit(cellOf(sc, TOTAL_ROW, 'vcp'), '+'), null)
})
test('the key written to the sheet changes the drawn mark', async () => {
  const { tableSheet } = await import('./sheetAdapters.js')
  const { buildSheet, emptyEdits, setCell } = await import('./sheetModel.js')
  const { markEdit } = await import('./tableScene.js')
  const { applyValidation } = await import('./useSheet.js')
  const base = tableSheet.toBase(COLS, ROWS)
  const draw = e => { const sh = applyValidation(buildSheet(base, e), s => tableSheet.validate(s, COLS)); const d = tableSheet.fromSheet(sh, COLS, ROWS); return { sh, sc: buildTableScene({}, d.columns, d.rows, { width: 720 }) } }
  let { sh, sc } = draw(emptyEdits())
  const numeric = sh.cols.find(c => c.key === 'board').type !== 'text'
  let e = setCell(emptyEdits(), 'b', 'vcp', markEdit(cellOf(sc, 'b', 'vcp'), '+'))
  e = setCell(e, 'b', 'board', markEdit(cellOf(sc, 'b', 'board'), 'v', { numeric }))
  ;({ sh, sc } = draw(e))
  assert.equal(cellOf(sc, 'b', 'vcp').harvey, 0.5)
  assert.equal(cellOf(sc, 'b', 'board').check, 'yes')
  assert.ok(sh.rows.every(r => r.cells.every(c => !c.error)))
})

// ── Outline, orientation, shapes, unlinked cell ──
test('mark outline: color and style, the cell wins', async () => {
  const { OUTLINES } = await import('./tableScene.js')
  const sc = buildTableScene({ outlineColors: { '*|vcp': 'cat-2' }, outlineStyles: { '*|vcp': 'bold', 'a|vcp': 'dashed', 'b|board': 'none' } }, COLS, ROWS, { width: 720 })
  assert.deepEqual(cellOf(sc, 'b', 'vcp').outline, { color: 'cat-2', ...OUTLINES.bold })
  assert.equal(cellOf(sc, 'a', 'vcp').outline.dash, '2 2')
  assert.equal(cellOf(sc, 'b', 'board').outline.width, 0)
  assert.equal(cellOf(sc, 'a', 'board').outline, undefined)
})
test('90° header: the header row grows, the column stays narrow', () => {
  const cols = [{ key: 'h', label: 'A very long header label', type: 'harvey' }]
  const rows = [{ key: 'a', label: 'A', cells: { h: 0.5 } }]
  const flat = buildTableScene({ widths: { [LABEL_COL]: 80 } }, cols, rows, { width: 200 })
  const up = buildTableScene({ rotate: { h: 90 }, widths: { [LABEL_COL]: 80 } }, cols, rows, { width: 200 })
  assert.ok(up.headH > flat.headH)
  assert.equal(up.rows[0].h, up.headH)
  assert.equal(cellOf(up, '__head__', 'h').rotate, 90)
  assert.equal(cellOf(up, 'a', 'h').y, up.headH)
  assert.equal(up.lines.find(l => l.key === 'h').y1, up.headH)
})
test('pentagon and rounded cells: filled shape, text inside', () => {
  const sc = buildTableScene({ colTypes: { note: 'pentagon' }, cellTypes: { 'a|ebitda': 'pill' } }, COLS, ROWS, { width: 900 })
  const p = cellOf(sc, 'b', 'note'), r = cellOf(sc, 'a', 'ebitda')
  assert.equal(p.type, 'pentagon'); assert.equal(p.text, 'Covenant watch'); assert.equal(p.shape.points.split(' ').length, 5)
  assert.equal(r.type, 'pill'); assert.equal(r.text, '12.5'); assert.equal(r.shape.rx, r.shape.h / 2)
  assert.ok(p.tx > p.x && p.tx < p.x + p.w)
})
test('unlinked cell: free text overrides the sheet and is flagged; null relinks it', () => {
  const sc = buildTableScene({ overrides: { 'a|ebitda': 'n/a', 'b|vcp': '1' } }, COLS, ROWS, { width: 720 })
  assert.equal(cellOf(sc, 'a', 'ebitda').text, 'n/a'); assert.ok(cellOf(sc, 'a', 'ebitda').overwritten)
  assert.equal(cellOf(sc, 'b', 'vcp').harvey, 1); assert.ok(cellOf(sc, 'b', 'vcp').overwritten)
  assert.ok(!cellOf(sc, 'b', 'ebitda').overwritten)
  const back = buildTableScene({ overrides: { 'a|ebitda': null } }, COLS, ROWS, { width: 720 })
  assert.equal(cellOf(back, 'a', 'ebitda').text, '12.5'); assert.ok(!cellOf(back, 'a', 'ebitda').overwritten)
  // A changed sheet does not touch the unlinked cell.
  const rows2 = ROWS.map(r => (r.key === 'a' ? { ...r, cells: { ...r.cells, ebitda: 99 } } : r))
  assert.equal(cellOf(buildTableScene({ overrides: { 'a|ebitda': 'n/a' } }, COLS, rows2, { width: 720 }), 'a', 'ebitda').text, 'n/a')
})

test('table: resizing keeps proportions, height sets the rows', async () => {
  const { resizeTableWidths, resizeTableRowHeight } = await import('./tableScene.js')
  const cols = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]
  const rows = [{ key: 'r1', label: 'One', cells: { a: 1, b: 2 } }, { key: 'r2', label: 'Two', cells: { a: 3, b: 4 } }]
  const sc = buildTableScene({}, cols, rows, { width: 400 })
  const widths = resizeTableWidths(sc, 300)
  const sc2 = buildTableScene({ widths }, cols, rows, { width: 400 })
  assert.ok(Math.abs(sc2.width - 300) <= 3)
  assert.ok(Math.abs(sc2.cols[1].w / sc2.cols[2].w - sc.cols[1].w / sc.cols[2].w) < 0.05)
  const rh = resizeTableRowHeight(sc, sc.height + 30)
  const sc3 = buildTableScene({ rowHeight: rh }, cols, rows, { width: 400 })
  assert.equal(sc3.rowH, rh)
  assert.ok(rh > sc.rowH)
})

test('table: text and mark size in steps, alignment per cell', () => {
  const cols = [{ key: 'a', label: 'A' }, { key: 'h', label: 'H', type: 'harvey' }]
  const rows = [{ key: 'r1', label: 'One', cells: { a: 1, h: 0.5 } }]
  const sc = buildTableScene({}, cols, rows, { width: 400 })
  const big = buildTableScene({ fontSize: 'xlarge', markSizes: { h: 'large' }, align: { 'r1|a': 'left' }, valign: { 'r1|a': 'top' } }, cols, rows, { width: 400 })
  const at = (s, k) => s.cells.find(c => c.key === k)
  assert.ok(at(big, 'r1|a').fs > at(sc, 'r1|a').fs)
  assert.ok(big.rowH > sc.rowH)
  assert.ok(at(big, 'r1|h').r > at(sc, 'r1|h').r)
  assert.equal(at(big, 'r1|a').align, 'left')
  assert.equal(at(sc, 'r1|a').align, 'right')
  assert.equal(at(big, 'r1|a').valign, 'top')
  assert.ok(at(big, 'r1|a').cy < at(big, 'r1|a').y + big.rowH / 2)
})
