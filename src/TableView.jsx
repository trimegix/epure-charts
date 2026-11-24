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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
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
import { SpecLocale, useT } from './uiLocale.js'
const OBJ_KEYS = ['colTypes', 'cellTypes', 'align', 'widths', 'fontSizes', 'markSizes', 'decimals', 'magnitude', 'harveyMax', 'text', 'fills', 'colors', 'markFills', 'valign', 'rotate', 'outlineColors', 'outlineStyles', 'overrides', 'checkSymbols', 'pts', 'fonts']
const ARR_KEYS = ['emphasis', 'insRows', 'insCols', 'hideRows', 'hideCols']
const DEFAULTS = {
  headerRow: null, headerCol: null, stripes: null, stripeColors: null, rowLines: null, colLines: null, totals: null, density: null, rowHeight: null, fontSize: null, labelHeader: null,
  ...Object.fromEntries(OBJ_KEYS.map(k => [k, {}])), ...Object.fromEntries(ARR_KEYS.map(k => [k, null])),
}
const typeItems = tr => [['auto', tr('Auto')], ['number', tr('Number')], ['text', tr('Text')], ['harvey', tr('Harvey ball')], ['check', tr('Checkbox')], ['icon', tr('Icon')], ['pentagon', tr('Chevron')], ['pill', tr('Rounded box')]]
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
  const tr = useT()
  const [custom, setCustom] = useState(false)
  return (
    <div className="chart-pop__swatches">
      <button type="button" className="chart-pop__more" aria-pressed={value == null} onClick={() => onPick(null)}>{tr('Auto')}</button>
      {tokens.map(t => (
        <button key={t} type="button" className={`chart-editor-swatch${value === t ? ' is-on' : ''}`} style={{ background: pale ? fillCss(t) : tok(t) }}
          aria-label={tr('Color {name}', { name: colorName(t) })} aria-pressed={value === t} title={colorName(t)} onClick={() => onPick(t)} />
      ))}
      {custom || isHex(value)
        ? <CustomColor value={value} onPick={onPick} />
        : <button type="button" className="chart-pop__more" onClick={() => setCustom(true)} title={tr('Any color: picker, hex or R,G,B')}>{tr('Custom…')}</button>}
    </div>
  )
}

// Summary of the Style control: "Style: Serif · 14 pt" (font, then size in pt or the step).
const styleLabel = (tr, font, pt, tier) => tr('Style: {name}', { name: [font ? fontName(font) : tier && tr('Default'), isPt(pt) ? `${pt} pt` : tier].filter(Boolean).join(' · ') || tr('as column') })

// The drawing width: the `width` prop when given (no measuring: server rendering,
// static pages), else the box's width, followed with a ResizeObserver.
function useWidth(ref, fixed) {
  const [w, setW] = useState(fixed ?? 0)
  useIsoLayoutEffect(() => {
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
// The interface (menus, format bar, messages) speaks the spec's language (spec.locale).
export default function TableView(props) {
  return <SpecLocale spec={props.spec}><TableViewBody {...props} /></SpecLocale>
}

function TableViewBody({ id = 'table', spec: baseSpec = {}, columns: columnsIn = [], rows: rowsIn = [], format, label: labelIn, width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  const tr = useT()
  const label = labelIn ?? tr('Table')
  const TYPE_ITEMS = typeItems(tr)
  const TYPE_NAME = Object.fromEntries(TYPE_ITEMS)
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
    chart: { name: tr('Table'), icon: IconTable },
    ...(col ? { column: { name: col.label || tr('Column'), icon: IconColumns } } : {}),
    ...(row ? { row: { name: row.label || (isTotal ? tr('Total') : tr('Row')), icon: IconLayoutRows } } : {}),
    ...(cell ? { cell: { name: tr('Cell'), icon: IconSquare } } : {}),
  }
  const colType = col ? colTypeOf(col) : 'auto'
  // Colors of a cell, a row ("r|*") or a column ("*|c"): fill, ink, mark background.
  const styleCtl = (k, type) => {
    const fill = spec.fills?.[k] ?? null
    const ink = spec.colors?.[k] ?? null
    const mark = spec.markFills?.[k] ?? null
    const inkName = type === 'harvey' ? tr('Filled') : type === 'check' ? tr('Symbol') : tr('Text')
    const markName = type === 'harvey' ? tr('Unfilled') : type === 'check' ? tr('Box') : tr('Shape')
    const marks = type === 'harvey' || type === 'check' || type === 'auto' || type === 'pentagon' || type === 'pill'
    return ['style', null, tr('Fill: {name}', { name: `${fill ? colorName(fill) : tr('auto')}${ink ? `, ${inkName.toLowerCase()} ${colorName(ink)}` : ''}` }), tr('Fill, text and symbol colors'), (
      <>
        {/* Custom checkbox symbols: any character. */}
        {type === 'check' && <Line label={tr('Symbols')}>
          <Field inline label={tr('Checked symbol')} placeholder="✓" value={spec.checkSymbols?.[k]?.yes ?? ''} onCommit={v => setIn('checkSymbols', k, { ...(spec.checkSymbols?.[k] ?? {}), yes: v || undefined })} />
          <Field inline label={tr('Crossed symbol')} placeholder="✗" value={spec.checkSymbols?.[k]?.no ?? ''} onCommit={v => setIn('checkSymbols', k, { ...(spec.checkSymbols?.[k] ?? {}), no: v || undefined })} />
        </Line>}
        <Line label={tr('Fill')}><TokenPick pale tokens={FILL_TOKENS} value={fill} onPick={v => setIn('fills', k, v)} /></Line>
        <Line label={type === 'auto' ? tr('Text, symbol') : inkName}><TokenPick tokens={INK_TOKENS} value={ink} onPick={v => setIn('colors', k, v)} /></Line>
        {marks && <Line label={type === 'auto' ? tr('Unfilled, box') : markName}><TokenPick pale tokens={FILL_TOKENS} value={mark} onPick={v => setIn('markFills', k, v)} /></Line>}
        {marks && <Line label={tr('Outline')}><Seg label={tr('Outline style')} value={spec.outlineStyles?.[k] ?? null} onPick={v => setIn('outlineStyles', k, v)} items={[[null, tr('Auto')], ['solid', tr('Thin')], ['bold', tr('Bold')], ['dashed', tr('Dashed')], ['none', tr('None')]]} /></Line>}
        {marks && spec.outlineStyles?.[k] !== 'none' && <Line label={tr('Outline color')}><TokenPick tokens={INK_TOKENS} value={spec.outlineColors?.[k] ?? null} onPick={v => setIn('outlineColors', k, v)} /></Line>}
        {(type === 'harvey' || type === 'check') && <div className="chart-pop__note">{type === 'harvey' ? tr('Keys: + / − or 0–8; double-click adds a sector.') : tr('Keys: v or 1 check, x or 2 cross, space or 0 empty; double-click cycles.')}</div>}
      </>
    )]
  }
  const shownType = cell?.type
  const controls = {
    chart: [
      // Style (font + size in points), first as on the other types: the whole table.
      ['font', null, styleLabel(tr, P.labelFont, P.labelPt, SIZE_NAME[spec.fontSize] ?? 'M'), tr('Font and text size of the table'), (
        <>
          <Line label={tr('Size')}><Seg label={tr('Text size')} value={spec.fontSize ?? null} onPick={v => { set('fontSize', v); set('labelPt', null) }} items={SIZE_ITEMS} /></Line>
          <TextStyle defaultFont={tr('Default')} font={P.labelFont} pt={P.labelPt} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} />
        </>
      )],
      ['head', null, tr('Headers: {name}', { name: [spec.headerRow !== false && tr('row'), spec.headerCol !== false && tr('column')].filter(Boolean).join(' + ') || tr('none') }), tr('Header row and header column'), (
        <>
          <Line label=""><Check on={spec.headerRow !== false} onClick={() => set('headerRow', spec.headerRow === false)}>{tr('Header row')}</Check></Line>
          <Line label=""><Check on={spec.headerCol !== false} onClick={() => set('headerCol', spec.headerCol === false)}>{tr('Header column (row labels)')}</Check></Line>
          {spec.headerCol !== false && spec.headerRow !== false && <Line label={tr('Corner')}><Field label={tr('Corner text')} wide value={spec.labelHeader ?? ''} placeholder={tr('None')} onCommit={v => set('labelHeader', v || null)} /></Line>}
        </>
      )],
      ['stripes', null, tr('Stripes: {name}', { name: { rows: tr('rows'), cols: tr('columns') }[stripes] ?? tr('none') }), tr('Alternate shading'), (
        <>
          <Line label={tr('Stripes')}><Seg label={tr('Stripes')} value={stripes} onPick={v => set('stripes', v)} items={[[null, tr('None')], ['rows', tr('Rows')], ['cols', tr('Columns')]]} /></Line>
          {stripes && <Line label={tr('Color {n}', { n: 1 })}><TokenPick pale tokens={FILL_TOKENS} value={spec.stripeColors?.[0] ?? null} onPick={v => set('stripeColors', [v, spec.stripeColors?.[1] ?? null])} /></Line>}
          {stripes && <Line label={tr('Color {n}', { n: 2 })}><TokenPick pale tokens={FILL_TOKENS} value={spec.stripeColors?.[1] ?? null} onPick={v => set('stripeColors', [spec.stripeColors?.[0] ?? null, v])} /></Line>}
        </>
      )],
      ['lines', null, spec.colLines ? tr('Lines: {name} + columns', { name: tr(rowLines) }) : tr('Lines: {name}', { name: tr(rowLines) }), tr('Row and column separators'), (
        <>
          <Line label={tr('Rows')}><Seg label={tr('Row separators')} value={rowLines} onPick={v => set('rowLines', v === 'header' ? null : v)} items={[['header', tr('Under header')], ['all', tr('Every row')], ['none', tr('None')]]} /></Line>
          <Line label=""><Check on={!!spec.colLines} onClick={() => set('colLines', !spec.colLines)}>{tr('Column separators')}</Check></Line>
        </>
      )],
      ['totals', null, tr('Totals: {name}', { name: spec.totals ? tr('on') : tr('off') }), tr('Totals row'), (
        <>
          <Line label=""><Check on={!!spec.totals} onClick={() => set('totals', !spec.totals)}>{tr('Totals row')}</Check></Line>
          <div className="chart-pop__note">{tr('Numbers are summed, Harvey balls averaged, checkboxes counted.')}</div>
        </>
      )],
      ['density', null, tr('Rows: {name}', { name: spec.rowHeight ? `${spec.rowHeight} px` : tr(spec.density ?? 'normal') }), tr('Row height'), (
        <>
          <Line label={tr('Height')}><Seg label={tr('Row height')} value={spec.rowHeight ? null : spec.density ?? 'normal'} onPick={v => { set('rowHeight', null); set('density', v === 'normal' ? null : v) }} items={[['compact', tr('Compact')], ['normal', tr('Normal')], ['roomy', tr('Roomy')]]} /></Line>
          <div className="chart-pop__note">{tr('Or drag the bottom-right corner of the table to resize it.')}</div>
        </>
      )],
    ],
    column: col ? [
      ['type', null, tr('Type: {name}', { name: TYPE_NAME[colType ?? 'auto'] }), tr('Content type of the column (the value drives it)'), (
        <Line label={tr('Type')}><Seg label={tr('Column type')} value={colType ?? 'auto'} onPick={v => setIn('colTypes', col.key, v)} items={TYPE_ITEMS} /></Line>
      )],
      ['align', null, tr('Align: {name}', { name: tr(col.align) }), tr('Alignment'), (
        <>
          <Line label={tr('Align')}><Seg label={tr('Alignment')} value={col.align} onPick={v => setIn('align', col.key, v)} items={[['left', tr('Left')], ['center', tr('Center')], ['right', tr('Right')]]} /></Line>
          <Line label={tr('Header')}><Seg label={tr('Header text orientation')} value={spec.rotate?.[col.key] == null ? null : Number(spec.rotate[col.key]) === 90 ? 90 : 0} onPick={v => setIn('rotate', col.key, v == null ? null : v === 90 ? 90 : 0)} items={[[null, tr('Auto')], [0, '0°'], [90, '90°']]} /></Line>
          <Line label={tr('Vertical')}><Seg label={tr('Vertical alignment')} value={spec.valign?.[col.key] ?? 'middle'} onPick={v => setIn('valign', col.key, v === 'middle' ? null : v)} items={[['top', tr('Top')], ['middle', tr('Middle')], ['bottom', tr('Bottom')]]} /></Line>
        </>
      )],
      styleCtl(`*|${col.key}`, colType ?? 'auto'),
      ['font', null, styleLabel(tr, spec.fonts?.[col.key], spec.pts?.[col.key], SIZE_NAME[spec.fontSizes?.[col.key] ?? spec.fontSize] ?? 'M'), tr('Font and text size of the column'), (
        <>
          <Line label={tr('Size')}><Seg label={tr('Column text size')} value={spec.fontSizes?.[col.key] ?? null} onPick={v => { setIn('fontSizes', col.key, v); setIn('pts', col.key, null) }} items={SIZE_ITEMS} /></Line>
          <TextStyle defaultFont={tr('Default')} font={spec.fonts?.[col.key] ?? null} pt={spec.pts?.[col.key] ?? null} onFont={v => setIn('fonts', col.key, v)} onPt={v => setIn('pts', col.key, v)} />
        </>
      )],
      scene.cells.some(c => c.col === col.key && (c.type === 'harvey' || c.type === 'check')) && ['mark', null, tr('Size: {name}', { name: SIZE_NAME[spec.markSizes?.[col.key]] ?? 'M' }), tr('Size of the Harvey balls and checkboxes'), (
        <Line label={tr('Size')}><Seg label={tr('Mark size')} value={spec.markSizes?.[col.key] ?? null} onPick={v => setIn('markSizes', col.key, v)} items={SIZE_ITEMS} /></Line>
      )],
      ['width', null, tr('Width: {name}', { name: col.manual ? `${Math.round(col.w)} px` : tr('auto') }), tr('Column width'), (
        <>
          <Line label={tr('Width')}><Seg label={tr('Width')} value={col.manual ? 'manual' : 'auto'} onPick={v => setIn('widths', col.key, v === 'auto' ? null : Math.round(col.w))} items={[['auto', tr('Auto')], ['manual', tr('Fixed')]]} /></Line>
          <Line label={tr('Pixels')}><Field label={tr('Width in pixels')} numeric value={col.manual ? Math.round(col.w) : ''} placeholder={tr('Auto')} onCommit={v => setIn('widths', col.key, v == null ? null : Math.max(24, Math.round(v)))} /></Line>
          <div className="chart-pop__note">{tr('Or drag the column edge in the header row.')}</div>
        </>
      )],
      (shownType === 'number' || colType === 'number') && ['num', null, tr('Decimals: {name}', { name: `${spec.decimals?.[col.key] ?? tr('auto')}${spec.magnitude?.[col.key] ? `, ${spec.magnitude[col.key]}` : ''}` }), tr('Number format'), (
        <>
          <Line label={tr('Decimals')}><Seg label={tr('Decimals')} value={spec.decimals?.[col.key] ?? null} onPick={v => setIn('decimals', col.key, v)} items={[[null, tr('Auto')], [0, '0'], [1, '0.0'], [2, '0.00']]} /></Line>
          <Line label={tr('Magnitude')}><Seg label={tr('Magnitude')} value={spec.magnitude?.[col.key] ?? null} onPick={v => setIn('magnitude', col.key, v)} items={[[null, tr('As is')], ['k', 'k'], ['M', 'M'], ['B', 'B']]} /></Line>
        </>
      )],
      (shownType === 'harvey' || colType === 'harvey') && ['scale', null, tr('Scale: {name}', { name: spec.harveyMax?.[col.key] === 4 ? tr('quarters') : spec.harveyMax?.[col.key] === 1 ? '0–1' : tr('auto') }), tr('What a full Harvey ball means'), (
        <Line label={tr('Full at')}><Seg label={tr('Harvey scale')} value={spec.harveyMax?.[col.key] ?? null} onPick={v => setIn('harveyMax', col.key, v)} items={[[null, tr('Auto')], [1, tr('1 (100%)')], [4, tr('4 quarters')]]} /></Line>
      )],
    ] : [],
    row: row ? [
      !isTotal && ['bold', null, tr('Emphasis: {name}', { name: row.bold ? tr('bold') : tr('none') }), tr('Emphasize this row'), (
        <Line label=""><Check on={arr('emphasis').includes(row.key)} onClick={() => toggleIn('emphasis', row.key)}>{tr('Bold row')}</Check></Line>
      )],
      styleCtl(`${row.key}|*`, 'auto'),
      row.inserted && ['label', null, tr('Label: {name}', { name: spec.text?.[`${row.key}|${LABEL_COL}`] || tr('empty') }), tr('Row label'), (
        <Line label={tr('Label')}><Field label={tr('Row label')} wide value={spec.text?.[`${row.key}|${LABEL_COL}`] ?? ''} onCommit={v => setIn('text', `${row.key}|${LABEL_COL}`, v)} /></Line>
      )],
    ] : [],
    cell: cell ? [
      ['type', null, tr('Type: {name}', { name: spec.cellTypes?.[cellId] ? TYPE_NAME[spec.cellTypes[cellId]] : tr('column ({name})', { name: TYPE_NAME[shownType] ?? shownType }) }), tr('Content type of this cell'), (
        <>
          <Line label={tr('Type')}><Seg label={tr('Cell type')} value={spec.cellTypes?.[cellId] ?? null} onPick={v => setIn('cellTypes', cellId, v)} items={[[null, tr('Column')], ...TYPE_ITEMS.slice(1)]} /></Line>
          <div className="chart-pop__note">{tr('The cell value drives the mark: 0–1 or 0–4 fills a Harvey ball, yes / no / empty sets a checkbox, up / down / red / green picks an icon.')}</div>
        </>
      )],
      ['align', null, tr('Align: {name}', { name: `${tr(cell.align)}, ${tr(cell.valign)}` }), tr('Alignment of this cell (Alt+Shift+Page Up / Down: top / bottom)'), (
        <>
          <Line label={tr('Align')}><Seg label={tr('Cell alignment')} value={spec.align?.[cellId] ?? null} onPick={v => setIn('align', cellId, v)} items={[[null, tr('Column')], ['left', tr('Left')], ['center', tr('Center')], ['right', tr('Right')]]} /></Line>
          <Line label={tr('Vertical')}><Seg label={tr('Cell vertical alignment')} value={spec.valign?.[cellId] ?? null} onPick={v => setIn('valign', cellId, v)} items={[[null, tr('Column')], ['top', tr('Top')], ['middle', tr('Middle')], ['bottom', tr('Bottom')]]} /></Line>
        </>
      )],
      (shownType === 'harvey' || shownType === 'check') && ['mark', null, tr('Size: {name}', { name: SIZE_NAME[spec.markSizes?.[cellId] ?? spec.markSizes?.[col.key]] ?? 'M' }), tr('Size of this Harvey ball or checkbox'), (
        <Line label={tr('Size')}><Seg label={tr('Cell mark size')} value={spec.markSizes?.[cellId] ?? null} onPick={v => setIn('markSizes', cellId, v)} items={[[null, tr('Column')], ...SIZE_ITEMS.filter(([k]) => k)]} /></Line>
      )],
      styleCtl(cellId, shownType),
      ['font', null, styleLabel(tr, spec.fonts?.[cellId], spec.pts?.[cellId], null), tr('Font and text size of this cell'), (
        <TextStyle defaultFont={tr('Default')} font={spec.fonts?.[cellId] ?? null} pt={spec.pts?.[cellId] ?? null} onFont={v => setIn('fonts', cellId, v)} onPt={v => setIn('pts', cellId, v)} />
      )],
      !isTotal && !row.inserted && !col.inserted && ['over', null, cell.overwritten ? tr('Text: overwritten') : tr('Text: linked'), tr('Type over this cell (unlinks it from the data sheet)'), (
        <>
          <Line label={tr('Text')}><Field label={tr('Cell text')} wide value={spec.overrides?.[cellId] ?? (cell.text ?? (cell.value == null ? '' : String(cell.value)))} onCommit={v => setIn('overrides', cellId, v ?? '')} /></Line>
          {cell.overwritten
            ? <Line label=""><button type="button" className="chart-pop__more" onClick={() => setIn('overrides', cellId, null)}>{tr('Text from data sheet')}</button></Line>
            : <div className="chart-pop__note">{tr('Typing here unlinks the cell: the data sheet no longer drives it.')}</div>}
        </>
      )],
      (row.inserted || col.inserted) && ['text', null, tr('Value: {name}', { name: spec.text?.[cellId] || tr('empty') }), tr('Content of this inserted cell'), (
        <Line label={tr('Value')}><Field label={tr('Cell value')} wide value={spec.text?.[cellId] ?? ''} onCommit={v => setIn('text', cellId, v)} /></Line>
      )],
    ] : [],
  }
  // pre: the menu sentence with a {type} slot ('Column as {type}').
  const typeActions = (pre, current, onPick) => TYPE_ITEMS.slice(1).map(([v, l]) => ({ label: pre(l.toLowerCase()), checked: current === v, onSelect: () => onPick(v) }))
  const rowActions = row ? [
    !isTotal && { label: tr('Insert row above'), onSelect: () => insertRow(false) },
    !isTotal && { label: tr('Insert row below'), onSelect: () => insertRow(true) },
    !isTotal && { label: tr('Duplicate row'), shortcut: 'Ctrl+Alt+↓', onSelect: () => insertRow(true, true) },
    { label: isTotal ? tr('Remove totals row') : tr('Delete row'), onSelect: deleteRow },
    !isTotal && { label: tr('Bold row'), checked: arr('emphasis').includes(row.key), onSelect: () => toggleIn('emphasis', row.key) },
  ] : []
  const colActions = col ? [
    { label: tr('Insert column left'), onSelect: () => insertCol(false) },
    { label: tr('Insert column right'), onSelect: () => insertCol(true) },
    { label: tr('Duplicate column'), shortcut: 'Ctrl+Alt+→', onSelect: () => insertCol(true, true) },
    { label: tr('Delete column'), onSelect: deleteCol },
  ] : []
  const actions = {
    chart: [
      { label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: tr('Reset data to source'), onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: spec.totals ? tr('Remove totals row') : tr('Add totals row'), onSelect: () => set('totals', !spec.totals) },
      { label: tr('Row stripes'), checked: stripes === 'rows', onSelect: () => set('stripes', stripes === 'rows' ? null : 'rows') },
      { label: tr('Column stripes'), checked: stripes === 'cols', onSelect: () => set('stripes', stripes === 'cols' ? null : 'cols') },
      { label: tr('Column separators'), checked: !!spec.colLines, onSelect: () => set('colLines', !spec.colLines) },
      hidden > 0 && { label: tr('Restore deleted rows and columns ({n})', { n: hidden }), onSelect: () => { set('hideRows', []); set('hideCols', []) } },
    ],
    column: col ? [...colActions, '-', ...typeActions(type => tr('Column as {type}', { type }), colType, v => setIn('colTypes', col.key, v))] : [],
    row: rowActions,
    cell: cell ? [cell.overwritten && { label: tr('Text from data sheet'), onSelect: () => setIn('overrides', cellId, null) }, ...typeActions(type => tr('Cell as {type}', { type }), spec.cellTypes?.[cellId] ?? null, v => setIn('cellTypes', cellId, spec.cellTypes?.[cellId] === v ? null : v)), '-', ...rowActions, ...colActions] : [],
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
        {scene?.empty && <div className="chart-engine-empty">{tr('No data for this table yet.')}</div>}
        <TableFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title={tr('Table format: number format, colours and layout. Tip: click or right-click any cell')} aria-label={tr('Table format')}
          onClick={e => open(e, { obj: 'chart' })}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">{tr('No data for this table yet.')}</div>}
      {scene && !scene.empty && (
        <TableFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} part={part}>
          {sel && <rect x={sel.x + 0.5} y={sel.y + 0.5} width={Math.max(0, sel.w - 1)} height={Math.max(0, sel.h - 1)} className="chart-table__sel" pointerEvents="none" />}
          <rect x={scene.width - 7} y={scene.height - 7} width={8} height={8} className="chart-table__corner" style={{ cursor: 'nwse-resize' }} fill={cur === 'chart' && pick ? tok('gold') : 'transparent'}
            onPointerDown={dragTable}><title>{tr('Drag to resize the table')}</title></rect>
          {spec.headerRow !== false && scene.cols.map(c => (
            <rect key={`w-${c.key}`} x={c.x + c.w - 3} y={0} width={6} height={scene.headH || scene.rowH} className="chart-table__resize" onPointerDown={e => dragWidth(e, c)}>
              <title>{tr('Drag to set the width ({n} px)', { n: Math.round(c.w) })}</title>
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
