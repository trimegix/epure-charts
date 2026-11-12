// Table: Style (font + size in points) at table, column and cell level;
// applied to the text and to row height.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTableScene } from './tableScene.js'

const cols = [{ key: 'a', label: 'Revenue', type: 'number' }, { key: 'b', label: 'Owner' }]
const rows = [{ key: 'r1', label: 'Alpha', cells: { a: 12.5, b: 'Ann' } }, { key: 'r2', label: 'Beta', cells: { a: 3, b: 'Bob' } }]
const at = (sc, k) => sc.cells.find(c => c.key === k)

test('table Style: font and size everywhere, the row grows', () => {
  const base = buildTableScene({}, cols, rows, { width: 600 })
  const big = buildTableScene({ labelPt: 24, labelFont: 'serif' }, cols, rows, { width: 600 })
  assert.equal(at(big, 'r1|a').fs, 32)
  assert.equal(at(big, 'r1|b').font, 'serif')
  assert.equal(at(base, 'r1|b').font, null)
  assert.ok(big.rowH >= 32 + 6 && big.rowH > base.rowH)
})

test('column Style: its size and font, header included; other columns keep theirs', () => {
  const sc = buildTableScene({ pts: { a: 20 }, fonts: { a: 'verdana' } }, cols, rows, { width: 600 })
  assert.equal(at(sc, 'r1|a').fs, 27)
  assert.equal(at(sc, '__head__|a').fs, 27)
  assert.equal(at(sc, 'r1|a').font, 'verdana')
  assert.equal(at(sc, 'r1|b').fs, 12)
  assert.equal(at(sc, 'r1|b').font, null)
  assert.ok(sc.rowH >= 27 + 6, `row ${sc.rowH}`)
  // The column widens to fit its enlarged text.
  const base = buildTableScene({}, cols, rows, { width: 300 })
  const wide = buildTableScene({ pts: { a: 30 } }, cols, rows, { width: 300 })
  assert.ok(wide.cols.find(c => c.key === 'a').w > base.cols.find(c => c.key === 'a').w)
})

test('cell Style: wins over the column and the table', () => {
  const sc = buildTableScene({ labelPt: 10, pts: { a: 14, 'r2|a': 30 }, fonts: { 'r2|a': 'mono' } }, cols, rows, { width: 600 })
  assert.equal(at(sc, 'r1|b').fs, 13)
  assert.equal(at(sc, 'r1|a').fs, 19)
  assert.equal(at(sc, 'r2|a').fs, 40)
  assert.equal(at(sc, 'r2|a').font, 'mono')
  assert.equal(at(sc, 'r1|a').font, null)
  // All rows share the same height: that of the largest text.
  assert.ok(sc.rows.every(r => r.h >= 46))
  // A manual height never clips the text.
  const hand = buildTableScene({ rowHeight: 20, pts: { 'r1|a': 30 } }, cols, rows, { width: 600 })
  assert.ok(hand.rowH >= 46)
  // An out-of-range value is ignored.
  assert.equal(at(buildTableScene({ pts: { a: 500 } }, cols, rows, { width: 600 }), 'r1|a').fs, 12)
})

test('empty table font: "Default", not "Mono (figures)"', async () => {
  const { fontOptions } = await import('./customStyle.js')
  assert.deepEqual(fontOptions('Default')[0], [null, 'Default'])
  assert.equal(fontOptions()[0][1], 'Mono (figures)')
  // Empty font: the cell keeps its type's font (no font forced).
  assert.equal(buildTableScene({}, cols, rows, { width: 600 }).cells.find(c => c.key === 'r1|a').font, null)
})

// At 24 pt the table stays within its width; headers wrap without overlapping, text that is too
// long is ellipsized (full text kept for hover), and symbols follow the size.
const SC = [
  { key: 'ebitda', label: 'EBITDA (€M)', type: 'number', decimals: 1 },
  { key: 'growth', label: 'Growth', type: 'icon' },
  { key: 'progress', label: 'Plan progress', type: 'harvey' },
  { key: 'esg', label: 'ESG maturity', type: 'harvey' },
  { key: 'report', label: 'Monthly report', type: 'check' },
  { key: 'risk', label: 'Risk', type: 'icon' },
  { key: 'note', label: 'Comment', type: 'text' },
]
const SR = [
  { key: 'alpha', label: 'Alpha', cells: { ebitda: 18.4, growth: 'up', progress: 3, esg: 2, report: true, risk: 'green', note: 'Pricing wave 1 done' } },
  { key: 'beta', label: 'Beta', cells: { ebitda: 9.2, growth: 'down', progress: 1, esg: 1, report: false, risk: 'amber', note: 'Late monthly report' } },
]
const cellOf = (sc, r, c) => sc.cells.find(x => x.row === r && x.col === c)
const fits = (sc, measure) => {
  for (const c of sc.cells) {
    const shown = c.lines ?? (c.type === 'text' || c.type === 'number' ? [c.shown ?? c.text] : [])
    // Vertical header: it fits within the header row height.
    const room = c.rotate === 90 ? c.h : c.w
    for (const l of shown) assert.ok(measure(l, c) <= room - 20 + 0.5, `${c.key} "${l}" ${measure(l, c)} > ${room - 20}`)
  }
}
test('table at 24 pt: inside the card, headers wrapped or ellipsized, nothing overflows its column', () => {
  const m = (s, c) => String(s).length * c.fs * 0.58 * (c.row === '__head__' ? 1.06 : 1) * (c.fs === 32 ? 1 : 32 / c.fs)
  for (const width of [1100, 800]) {
    const sc = buildTableScene({ labelPt: 24, labelHeader: 'Unit' }, SC, SR, { width })
    assert.ok(sc.width <= width + 0.01, `width ${sc.width} > ${width}`)
    fits(sc, m)
    // Headers do not overlap: each line fits its column (fits), and the header row fits all its lines.
    const head = sc.cells.filter(c => c.row === '__head__')
    assert.ok(head.some(c => c.lines?.length > 1), 'at least one header wraps')
    for (const c of head) assert.ok((c.lines?.length ?? 1) * 32 * 1.2 <= sc.headH, c.key)
    const note = cellOf(sc, 'alpha', 'note')
    assert.equal(note.text, 'Pricing wave 1 done')
    if (width === 800) assert.ok(note.clipped && note.shown.endsWith('…'))
  }
  // At the default size nothing changes: no ellipsis, no wrapping.
  const base = buildTableScene({ labelHeader: 'Unit' }, SC, SR, { width: 1100 })
  assert.ok(base.cells.every(c => !c.clipped && !c.lines))
})
test('table at 24 pt: Harvey balls, checkboxes and icons scale with the text', () => {
  const base = buildTableScene({}, SC, SR, { width: 1100 })
  const big = buildTableScene({ labelPt: 24 }, SC, SR, { width: 1100 })
  const hb = (sc) => cellOf(sc, 'alpha', 'progress'), ck = sc => cellOf(sc, 'alpha', 'report')
  assert.ok(hb(big).r >= hb(base).r * 2, `${hb(big).r} vs ${hb(base).r}`)
  assert.ok(ck(big).size >= ck(base).size * 2)
  assert.ok(cellOf(big, 'alpha', 'growth').k > 2 && cellOf(base, 'alpha', 'growth').k === 1)
  // never taller than the row, never wider than the column
  assert.ok(hb(big).r * 2 <= big.rowH && hb(big).r * 2 + 20 <= hb(big).w)
})

// At 24 pt, symbol columns take their content width (symbol + margin); the surplus goes to text.
test('table at 24 pt / 1100 px: no symbol column wider than 2× its content while text is ellipsized', () => {
  const rows = [...SR,
    { key: 'gamma', label: 'Gamma', cells: { ebitda: 24, growth: 'up', progress: 4, esg: 3, report: true, risk: 'green', note: 'Launch prep' } },
    { key: 'delta', label: 'Delta', cells: { ebitda: 6.7, growth: 'flat', progress: 2, esg: 0, report: 'empty', risk: 'red', note: 'Supplier dispute' } },
    { key: 'epsilon', label: 'Epsilon', cells: { ebitda: 12.1, growth: 'up', progress: 2, esg: 4, report: true, risk: 'green', note: '' } }]
  const marks = ['growth', 'progress', 'esg', 'report', 'risk']
  for (const width of [1100, 900, 800, 700]) {
    const sc = buildTableScene({ labelPt: 24, labelHeader: 'Unit' }, SC, rows, { width })
    assert.ok(sc.width <= width + 0.01)
    const textClipped = sc.cells.some(c => c.row !== '__head__' && (c.col === 'note' || c.col === '__label__') && c.clipped)
    for (const k of marks) {
      const c = cellOf(sc, 'alpha', k)
      const content = Math.max(c.r * 2, c.size) + 20
      if (textClipped) assert.ok(c.w <= 2 * content, `${width} ${k} ${c.w} > 2 × ${content}`)
    }
    if (width === 1100) {
      // At 1100 px the text is whole: Comment and the row names are no longer ellipsized.
      assert.ok(!textClipped, 'text ellipsized at 1100 px')
      assert.equal(cellOf(sc, '__head__', '__label__').clipped ?? false, false)
    }
  }
})

// A header that does not fit on two lines rotates to 90° automatically, the header row is capped
// at ~40% of the table, and a manually set orientation wins.
test('table at 24 pt: narrow headers auto-rotated to 90°, 40% cap, manual choice wins', () => {
  const rows = [...SR,
    { key: 'gamma', label: 'Gamma', cells: { ebitda: 24, growth: 'up', progress: 4, esg: 3, report: true, risk: 'green', note: 'Launch prep' } },
    { key: 'delta', label: 'Delta', cells: { ebitda: 6.7, growth: 'flat', progress: 2, esg: 0, report: 'empty', risk: 'red', note: 'Supplier dispute' } },
    { key: 'epsilon', label: 'Epsilon', cells: { ebitda: 12.1, growth: 'up', progress: 2, esg: 4, report: true, risk: 'green', note: '' } }]
  const sc = buildTableScene({ labelPt: 24, labelHeader: 'Unit' }, SC, rows, { width: 1100 })
  const head = sc.cells.filter(c => c.row === '__head__')
  // No horizontal header is ellipsized any more: either whole (one or two lines) or vertical.
  for (const c of head) if (!c.rotate) assert.ok(!(c.lines ?? [c.shown ?? c.text]).some(l => String(l).endsWith('…')), `${c.key} ellipsized while flat`)
  const turned = head.filter(c => c.autoRotate)
  assert.ok(turned.length >= 3, `rotated: ${turned.map(c => c.col)}`)
  assert.ok(sc.headH <= 0.4 * sc.height + 1, `${sc.headH} > 40% of ${sc.height}`)
  for (const c of turned) assert.equal(c.rotate, 90)
  // A manual 0° wins (stays flat, ellipsized if needed).
  const k = turned[0].col
  const flat = buildTableScene({ labelPt: 24, labelHeader: 'Unit', rotate: { [k]: 0 } }, SC, rows, { width: 1100 })
  assert.equal(cellOf(flat, '__head__', k).rotate, undefined)
  // Cap reached: vertical text that is too long is ellipsized, whole on hover ("Plan progr…").
  const capped = turned.filter(c => c.clipped)
  assert.ok(capped.length >= 1 && capped.every(c => c.shown.endsWith('…') && c.text.length > c.shown.length - 1))
  assert.ok(turned.some(c => !c.clipped && c.text === 'EBITDA (€M)'))
  // One-row table: a capped vertical header would show less than a horizontal one, so it stays flat.
  const short = buildTableScene({ labelPt: 24, labelHeader: 'Unit' }, SC, SR.slice(0, 1), { width: 1100 })
  assert.ok(short.cells.every(c => !c.autoRotate))
  // Default size, comfortable width: nothing rotates.
  assert.ok(buildTableScene({ labelHeader: 'Unit' }, SC, rows, { width: 1100 }).cells.every(c => !c.autoRotate))
})
