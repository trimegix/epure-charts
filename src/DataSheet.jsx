// ─── epure-charts · the chart datasheet ──────────────────────────────────────
// A real spreadsheet under the chart, inside its card (double-click the chart,
// or "Data sheet" in the settings menu), never a new surface:
//   row 1 = categories, column A = series, B2... = the numbers;
//   edit a cell (typing, double-click, F2), Enter / Tab / arrows,
//   paste a block from Excel, formulas (=C2/B2-1, =SUM(B2:F2)), fill handle,
//   insert / delete rows and columns (right-click or buttons), undo / redo.
//
// The grid is Jspreadsheet CE (MIT, bundled, no network request). It is only a
// workspace: on each change, sheetModel compares the grid with the source data
// and derives the edits. They are a view preference, flagged on the chart, never
// written to the collected data.
import { useEffect, useRef, useState } from 'react'
import jspreadsheet from 'jspreadsheet-ce'
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jsuites/dist/jsuites.css'
import { toGrid, editsFromGrid, growIds, toTSV, parseCell, setFill, setFont, toggleHidden, sortRows, clampSheetWidth } from './sheetModel'

// Jspreadsheet passes a list of { column | row, ... } objects, a single object or numbers depending on
// the gesture (menu, Tab at the end of a row...): normalized to one shape here.
const asList = (x, k = 'column') => (Array.isArray(x) ? x : x == null ? [] : [x]).map(v => (typeof v === 'number' ? { [k]: v } : v)).filter(v => v && Number.isFinite(v[k]))

// The grid sometimes returns escaped HTML ("&amp;"): read the input back as typed.
const decodeCell = v => (typeof v === 'string' ? v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : v)

const plural = w => (/s$/.test(w) ? w : `${w}s`)

// Layout options a user can keep as default.
const LAYOUT_KEYS = ['base100Row', 'sheetFormat', 'sheetFont', 'tableAll', 'gaps', 'emptyZero', 'subRow']

// Colors offered for cell fills (design system tokens).
const FILLS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8', 'gray-500', null]
import { colLetter } from './formula'
import { ActionMenu } from './ChartWheel'
import { colorName } from './colorNames'
import { IconArrowBackUp, IconArrowForwardUp, IconDots } from '@tabler/icons-react'
import { tok } from './customStyle.js'

// layout: { fixedCols?: true (columns are the chart's fields: no add or remove),
//           rowsLabel?: 'Slices' | 'Points'..., title? }. The same sheet serves every chart type.
export default function DataSheet({ api, onClose, layout = {}, colors = {} }) {
  const fixedCols = !!layout.fixedCols
  // Bar chart rotated to horizontal: categories become sheet rows;
  // rotated AND transposed, the sheet is back upright.
  const transposed = (!!api.fmt?.transpose !== !!api.fmt?.horizontal) && !fixedCols
  const host = useRef(null)
  const ws = useRef(null)
  const ids = useRef(null)
  // The grid's last selection: clicking a button makes it lose it.
  const selection = useRef({ x1: 1, y1: 1, x2: 1, y2: 1 })
  // The cell to select when the grid rebuilds (after a column insertion).
  const focusAfter = useRef(null)
  const apiRef = useRef(api)
  const [generation, setGeneration] = useState(0)
  const [fillOpen, setFillOpen] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState({ x: 1, y: 1 })
  // Sheet width inside the card (resizable window), remembered per browser.
  const [sheetW, setSheetW] = useState(() => { try { return Number(localStorage.getItem('epure-chart-sheet-width')) || null } catch { return null } })
  const saveW = w => { setSheetW(w); try { if (w) localStorage.setItem('epure-chart-sheet-width', String(w)); else localStorage.removeItem('epure-chart-sheet-width') } catch { /* private mode */ } }
  const resizeBy = (startW, dx) => clampSheetWidth(startW + dx, rootRef.current?.parentElement?.clientWidth)
  const onResizeDown = e => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX, w0 = rootRef.current.getBoundingClientRect().width
    let w = w0
    const move = ev => { w = resizeBy(w0, ev.clientX - x0); setSheetW(w) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveW(w) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // A click outside the "⋯" menu or the palette closes them (only one open at a time).
  const rootRef = useRef(null)
  useEffect(() => {
    if (!menuOpen && !fillOpen && !textOpen) return undefined
    const down = e => {
      if (e.target.closest?.('.chart-datasheet__menu, .chart-datasheet__fill') && rootRef.current?.contains(e.target)) return
      setMenuOpen(false); setFillOpen(false); setTextOpen(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [menuOpen, fillOpen, textOpen])
  const markRef = useRef(null)
  const colorsRef = useRef(colors)
  useEffect(() => { colorsRef.current = colors })
  // After each render (a color applied, a value recomputed) the grid refreshes.
  // API first, marking second (it reads the latest computed sheet).
  useEffect(() => { apiRef.current = api })
  useEffect(() => { markRef.current?.() })

  useEffect(() => {
    const el = host.current
    if (!el) return undefined
    // destroy() does not empty the container (and React mounts twice in dev): empty it.
    el.innerHTML = ''
    // Transposed ("Transpose"): the grid shows series as columns; ids stay
    // stored by rows / columns OF THE GRID, and input is translated back to the
    // model's orientation before becoming edits.
    const T = transposed
    const g0 = toGrid(apiRef.current.sheet)
    const g = T ? { matrix: g0.matrix[0].map((_, j) => g0.matrix.map(row => row[j])), rowIds: g0.colKeys, colKeys: g0.rowIds } : g0
    // Column A follows its labels (neither a fixed 170 px nor truncated).
    const colAWidth = Math.max(90, Math.min(220, Math.max(...g.matrix.map(row => String(row[0] ?? '').length)) * 7 + 24))
    ids.current = { rowIds: [...g.rowIds], colKeys: [...g.colKeys] }

    // Edited cells are visible (amber background): a class set on the DOM,
    // outside the spreadsheet's history.
    const mark = edits => {
      const r = ids.current.rowIds
      const c = ids.current.colKeys
      const on = new Set()
      // Grid coordinates of a model cell (row, column), transposition included.
      const at = (rowId, colKey) => (T ? `${c.indexOf(rowId) + 1}:${r.indexOf(colKey) + 1}` : `${c.indexOf(colKey) + 1}:${r.indexOf(rowId) + 1}`)
      for (const k of Object.keys(edits.cells)) {
        const [rowId, colKey] = k.split('|')
        on.add(at(rowId, colKey))
      }
      for (const k of Object.keys(edits.colNames)) on.add(T ? `0:${r.indexOf(k) + 1}` : `${c.indexOf(k) + 1}:0`)
      for (const k of Object.keys(edits.rowNames)) on.add(T ? `${c.indexOf(k) + 1}:0` : `0:${r.indexOf(k) + 1}`)
      // Fill colors ("Use Datasheet Fill") and error cells, read from the computed sheet.
      const sh = apiRef.current.sheet
      el.querySelectorAll('td[data-x][data-y]').forEach(td => {
        td.classList.toggle('is-edited', on.has(`${td.dataset.x}:${td.dataset.y}`))
        const gx = Number(td.dataset.x), gy = Number(td.dataset.y)
        const xi = T ? gy : gx, yi = T ? gx : gy
        const row = yi > 0 ? sh.rows[yi - 1] : null
        const cell = row && xi > 0 ? row.cells[xi - 1] : null
        const fill = cell?.fill ?? (xi === 0 ? row?.fill : null)
        // Fill applied: tinted background; column A: the series color (set or original) as a stripe.
        td.style.background = fill ? `color-mix(in srgb, ${tok(fill)} 22%, transparent)` : ''
        const own = xi === 0 && gx === 0 && row ? (row.fill ?? colorsRef.current?.[row.id]) : null
        td.style.boxShadow = own ? `inset 4px 0 0 ${tok(own)}` : ''
        // Text formatting (bold, italic, color, alignment, border): picked up by the chart when requested.
        const font = cell?.font
        td.style.fontWeight = font?.bold ? '700' : ''
        td.style.fontStyle = font?.italic ? 'italic' : ''
        td.style.color = font?.color ? tok(font.color) : ''
        td.style.textAlign = font?.align ?? ''
        td.style.verticalAlign = font?.valign ?? ''
        td.style.outline = font?.border ? '1px solid var(--gray-700)' : ''
        td.style.outlineOffset = font?.border ? '-2px' : ''
        td.classList.toggle('is-error', !!cell?.error)
        td.classList.toggle('is-warning', !!cell?.warning)
        // Label rewritten by hand on the chart (free text): marked in its cell.
        const over = row && xi > 0 && apiRef.current.fmt?.labels?.texts?.[`${row.id}|${sh.cols[xi - 1]?.key}`] != null
        td.classList.toggle('is-overwritten', !!over)
        // Accessibility: grid cells (row / column headers included).
        td.setAttribute('role', gy === 0 ? 'columnheader' : gx === 0 ? 'rowheader' : 'gridcell')
        td.classList.toggle('is-hidden', !!(row?.hidden || (xi > 0 && sh.cols[xi - 1]?.hidden)))
        td.title = cell?.error ? `${cell.error}: this value is ignored by the chart` : cell?.warning ? cell.warning : td.classList.contains('readonly') ? (td.title || 'Read-only: computed by the chart') : ''
        // Column header left empty in the grid (column just inserted): the name given by the model.
        if (yi === 0 && xi > 0 && !td.textContent.trim() && sh.cols[xi - 1]?.name) td.textContent = sh.cols[xi - 1].name
        // An error cell shows what was typed (in red), never the previous value.
        if (cell?.error && cell.raw != null && td.textContent !== String(cell.raw)) td.textContent = String(cell.raw)
        // A validated date displays normalized (YYYY-MM-DD, time after it), whatever format was typed.
        if (cell && !cell.error && sh.cols[xi - 1]?.type === 'date' && typeof cell.value === 'string' && td.textContent !== cell.value.replace('T', ' ')) td.textContent = cell.value.replace('T', ' ')
        const head = td.dataset.y === '0' || td.dataset.x === '0'
        td.classList.toggle('is-head', head)
        // A formula result displays to two decimals (the stored value does not change).
        if (!head && /^-?\d+\.\d{3,}$/.test(td.textContent)) td.textContent = String(Math.round(Number(td.textContent) * 100) / 100)
      })
    }
    markRef.current = () => mark(apiRef.current.edits)
    const sync = sheet => {
      const data = sheet.getData(false, false).map(row => row.map(v => decodeCell(v)))
      // Input in a grid column (or row) that has no id yet becomes an added
      // column (row), hence a chart category (series).
      // (Fixed columns: the grid only gains model rows.)
      const grown = growIds(data, ids.current.rowIds, ids.current.colKeys)
      ids.current = { rowIds: fixedCols && T ? ids.current.rowIds : grown.rowIds, colKeys: fixedCols && !T ? ids.current.colKeys : grown.colKeys }
      const model = T ? data[0].map((_, j) => data.map(row => row[j])) : data
      const res = editsFromGrid(apiRef.current.sheetBase, model, T ? ids.current.colKeys : ids.current.rowIds, T ? ids.current.rowIds : ids.current.colKeys)
      ids.current = T ? { rowIds: res.colKeys, colKeys: res.rowIds } : { rowIds: res.rowIds, colKeys: res.colKeys }
      // The grid only knows values: fill colors are kept from one input to the next.
      apiRef.current.applyEdits(cur => ({ ...res.edits, fills: cur.fills ?? {}, fonts: cur.fonts ?? {}, hiddenRows: cur.hiddenRows ?? [], hiddenCols: cur.hiddenCols ?? [], rowOrder: cur.rowOrder ?? null }))
      mark(res.edits)
    }
    // Row 1 and column A carry the names: nothing is inserted or deleted before them.
    const guardRows = rows => !rows.some(i => i === 0)
    const guardCols = cols => !cols.some(i => i === 0)

    const [sheet] = jspreadsheet(el, {
      worksheets: [{
        data: g.matrix,
        // Each column's type: numbers right-aligned, text left, dates as calendar; a computed column is read-only.
        columns: g.matrix[0].map((_, j) => {
          const col = j === 0 ? null : apiRef.current.sheet.cols[j - 1]
          const t = col?.type ?? 'number'
          // Dates: typed on the keyboard (YYYY-MM-DD), checked by the sheet (#DATE); a calendar
          // editor also reformatted the column header and blocked typing.
          return t === 'date'
            ? { type: 'text', width: 128, align: 'left', readOnly: !!col?.readOnly }
            // Width: enough for the header ("Revenue growth (%)" is no longer truncated), bounded.
            // Text: Alt+Enter inserts a line break in the cell (wordWrap).
            // Width: the header and the content (first 60 rows), bounded.
            : { type: 'text', wordWrap: j === 0 || t === 'text', width: j === 0 ? colAWidth : Math.max(t === 'text' ? 110 : 76, Math.min(t === 'text' ? 240 : 180, Math.max(...g.matrix.slice(0, 61).map(row => String(row[j] ?? '').length)) * 7 + 18)), align: j === 0 || t === 'text' ? 'left' : 'right', readOnly: !!col?.readOnly }
        }),
        minDimensions: [g.matrix[0].length, g.matrix.length],
        allowInsertRow: true, allowDeleteRow: true, allowInsertColumn: !fixedCols, allowDeleteColumn: !fixedCols,
        allowRenameColumn: false, columnSorting: false, columnDrag: false, rowDrag: false,
        tableOverflow: true, tableWidth: '100%', tableHeight: `${Math.min(480, Math.max(140, (g.matrix.length + 1) * 27))}px`,
      }],
      parseFormulas: true,
      toolbar: false,
      onselection: (s, x1, y1, x2, y2) => { selection.current = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) }; setActive({ x: x1, y: y1 }) },
      // Neither Tab nor Enter at the sheet edge creates a phantom row or column.
      // Tab / Enter at the edge extend the data (like Excel); a row or column left empty does not enter the chart.
      allowManualInsertRow: true, allowManualInsertColumn: !fixedCols,
      onafterchanges: s => sync(s),
      onbeforeinsertrow: (s, rows) => (guardRows(asList(rows, 'row').map(r => r.row)) ? undefined : false),
      onbeforedeleterow: (s, rows) => (guardRows(rows) ? undefined : false),
      onbeforeinsertcolumn: (s, colsIn) => {
        const cols = asList(colsIn)
        if (!guardCols(cols.map(c => c.column))) return false
        // An inserted column takes the other columns' settings (text, width, alignment):
        // without them, the first character typed in its header was lost.
        for (const c of cols) if (c && typeof c === 'object' && 'options' in c) c.options = { ...(c.options ?? {}), type: 'text', width: 86, align: 'right' }
        return undefined
      },
      onbeforedeletecolumn: (s, cols) => (guardCols(cols) ? undefined : false),
      oninsertrow: (s, rowsIn) => { for (const r of asList(rowsIn, 'row').sort((a, b) => a.row - b.row)) ids.current.rowIds.splice(r.row - 1, 0, null); sync(s) },
      ondeleterow: (s, rows) => { for (const i of [...rows].sort((a, b) => b - a)) ids.current.rowIds.splice(i - 1, 1); sync(s) },
      // A freshly inserted column is not quite ready in Jspreadsheet (its first
      // keystroke did not open the editor): the grid rebuilds from the already
      // updated sheet, and the new column's header is selected.
      oninsertcolumn: (s, colsIn) => {
        const sorted = asList(colsIn).sort((a, b) => a.column - b.column)
        if (!sorted.length) return
        for (const c of sorted) ids.current.colKeys.splice(c.column - 1, 0, null)
        sync(s)
        // Tab at the end of a row (column added at the end): stay on the row, like Excel;
        // the header names itself if it continues a sequence ("2026" after "2025").
        const appended = sorted.at(-1).column >= ids.current.colKeys.length && selection.current.y1 > 0
        focusAfter.current = { x: sorted[0].column, y: appended && !T ? selection.current.y1 : 0 }
        setGeneration(n => n + 1)
      },
      ondeletecolumn: (s, cols) => { for (const i of [...cols].sort((a, b) => b - a)) ids.current.colKeys.splice(i - 1, 1); sync(s) },
    })
    ws.current = sheet
    mark(apiRef.current.edits)
    if (!focusAfter.current) {
      // On open: the first data cell is active, the keyboard goes straight to it.
      sheet.updateSelectionFromCoords(1, 1, 1, 1)
      jspreadsheet.current = sheet
      el.setAttribute('tabindex', '0')
      el.focus({ preventScroll: true })
    }
    if (focusAfter.current) {
      const { x, y } = focusAfter.current
      focusAfter.current = null
      sheet.updateSelectionFromCoords(x, y, x, y)
      jspreadsheet.current = sheet
      // The new column opens in edit mode on its header so it can be named right
      // away (after an insertion, the first keystroke on a merely selected cell was
      // lost in Jspreadsheet).
      const td = el.querySelector(`td[data-x="${x}"][data-y="${y}"]`)
      if (td) sheet.openEditor(td, true)
    }
    return () => { jspreadsheet.destroy(el, true); el.innerHTML = ''; ws.current = null }
  }, [generation, fixedCols, transposed])

  // After a button, the grid takes focus back on the cell to name (otherwise the
  // first keystroke is lost: focus stayed on the button).
  const focusCell = (x, y) => {
    document.activeElement?.blur?.()
    ws.current?.updateSelectionFromCoords(x, y, x, y)
    if (ws.current) jspreadsheet.current = ws.current
  }
  // Like Excel: insert BEFORE the selection (row above, column to the left).
  const addRow = () => { const r = Math.max(1, firstRow()); if (ws.current?.insertRow(1, r - 1, true) !== false) focusCell(0, r) }
  const addCol = () => { document.activeElement?.blur?.(); ws.current?.insertColumn(1, Math.max(1, firstCol()), true) }
  const lastRow = () => Math.max(1, selection.current.y2)
  const lastCol = () => Math.max(1, selection.current.x2)
  const firstRow = () => selection.current.y1
  const firstCol = () => selection.current.x1
  const sortBy = dir => {
    const x = selection.current.x1
    const colKey = x > 0 ? ids.current?.colKeys?.[x - 1] : null
    api.applyEdits(cur => sortRows(cur, api.sheet, colKey, dir))
    setGeneration(n => n + 1)
  }
  // Hide: column A selected = rows; row 1 selected = columns.
  const toggleHide = () => {
    const { x1, x2, y1, y2 } = selection.current
    const rowIds = ids.current?.rowIds ?? [], colKeys = ids.current?.colKeys ?? []
    const gRows = x1 === 0 ? rowIds.slice(Math.max(1, y1) - 1, y2).filter(Boolean) : []
    const gCols = y1 === 0 ? colKeys.slice(Math.max(1, x1) - 1, x2).filter(Boolean) : []
    const [rows, cols] = transposed ? [gCols, gRows] : [gRows, gCols]
    if (rows.length || cols.length) api.applyEdits(cur => toggleHidden(cur, rows, cols))
  }
  // Selected cells become "row|column" targets; column A means the whole row.
  const targetsOf = () => {
    const { x1, x2, y1, y2 } = selection.current
    const rowIds = ids.current?.rowIds ?? [], colKeys = ids.current?.colKeys ?? []
    const targets = []
    for (let y = Math.max(1, y1); y <= y2; y++) {
      const rid = rowIds[y - 1]
      if (!rid) continue
      if (x1 === 0 && !transposed) targets.push([rid, '*'])
      for (let x = Math.max(1, x1); x <= x2; x++) if (colKeys[x - 1]) targets.push(transposed ? [colKeys[x - 1], rid] : [rid, colKeys[x - 1]])
    }
    return targets
  }
  const applyFont = patch => { const t = targetsOf(); if (t.length) api.applyEdits(cur => setFont(cur, t, patch)) }
  const applyFill = token => {
    const { x1, x2, y1, y2 } = selection.current
    const rowIds = ids.current?.rowIds ?? [], colKeys = ids.current?.colKeys ?? []
    const targets = []
    for (let y = Math.max(1, y1); y <= y2; y++) {
      const rid = rowIds[y - 1]
      if (!rid) continue
      if (x1 === 0 && !transposed) targets.push([rid, '*'])
      for (let x = Math.max(1, x1); x <= x2; x++) if (colKeys[x - 1]) targets.push(transposed ? [colKeys[x - 1], rid] : [rid, colKeys[x - 1]])
    }
    if (targets.length) api.applyEdits(cur => setFill(cur, targets, token))
  }

  // The "⋯" menu: insertions and deletions (like Excel's right-click), clipboard,
  // back to source, then the chart's own layout options.
  const fmt = api.fmt ?? {}
  const togglePct = () => {
    const ks = api.sheet.cols.slice(Math.max(0, firstCol() - 1), Math.max(1, lastCol())).map(c => c.key)
    const cur = new Set(fmt.pctCols ?? [])
    const allOn = ks.every(k => cur.has(k))
    for (const k of ks) { if (allOn) cur.delete(k); else cur.add(k) }
    api.setFmt('pctCols', cur.size ? [...cur] : null)
  }
  const menuItems = [
    { label: `Insert ${layout.rowName ?? 'row'} above`, onSelect: () => addRow() },
    !fixedCols && { label: 'Insert column left', onSelect: () => addCol() },
    // Waterfall: one more column = one more segment in each step (stacked waterfall).
    layout.segmentCols && { label: 'Add a segment column', onSelect: () => { document.activeElement?.blur?.(); ws.current?.insertColumn(1, api.sheet.cols.length, false) } },
    { label: `Delete selected ${plural(layout.rowName ?? 'row')}`, onSelect: () => { const a = firstRow(); if (a >= 1) ws.current?.deleteRow(a - 1, lastRow() - a + 1) } },
    !fixedCols && { label: 'Delete selected columns', onSelect: () => { const a = firstCol(); if (a >= 1) ws.current?.deleteColumn(a, lastCol() - a + 1) } },
    '-',
    { label: 'Cut', shortcut: 'Ctrl+X', onSelect: () => ws.current?.copy?.(true) },
    { label: 'Copy whole sheet', onSelect: () => navigator.clipboard?.writeText(toTSV(api.sheet)) },
    { label: 'Hide / show selected rows or columns', onSelect: () => toggleHide() },
    // Sort (the sheet order is the chart order).
    { label: 'Sort rows by this column, ascending', onSelect: () => sortBy('asc') },
    { label: 'Sort rows by this column, descending', onSelect: () => sortBy('desc') },
    api.edits?.rowOrder && { label: 'Original row order', onSelect: () => sortBy(null) },
    '-',
    api.setFmt && { label: 'Transpose (series in columns)', checked: !!fmt.transpose, onSelect: () => api.setFmt('transpose', fmt.transpose ? null : true) },
    api.setFmt && { label: 'Reverse rows', checked: fmt.seriesOrder === 'reverse', onSelect: () => api.setFmt('seriesOrder', fmt.seriesOrder === 'reverse' ? null : 'reverse') },
    api.setFmt && { label: 'Reverse columns', checked: fmt.catOrder === 'reverse', onSelect: () => api.setFmt('catOrder', fmt.catOrder === 'reverse' ? null : 'reverse') },
    api.setFmt && { label: 'Empty cells make a gap', checked: fmt.gaps === 'break', onSelect: () => { api.setFmt('emptyZero', null); api.setFmt('gaps', fmt.gaps === 'break' ? null : 'break') } },
    api.setFmt && { label: 'Empty cells count as zero', checked: !!fmt.emptyZero, onSelect: () => { api.setFmt('gaps', null); api.setFmt('emptyZero', fmt.emptyZero ? null : true) } },
    api.setFmt && { label: '% entry for selected columns', checked: (fmt.pctCols ?? []).length > 0, disabled: !api.bars || api.bars === 'clustered', title: 'Stacked charts only: the column reads as % of its 100%= row', onSelect: () => togglePct() },
    api.setFmt && { label: 'Use the sheet number and date format on labels', checked: !!fmt.sheetFormat, onSelect: () => api.setFmt('sheetFormat', fmt.sheetFormat ? null : true) },
    // "Use Datasheet Bold/Italic, Font Color, Alignment, Border": the cells' text styling applied to labels.
    api.setFmt && { label: 'Use the sheet font on labels (bold, italic, color, alignment, border)', checked: !!fmt.sheetFont, onSelect: () => api.setFmt('sheetFont', fmt.sheetFont ? null : true) },
    api.setFmt && { label: 'Second label row', checked: !!fmt.subRow, onSelect: () => api.setFmt('subRow', fmt.subRow ? null : true) },
    // Layout ("Edit Data Layout"): optional sheet rows and columns.
    api.setFmt && api.bars && api.bars !== 'clustered' && { label: '100%= row', checked: fmt.base100Row ?? api.bars === 'stacked100', onSelect: () => api.setFmt('base100Row', !(fmt.base100Row ?? api.bars === 'stacked100')) },
    api.setFmt && { label: 'Series names shown on the chart', checked: fmt.legend !== 'none', onSelect: () => api.setFmt('legend', fmt.legend === 'none' ? null : 'none') },
    api.setFmt && { label: 'Category labels shown on the chart', checked: fmt.xAxis?.labels !== false, onSelect: () => api.setFmt('xAxis.labels', fmt.xAxis?.labels === false ? null : false) },
    // "Enable Data Tables": every series except the first goes below the axis, as a table;
    // kept as the default layout, it applies to future charts.
    api.setFmt && { label: 'Data table: all series but the first', checked: !!fmt.tableAll, onSelect: () => api.setFmt('tableAll', fmt.tableAll ? null : true) },
    // The user's default layout: applied to sheets that have none of their own.
    api.setFmt && { label: 'Use this layout as my default', onSelect: () => { try { localStorage.setItem('epure-chart-sheet-layout', JSON.stringify(Object.fromEntries(LAYOUT_KEYS.map(k => [k, fmt[k] ?? null])))) } catch { /* private mode */ } } },
    api.setFmt && '-',
    { label: 'Reset to source', disabled: !api.sheetEdited, onSelect: () => { api.resetSheet(); setGeneration(n => n + 1) } },
  ]
  const errorCount = (api.sheet?.rows ?? []).reduce((t, r) => t + r.cells.filter(c => c.error).length, 0)
  const warning = (api.sheet?.rows ?? []).flatMap(r => r.cells.filter(c => c.warning).map(c => c.warning))[0]
  // The formula bar: the active cell's raw input (a formula can be read and fixed here).
  // Model coordinates of the active cell (the transposed grid swaps rows and columns).
  const mx = transposed ? active.y : active.x, my = transposed ? active.x : active.y
  const activeRow = my > 0 ? api.sheet.rows[my - 1] : null
  const activeRaw = my === 0 ? api.sheet.cols[mx - 1]?.name ?? '' : mx === 0 ? activeRow?.name ?? '' : activeRow?.cells[mx - 1]?.raw ?? ''
  const activeFill = mx > 0 ? activeRow?.cells[mx - 1]?.fill : activeRow?.fill
  const activeFont = (mx > 0 ? activeRow?.cells[mx - 1]?.font : null) ?? {}
  const onKey = e => {
    const editing = e.target.closest?.('.jss_worksheet td input, .jss_worksheet td textarea, .jss_worksheet .editor, .chart-datasheet__fx input')
    // Escape: first the open menu or palette (focus returns to the grid), otherwise the sheet.
    if (e.key === 'Escape' && (menuOpen || fillOpen || textOpen)) { e.preventDefault(); setMenuOpen(false); setFillOpen(false); setTextOpen(false); focusCell(Math.max(1, active.x), Math.max(1, active.y)); return }
    if (e.key === 'Escape' && !editing) { e.preventDefault(); onClose?.() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); ws.current?.redo() }
    // Excel: Ctrl+arrow goes to the data edge, Ctrl+Shift+arrow extends the selection there.
    if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow') && !editing && ws.current) {
      e.preventDefault()
      const nCols = api.sheet.cols.length, nRows = api.sheet.rows.length
      const [W, H] = transposed ? [nRows, nCols] : [nCols, nRows]
      const { x1, y1, x2, y2 } = selection.current
      const tx = e.key === 'ArrowRight' ? W : e.key === 'ArrowLeft' ? 0 : null
      const ty = e.key === 'ArrowDown' ? H : e.key === 'ArrowUp' ? 0 : null
      if (e.shiftKey) ws.current.updateSelectionFromCoords(x1, y1, tx ?? x2, ty ?? y2)
      else { const x = tx ?? x1, y = ty ?? y1; ws.current.updateSelectionFromCoords(x, y, x, y) }
    }
  }

  return (
    <div ref={rootRef} className="chart-datasheet" role="region" aria-label="Data sheet" onKeyDown={onKey} style={sheetW ? { width: sheetW } : undefined}>
      <div className="chart-datasheet__head">
        {/* Help as the title tooltip; the state (edited or not) in one word. */}
        <span className="chart-datasheet__title" title="Type values or formulas (=B2*2, =IF(B2>10,1,0), =SUMIF(B2:F2,&quot;>0&quot;), =VLOOKUP(&quot;EBITDA&quot;,A2:F9,3,FALSE)); paste from Excel; right-click a header to insert or delete. Edits here are not the reported data.">{layout.title ?? 'Sheet · series'}</span>
        <span className="chart-datasheet__note">{api.sheetEdited ? 'Edited' : 'Reported data'}{transposed ? ' · transposed' : ''}{errorCount > 0 && <span className="chart-engine-edited-err"> · {errorCount} error{errorCount > 1 ? 's' : ''} (ignored)</span>}{warning && <span className="chart-engine-edited-warn" title={warning}> · check: {warning.split(':')[0]}</span>}</span>
        <button type="button" className="chart-editor-pill is-icon" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={() => ws.current?.undo()}><IconArrowBackUp size={14} /></button>
        <button type="button" className="chart-editor-pill is-icon" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={() => ws.current?.redo()}><IconArrowForwardUp size={14} /></button>
        {/* Fill color of the selected cells (column A = the whole row): it colors the chart. */}
        <span className="chart-datasheet__fill">
          <button type="button" className={`chart-editor-pill${fillOpen ? ' is-on' : ''}`} aria-expanded={fillOpen} title="Fill color of the selected cells (column A: the whole series); the chart uses it" onClick={() => { setMenuOpen(false); setFillOpen(o => !o) }}>
            {activeFill && <span className="chart-datasheet__dot" style={{ background: tok(activeFill) }} />}Fill ▾</button>
          {fillOpen && (
            <span className="chart-datasheet__swatches" role="group" aria-label="Fill colors">
              {FILLS.map(t => (
                <button key={t ?? 'none'} type="button" className={`chart-datasheet__swatch${t === (activeFill ?? null) ? ' is-on' : ''}`} title={t ? colorName(t) : 'No fill'} aria-label={t ? `Fill ${colorName(t)}` : 'No fill'} aria-pressed={t === (activeFill ?? null)}
                  style={t ? { background: tok(t) } : undefined} onClick={() => { applyFill(t); setFillOpen(false) }}>{t ? (t === activeFill ? '✓' : '') : '×'}</button>
              ))}
            </span>
          )}
        </span>
        {/* Cell text (bold, italic, color, alignment, border): "Use datasheet font" on the chart side. */}
        {api.applyEdits && api.sheet?.rows?.[0]?.cells?.[0] && 'font' in api.sheet.rows[0].cells[0] && <span className="chart-datasheet__fill">
          <button type="button" className={`chart-editor-pill is-icon${activeFont.bold ? ' is-on' : ''}`} title="Bold (the chart can use it: Use sheet font)" aria-label="Bold" aria-pressed={!!activeFont.bold} onClick={() => applyFont({ bold: !activeFont.bold })} style={{ fontWeight: 700 }}>B</button>
          <button type="button" className={`chart-editor-pill is-icon${activeFont.italic ? ' is-on' : ''}`} title="Italic" aria-label="Italic" aria-pressed={!!activeFont.italic} onClick={() => applyFont({ italic: !activeFont.italic })} style={{ fontStyle: 'italic' }}>I</button>
          <button type="button" className={`chart-editor-pill${textOpen ? ' is-on' : ''}`} aria-expanded={textOpen} title="Text color, alignment and border of the selected cells" onClick={() => { setMenuOpen(false); setFillOpen(false); setTextOpen(o => !o) }}>
            {activeFont.color && <span className="chart-datasheet__dot" style={{ background: tok(activeFont.color) }} />}Text ▾</button>
          {textOpen && (
            <span className="chart-datasheet__swatches" role="group" aria-label="Text format">
              {FILLS.map(t => (
                <button key={t ?? 'none'} type="button" className={`chart-datasheet__swatch${t === (activeFont.color ?? null) ? ' is-on' : ''}`} title={t ? colorName(t) : 'Default color'} aria-label={t ? `Text ${colorName(t)}` : 'Default text color'}
                  style={t ? { background: tok(t) } : undefined} onClick={() => applyFont({ color: t })}>{t ? '' : '×'}</button>
              ))}
              {[['left', '⇤'], ['center', '↔'], ['right', '⇥']].map(([v, g]) => (
                <button key={v} type="button" className={`chart-datasheet__swatch${activeFont.align === v ? ' is-on' : ''}`} title={`Align ${v}`} aria-label={`Align ${v}`} onClick={() => applyFont({ align: activeFont.align === v ? null : v })}>{g}</button>
              ))}
              {[['top', '⤒'], ['middle', '↕'], ['bottom', '⤓']].map(([v, g]) => (
                <button key={v} type="button" className={`chart-datasheet__swatch${activeFont.valign === v ? ' is-on' : ''}`} title={`Align ${v}`} aria-label={`Align ${v}`} onClick={() => applyFont({ valign: activeFont.valign === v ? null : v })}>{g}</button>
              ))}
              <button type="button" className={`chart-datasheet__swatch${activeFont.border ? ' is-on' : ''}`} title="Border" aria-label="Border" onClick={() => applyFont({ border: !activeFont.border })}>▢</button>
            </span>
          )}
        </span>}
        {/* Move buttons: the active series or category to the chart's data table,
            or back into the chart. */}
        {api.setFmt && api.fmt && !fixedCols && activeRow && (() => {
          const tbl = api.fmt.table ?? [], cols = api.fmt.tableCols ?? []
          const rid = activeRow.id, ck = mx > 0 ? api.sheet.cols[mx - 1]?.key : null
          const rowIn = !!api.fmt.tableAll || tbl.includes(rid)
          return <>
            <button type="button" className="chart-editor-pill" title={rowIn ? 'Move this series back to the chart' : 'Move this series to the data table under the axis'}
              disabled={!!api.fmt.tableAll}
              onClick={() => api.setFmt('table', rowIn ? (tbl.filter(x => x !== rid).length ? tbl.filter(x => x !== rid) : null) : [...tbl, rid])}>{rowIn ? 'Series → chart' : 'Series → table'}</button>
            {ck && <button type="button" className="chart-editor-pill" title={cols.includes(ck) ? 'Move this category back to the chart' : 'Move this category to a table column at the right'}
              onClick={() => api.setFmt('tableCols', cols.includes(ck) ? (cols.filter(x => x !== ck).length ? cols.filter(x => x !== ck) : null) : [...cols, ck])}>{cols.includes(ck) ? 'Category → chart' : 'Category → table'}</button>}
          </>
        })()}
        <span className="chart-datasheet__menu">
          <button type="button" className={`chart-editor-pill is-icon${menuOpen ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Insert, delete, cut, layout, reset" aria-label="More sheet actions" onClick={() => { setFillOpen(false); setMenuOpen(o => !o) }}><IconDots size={14} /></button>
          {menuOpen && <div className="chart-datasheet__menu-pop" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, background: 'var(--white)', boxShadow: '0 6px 18px rgba(0,0,0,.12)', borderRadius: 8 }}><ActionMenu items={menuItems} onClose={() => { setMenuOpen(false); focusCell(Math.max(1, active.x), Math.max(1, active.y)) }} /></div>}
        </span>
        <button type="button" className="chart-editor-bar__close" onClick={onClose} aria-label="Close data sheet (Esc)" title="Close (Esc)">×</button>
      </div>
      <div className="chart-datasheet__fx">
        <span className="chart-datasheet__fx-ref">{active.x === 0 && active.y === 0 ? '' : `${colLetter(active.x)}${active.y + 1}`}</span>
        <span className="chart-datasheet__fx-label" aria-hidden="true">fx</span>
        {/* A line break (Alt+Enter) shows as "↵" here and comes back unchanged on commit. */}
        <input key={`${active.x}:${active.y}:${activeRaw}`} className="chart-opts-input chart-datasheet__fx-input" aria-label="Formula bar: raw content of the active cell" defaultValue={String(activeRaw).replace(/\n/g, ' ↵ ')}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); ws.current?.setValueFromCoords(active.x, active.y, e.currentTarget.value.replace(/ ?↵ ?/g, '\n')); focusCell(active.x, active.y) }
            if (e.key === 'Escape') { e.currentTarget.value = String(activeRaw).replace(/\n/g, ' ↵ '); focusCell(active.x, active.y) }
          }} />
      </div>
      {/* Optional sheet rows ("Edit data layout"): a second label
          under each category; the "100 %=" row in 100 % charts. */}
      {api.fmt?.subRow && (
        <div className="chart-datasheet__base100" role="group" aria-label="Second label row">
          <span className="chart-datasheet__base100-head" title="A second line under each category label">2nd label</span>
          {api.sheet.cols.map(c => (
            <input key={c.key} className="chart-opts-input" aria-label={`Second label for ${c.name}`} placeholder="—"
              defaultValue={api.fmt?.subLabels?.[c.key] ?? ''}
              onBlur={e => { const v = e.currentTarget.value.trim(); api.setFmt('subLabels', { ...(api.fmt?.subLabels ?? {}), [c.key]: v || undefined }) }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          ))}
        </div>
      )}
      {/* "100 %=" row: in 100 % charts, each column reads against this base; empty = its sum. */}
      {(api.fmt?.base100Row ?? api.bars === 'stacked100') && api.bars && api.bars !== 'clustered' && (
        <div className="chart-datasheet__base100" role="group" aria-label="100% equals row">
          <span className="chart-datasheet__base100-head" title="Each column reads against this value; empty = the sum of the column">100%=</span>
          {api.sheet.cols.map(c => (
            <input key={c.key} className="chart-opts-input" aria-label={`100% equals for ${c.name}`} placeholder="sum"
              defaultValue={api.fmt?.base100?.[c.key] ?? ''}
              onBlur={e => { const v = parseCell(e.currentTarget.value); api.setFmt('base100', { ...(api.fmt?.base100 ?? {}), [c.key]: v ?? undefined }) }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          ))}
        </div>
      )}
      <div ref={host} role="grid" className="chart-datasheet__grid" aria-label={`Spreadsheet, columns A to ${colLetter((api.sheet.cols.length))}`} />
      {/* Right-edge handle: drag to widen or narrow, double-click for full width. */}
      <div className="chart-datasheet__resize" role="separator" aria-orientation="vertical" aria-label="Resize data sheet width" tabIndex={0}
        title="Drag to resize · double-click for full width" onPointerDown={onResizeDown} onDoubleClick={() => saveW(null)}
        onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); saveW(resizeBy(rootRef.current.getBoundingClientRect().width, e.key === 'ArrowLeft' ? -24 : 24)) } }} />
    </div>
  )
}

/** The "Edited" note on a chart whose sheet was modified (discreet, not a callout). */
export function EditedNote({ api }) {
  // Sheet open: its header already says "Edited"; the note would only push the chart.
  if (!api?.sheetEdited || api.sheetOpen) return null
  // An error cell (#VALUE, #DIV/0, invalid date...) is ignored by the chart: say so.
  const errors = (api.sheet?.rows ?? []).reduce((t, r) => t + r.cells.filter(c => c.error).length, 0)
  const warning = (api.sheet?.rows ?? []).flatMap(r => r.cells.filter(c => c.warning).map(c => c.warning))[0]
  return (
    <div className="chart-engine-edited-note" role="status">
      <span className="chart-engine-edited-dot" aria-hidden="true" />Edited figures, not the reported data
      {errors > 0 && <span className="chart-engine-edited-err">· {errors} cell{errors > 1 ? 's' : ''} with errors, ignored</span>}
      {warning && <span className="chart-engine-edited-warn" title={warning}>· {warning.split(':')[0]}</span>}
      {' '}·{' '}<button type="button" className="chart-pop__link" onClick={() => api.setSheetOpen(true)}>Open sheet</button>
    </div>
  )
}
