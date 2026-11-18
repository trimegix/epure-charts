// ─── epure-charts · table ────────────────────────────────────────────────────
// <TableView id columns={[{ key, label, type?, unit? }]} rows={[{ key, label, cells }]} spec format />
// A cell's value drives its content: number, text, Harvey ball, checkbox,
// icon (type per column, or per cell). Formatting
// (FormatBar): click on a cell, a column header or a row label
// → its format bar; right-click → its action menu (insert, delete, type,
// banding…); settings button in the corner. Header edges can be dragged to
// set a width. View preferences, per browser: the numbers never change.
// Harvey balls and checkboxes from the keyboard: selected cell, + / − and 0–8, v / 1,
// x / 2, space / 0; double-click = cycle. Input is written to the sheet, the table's source.
// Ctrl+Alt+arrows duplicates the selected row or column next to it.
// A cell can be unlinked from the sheet (free text, marked "overwritten"); "Text from
// data sheet" or Reset links it again.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconPalette, IconTable, IconColumns, IconLayoutRows, IconSquare } from '@tabler/icons-react'
import { buildTableScene, nextInsertKey, markEdit, resizeTableWidths, resizeTableRowHeight, LABEL_COL, TOTAL_ROW } from './tableScene.js'
import { setCell } from './sheetModel.js'
import { colorName } from './colorNames.js'
import TableFigure from './TableFigure.jsx'
import { Seg, Check, Line, Field } from './ChartWheel'
import FormatBar from './FormatBar'
import { useViewPrefs } from './useViewPrefs.js'
import { useFormatPick } from './useFormatPick.js'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { tableSheet } from './sheetAdapters.js'

// A color: a palette token, or a hex picked by the user (custom style).
import { tok, isHex, fontName, isPt } from './customStyle.js'
import { CustomColor, TextStyle } from './CustomStyle.jsx'
const OBJ_KEYS = ['colTypes', 'cellTypes', 'align', 'widths', 'fontSizes', 'markSizes', 'decimals', 'magnitude', 'harveyMax', 'text', 'fills', 'colors', 'markFills', 'valign', 'rotate', 'outlineColors', 'outlineStyles', 'overrides', 'checkSymbols', 'pts', 'fonts']
const ARR_KEYS = ['emphasis', 'insRows', 'insCols', 'hideRows', 'hideCols']
const DEFAULTS = {
  headerRow: null, headerCol: null, stripes: null, stripeColors: null, rowLines: null, colLines: null, totals: null, density: null, rowHeight: null, fontSize: null, labelHeader: null,
  ...Object.fromEntries(OBJ_KEYS.map(k => [k, {}])), ...Object.fromEntries(ARR_KEYS.map(k => [k, null])),
}
const TYPE_ITEMS = [['auto', 'Auto'], ['number', 'Number'], ['text', 'Text'], ['harvey', 'Harvey ball'], ['check', 'Checkbox'], ['icon', 'Icon'], ['pentagon', 'Chevron'], ['pill', 'Rounded box']]
const TYPE_NAME = Object.fromEntries(TYPE_ITEMS)
// Size steps (text, Harvey balls, checkboxes): the same as charts; text also accepts a free point size (custom style).
const SIZE_ITEMS = [['xsmall', 'XS'], ['small', 'S'], [null, 'M'], ['large', 'L'], ['xlarge', 'XL']]
const SIZE_NAME = { xsmall: 'XS', small: 'S', large: 'L', xlarge: 'XL' }
const VALIGNS = ['top', 'middle', 'bottom']
// Offered colors: the palette tokens (pale fills like the sheet's, solid inks).
const FILL_TOKENS = ['gray-50', 'gray-100', 'gray-200', 'green-bg', 'amber-bg', 'red-bg', 'blue-bg', 'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
const INK_TOKENS = ['gray-800', 'gray-500', 'black', 'green', 'amber', 'red', 'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
// A saturated token is applied as a 22% fill (like the sheet); a gray or a "-bg" token as is.
const isPale = t => /^gray-|-bg$|^surface$|^white$/.test(t)
// A hex picked by the user is applied as is.
const fillCss = t => (isPale(t) || isHex(t) ? tok(t) : `color-mix(in srgb, ${tok(t)} 22%, transparent)`)

/**
 * A token picker: "Auto" (the default style) then the palette swatches; the custom
 * color unfolds under "Custom…" (open by default when the current color is a hex), so a
 * cell menu keeps four compact rows instead of four blocks.
 */
function TokenPick({ tokens, value, onPick, pale }) {
  const [custom, setCustom] = useState(false)
  return (
    <div className="chart-pop__swatches">
      <button type="button" className="chart-pop__more" aria-pressed={value == null} onClick={() => onPick(null)}>Auto</button>
      {tokens.map(t => (
        <button key={t} type="button" className={`chart-editor-swatch${value === t ? ' is-on' : ''}`} style={{ background: pale ? fillCss(t) : tok(t) }}
          aria-label={`Color ${colorName(t)}`} aria-pressed={value === t} title={colorName(t)} onClick={() => onPick(t)} />
      ))}
      {custom || isHex(value)
        ? <CustomColor value={value} onPick={onPick} />
        : <button type="button" className="chart-pop__more" onClick={() => setCustom(true)} title="Any color: picker, hex or R,G,B">Custom…</button>}
    </div>
  )
}

// Summary of the Style control: "Style: Serif · 14 pt" (font, then size in pt or the step).
const styleLabel = (font, pt, tier) => `Style: ${[font ? fontName(font) : tier && 'Default', isPt(pt) ? `${pt} pt` : tier].filter(Boolean).join(' · ') || 'as column'}`

// The drawing width: the `width` prop when given (no measuring: server rendering,
// static pages), else the box's width, followed with a ResizeObserver.
function useWidth(ref, fixed) {
  const [w, setW] = useState(fixed ?? 0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || fixed != null) return undefined
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fixed])
  return fixed ?? w
}

/** Follows the pointer until release; onMove(dx) from the starting point. */
function track(e, onMove) {
  e.preventDefault(); e.stopPropagation()
  const x0 = e.clientX
  const move = ev => onMove(ev.clientX - x0)
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}

/** Table view: cells driven by their values (number, text, Harvey ball, checkbox, icon), with format bars and menus. */
// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences
// (with applyPrefs: the stored preferences and sheet edits drawn, still no control).
// responsive: the SVG scales to its container (width="100%", ratio kept).
// dataTable: the table's content also as a visually hidden HTML table.
export default function TableView({ id = 'table', spec: baseSpec = {}, columns: columnsIn = [], rows: rowsIn = [], format, label = 'Table', width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  const boxRef = useRef(null)
  const width = useWidth(boxRef, widthProp)
  const prefsApi = useViewPrefs(`epure-chart-table-${id}`, DEFAULTS)
  const { set, update, reset, undo, canUndo } = prefsApi
  const P = readOnly && !applyPrefs ? DEFAULTS : prefsApi.prefs
  // The sheet drives the table: cells, rows and columns come from it (source + edits).
  const sheetBase = useMemo(() => tableSheet.toBase(columnsIn, rowsIn), [columnsIn, rowsIn])
  // Validation reads the effective Harvey scale (including a set preference), like the drawn table.
  const sheetApi = useSheet(`table-${id}`, sheetBase, sh => tableSheet.validate(sh, columnsIn, { ...baseSpec, harveyMax: { ...(baseSpec.harveyMax ?? {}), ...(P.harveyMax ?? {}) } }))
  const { columns, rows } = readOnly && !applyPrefs ? { columns: columnsIn, rows: rowsIn } : tableSheet.fromSheet(sheetApi.sheet, columnsIn, rowsIn)
  // Effective spec: set preference > host spec; objects merged, lists replaced.
  const spec = { ...baseSpec }
  for (const [k, v] of Object.entries(P)) {
    if (OBJ_KEYS.includes(k)) spec[k] = { ...(baseSpec[k] ?? {}), ...(v ?? {}) }
    else if (v != null) spec[k] = v
  }
  const specKey = JSON.stringify(spec)
  const scene = useMemo(() => (width > 0 ? buildTableScene(spec, columns, rows, { width: width - 2, format }) : null), [specKey, columns, rows, width, format]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, open, close] = useFormatPick(boxRef)
  const [obj, setObj] = useState(null)
  const cur = obj ?? pick?.obj

  // ── Selected object: row, column, cell ──
  const rowKey = pick?.row ?? null
  const colKey = pick?.col ?? null
  const col = scene?.cols.find(c => c.key === colKey && !c.header) ?? null
  const row = scene?.rows.find(r => r.key === rowKey && r.kind !== 'header') ?? null
  const cell = col && row ? scene.cells.find(c => c.row === row.key && c.col === col.key) : null
  const cellId = cell ? `${row.key}|${col.key}` : null
  const isTotal = row?.key === TOTAL_ROW

  const arr = k => P[k] ?? baseSpec[k] ?? []
  const toggleIn = (k, key) => update(k, c0 => { const s = new Set(c0 ?? baseSpec[k] ?? []); if (s.has(key)) s.delete(key); else s.add(key); return [...s] })
  const setIn = (k, key, v) => update(k, c0 => ({ ...(c0 ?? {}), [key]: v }))
  const bodyRows = scene?.rows.filter(r => r.kind === 'data') ?? []
  const dataCols = scene?.cols.filter(c => !c.header) ?? []

  // ── Insert / delete row or column ──
  // copy (Ctrl+Alt+arrows): the new row / column takes the content of the selection.
  const rawOf = c => (c.col === LABEL_COL ? c.text ?? '' : c.value ?? c.text ?? '')
  const insertRow = (below, copy = false) => {
    const i = bodyRows.findIndex(r => r.key === row.key)
    const after = below ? row.key : (bodyRows[i - 1]?.key ?? null)
    const list = P.insRows ?? baseSpec.insRows ?? []
    const key = nextInsertKey([...list.map(x => x.key), ...rows.map(r => r.key)], 'row')
    update('insRows', () => [...list, { key, after }])
    if (copy) update('text', t0 => ({ ...(t0 ?? {}), ...Object.fromEntries(scene.cells.filter(c => c.row === row.key).map(c => [`${key}|${c.col}`, String(rawOf(c))])) }))
  }
  const insertCol = (right, copy = false) => {
    const i = dataCols.findIndex(c => c.key === col.key)
    const after = right ? col.key : (dataCols[i - 1]?.key ?? null)
    const list = P.insCols ?? baseSpec.insCols ?? []
    const key = nextInsertKey([...list.map(x => x.key), ...columns.map(c => c.key)], 'col')
    update('insCols', () => [...list, { key, after, label: copy ? col.label ?? '' : '' }])
    if (copy) update('text', t0 => ({ ...(t0 ?? {}), ...Object.fromEntries(scene.cells.filter(c => c.col === col.key && c.row !== '__head__').map(c => [`${c.row}|${key}`, String(rawOf(c))])) }))
  }
  const deleteRow = () => {
    if (isTotal) set('totals', false)
    else if (row.inserted) update('insRows', c0 => (c0 ?? baseSpec.insRows ?? []).filter(x => x.key !== row.key))
    else toggleIn('hideRows', row.key)
    close(); setObj(null)
  }
  const deleteCol = () => {
    if (col.inserted) update('insCols', c0 => (c0 ?? baseSpec.insCols ?? []).filter(x => x.key !== col.key))
    else toggleIn('hideCols', col.key)
    close(); setObj(null)
  }
  const hidden = arr('hideRows').length + arr('hideCols').length

  // ── Harvey balls and checkboxes: input on the table is written to the sheet ──
  const writeMark = (c, dbl, key) => {
    const r0 = scene?.rows.find(r => r.key === c.row)
    const c0 = scene?.cols.find(k => k.key === c.col)
    if (!r0 || !c0) return false
    const sc = sheetApi.sheet.cols.find(k => k.key === c.col)
    const raw = markEdit(c, key, { dbl, numeric: sc ? sc.type !== 'text' : false })
    if (raw == null) return false
    if (c.overwritten) setIn('overrides', `${c.row}|${c.col}`, raw)
    else if (r0.inserted || c0.inserted) setIn('text', `${c.row}|${c.col}`, raw)
    else sheetApi.applyEdits(e => setCell(e, c.row, c.col, raw))
    return true
  }
  useEffect(() => {
    if (!pick || !scene || scene.empty) return undefined
    const onKey = e => {
      const t = e.target
      if (t?.closest?.('input, textarea, select, [contenteditable="true"], .chart-datasheet, .chart-wheel')) return
      // Ctrl+Alt+arrows: a copy of the row above / below, of the column left / right.
      if (e.ctrlKey && e.altKey && e.key.startsWith('Arrow')) {
        const vert = e.key === 'ArrowUp' || e.key === 'ArrowDown'
        if (vert && row && !isTotal) { e.preventDefault(); insertRow(e.key === 'ArrowDown', true) }
        else if (!vert && col) { e.preventDefault(); insertCol(e.key === 'ArrowRight', true) }
        return
      }
      // Alt+Shift+PgUp / PgDn: the cell (or column) text moves up or down.
      if (e.altKey && e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown') && col) {
        e.preventDefault()
        const k = cur === 'cell' && cell ? cellId : col.key
        const now = VALIGNS.indexOf(spec.valign?.[k] ?? (cur === 'cell' ? cell?.valign : null) ?? 'middle')
        const v = VALIGNS[Math.max(0, Math.min(2, now + (e.key === 'PageUp' ? -1 : 1)))]
        setIn('valign', k, v === 'middle' && k === col.key ? null : v)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || cur !== 'cell' || !cell) return
      if (writeMark(cell, false, e.key)) e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const stripes = spec.stripes ?? null
  const rowLines = spec.rowLines ?? 'header'
  const colTypeOf = c => spec.colTypes?.[c.key] ?? c.type
  const objects = {
    chart: { name: 'Table', icon: IconTable },
    ...(col ? { column: { name: col.label || 'Column', icon: IconColumns } } : {}),
    ...(row ? { row: { name: row.label || (isTotal ? 'Total' : 'Row'), icon: IconLayoutRows } } : {}),
    ...(cell ? { cell: { name: 'Cell', icon: IconSquare } } : {}),
  }
  const colType = col ? colTypeOf(col) : 'auto'
  // Colors of a cell, a row ("r|*") or a column ("*|c"): fill, ink, mark background.
  const styleCtl = (k, type) => {
    const fill = spec.fills?.[k] ?? null
    const ink = spec.colors?.[k] ?? null
    const mark = spec.markFills?.[k] ?? null
    const inkName = type === 'harvey' ? 'Filled' : type === 'check' ? 'Symbol' : 'Text'
    const markName = type === 'harvey' ? 'Unfilled' : type === 'check' ? 'Box' : 'Shape'
    const marks = type === 'harvey' || type === 'check' || type === 'auto' || type === 'pentagon' || type === 'pill'
    return ['style', null, `Fill: ${fill ? colorName(fill) : 'auto'}${ink ? `, ${inkName.toLowerCase()} ${colorName(ink)}` : ''}`, 'Fill, text and symbol colors', (
      <>
        {/* Custom checkbox symbols: any character. */}
        {type === 'check' && <Line label="Symbols">
          <Field inline label="Checked symbol" placeholder="✓" value={spec.checkSymbols?.[k]?.yes ?? ''} onCommit={v => setIn('checkSymbols', k, { ...(spec.checkSymbols?.[k] ?? {}), yes: v || undefined })} />
          <Field inline label="Crossed symbol" placeholder="✗" value={spec.checkSymbols?.[k]?.no ?? ''} onCommit={v => setIn('checkSymbols', k, { ...(spec.checkSymbols?.[k] ?? {}), no: v || undefined })} />
        </Line>}
        <Line label="Fill"><TokenPick pale tokens={FILL_TOKENS} value={fill} onPick={v => setIn('fills', k, v)} /></Line>
        <Line label={type === 'auto' ? 'Text, symbol' : inkName}><TokenPick tokens={INK_TOKENS} value={ink} onPick={v => setIn('colors', k, v)} /></Line>
        {marks && <Line label={type === 'auto' ? 'Unfilled, box' : markName}><TokenPick pale tokens={FILL_TOKENS} value={mark} onPick={v => setIn('markFills', k, v)} /></Line>}
        {marks && <Line label="Outline"><Seg label="Outline style" value={spec.outlineStyles?.[k] ?? null} onPick={v => setIn('outlineStyles', k, v)} items={[[null, 'Auto'], ['solid', 'Thin'], ['bold', 'Bold'], ['dashed', 'Dashed'], ['none', 'None']]} /></Line>}
        {marks && spec.outlineStyles?.[k] !== 'none' && <Line label="Outline color"><TokenPick tokens={INK_TOKENS} value={spec.outlineColors?.[k] ?? null} onPick={v => setIn('outlineColors', k, v)} /></Line>}
        {(type === 'harvey' || type === 'check') && <div className="chart-pop__note">{type === 'harvey' ? 'Keys: + / − or 0–8; double-click adds a sector.' : 'Keys: v or 1 check, x or 2 cross, space or 0 empty; double-click cycles.'}</div>}
      </>
    )]
  }
  const shownType = cell?.type
  const controls = {
    chart: [
      // Style (font + size in points), first as on the other types: the whole table.
      ['font', null, styleLabel(P.labelFont, P.labelPt, SIZE_NAME[spec.fontSize] ?? 'M'), 'Font and text size of the table', (
        <>
          <Line label="Size"><Seg label="Text size" value={spec.fontSize ?? null} onPick={v => { set('fontSize', v); set('labelPt', null) }} items={SIZE_ITEMS} /></Line>
          <TextStyle defaultFont="Default" font={P.labelFont} pt={P.labelPt} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} />
        </>
      )],
      ['head', null, `Headers: ${[spec.headerRow !== false && 'row', spec.headerCol !== false && 'column'].filter(Boolean).join(' + ') || 'none'}`, 'Header row and header column', (
        <>
          <Line label=""><Check on={spec.headerRow !== false} onClick={() => set('headerRow', spec.headerRow === false)}>Header row</Check></Line>
          <Line label=""><Check on={spec.headerCol !== false} onClick={() => set('headerCol', spec.headerCol === false)}>Header column (row labels)</Check></Line>
          {spec.headerCol !== false && spec.headerRow !== false && <Line label="Corner"><Field label="Corner text" wide value={spec.labelHeader ?? ''} placeholder="None" onCommit={v => set('labelHeader', v || null)} /></Line>}
        </>
      )],
      ['stripes', null, `Stripes: ${{ rows: 'rows', cols: 'columns' }[stripes] ?? 'none'}`, 'Alternate shading', (
        <>
          <Line label="Stripes"><Seg label="Stripes" value={stripes} onPick={v => set('stripes', v)} items={[[null, 'None'], ['rows', 'Rows'], ['cols', 'Columns']]} /></Line>
          {stripes && <Line label="Color 1"><TokenPick pale tokens={FILL_TOKENS} value={spec.stripeColors?.[0] ?? null} onPick={v => set('stripeColors', [v, spec.stripeColors?.[1] ?? null])} /></Line>}
          {stripes && <Line label="Color 2"><TokenPick pale tokens={FILL_TOKENS} value={spec.stripeColors?.[1] ?? null} onPick={v => set('stripeColors', [spec.stripeColors?.[0] ?? null, v])} /></Line>}
        </>
      )],
      ['lines', null, `Lines: ${rowLines}${spec.colLines ? ' + columns' : ''}`, 'Row and column separators', (
        <>
          <Line label="Rows"><Seg label="Row separators" value={rowLines} onPick={v => set('rowLines', v === 'header' ? null : v)} items={[['header', 'Under header'], ['all', 'Every row'], ['none', 'None']]} /></Line>
          <Line label=""><Check on={!!spec.colLines} onClick={() => set('colLines', !spec.colLines)}>Column separators</Check></Line>
        </>
      )],
      ['totals', null, `Totals: ${spec.totals ? 'on' : 'off'}`, 'Totals row', (
        <>
          <Line label=""><Check on={!!spec.totals} onClick={() => set('totals', !spec.totals)}>Totals row</Check></Line>
          <div className="chart-pop__note">Numbers are summed, Harvey balls averaged, checkboxes counted.</div>
        </>
      )],
      ['density', null, `Rows: ${spec.rowHeight ? `${spec.rowHeight} px` : spec.density ?? 'normal'}`, 'Row height', (
        <>
          <Line label="Height"><Seg label="Row height" value={spec.rowHeight ? null : spec.density ?? 'normal'} onPick={v => { set('rowHeight', null); set('density', v === 'normal' ? null : v) }} items={[['compact', 'Compact'], ['normal', 'Normal'], ['roomy', 'Roomy']]} /></Line>
          <div className="chart-pop__note">Or drag the bottom-right corner of the table to resize it.</div>
        </>
      )],
    ],
    column: col ? [
      ['type', null, `Type: ${TYPE_NAME[colType ?? 'auto']}`, 'Content type of the column (the value drives it)', (
        <Line label="Type"><Seg label="Column type" value={colType ?? 'auto'} onPick={v => setIn('colTypes', col.key, v)} items={TYPE_ITEMS} /></Line>
      )],
      ['align', null, `Align: ${col.align}`, 'Alignment', (
        <>
          <Line label="Align"><Seg label="Alignment" value={col.align} onPick={v => setIn('align', col.key, v)} items={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} /></Line>
          <Line label="Header"><Seg label="Header text orientation" value={spec.rotate?.[col.key] == null ? null : Number(spec.rotate[col.key]) === 90 ? 90 : 0} onPick={v => setIn('rotate', col.key, v == null ? null : v === 90 ? 90 : 0)} items={[[null, 'Auto'], [0, '0°'], [90, '90°']]} /></Line>
          <Line label="Vertical"><Seg label="Vertical alignment" value={spec.valign?.[col.key] ?? 'middle'} onPick={v => setIn('valign', col.key, v === 'middle' ? null : v)} items={[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} /></Line>
        </>
      )],
      styleCtl(`*|${col.key}`, colType ?? 'auto'),
      ['font', null, styleLabel(spec.fonts?.[col.key], spec.pts?.[col.key], SIZE_NAME[spec.fontSizes?.[col.key] ?? spec.fontSize] ?? 'M'), 'Font and text size of the column', (
        <>
          <Line label="Size"><Seg label="Column text size" value={spec.fontSizes?.[col.key] ?? null} onPick={v => { setIn('fontSizes', col.key, v); setIn('pts', col.key, null) }} items={SIZE_ITEMS} /></Line>
          <TextStyle defaultFont="Default" font={spec.fonts?.[col.key] ?? null} pt={spec.pts?.[col.key] ?? null} onFont={v => setIn('fonts', col.key, v)} onPt={v => setIn('pts', col.key, v)} />
        </>
      )],
      scene.cells.some(c => c.col === col.key && (c.type === 'harvey' || c.type === 'check')) && ['mark', null, `Size: ${SIZE_NAME[spec.markSizes?.[col.key]] ?? 'M'}`, 'Size of the Harvey balls and checkboxes', (
        <Line label="Size"><Seg label="Mark size" value={spec.markSizes?.[col.key] ?? null} onPick={v => setIn('markSizes', col.key, v)} items={SIZE_ITEMS} /></Line>
      )],
      ['width', null, `Width: ${col.manual ? `${Math.round(col.w)} px` : 'auto'}`, 'Column width', (
        <>
          <Line label="Width"><Seg label="Width" value={col.manual ? 'manual' : 'auto'} onPick={v => setIn('widths', col.key, v === 'auto' ? null : Math.round(col.w))} items={[['auto', 'Auto'], ['manual', 'Fixed']]} /></Line>
          <Line label="Pixels"><Field label="Width in pixels" numeric value={col.manual ? Math.round(col.w) : ''} placeholder="Auto" onCommit={v => setIn('widths', col.key, v == null ? null : Math.max(24, Math.round(v)))} /></Line>
          <div className="chart-pop__note">Or drag the column edge in the header row.</div>
        </>
      )],
      (shownType === 'number' || colType === 'number') && ['num', null, `Decimals: ${spec.decimals?.[col.key] ?? 'auto'}${spec.magnitude?.[col.key] ? `, ${spec.magnitude[col.key]}` : ''}`, 'Number format', (
        <>
          <Line label="Decimals"><Seg label="Decimals" value={spec.decimals?.[col.key] ?? null} onPick={v => setIn('decimals', col.key, v)} items={[[null, 'Auto'], [0, '0'], [1, '0.0'], [2, '0.00']]} /></Line>
          <Line label="Magnitude"><Seg label="Magnitude" value={spec.magnitude?.[col.key] ?? null} onPick={v => setIn('magnitude', col.key, v)} items={[[null, 'As is'], ['k', 'k'], ['M', 'M'], ['B', 'B']]} /></Line>
        </>
      )],
      (shownType === 'harvey' || colType === 'harvey') && ['scale', null, `Scale: ${spec.harveyMax?.[col.key] === 4 ? 'quarters' : spec.harveyMax?.[col.key] === 1 ? '0–1' : 'auto'}`, 'What a full Harvey ball means', (
        <Line label="Full at"><Seg label="Harvey scale" value={spec.harveyMax?.[col.key] ?? null} onPick={v => setIn('harveyMax', col.key, v)} items={[[null, 'Auto'], [1, '1 (100%)'], [4, '4 quarters']]} /></Line>
      )],
    ] : [],
    row: row ? [
      !isTotal && ['bold', null, `Emphasis: ${row.bold ? 'bold' : 'none'}`, 'Emphasize this row', (
        <Line label=""><Check on={arr('emphasis').includes(row.key)} onClick={() => toggleIn('emphasis', row.key)}>Bold row</Check></Line>
      )],
      styleCtl(`${row.key}|*`, 'auto'),
      row.inserted && ['label', null, `Label: ${spec.text?.[`${row.key}|${LABEL_COL}`] || 'empty'}`, 'Row label', (
        <Line label="Label"><Field label="Row label" wide value={spec.text?.[`${row.key}|${LABEL_COL}`] ?? ''} onCommit={v => setIn('text', `${row.key}|${LABEL_COL}`, v)} /></Line>
      )],
    ] : [],
    cell: cell ? [
      ['type', null, `Type: ${spec.cellTypes?.[cellId] ? TYPE_NAME[spec.cellTypes[cellId]] : `column (${TYPE_NAME[shownType] ?? shownType})`}`, 'Content type of this cell', (
        <>
          <Line label="Type"><Seg label="Cell type" value={spec.cellTypes?.[cellId] ?? null} onPick={v => setIn('cellTypes', cellId, v)} items={[[null, 'Column'], ...TYPE_ITEMS.slice(1)]} /></Line>
          <div className="chart-pop__note">The cell value drives the mark: 0–1 or 0–4 fills a Harvey ball, yes / no / empty sets a checkbox, up / down / red / green picks an icon.</div>
        </>
      )],
      ['align', null, `Align: ${cell.align}, ${cell.valign}`, 'Alignment of this cell (Alt+Shift+Page Up / Down: top / bottom)', (
        <>
          <Line label="Align"><Seg label="Cell alignment" value={spec.align?.[cellId] ?? null} onPick={v => setIn('align', cellId, v)} items={[[null, 'Column'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} /></Line>
          <Line label="Vertical"><Seg label="Cell vertical alignment" value={spec.valign?.[cellId] ?? null} onPick={v => setIn('valign', cellId, v)} items={[[null, 'Column'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} /></Line>
        </>
      )],
      (shownType === 'harvey' || shownType === 'check') && ['mark', null, `Size: ${SIZE_NAME[spec.markSizes?.[cellId] ?? spec.markSizes?.[col.key]] ?? 'M'}`, 'Size of this Harvey ball or checkbox', (
        <Line label="Size"><Seg label="Cell mark size" value={spec.markSizes?.[cellId] ?? null} onPick={v => setIn('markSizes', cellId, v)} items={[[null, 'Column'], ...SIZE_ITEMS.filter(([k]) => k)]} /></Line>
      )],
      styleCtl(cellId, shownType),
      ['font', null, styleLabel(spec.fonts?.[cellId], spec.pts?.[cellId], null), 'Font and text size of this cell', (
        <TextStyle defaultFont="Default" font={spec.fonts?.[cellId] ?? null} pt={spec.pts?.[cellId] ?? null} onFont={v => setIn('fonts', cellId, v)} onPt={v => setIn('pts', cellId, v)} />
      )],
      !isTotal && !row.inserted && !col.inserted && ['over', null, cell.overwritten ? 'Text: overwritten' : 'Text: linked', 'Type over this cell (unlinks it from the data sheet)', (
        <>
          <Line label="Text"><Field label="Cell text" wide value={spec.overrides?.[cellId] ?? (cell.text ?? (cell.value == null ? '' : String(cell.value)))} onCommit={v => setIn('overrides', cellId, v ?? '')} /></Line>
          {cell.overwritten
            ? <Line label=""><button type="button" className="chart-pop__more" onClick={() => setIn('overrides', cellId, null)}>Text from data sheet</button></Line>
            : <div className="chart-pop__note">Typing here unlinks the cell: the data sheet no longer drives it.</div>}
        </>
      )],
      (row.inserted || col.inserted) && ['text', null, `Value: ${spec.text?.[cellId] || 'empty'}`, 'Content of this inserted cell', (
        <Line label="Value"><Field label="Cell value" wide value={spec.text?.[cellId] ?? ''} onCommit={v => setIn('text', cellId, v)} /></Line>
      )],
    ] : [],
  }
  const typeActions = (pre, current, onPick) => TYPE_ITEMS.slice(1).map(([v, l]) => ({ label: `${pre} ${l.toLowerCase()}`, checked: current === v, onSelect: () => onPick(v) }))
  const rowActions = row ? [
    !isTotal && { label: 'Insert row above', onSelect: () => insertRow(false) },
    !isTotal && { label: 'Insert row below', onSelect: () => insertRow(true) },
    !isTotal && { label: 'Duplicate row', shortcut: 'Ctrl+Alt+↓', onSelect: () => insertRow(true, true) },
    { label: isTotal ? 'Remove totals row' : 'Delete row', onSelect: deleteRow },
    !isTotal && { label: 'Bold row', checked: arr('emphasis').includes(row.key), onSelect: () => toggleIn('emphasis', row.key) },
  ] : []
  const colActions = col ? [
    { label: 'Insert column left', onSelect: () => insertCol(false) },
    { label: 'Insert column right', onSelect: () => insertCol(true) },
    { label: 'Duplicate column', shortcut: 'Ctrl+Alt+→', onSelect: () => insertCol(true, true) },
    { label: 'Delete column', onSelect: deleteCol },
  ] : []
  const actions = {
    chart: [
      { label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: 'Reset data to source', onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: spec.totals ? 'Remove totals row' : 'Add totals row', onSelect: () => set('totals', !spec.totals) },
      { label: 'Row stripes', checked: stripes === 'rows', onSelect: () => set('stripes', stripes === 'rows' ? null : 'rows') },
      { label: 'Column stripes', checked: stripes === 'cols', onSelect: () => set('stripes', stripes === 'cols' ? null : 'cols') },
      { label: 'Column separators', checked: !!spec.colLines, onSelect: () => set('colLines', !spec.colLines) },
      hidden > 0 && { label: `Restore deleted rows and columns (${hidden})`, onSelect: () => { set('hideRows', []); set('hideCols', []) } },
    ],
    column: col ? [...colActions, '-', ...typeActions('Column as', colType, v => setIn('colTypes', col.key, v))] : [],
    row: rowActions,
    cell: cell ? [cell.overwritten && { label: 'Text from data sheet', onSelect: () => setIn('overrides', cellId, null) }, ...typeActions('Cell as', spec.cellTypes?.[cellId] ?? null, v => setIn('cellTypes', cellId, spec.cellTypes?.[cellId] === v ? null : v)), '-', ...rowActions, ...colActions] : [],
  }

  // ── Selecting an object: cell, column header, row label, corner ──
  const pickCell = (e, c) => {
    if (e.type === 'click' && e.button !== 0) return
    setObj(null)
    if (c.row === '__head__' && c.col === LABEL_COL) open(e, { obj: 'chart' })
    else if (c.row === '__head__') open(e, { obj: 'column', col: c.col })
    else if (c.col === LABEL_COL) open(e, { obj: 'row', row: c.row })
    else open(e, { obj: 'cell', row: c.row, col: c.col })
  }
  const onKeyCell = (e, c) => { if (e.key === 'Enter' || e.key === ' ') { const r = e.currentTarget.getBoundingClientRect(); pickCell({ type: 'click', button: 0, clientX: r.left + r.width / 2, clientY: r.bottom, preventDefault: () => e.preventDefault(), stopPropagation: () => {} }, c) } }
  const dragWidth = (e, c) => { const w0 = c.w; track(e, dx => setIn('widths', c.key, Math.max(24, Math.round(w0 + dx)))) }
  // Bottom-right corner (resize): width keeps the column proportions,
  // height sets the row height.
  const dragTable = e => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const sc = scene, x0 = e.clientX, y0 = e.clientY
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0
      if (Math.abs(dx) >= 2) set('widths', { ...(P.widths ?? {}), ...resizeTableWidths(sc, Math.min(width - 2, Math.max(60, sc.width + dx))) })
      if (Math.abs(dy) >= 2) set('rowHeight', resizeTableRowHeight(sc, sc.height + dy))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // Outline of the selected object.
  const sel = (() => {
    if (!scene || scene.empty || !pick) return null
    if (cur === 'cell' && cell) return { x: cell.x, y: cell.y, w: cell.w, h: cell.h }
    if (cur === 'row' && row) return { x: 0, y: row.y, w: scene.width, h: row.h }
    if (cur === 'column' && col) return { x: col.x, y: 0, w: col.w, h: scene.height }
    if (cur === 'chart') return { x: 0, y: 0, w: scene.width, h: scene.height }
    return null
  })()

  // Editing on the drawn cells: selection, menus, keyboard, double-click.
  const part = (kind, c) => {
    if (kind !== 'cell') return null
    const focusable = c.row === '__head__' || c.col === LABEL_COL
    return {
      className: 'chart-engine-clickable chart-table__cell', tabIndex: focusable ? 0 : undefined,
      onClick: e => pickCell(e, c), onContextMenu: e => pickCell(e, c), onKeyDown: focusable ? e => onKeyCell(e, c) : undefined,
      // Double-click on a cell: the data sheet (the cell is redrawn on the first click).
      // Harvey ball or checkbox: double-click cycles the state.
      onDoubleClick: e => { e.stopPropagation(); if (writeMark(c, true)) return; close(); setObj(null); sheetApi.setSheetOpen(true) },
    }
  }

  if (readOnly) {
    return (
      <div ref={boxRef} className="chart-engine chart-engine-box">
        {scene?.empty && <div className="chart-engine-empty">No data for this table yet.</div>}
        <TableFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title="Table format: number format, colours and layout. Tip: click or right-click any cell" aria-label="Table format"
          onClick={e => open(e, { obj: 'chart' })}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">No data for this table yet.</div>}
      {scene && !scene.empty && (
        <TableFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} part={part}>
          {sel && <rect x={sel.x + 0.5} y={sel.y + 0.5} width={Math.max(0, sel.w - 1)} height={Math.max(0, sel.h - 1)} className="chart-table__sel" pointerEvents="none" />}
          <rect x={scene.width - 7} y={scene.height - 7} width={8} height={8} className="chart-table__corner" style={{ cursor: 'nwse-resize' }} fill={cur === 'chart' && pick ? tok('gold') : 'transparent'}
            onPointerDown={dragTable}><title>Drag to resize the table</title></rect>
          {spec.headerRow !== false && scene.cols.map(c => (
            <rect key={`w-${c.key}`} x={c.x + c.w - 3} y={0} width={6} height={scene.headH || scene.rowH} className="chart-table__resize" onPointerDown={e => dragWidth(e, c)}>
              <title>{`Drag to set the width (${Math.round(c.w)} px)`}</title>
            </rect>
          ))}
        </TableFigure>
      )}
      {pick && (
        <FormatBar onOpenSheet={() => sheetApi.setSheetOpen(true)} key={`${pick.mode}|${pick.obj}|${pick.row}|${pick.col}`} mode={pick.mode} anchor={pick.anchor} objects={objects} object={objects[cur] ? cur : 'chart'}
          onObject={setObj} controls={(controls[objects[cur] ? cur : 'chart'] ?? []).filter(Boolean)} actions={(actions[objects[cur] ? cur : 'chart'] ?? []).filter(Boolean)}
          onReset={reset} onUndo={undo} canUndo={canUndo} onClose={() => { close(); setObj(null) }} />
      )}
      {sheetApi.sheetOpen && <DataSheet api={{ ...sheetApi, fmt: { labels: { texts: spec.overrides ?? {} } } }} layout={tableSheet.layout} onClose={() => sheetApi.setSheetOpen(false)} />}
    </div>
  )
}
