// ─── epure-charts · Gantt chart / schedule ─────────────────────────────────────
// <GanttView id rows={[{ key, label, group?, level?, responsible?, remark?, status?,
//   items: [{ key, start?, end?, label?, color?, kind?, shape?, marker?, line?, done?, after?, lag?, duration? }] }]} spec />
// Formatting (FormatBar): clicking a bar, a milestone, a bracket, the header (the scale),
// the label columns or the labels opens its mini toolbar; right-click opens a menu; the
// "today" line can be dragged.
// Editing the plan on the chart: clicking a row opens its mini toolbar (own style, level);
// right-click inserts, duplicates, deletes, moves, indents; keyboard on the selected row
// (Ins, Del, Ctrl+D, Alt+Up/Down, Tab / Shift+Tab, Up/Down); drag a bar (dates), its ends
// (duration) or a milestone, snapped to the scale unit; double-click opens the shared
// datasheet (DataSheet, one row per task, key dates first), which drives the chart. The plan
// lives in the sheet overlay ("Reset data to source" clears it); see ganttSheet for the mapping.
// Also: a calendar (double-click on the scale or an item), handles at the scale ends,
// crosshair with the date while dragging, zoom-dependent step, Ctrl+drag copies
// (Shift+Ctrl: anchored copy), Shift+click multi-selects, arrows move the item, drag a row
// by its label, F2 / double-click edit a label (Alt+arrows between labels), shades and
// brackets from the row menu, labels spanning several rows.
// The drawing itself is GanttFigure (no hooks: server rendering); this view adds the editing
// layer through its `part` and `children`.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { IconPalette, IconTimeline, IconChartBar, IconFlag, IconCalendarEvent, IconTag, IconBracketsContain, IconColumns, IconListTree } from '@tabler/icons-react'
import GanttFigure from './GanttFigure.jsx'
import { buildGanttScene, ganttLang, GANTT_UNITS, insertRow, duplicateRow, deleteRow, moveRow, moveRowTo, moveItem, indentRow, patchRow, patchItem, addItem, removeItem, addUnits, snapDate, unitsBetween, ganttNewKey, ganttSnapUnit, ganttNames, calendarWeeks, calendarMove, calendarRange, formatDate, parseDate } from './ganttScene.js'
import { Seg, Check, Line, Swatches, Field } from './ChartWheel'
import FormatBar from './FormatBar'
import { useViewPrefs } from './useViewPrefs.js'
import { useFormatPick } from './useFormatPick.js'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec.js'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { ganttSheet } from './sheetAdapters.js'

// A color: a design token, or a user-picked hex (custom style).
import { tok, labelTextStyle, styleSummary } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
const PALETTE = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
const MAPS = ['colors', 'shapes', 'markers', 'lines', 'plan', 'rowStyles', 'outlines', 'prevDays', 'recentFormats']
const DEFAULTS = {
  scale: null, today: null, labels: null, rowHeight: null, groups: null, progress: null,
  from: null, to: null, fiscalStart: null, weekStart: null, weekendDays: null, weekends: null,
  monthLabel: null, weekLabel: null, dayLabel: null, gridlines: null, rowStyle: null,
  dateLabels: null, dateFormat: null, shape: null, marker: null, columns: null, status: null, links: null,
  tiers: null, scaleLabels: null, plan: null,
  lang: null, colTitles: null, scaleTexts: null, labelSpans: null, shades: null, background: null,
  colors: {}, shapes: {}, markers: {}, lines: {}, rowStyles: {}, outlines: {}, prevDays: {}, recentFormats: null,
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
const SHAPES = [['bar', 'Bar'], ['pentagon', 'Pentagon'], ['chevron', 'Chevron']]
const MARKERS = [['diamond', 'Diamond'], ['triangle', 'Triangle'], ['circle', 'Circle'], ['square', 'Square']]
const DATE_FORMATS = [['d mmm', '6 Jan'], ['dd/mm', '06/01'], ['mm/dd', '01/06'], ['mmm yy', 'Jan 25'], ['iso', 'ISO']]
const DATE_LABELS = { none: 'none', range: 'range', start: 'start', end: 'end', duration: 'duration' }
const COLS = [['responsible', 'Responsible'], ['status', 'Status'], ['remark', 'Remark']]
const UNIT_NAME = { year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week', day: 'Day' }
const TIER_PRESETS = [['year,quarter', 'Year + Quarter'], ['quarter,month', 'Quarter + Month'], ['month,week', 'Month + Week'], ['week,day', 'Week + Day']]
// A color's display name, for "Fill: teal".
const COLOR_NAME = { 'cat-1': 'teal', 'cat-2': 'blue', 'cat-3': 'orange', 'cat-4': 'purple', 'cat-5': 'raspberry', 'cat-6': 'cyan', 'cat-7': 'slate', 'cat-8': 'bronze' }
const colorName = t => COLOR_NAME[t] ?? String(t ?? '').replace(/-\d+$/, '')
const LANGS = [['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch']]
const LINKS = [['fs', 'After end'], ['ss', 'With start'], ['ff', 'Same end']]
const DAY = 86400000
const daysOf = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY)
const prettyDate = (iso, lang) => formatDate(iso, 'd mmm yyyy', false, lang ?? 'en')
// Has the current drag moved? An event flag (one pointer at a time), kept outside render:
// the click that ends a drag does not open the mini toolbar.
const dragMoved = { v: false }
const setMoved = v => { dragMoved.v = v }

// The chart width, and the band to reserve above the plot when the card header has no room
// for the mini toolbar (it never covers the clicked scale). `fixed`: the `width` prop (no
// measuring: server rendering, static pages).
function useBox(ref, fixed) {
  const [box, setBox] = useState({ width: fixed ?? 0, reserve: 0 })
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || fixed != null) return undefined
    const measure = () => {
      const r = el.getBoundingClientRect()
      // The toolbar sits on the title line: no band reserved above the plot.
      const reserve = 0
      setBox(b => (b.width === Math.round(r.width) && b.reserve === reserve ? b : { width: Math.round(r.width), reserve }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fixed])
  return fixed != null ? { width: fixed, reserve: 0 } : box
}

// Calendar dialog, self-contained and offline: month and year selectable; click sets the
// start, Shift+click the end, drag picks a range; keyboard: arrows, Page Up / Down (month,
// Shift: year), Home / End, Enter picks, Shift+arrows extends.
// Today is shown in red. `single`: one date only (milestone).
function Calendar({ from, to, single, weekStart = 0, lang, onPick }) {
  const N = ganttNames(lang)
  const today = new Date().toISOString().slice(0, 10)
  const init = from || today
  const [view, setView] = useState({ y: +init.slice(0, 4), m: +init.slice(5, 7) - 1 })
  const [focus, setFocus] = useState(init)
  const [anchor, setAnchor] = useState(from || null)
  const [sel, setSel] = useState([from, single ? from : to])
  const drag = useRef(false)
  const gridRef = useRef(null)
  const commit = (a, b) => { const [x, y] = single ? [b, b] : calendarRange(a, b); setSel([x, y]); onPick(x, y) }
  const show = iso => { setFocus(iso); setView({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 }) }
  useEffect(() => {
    const up = () => { if (!drag.current) return; drag.current = false; if (single || sel[0] !== sel[1]) commit(sel[0], sel[1]) }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  })
  const onKey = e => {
    const k = e.key
    if (k === 'Enter' || k === ' ') { e.preventDefault(); setAnchor(focus); if (single) commit(focus, focus); else setSel([focus, focus]); return }
    const nf = calendarMove(focus, k, { shift: e.shiftKey, weekStart })
    if (nf === focus) return
    e.preventDefault(); e.stopPropagation()
    show(nf)
    if (e.shiftKey && !single && k.startsWith('Arrow')) commit(anchor ?? focus, nf)
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-iso="${nf}"]`)?.focus())
  }
  const [a, b] = sel[0] && sel[1] ? calendarRange(sel[0], sel[1]) : [sel[0], sel[0]]
  const step = n => { const t = addUnits(`${view.y}-${String(view.m + 1).padStart(2, '0')}-01`, n, 'month'); setView({ y: +t.slice(0, 4), m: +t.slice(5, 7) - 1 }) }
  const weeks = calendarWeeks(view.y, view.m, weekStart)
  const dows = [...Array(7).keys()].map(i => N.dow[(i + weekStart) % 7])
  const cell = { width: 26, height: 22, border: 0, padding: 0, font: 'inherit', fontSize: 11, borderRadius: 3, cursor: 'pointer' }
  return (
    <div style={{ display: 'grid', gap: 6, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button type="button" className="chart-pop__more" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
        <select className="chart-opts-input" aria-label="Month" style={{ flex: 1, minWidth: 0 }} value={view.m} onChange={e => setView(v => ({ ...v, m: +e.target.value }))}>
          {N.long.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
        <input className="chart-opts-input" aria-label="Year" type="number" style={{ width: 58, flex: 'none', minWidth: 58 }} value={view.y} onChange={e => { const y = Math.round(+e.target.value); if (y > 1900 && y < 2200) setView(v => ({ ...v, y })) }} />
        <button type="button" className="chart-pop__more" aria-label="Next month" onClick={() => step(1)}>›</button>
        <button type="button" className="chart-pop__more" onClick={() => show(today)}>Today</button>
      </div>
      <div ref={gridRef} role="grid" aria-label="Calendar" title={single ? 'Click a day' : 'Click the first day, Shift+click the last, or drag across'} onKeyDown={onKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 1 }}>
        {dows.map((d, i) => <span key={`h${i}`} style={{ fontSize: 10, textAlign: 'center', color: tok('gray-500') }}>{d}</span>)}
        {weeks.flat().map(d => {
          const inRange = a && d.iso >= a && d.iso <= b, end = d.iso === a || d.iso === b
          return (
            <button key={d.iso} type="button" role="gridcell" data-iso={d.iso} aria-selected={!!inRange} tabIndex={d.iso === focus ? 0 : -1}
              title={prettyDate(d.iso, lang)}
              style={{ ...cell, background: end ? tok('gold') : inRange ? tok('gray-100') : 'transparent', color: d.iso === today ? tok('red') : d.out ? tok('gray-400') : tok('black'), fontWeight: d.iso === today || end ? 600 : 400, outline: d.iso === focus ? `1px solid ${tok('gray-500')}` : 'none' }}
              onPointerDown={e => {
                e.preventDefault(); e.currentTarget.focus(); setFocus(d.iso)
                if (e.shiftKey && anchor && !single) { commit(anchor, d.iso); return }
                setAnchor(d.iso); setSel([d.iso, d.iso]); drag.current = true
              }}
              onPointerEnter={() => { if (drag.current && !single) setSel([anchor, d.iso]) }}>{d.day}</button>
          )
        })}
      </div>
    </div>
  )
}

const ROW_STYLE = ['color', 'shape', 'bold']
const ACT_FIELDS = ['responsible', 'status', 'remark', 'level']
const EMPTY = []

// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences.
// responsive: the SVG scales to its container (width="100%", ratio kept).
// dataTable: the dates as a visually hidden table next to the SVG.
export default function GanttView({ id = 'gantt', spec: baseSpec = {}, rows = [], label = 'Gantt chart', width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  // readOnly + applyPrefs: the stored settings and sheet edits drawn, no editing control.
  const plain = readOnly && !applyPrefs
  const boxRef = useRef(null)
  const arrowId = `gantt-arrow-${useId().replace(/:/g, '')}`
  const { width, reserve } = useBox(boxRef, widthProp)
  const prefsApi = useViewPrefs(`epure-chart-gantt-${id}`, DEFAULTS)
  const { set, update, reset, undo, canUndo } = prefsApi
  const P = plain ? DEFAULTS : prefsApi.prefs
  // The datasheet: the source (rows + key dates) as base, with the typed or dragged overlay
  // on top; the chart draws only what it returns.
  // The sheet follows the chart order (group bands when shown) and its status scale
  // (Harvey ball quarters or checkbox).
  const srcEvents = baseSpec.events ?? EMPTY
  const viewSpec = { ...baseSpec, ...Object.fromEntries(Object.entries(P).filter(([k, v]) => v != null && !MAPS.includes(k))) }
  const sheetOpts = useMemo(() => ({ groups: !!viewSpec.groups, status: viewSpec.status === 'checkbox' ? 'checkbox' : 'harvey' }), [viewSpec.groups, viewSpec.status])
  const sheetBase = useMemo(() => ganttSheet.toBase(rows, srcEvents, sheetOpts), [rows, srcEvents, sheetOpts])
  // A task with an invalid date is not drawn: the tasks that depend on it (After column)
  // say so on their row (warning; the value is kept).
  const ganttValidate = useCallback(sh => {
    const ci = k => sh.cols.findIndex(c => c.key === k)
    const iAfter = ci('after'), iLabel = ci('label'), iStart = ci('start')
    const bad = sh.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.cells.some(c => c.error))
    if (!bad.length || iAfter < 0) return {}
    const out = {}
    for (const r of sh.rows) {
      const after = String(r.cells[iAfter]?.value ?? '').trim()
      if (!after) continue
      const hit = bad.find(({ r: b }) => [b.name, iLabel >= 0 ? b.cells[iLabel]?.value : null].filter(Boolean).some(n => after.startsWith(String(n).replace(/^↳\s*/, ''))))
      if (!hit) continue
      const msg = `!Depends on sheet row ${hit.i + 2}, whose date is invalid: not drawn until it is fixed`
      out[`${r.id}|after`] = msg
      if (iStart >= 0) out[`${r.id}|start`] = msg
    }
    return out
  }, [])
  const sheetApi = useSheet(`gantt-${id}`, sheetBase, ganttValidate)
  // Read-only: the source as given (no sheet edits).
  const fromSheet = plain ? { rows, events: srcEvents } : ganttSheet.fromSheet(sheetApi.sheet, rows, srcEvents, sheetOpts)
  // Drawn: without tasks whose typed date is in error, and without hidden rows.
  const drawn = ganttSheet.drawable(fromSheet)
  // The sheet row of a bar ("linked to sheet row n"), numbered like the grid.
  const sheetRowOf = b => {
    const i = sheetApi.sheet.rows.findIndex(r => r.id === `${b.rowKey}~${b.itemKey ?? ''}`)
    return i >= 0 ? `Sheet row ${i + 2}` : 'Sheet'
  }
  // Sheet date format: the last format typed in Start / End becomes the date-label format,
  // as long as no format is chosen on the chart.
  const typedPattern = readOnly ? null : sheetApi.sheet.rows.flatMap(r => r.cells.filter(c => c.edited && c.datePattern && c.datePattern !== 'iso').map(c => c.datePattern)).at(-1)
  const DATE_FMT = { dmy: 'dd/mm/yyyy', mdy: 'mm/dd/yyyy', 'd mmm yyyy': 'd mmm yyyy', 'mmm d yyyy': 'mmm d yyyy' }
  const spec = { ...viewSpec, events: drawn.events, ...(typedPattern && P.dateFormat == null && baseSpec.dateFormat == null ? { dateFormat: DATE_FMT[typedPattern] } : {}) }
  // The displayed plan: the sheet, plus each row's own style (view preference).
  const plan = fromSheet.rows.map(r => (P.rowStyles?.[r.key] ? { ...r, ...P.rowStyles[r.key] } : r))
  // The open grid is rebuilt after an edit on the chart (it reflects the drag).
  const [gridGen, setGridGen] = useState(0)
  // A chart operation (drag, insert, indent...) writes to the sheet overlay.
  // Sheet fill colors and hidden rows / columns are kept; the order is already in the ids
  // returned by fromPlan.
  const edit = fn => {
    const next = fn(plan)
    sheetApi.applyEdits(cur => ({ ...ganttSheet.fromPlan(next, fromSheet.events, sheetBase, sheetOpts), fills: cur.fills ?? {}, hiddenRows: cur.hiddenRows ?? [], hiddenCols: cur.hiddenCols ?? [] }))
    setGridGen(n => n + 1)
  }
  const styleRow = (key, patch) => update('rowStyles', m => {
    const st = { ...(m?.[key] ?? {}), ...patch }
    for (const k of Object.keys(st)) if (st[k] == null) delete st[k]
    return { ...(m ?? {}), [key]: st }
  })
  // A legacy plan edited on the chart (`plan` preference, pre-sheet) migrates into the sheet once.
  useEffect(() => {
    if (!P.plan) return
    if (!sheetApi.sheetEdited) sheetApi.applyEdits(() => ganttSheet.fromPlan(P.plan, srcEvents, sheetBase, sheetOpts))
    const styles = Object.fromEntries(P.plan.map(r => [r.key, Object.fromEntries(ROW_STYLE.filter(k => r[k] != null).map(k => [k, r[k]]))]).filter(([, v]) => Object.keys(v).length))
    if (Object.keys(styles).length) set('rowStyles', { ...(P.rowStyles ?? {}), ...styles })
    set('plan', null)
  }, [P.plan]) // eslint-disable-line react-hooks/exhaustive-deps
  // During a drag: { rowKey, itemKey, toRow?, items: { 'row|item': { start, end } } }.
  const [drag, setDrag] = useState(null)
  // After a drag: the item to reselect once redrawn ({ key, obj }).
  const [reselect, setReselect] = useState(null)
  const [selRow, setSelRow] = useState(null)
  const [sel, setSel] = useState([]) // selected items (Shift+click): 'row|item'
  const [cross, setCross] = useState(null) // crosshair: { x, text }
  const [rowDrop, setRowDrop] = useState(null) // row being dragged: { key, y }
  const [editing, setEditing] = useState(null) // label being edited: { rowKey, col, top }
  const startEdit = (rowKey, col) => setEditing({ rowKey, col })
  const over = (r, it) => {
    const k = `${r.key}|${it.key}`
    let x = { ...it, ...(P.colors?.[k] ? { color: P.colors[k] } : {}), ...(P.shapes?.[k] ? { shape: P.shapes[k] } : {}), ...(P.markers?.[k] ? { marker: P.markers[k] } : {}), ...(P.lines?.[k] != null ? { line: P.lines[k] } : {}),
      ...(P.outlines?.[k] ? { outline: P.outlines[k] } : {}), ...(P.prevDays?.[k] ? { prevDay: true } : {}) }
    const d = drag?.items?.[k]
    if (d) x = { ...x, start: d.start, end: d.end, duration: undefined }
    return x
  }
  let data = drawn.rows.map(r => ({ ...r, ...(P.rowStyles?.[r.key] ?? {}), items: (r.items ?? []).map(it => over(r, it)) }))
  // An item dragged to another row already shows there.
  if (drag?.toRow && drag.toRow !== drag.rowKey) {
    const it = data.find(r => r.key === drag.rowKey)?.items.find(x => x.key === drag.itemKey)
    if (it) data = data.map(r => (r.key === drag.rowKey ? { ...r, items: r.items.filter(x => x !== it) } : r.key === drag.toRow ? { ...r, items: [...r.items, it] } : r))
  }
  const specKey = JSON.stringify(spec)
  const dataKey = JSON.stringify(data)
  // During a drag the scale stays as it was; it re-fits on release.
  const frame = drag?.frame ?? null
  const frameKey = frame ? `${frame.from}|${frame.to}|${frame.auto}` : ''
  const scene = useMemo(() => (width > 0 ? buildGanttScene(spec, data, { width, ...(frame ? { frame } : {}) }) : null), [specKey, dataKey, width, frameKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // The grid mirrors the chart structure (classes set on its DOM on each render, since it
  // rebuilds and its rows move; `readonly` is the Jspreadsheet class):
  //   group band as a header without fields; "↳" task without the activity fields;
  //   key date without end or duration; parent activity: its computed dates (summary of its
  //   sub-activities) greyed and read-only; linked date (After) or end derived from duration:
  //   the computed date greyed, replaced by typing; column A indented by Indent.
  // Only the display changes: the cell value (getData) stays empty.
  // The clicked object (its on-screen box): a mark of infinite weight, never covered.
  const hit = useRef(null)
  const [pick, open0, close] = useFormatPick(boxRef, () => (hit.current ? [hit.current] : []), { onTitle: true })
  const open = (e, o) => {
    const r = e.currentTarget?.getBoundingClientRect?.()
    hit.current = r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, weight: 1e6 } : null
    open0(e, o)
  }
  const [obj, setObj] = useState(null)
  const cur = obj ?? pick?.obj
  const bar = scene?.bars.find(b => b.key === pick?.key)
  const ms = scene?.milestones.find(m => m.key === pick?.key)
  const br = scene?.brackets.find(b => b.key === pick?.key)
  const shade = pick?.obj === 'shade' ? scene?.shades.find(x => x.key === pick.key) : null
  const pickedItem = (pick?.obj === 'bar' && bar) || (pick?.obj === 'milestone' && ms) || (pick?.obj === 'bracket' && br) || null
  const info = sheetApi.sheetOpen ? ganttSheet.rowInfo(sheetApi.sheet) : null
  useEffect(() => {
    if (!info) return undefined
    const decorate = () => {
      const el = boxRef.current?.querySelector('.chart-datasheet__grid')
      if (!el) return
      const sh = sheetApi.sheet
      const cols = sh.cols.map(c => c.key)
      const sums = new Map((scene?.summaries ?? []).map(m => [m.rowKey, m]))
      const items = new Map(fromSheet.rows.flatMap(r => (r.items ?? []).map(it => [`${r.key}|${it.key}`, it])))
      const marks = new Map([...(scene?.bars ?? []), ...(scene?.brackets ?? []), ...(scene?.milestones ?? [])].map(b => [`${b.rowKey}|${b.itemKey}`, b]))
      // The row linked to the item selected on the chart (green outline in the sheet).
      const linked = pickedItem ? sh.rows.findIndex(r => r.id.split('@')[0] === `${pickedItem.rowKey}~${pickedItem.itemKey}`) : -1
      el.querySelectorAll('td[data-x][data-y]').forEach(td => {
        const y = Number(td.dataset.y), x = Number(td.dataset.x)
        const inf = y > 0 ? info[y - 1] : null
        const k = x > 0 ? cols[x - 1] : null
        const cell = inf && x > 0 ? sh.rows[y - 1]?.cells[x - 1] : null
        td.style.boxShadow = linked >= 0 && y - 1 === linked ? `inset 0 2px 0 ${tok('green')}, inset 0 -2px 0 ${tok('green')}` : ''
        td.classList.toggle('chart-gantt-grid__group', inf?.kind === 'group')
        td.classList.toggle('chart-gantt-grid__muted', inf?.kind === 'cont' && x === 0)
        if (x === 0) { td.style.paddingLeft = inf && inf.level > 0 ? `${8 + inf.level * 14}px` : ''; return }
        if (!inf) return
        let ro = false, title = '', computed = null
        if (inf.kind === 'group') { ro = true; title = 'Group heading: no dates of its own, read-only' }
        else if (inf.kind === 'event') { if (k !== 'start') { ro = true; title = 'Key date: only Start applies, read-only' } }
        else if (inf.kind === 'cont' && ACT_FIELDS.includes(k)) { ro = true; title = 'Set on the activity row above, read-only' }
        else if (!inf.itemKey && sums.has(inf.rowKey) && ['start', 'end', 'duration', 'after', 'label'].includes(k)) {
          ro = true; title = 'Computed from its sub-activities, read-only'
          if (k === 'start' || k === 'end') computed = sums.get(inf.rowKey)[k]
        } else if (inf.itemKey && (k === 'start' || k === 'end') && !cell?.error && !items.get(`${inf.rowKey}|${inf.itemKey}`)?.[k]) {
          // The date the chart computes (the cell may keep a source date that After overrides).
          const b = marks.get(`${inf.rowKey}|${inf.itemKey}`)
          const v = k === 'start' ? b?.start ?? b?.date : b?.end
          if (v) { computed = v; title = k === 'start' ? 'Computed from After: type a date to override' : 'Computed from Start + Duration: type a date to override' }
        }
        td.classList.toggle('readonly', ro)
        td.classList.toggle('chart-gantt-grid__computed', computed != null)
        if (computed != null) { td.textContent = computed; td.dataset.ganttComputed = '1' }
        else if (td.dataset.ganttComputed) { delete td.dataset.ganttComputed; td.textContent = cell?.raw ?? '' }
        // An error keeps its message (set by the sheet).
        if (!cell?.error) { if (title) { td.title = title; td.dataset.ganttTitle = '1' } else if (td.dataset.ganttTitle) { delete td.dataset.ganttTitle; td.title = '' } }
      })
    }
    decorate()
    // The grid may rebuild right after (mount, double mount in dev): a second pass.
    const raf = requestAnimationFrame(decorate)
    return () => cancelAnimationFrame(raf)
  })
  // Right-to-left: the drawing is mirrored; a pointer is read from the right edge.
  const pxOf = (ev, r) => (spec.rtl ? r.right - ev.clientX : ev.clientX - r.left)
  const rowKey = pick?.obj === 'row' ? pick.key : selRow
  const row = plan.find(r => r.key === rowKey)
  const rowIdx = plan.findIndex(r => r.key === rowKey)
  const hasGroups = plan.some(r => r.group)
  const hasLinks = plan.some(r => (r.items ?? []).some(it => it.after))
  const todayISO = new Date().toISOString().slice(0, 10)
  const cols = spec.columns ?? []
  const fine = scene?.scale === 'day' || scene?.scale === 'week'
  const tiers = scene?.tiers ?? []
  const unit = scene?.scale ?? 'month'
  const snapOpts = { weekStart: spec.weekStart ?? 0, fiscalStart: spec.fiscalStart ?? 1 }
  const toggleCol = c => { const next = cols.includes(c) ? cols.filter(x => x !== c) : COLS.map(([k]) => k).filter(k => k === c || cols.includes(k)); set('columns', next) }
  const setMap = (name, key, v) => update(name, x => ({ ...(x ?? {}), [key]: v }))
  const setTiers = list => set('tiers', list?.length ? GANTT_UNITS.filter(u => list.includes(u)) : null)
  const toggleTier = u => setTiers(tiers.includes(u) ? tiers.filter(x => x !== u) : [...tiers, u])
  // Drag / arrow step by zoom level (day, week, month...).
  const snapU = scene?.pxPerDay ? ganttSnapUnit(scene.pxPerDay) : unit
  // Language: spec.lang, else the chart locale (as the scene reads it).
  const lang = ganttLang(spec)
  const defaultLang = ganttLang(baseSpec)
  const tipOf = iso => prettyDate(iso, lang)
  // Shades: the view's own, else the source's.
  const shadeList = spec.shades ?? []
  const setShade = (i, patch) => set('shades', shadeList.map((x, k) => (k === i ? Object.fromEntries(Object.entries({ ...x, ...patch }).filter(([, v]) => v != null)) : x)))
  const addShade = (from, to) => {
    const used = new Set(shadeList.map(x => x.key))
    let n = 1
    while (used.has(`shade-${n}`)) n++
    set('shades', [...shadeList, { key: `shade-${n}`, from, to }])
  }
  const spanOf = (col, key) => spec.labelSpans?.[`${col}|${key}`] ?? null
  const setSpan = (col, key, v) => set('labelSpans', Object.fromEntries(Object.entries({ ...(spec.labelSpans ?? {}), [`${col}|${key}`]: v }).filter(([, x]) => x && x.rows > 1)))
  const planItem = o => plan.find(r => r.key === o.rowKey)?.items?.find(x => x.key === o.itemKey)

  // ── Rows: menu, keyboard and sheet operations ──
  const rowOps = key => {
    const i = plan.findIndex(r => r.key === key)
    if (i < 0) return []
    const r = plan[i], L = r.level ?? 0
    const sibUp = plan.slice(0, i).reverse().find(x => (x.level ?? 0) <= L)
    const after = plan.slice(i + 1)
    const end = after.findIndex(x => (x.level ?? 0) <= L)
    const sibDown = end >= 0 ? after[end] : null
    // Right-click in the date area: items are inserted at the clicked date.
    const at0 = pick?.obj === 'row' && pick.key === key && pick.at ? pick.at : null
    const mid = at0 ? (unit === 'day' ? at0 : snapDate(at0, unit, snapOpts)) : scene?.invert ? snapDate(scene.invert(scene.plot.left + scene.plot.width * 0.4), unit, snapOpts) : todayISO
    const span = unit === 'day' ? 5 : unit === 'week' ? 2 : 1
    const last = addUnits(addUnits(mid, span, unit), -1, 'day')
    return [
      { label: 'Insert row above', shortcut: 'Shift+Ins', onSelect: () => { setSelRow(ganttNewKey(plan)); edit(p => insertRow(p, key, 'above')) } },
      { label: 'Insert row below', shortcut: 'Ins', onSelect: () => { setSelRow(ganttNewKey(plan)); edit(p => insertRow(p, key, 'below')) } },
      { label: 'Duplicate row', shortcut: 'Ctrl+D', onSelect: () => { setSelRow(ganttNewKey(plan, key)); edit(p => duplicateRow(p, key)) } },
      { label: 'Duplicate row above', shortcut: 'Ctrl+Alt+↑', onSelect: () => { setSelRow(ganttNewKey(plan, key)); edit(p => duplicateRow(p, key, 'above')) } },
      { label: 'Delete row', shortcut: 'Del', onSelect: () => { setSelRow(null); edit(p => deleteRow(p, key)) } },
      '-',
      sibUp && (sibUp.level ?? 0) === L && { label: 'Move row up', shortcut: 'Alt+↑', onSelect: () => edit(p => moveRow(p, key, -1)) },
      sibDown && (sibDown.level ?? 0) === L && { label: 'Move row down', shortcut: 'Alt+↓', onSelect: () => edit(p => moveRow(p, key, 1)) },
      i > 0 && (plan[i - 1].level ?? 0) >= L && { label: 'Indent', shortcut: 'Tab / Alt+Shift+→', onSelect: () => edit(p => indentRow(p, key, 1)) },
      L > 0 && { label: 'Outdent', shortcut: 'Shift+Tab / Alt+Shift+←', onSelect: () => edit(p => indentRow(p, key, -1)) },
      '-',
      { label: 'Add bar', onSelect: () => edit(p => addItem(p, key, { start: mid, end: last, label: '' })) },
      { label: 'Add milestone', onSelect: () => edit(p => addItem(p, key, { start: mid, kind: 'milestone' })) },
      { label: 'Add bracket', onSelect: () => edit(p => addItem(p, key, { start: mid, end: last, kind: 'bracket' })) },
      { label: 'Add shade', onSelect: () => addShade(mid, last) },
      { label: 'Edit label', shortcut: 'F2', noFocus: true, onSelect: () => startEdit(key, 'activity') },
    ].filter(Boolean).map(it => (it === '-' ? it : { ...it, onSelect: () => { setSelRow(key); it.onSelect(); if (!it.noFocus) refocus() } }))
  }
  // After a menu action, keyboard focus returns to the chart (the row stays selected).
  const refocus = () => requestAnimationFrame(() => document.getElementById(`${arrowId}-box`)?.focus({ preventScroll: true }))
  // Arrows move the selected item (and the rest of the selection) by one step; Ctrl: by one day.
  const nudge = (n, u) => {
    const ids = pickedItem ? [...new Set([pickedItem.key, ...sel])] : sel
    const all = [...(scene?.bars ?? []), ...(scene?.milestones ?? []), ...(scene?.brackets ?? [])]
    const list = ids.map(id => all.find(b => b.key === id)).filter(Boolean)
    if (!list.length) return
    edit(p => list.reduce((acc, b) => patchItem(acc, b.rowKey, b.itemKey, b.date != null && b.start == null
      ? { start: addUnits(b.date, n, u), end: null, duration: null }
      : { start: addUnits(b.start, n, u), end: addUnits(b.end, n, u, u !== 'day' && u !== 'week'), duration: null }), p))
  }
  const onKey = e => {
    if (e.target.closest?.('input, select, textarea, .chart-datasheet')) return
    const k = e.key, mod = e.ctrlKey || e.metaKey
    const run = fn => { e.preventDefault(); fn() }
    if (k === 'Escape' && sel.length) setSel([])
    // Alt+Shift+Left/Right: decrease / increase the activity row indent.
    if (row && e.altKey && e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) return run(() => edit(p => indentRow(p, row.key, k === 'ArrowLeft' ? -1 : 1)))
    if ((pickedItem || sel.length) && (k === 'ArrowLeft' || k === 'ArrowRight')) return run(() => nudge(k === 'ArrowLeft' ? -1 : 1, mod ? 'day' : snapU))
    if (!row) return
    if (k === 'F2') return run(() => startEdit(row.key, 'activity'))
    if (mod && e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) return run(() => { setSelRow(ganttNewKey(plan, row.key)); edit(p => duplicateRow(p, row.key, k === 'ArrowUp' ? 'above' : 'below')) })
    if (k === 'Tab') return run(() => edit(p => indentRow(p, row.key, e.shiftKey ? -1 : 1)))
    if (e.altKey && k === 'ArrowUp') return run(() => edit(p => moveRow(p, row.key, -1)))
    if (e.altKey && k === 'ArrowDown') return run(() => edit(p => moveRow(p, row.key, 1)))
    if (k === 'ArrowUp' || k === 'ArrowDown') return run(() => setSelRow(plan[Math.max(0, Math.min(plan.length - 1, rowIdx + (k === 'ArrowUp' ? -1 : 1)))]?.key ?? null))
    if (k === 'Insert') return run(() => { setSelRow(ganttNewKey(plan)); edit(p => insertRow(p, row.key, e.shiftKey ? 'above' : 'below')) })
    if (mod && (k === 'd' || k === 'D')) return run(() => { setSelRow(ganttNewKey(plan, row.key)); edit(p => duplicateRow(p, row.key)) })
    if (k === 'Delete' || k === 'Backspace') return run(() => { setSelRow(plan[rowIdx + 1]?.key ?? plan[rowIdx - 1]?.key ?? null); edit(p => deleteRow(p, row.key)) })
    if (k === 'Escape' && !pick) setSelRow(null)
  }

  // ── Drag: a bar (dates), one of its ends (duration) or a milestone, at the zoom step ──
  // To another row: the item changes row. Ctrl: a copy; Shift+Ctrl: a copy anchored to the
  // original (start to start, offset). Selected items (Shift+click) follow.
  const rowAtY = y => scene.rows.find(r => !r.group && !r.events && y >= r.y0 && y < r.y1)?.key ?? null
  const startDrag = (e, kind, b) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const sc = scene, svg = e.currentTarget.ownerSVGElement, x0 = e.clientX, y0 = e.clientY
    const at = ev => sc.invert(pxOf(ev, svg.getBoundingClientRect()))
    const d0 = at(e)
    const s0 = b.start ?? b.date, e0 = b.end ?? b.date
    const u = snapU, uMove = kind === 'milestone' && u === 'week' ? 'day' : u
    const group = kind === 'move' && sel.includes(b.key) && sel.length > 1
      ? [...(sc.bars ?? []), ...(sc.milestones ?? []), ...(sc.brackets ?? [])].filter(x => sel.includes(x.key) && x.key !== b.key) : []
    let next = null, toRow = b.rowKey, copy = 0, items = {}
    setMoved(false)
    const move = ev => {
      if (!dragMoved.v && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 6) return
      setMoved(true)
      const r = svg.getBoundingClientRect()
      const d = at(ev)
      if (kind === 'move') { const n = unitsBetween(d0, d, u); next = { start: addUnits(s0, n, u), end: addUnits(e0, n, u, u !== 'day' && u !== 'week') } }
      else if (kind === 'start') { const st = u === 'day' ? d : snapDate(d, u, snapOpts); next = { start: st > e0 ? e0 : st, end: e0 } }
      else if (kind === 'end') { const en = u === 'day' ? d : addUnits(snapDate(d, u, snapOpts), -1, 'day'); next = { start: s0, end: en < s0 ? s0 : en } }
      else { const n = unitsBetween(d0, d, uMove); next = { start: addUnits(s0, n, uMove), end: undefined } }
      if ((kind === 'move' || kind === 'milestone') && !group.length) toRow = rowAtY(ev.clientY - r.top) ?? toRow
      copy = (ev.ctrlKey || ev.metaKey) && (kind === 'move' || kind === 'milestone') ? (ev.shiftKey ? 2 : 1) : 0
      const n = kind === 'move' ? unitsBetween(d0, d, u) : 0
      items = { [b.key]: next }
      for (const g of group) items[g.key] = g.date != null && g.start == null ? { start: addUnits(g.date, n, u), end: undefined } : { start: addUnits(g.start, n, u), end: addUnits(g.end, n, u, u !== 'day' && u !== 'week') }
      setDrag({ rowKey: b.rowKey, itemKey: b.itemKey, toRow, items, frame: sc.frame })
      // The crosshair: the date (start, or end for the right end) under the pointer.
      const shown = kind === 'end' ? next.end : next.start
      setCross({ x: pxOf(ev, r), y: ev.clientY - r.top - 12, of: `${toRow}|${b.itemKey}`, text: `${tipOf(shown)}${copy ? (copy === 2 ? ' · anchored copy' : ' · copy') : ''}` })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setCross(null)
      if (next) {
        const src = planItem(b)
        const keep = src ? Object.fromEntries(Object.entries(src).filter(([k]) => !['key', 'start', 'end', 'duration', 'after', 'link', 'lag'].includes(k))) : {}
        const isMs = kind === 'milestone'
        if (copy === 2 && src) edit(p => addItem(p, toRow, { ...keep, after: b.itemKey, link: 'ss', lag: daysOf(s0, next.start) || undefined, ...(isMs ? {} : { duration: daysOf(s0, e0) + 1 }) }))
        else if (copy === 1 && src) edit(p => addItem(p, toRow, { ...keep, start: next.start, ...(isMs ? {} : { end: next.end }) }))
        else if (group.length) {
          edit(p => [b, ...group].reduce((acc, x) => {
            const g = items[x.key]
            return g ? patchItem(acc, x.rowKey, x.itemKey, { start: g.start, end: g.end ?? null, duration: null }) : acc
          }, p))
        } else edit(p => moveItem(p, b.rowKey, b.itemKey, toRow, isMs ? { start: next.start, end: null, duration: null } : { start: next.start, end: next.end, duration: null }))
        // The dragged item stays selected (its mini toolbar returns at its new place) once the
        // scale has re-fitted; a copy or a group keep the previous selection.
        if (!copy && !group.length) {
          setReselect({ key: `${toRow}|${b.itemKey}`, obj: isMs ? 'milestone' : 'bar' })
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // Scale ends: dragging widens or narrows the range, snapped to the scale unit; the date
  // is read under the pointer.
  const dragScale = side => e => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const sc = scene, svg = e.currentTarget.ownerSVGElement
    let d = null
    const move = ev => {
      const r = svg.getBoundingClientRect(), px = pxOf(ev, r)
      const raw = sc.dateAt(px)
      d = unit === 'day' ? raw : snapDate(raw, unit, snapOpts)
      if (side === 'to' && unit !== 'day') d = addUnits(d, -1, 'day')
      setCross({ x: px, text: `${side === 'from' ? 'From' : 'To'} ${tipOf(d)}` })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setCross(null)
      if (!d) return
      const other = side === 'from' ? spec.to ?? sc.range.to : spec.from ?? sc.range.from
      if (side === 'from' ? d < other : d > other) { set(side, d); if (!spec[side === 'from' ? 'to' : 'from']) set(side === 'from' ? 'to' : 'from', other) }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // Drag a row by its label: it drops above the target row (below in its lower half),
  // together with its children.
  const startRowDrag = (e, key) => {
    if (e.button !== 0) return
    const svg = e.currentTarget.ownerSVGElement, y0 = e.clientY
    let target
    setMoved(false)
    const editable = scene.rows.filter(r => !r.group && !r.events)
    const move = ev => {
      if (!dragMoved.v && Math.abs(ev.clientY - y0) < 5) return
      setMoved(true)
      const y = ev.clientY - svg.getBoundingClientRect().top
      const r = editable.find(x => y >= x.y0 && y < x.y1) ?? (y < editable[0].y0 ? editable[0] : editable.at(-1))
      const below = y >= (r.y0 + r.y1) / 2
      const i = plan.findIndex(x => x.key === r.key)
      target = below ? plan[i + 1]?.key ?? null : r.key
      setRowDrop({ key, y: below ? r.y1 : r.y0 })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setRowDrop(null)
      if (dragMoved.v && target !== undefined && target !== key) { setSelRow(key); edit(p => moveRowTo(p, key, target)) }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const objects = {
    chart: { name: 'Gantt', icon: IconTimeline },
    ...(bar ? { bar: { name: bar.label || 'Bar', icon: IconChartBar } } : {}),
    ...(ms ? { milestone: { name: ms.label ?? 'Milestone', icon: IconFlag } } : {}),
    ...(br ? { bracket: { name: 'Bracket', icon: IconBracketsContain } } : {}),
    ...(shade ? { shade: { name: shade.label || 'Shade', icon: IconCalendarEvent } } : {}),
    ...(row ? { row: { name: row.label || 'Row', icon: IconListTree } } : {}),
    scale: { name: 'Time scale', icon: IconCalendarEvent },
    columns: { name: 'Label columns', icon: IconColumns },
    labels: { name: 'Labels', icon: IconTag },
  }
  const colorCtl = it => ['fill', <span className="chart-bar__dot" style={{ background: tok(it.color) }} />, `Fill: ${colorName(it.color)}`, 'Fill color', (
    <Swatches palette={PALETTE} value={P.colors?.[it.key] ?? it.color} onPick={c => setMap('colors', it.key, c)} />
  )]
  // An item's dates, editable (or dragged on the chart).
  const dateCtl = (o, one) => ['dates', null, one ? `Date: ${tipOf(o.date)}` : `Dates: ${tipOf(o.start)} → ${tipOf(o.end)}`, one ? 'Date (calendar)' : 'Dates (calendar)', (
    <>
      <Calendar from={one ? o.date : o.start} to={one ? o.date : o.end} single={one} weekStart={spec.weekStart ?? 0} lang={lang}
        onPick={(a, b) => edit(p => patchItem(p, o.rowKey, o.itemKey, one ? { start: a, end: null, duration: null } : { start: a, end: b, duration: null }))} />
      {one && <Line label=""><Check on={!!o.prevDay} onClick={() => setMap('prevDays', o.key, !o.prevDay)}>Date label shows the previous day</Check></Line>}
      <Line label={one ? 'Date' : 'Start'}><Field label="Start" inline value={one ? o.date : o.start} placeholder="YYYY-MM-DD" onCommit={v => ISO.test(v) && edit(p => patchItem(p, o.rowKey, o.itemKey, { start: v, ...(one ? {} : { duration: null, end: o.end }) }))} /></Line>
      {!one && <Line label="End"><Field label="End" inline value={o.end} placeholder="YYYY-MM-DD" onCommit={v => ISO.test(v) && v >= o.start && edit(p => patchItem(p, o.rowKey, o.itemKey, { end: v, duration: null, start: o.start }))} /></Line>}
      {o.linked && <div className="chart-pop__note">Starts after its predecessor unless dated here.</div>}
    </>
  )]
  // Bar outline.
  const outlineCtl = it => ['outline', null, `Outline: ${it.outline ? colorName(it.outline) : 'none'}`, 'Outline color', (
    <>
      <Swatches palette={PALETTE} value={it.outline} onPick={c => setMap('outlines', it.key, c)} />
      {it.outline && <Line label=""><button type="button" className="chart-pop__more" onClick={() => setMap('outlines', it.key, null)}>No outline</button></Line>}
    </>
  )]
  // Anchors: link the dates to an item on any row.
  const anchorCtl = o => {
    const it = planItem(o)
    if (!it) return null
    const one = o.date != null && o.start == null
    const others = plan.flatMap(r => (r.items ?? []).filter(x => !(r.key === o.rowKey && x.key === o.itemKey)).map(x => [x.key, `${r.label || r.key} · ${x.label || x.key}`]))
    const pred = String([].concat(it.after ?? [])[0] ?? '').split('|').at(-1)
    const link = it.link ?? 'fs'
    const name = others.find(([k]) => k === pred)?.[1]
    const dur = one ? 0 : daysOf(o.start, o.end) + 1
    const setA = (after, lk = link, lag = it.lag) => edit(p => patchItem(p, o.rowKey, o.itemKey, after
      ? { after, link: lk === 'fs' ? null : lk, lag: lag || null, start: null, ...(one ? {} : { end: null, duration: dur }) }
      : { after: null, link: null, lag: null, start: one ? o.date : o.start, ...(one ? {} : { end: o.end, duration: null }) }))
    return ['anchor', null, `Anchor: ${name ? `${LINKS.find(l => l[0] === link)[1].toLowerCase()} ${name.split(' · ').at(-1)}` : 'none'}`, 'Link its dates to another item (any row)', (
      <>
        <Line label="To">
          <select className="chart-opts-input" aria-label="Anchored to" value={name ? pred : ''} onChange={e => setA(e.target.value || null)}>
            <option value="">None</option>
            {others.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Line>
        {name && <Line label="Type"><Seg label="Anchor type" value={link} onPick={v => setA(pred, v)} items={LINKS} /></Line>}
        {name && <Line label="Lag"><Field label="Lag in days" inline numeric value={it.lag ?? 0} onCommit={v => setA(pred, link, Math.round(v ?? 0))} /></Line>}
        <div className="chart-pop__note">The dates follow the other item; also typed in the sheet (After: « Name SS +2 »).</div>
      </>
    )]
  }
  // A Responsible / Remark label spanning several rows, with its bracket.
  const spanCols = ['responsible', 'remark'].filter(c => cols.includes(c))
  const rowColor = row?.color ?? null
  // Named fill scheme: one color per activity, in row order.
  const actRows = scene?.rows.filter(r => !r.group && !r.events) ?? []
  const controls = {
    chart: [
      ['scheme', null, `Colors: ${P.schemeName ?? 'default'}`, 'Color schemes (named, saved by browser)', (
        <SchemeTools current={actRows.map(r => r.color ?? scene.bars.find(b => b.rowKey === r.key)?.color ?? 'cat-2')} active={P.schemeName}
          onApply={sc => {
            if (sc) update('rowStyles', m => Object.fromEntries([...Object.entries(m ?? {}), ...actRows.map((r, i) => [r.key, { ...(m?.[r.key] ?? {}), color: sc.colors[i % sc.colors.length] }])]))
            set('schemeName', sc?.name ?? null)
          }} />
      )],
      hasGroups &&['groups', null, `Groups: ${spec.groups ? 'shown' : 'off'}`, 'Group rows under a heading', (
        <Line label=""><Check on={!!spec.groups} onClick={() => set('groups', !spec.groups)}>Group headings</Check></Line>
      )],
      ['today', null, `Today line: ${spec.today ? tipOf(spec.today) : 'off'}`, 'Today line', (
        <>
          <Line label=""><Check on={!!spec.today} onClick={() => set('today', spec.today ? null : todayISO)}>Today line</Check></Line>
          {spec.today && <Line label="Date"><Field label="Date" type="date" value={spec.today} placeholder="YYYY-MM-DD" onCommit={v => ISO.test(v) && set('today', v)} /></Line>}
          <div className="chart-pop__note">Or drag the line on the chart.</div>
        </>
      )],
      ['rows', null, `Rows: ${{ 20: 'compact', 34: 'roomy' }[spec.rowHeight] ?? 'medium'}, ${{ lines: 'separators', plain: 'plain' }[spec.rowStyle] ?? 'shaded'}`, 'Row height, row shade and separators', (
        <>
          <Line label="Height"><Seg label="Row height" value={spec.rowHeight ?? 26} onPick={v => set('rowHeight', v === 26 ? null : v)} items={[[20, 'Compact'], [26, 'Medium'], [34, 'Roomy']]} /></Line>
          <Line label="Rows"><Seg label="Row style" value={spec.rowStyle ?? 'banded'} onPick={v => set('rowStyle', v === 'banded' ? null : v)} items={[['banded', 'Shade'], ['lines', 'Separators'], ['plain', 'Plain']]} /></Line>
        </>
      )],
      ['shapes', null, `Shapes: ${spec.shape ?? 'bar'}, ${spec.marker ?? 'diamond'}`, 'Default bar shape (process arrows) and milestone marker', (
        <>
          <Line label="Bars"><Seg label="Bar shape" value={spec.shape ?? 'bar'} onPick={v => set('shape', v === 'bar' ? null : v)} items={SHAPES} /></Line>
          <Line label="Milestones"><Seg label="Milestone marker" value={spec.marker ?? 'diamond'} onPick={v => set('marker', v === 'diamond' ? null : v)} items={MARKERS} /></Line>
        </>
      )],
      ['progress', null, `Progress: ${spec.progress ? 'shown' : 'off'}`, 'Progress inside the bars', (
        <Line label=""><Check on={!!spec.progress} onClick={() => set('progress', !spec.progress)}>Show progress (% done)</Check></Line>
      )],
      ['background', spec.background ? <span className="chart-bar__dot" style={{ background: tok(spec.background) }} /> : null, `Background: ${spec.background ? colorName(spec.background) : 'none'}`, 'Chart background color', (
        <>
          <Swatches palette={[...NEUTRAL_TOKENS, ...COLOR_TOKENS]} value={spec.background} onPick={c => set('background', c)} />
          {spec.background && <Line label=""><button type="button" className="chart-pop__more" onClick={() => set('background', null)}>No background</button></Line>}
        </>
      )],
      ['lang', null, `Language: ${LANGS.find(l => l[0] === lang)?.[1] ?? lang}`, 'Month names, weekdays and default headings', (
        <Line label="Language"><Seg label="Language" value={lang} onPick={v => set('lang', v === defaultLang ? null : v)} items={LANGS} /></Line>
      )],
      hasLinks && ['links', null, `Links: ${spec.links === false ? 'hidden' : 'shown'}`, 'Dependency arrows between linked items', (
        <>
          <Line label=""><Check on={spec.links !== false} onClick={() => set('links', spec.links === false ? null : false)}>Dependency arrows</Check></Line>
          <div className="chart-pop__note">A linked item starts the day after its predecessor ends.</div>
        </>
      )],
    ],
    bar: bar ? [
      colorCtl(bar),
      ['shape', null, `Shape: ${bar.shape}`, 'Shape of this item', (
        <Line label="Shape"><Seg label="Item shape" value={bar.shape} onPick={v => setMap('shapes', bar.key, v)} items={SHAPES} /></Line>
      )],
      dateCtl(bar),
      outlineCtl(bar),
      anchorCtl(bar),
    ] : [],
    milestone: ms ? [
      colorCtl(ms),
      ['marker', null, `Marker: ${ms.marker}`, 'Marker of this milestone', (
        <>
          <Line label="Marker"><Seg label="Milestone marker" value={ms.marker} onPick={v => setMap('markers', ms.key, v)} items={MARKERS} /></Line>
          <Line label=""><Check on={!!ms.line} onClick={() => setMap('lines', ms.key, !ms.line)}>Milestone line across the chart</Check></Line>
        </>
      )],
      dateCtl(ms, true),
      anchorCtl(ms),
    ] : [],
    bracket: br ? [colorCtl(br), dateCtl(br)] : [],
    shade: shade ? [
      ['dates', null, `Dates: ${tipOf(shade.from)} → ${tipOf(shade.to)}`, 'Dates (calendar)', (
        <Calendar from={shade.from} to={shade.to} weekStart={spec.weekStart ?? 0} lang={lang} onPick={(a, b) => setShade(shade.index, { from: a, to: b })} />
      )],
      ['label', null, `Label: ${shade.label || '—'}`, 'Shade label', (
        <Line label="Label"><Field label="Shade label" inline wide value={shade.label ?? ''} onCommit={v => setShade(shade.index, { label: v || null })} /></Line>
      )],
      ['fill', <span className="chart-bar__dot" style={{ background: tok(shade.color) }} />, `Fill: ${colorName(shade.color)}`, 'Shade color', (
        <Swatches palette={[...NEUTRAL_TOKENS, ...COLOR_TOKENS]} value={shade.color} onPick={c => setShade(shade.index, { color: c })} />
      )],
      ['bracket', null, `Bracket: ${shade.bracket ? 'shown' : 'off'}`, 'A bracket anchored to the shade', (
        <Line label=""><Check on={!!shade.bracket} onClick={() => setShade(shade.index, { bracket: shade.bracket ? null : true })}>Bracket under the chart</Check></Line>
      )],
    ] : [],
    row: row ? [
      ['label', null, `Label: ${row.label || '—'}`, 'Activity label', (
        <Line label="Label"><Field label="Activity label" inline wide value={row.label} onCommit={v => edit(p => patchRow(p, row.key, { label: v }))} /></Line>
      )],
      ['rowfill', <span className="chart-bar__dot" style={{ background: tok(rowColor ?? 'cat-2') }} />, `Fill: ${rowColor ? colorName(rowColor) : 'chart default'}`, 'Bar color for this row', (
        <>
          <Swatches palette={PALETTE} value={rowColor} onPick={c => styleRow(row.key, { color: c })} />
          {rowColor && <Line label=""><button type="button" className="chart-pop__more" onClick={() => styleRow(row.key, { color: null })}>Use the chart default</button></Line>}
        </>
      )],
      ['rowshape', null, `Shape: ${row.shape ?? 'chart default'}`, 'Bar shape for this row', (
        <Line label="Shape"><Seg label="Row bar shape" value={row.shape ?? null} onPick={v => styleRow(row.key, { shape: v })} items={[[null, 'Default'], ...SHAPES]} /></Line>
      )],
      ['bold', null, `Text: ${row.bold ? 'bold' : 'regular'}`, 'Label weight', (
        <Line label=""><Check on={!!row.bold} onClick={() => styleRow(row.key, { bold: row.bold ? null : true })}>Bold label</Check></Line>
      )],
      spanCols.length > 0 && ['span', null, `Spans: ${spanCols.map(c => spanOf(c, row.key)?.rows ?? 1).join(' / ')} rows`, 'Responsible or remark label spanning several rows', (
        <>
          {spanCols.map(c => (
            <Line key={c} label={c === 'responsible' ? 'Responsible' : 'Remark'}>
              <Seg label={`${c} spans rows`} value={spanOf(c, row.key)?.rows ?? 1} onPick={v => setSpan(c, row.key, { ...(spanOf(c, row.key) ?? {}), rows: v })} items={[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]} />
              {(spanOf(c, row.key)?.rows ?? 1) > 1 && <Check on={!!spanOf(c, row.key)?.bracket} onClick={() => setSpan(c, row.key, { ...spanOf(c, row.key), bracket: !spanOf(c, row.key)?.bracket })}>Bracket</Check>}
            </Line>
          ))}
          <div className="chart-pop__note">The label of this row covers the rows below it.</div>
        </>
      )],
      ['level', null, `Level: ${row.level ?? 0}`, 'Hierarchy level (Tab / Shift+Tab)', (
        <>
          <Line label="Level">
            <button type="button" className="chart-pop__more" disabled={!(row.level > 0)} onClick={() => edit(p => indentRow(p, row.key, -1))}>Outdent</button>
            <button type="button" className="chart-pop__more" disabled={rowIdx < 1 || (plan[rowIdx - 1].level ?? 0) < (row.level ?? 0)} onClick={() => edit(p => indentRow(p, row.key, 1))}>Indent</button>
          </Line>
          <div className="chart-pop__note">A parent row without its own bar shows a summary bar over its children.</div>
        </>
      )],
    ] : [],
    scale: [
      ['tiers', null, `Scales: ${tiers.map(u => UNIT_NAME[u]).join(' + ')}`, 'Time scale: unit and stacked scales (up to three)', (
        <>
        <Line label="Unit"><Seg label="Time scale" value={spec.tiers ? 'custom' : spec.scale ?? null} onPick={v => { set('tiers', null); set('scale', v) }} items={[[null, 'Auto'], ['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['quarter', 'Quarters'], ['year', 'Years']]} /></Line>
          <Line label="Preset"><Seg label="Scale tiers" value={spec.tiers ? spec.tiers.join(',') : null} onPick={v => setTiers(v ? v.split(',') : null)} items={[[null, 'Auto'], ...TIER_PRESETS]} /></Line>
          <Line label="">
            <div className="chart-pop__stack">
              {GANTT_UNITS.map(u => <Check key={u} on={tiers.includes(u)} onClick={() => (tiers.includes(u) ? tiers.length > 1 : tiers.length < 3) && toggleTier(u)}>{UNIT_NAME[u]}s</Check>)}
            </div>
          </Line>
        </>
      )],
      ['scalelabels', null, `Scale labels: ${spec.scaleLabels ? 'shown' : 'off'}`, 'A label at the left of each scale', (
        <>
          <Line label=""><Check on={!!spec.scaleLabels} onClick={() => set('scaleLabels', spec.scaleLabels ? null : true)}>Scale labels</Check></Line>
          {spec.scaleLabels && tiers.map(u => (
            <Line key={u} label={UNIT_NAME[u]}><Field label={`${UNIT_NAME[u]} scale label`} inline value={scene?.tierLabels?.find(t => t.unit === u)?.text ?? ''}
              onCommit={v => set('scaleLabels', { ...(typeof spec.scaleLabels === 'object' ? spec.scaleLabels : {}), [u]: v })} /></Line>
          ))}
        </>
      )],
      pick?.cell && ['celltext', null, `Text: ${spec.scaleTexts?.[pick.cell] ?? 'date'}`, 'Free text in this scale label (footnote, name…)', (
        <>
          <Line label="Text"><Field label="Scale label text" inline wide value={spec.scaleTexts?.[pick.cell] ?? ''} placeholder={scene?.header.find(h => h.key === pick.cell)?.text ?? ''}
            onCommit={v => set('scaleTexts', Object.fromEntries(Object.entries({ ...(spec.scaleTexts ?? {}), [pick.cell]: v || null }).filter(([, x]) => x != null)))} /></Line>
          <div className="chart-pop__note">Empty: back to the date.</div>
        </>
      )],
      ['range', null, `Range: ${spec.from || spec.to ? `${tipOf(scene?.range?.from)} → ${tipOf(scene?.range?.to)}` : 'fit'}`, 'Date range shown (calendar, or drag the ends of the scale)', (
        <>
          <Calendar from={scene?.range?.from} to={scene?.range?.to} weekStart={spec.weekStart ?? 0} lang={lang} onPick={(a, b) => { set('from', a); set('to', b) }} />
          {(spec.from || spec.to) && <Line label=""><button type="button" className="chart-pop__more" onClick={() => { set('from', null); set('to', null) }}>Fit scale to data</button></Line>}
        </>
      )],
      ['fiscal', null, `Year: ${spec.fiscalStart > 1 ? `FY ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][spec.fiscalStart - 1]}` : 'calendar'}`, 'Fiscal year start', (
        <Line label="Starts"><Seg label="Fiscal year start" value={spec.fiscalStart ?? 1} onPick={v => set('fiscalStart', v === 1 ? null : v)} items={[[1, 'Jan'], [4, 'Apr'], [7, 'Jul'], [10, 'Oct']]} /></Line>
      )],
      ['weekends', null, `Weekends: ${spec.weekends ?? 'normal'}`, 'Weekend display and first day of the week', (
        <>
          <Line label="Weekends"><Seg label="Weekend display" value={spec.weekends ?? 'normal'} onPick={v => set('weekends', v === 'normal' ? null : v)} items={[['normal', 'Normal'], ['shaded', 'Shaded'], ['hidden', 'Hidden']]} /></Line>
          <Line label="Days"><Seg label="Weekend days" value={(spec.weekendDays ?? [5, 6]).join(',')} onPick={v => set('weekendDays', v === '5,6' ? null : v.split(',').map(Number))} items={[['5,6', 'Sat–Sun'], ['4,5', 'Fri–Sat']]} /></Line>
          <Line label="Week starts"><Seg label="Week starts on" value={spec.weekStart ?? 0} onPick={v => set('weekStart', v === 0 ? null : v)} items={[[0, 'Monday'], [6, 'Sunday']]} /></Line>
        </>
      )],
      ['format', null, `Labels: ${fine ? (scene?.scale === 'day' ? (spec.dayLabel ?? 'date') : (spec.weekLabel ?? 'date')) : (spec.monthLabel ?? 'short')}`, 'Scale label format', (
        <>
          <Line label="Months"><Seg label="Month labels" value={spec.monthLabel ?? 'short'} onPick={v => set('monthLabel', v === 'short' ? null : v)} items={[['short', 'Jan'], ['letter', 'J'], ['number', '01']]} /></Line>
          <Line label="Weeks"><Seg label="Week labels" value={spec.weekLabel ?? 'date'} onPick={v => set('weekLabel', v === 'date' ? null : v)} items={[['date', 'Start date'], ['number', 'Week no.']]} /></Line>
          <Line label="Days"><Seg label="Day labels" value={spec.dayLabel ?? 'date'} onPick={v => set('dayLabel', v === 'date' ? null : v)} items={[['date', 'Date'], ['weekday', 'Weekday']]} /></Line>
        </>
      )],
      ['grid', null, `Separators: ${spec.gridlines ?? 'all'}`, 'Vertical separator lines', (
        <Line label="Lines"><Seg label="Vertical separators" value={spec.gridlines ?? 'all'} onPick={v => set('gridlines', v === 'all' ? null : v)} items={[['all', 'Every unit'], ['major', 'Major only'], ['none', 'None']]} /></Line>
      )],
    ],
    columns: [
      ['cols', null, `Columns: ${cols.length ? cols.join(', ') : 'activity only'}`, 'Label columns beside the activities', (
        <Line label="">
          <div className="chart-pop__stack">
            {COLS.map(([k, l]) => <Check key={k} on={cols.includes(k)} onClick={() => toggleCol(k)}>{l}</Check>)}
          </div>
        </Line>
      )],
      cols.length > 0 && ['titles', null, `Titles: ${scene?.colHeads.map(h => h.text).join(', ')}`, 'Column headings', (
        <>
          {(scene?.colHeads ?? []).map(h => (
            <Line key={h.key} label={h.key === 'activity' ? 'Activity' : COLS.find(c => c[0] === h.key)?.[1]}>
              <Field label={`${h.key} heading`} inline value={spec.colTitles?.[h.key] ?? ''} placeholder={h.text}
                onCommit={v => set('colTitles', Object.fromEntries(Object.entries({ ...(spec.colTitles ?? {}), [h.key]: v || null }).filter(([, x]) => x != null)))} />
            </Line>
          ))}
        </>
      )],
      cols.includes('status') && ['status', null, `Status: ${spec.status === 'checkbox' ? 'checkbox' : 'Harvey ball'}`, 'Status display', (
        <Line label="Show as"><Seg label="Status display" value={spec.status ?? 'harvey'} onPick={v => set('status', v === 'harvey' ? null : v)} items={[['harvey', 'Harvey ball'], ['checkbox', 'Checkbox']]} /></Line>
      )],
    ],
    labels: [
      ['textstyle', null, styleSummary(P), 'Label color, font and size', <TextStyle font={P.labelFont} pt={P.labelPt} color={P.labelColor} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} onColor={v => set('labelColor', v)} />],
      // Labels dropped for lack of room (large size): counted; the name stays on bar hover.
      scene?.noRoom > 0 && ['noroom', null, `${scene.noRoom} hidden (no room)`, 'Labels left out for lack of room', (
        <div className="chart-pop__note">{`${scene.noRoom} label${scene.noRoom > 1 ? 's' : ''} did not fit at this size. Hover a bar to read it, or reduce the size in Style.`}</div>
      )],
      ['pos', null, `Labels: ${spec.labels ?? 'inside'}`, 'Bar labels', (
        <Line label="Position"><Seg label="Bar labels" value={spec.labels ?? 'inside'} onPick={v => set('labels', v === 'inside' ? null : v)} items={[['inside', 'Inside'], ['right', 'Right'], ['none', 'None']]} /></Line>
      )],
      ['dates', null, `Dates: ${DATE_LABELS[spec.dateLabels ?? 'none']}`, 'Date labels of the items', (
        <>
          <Line label="Content"><Seg label="Date label content" value={spec.dateLabels ?? 'none'} onPick={v => set('dateLabels', v === 'none' ? null : v)} items={[['none', 'None'], ['range', 'Range'], ['start', 'Start'], ['end', 'End'], ['duration', 'Duration']]} /></Line>
          <Line label="Format"><Seg label="Date format" value={spec.dateFormat ?? 'd mmm'} onPick={v => set('dateFormat', v === 'd mmm' ? null : v)} items={DATE_FORMATS} /></Line>
          {(P.recentFormats ?? []).length > 0 && <Line label="Recent"><Seg label="Recent date formats" value={spec.dateFormat} onPick={v => set('dateFormat', v)} items={P.recentFormats.map(f => [f, f])} /></Line>}
          <Line label="Code">
            <input className="chart-opts-input" aria-label="Date format code" placeholder="dddd d mmmm yyyy" defaultValue={DATE_FORMATS.some(f => f[0] === spec.dateFormat) ? '' : spec.dateFormat ?? ''}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onBlur={e => { const v = e.target.value.trim(); if (!v) return; set('dateFormat', v); update('recentFormats', l => [v, ...(l ?? []).filter(x => x !== v)].slice(0, 4)) }} />
          </Line>
          <div className="chart-pop__note">Codes: d dd ddd dddd, m mm mmm mmmm, yy yyyy, q (quarter), w ww (ISO week), "text". Example now: {formatDate(todayISO, spec.dateFormat ?? 'd mmm', false, lang)}</div>
        </>
      )],
    ],
  }
  // A control opened up front (the calendar): the toolbar remounts in "bar" mode.
  const [forceCtl, setForceCtl] = useState(null)
  useEffect(() => {
    if (!reselect || drag) return undefined
    // On the next tick: the scale has re-fitted, the toolbar is in its final place.
    const t = setTimeout(() => {
      const el = boxRef.current?.querySelector(`[data-gantt-key="${CSS.escape(reselect.key)}"]`)
      setReselect(null)
      if (!el) return
      const r = el.getBoundingClientRect()
      setSel([reselect.key]); setObj(null); setForceCtl(null)
      open({ type: 'click', clientX: r.left + r.width / 2, clientY: r.top, currentTarget: el, target: el, preventDefault() {}, stopPropagation() {} }, { obj: reselect.obj, key: reselect.key })
    }, 0)
    return () => clearTimeout(t)
  }, [reselect, drag]) // eslint-disable-line react-hooks/exhaustive-deps
  const openCal = () => setForceCtl(f => ({ ctl: 'range', n: (f?.n ?? 0) + 1 }))
  const actions = {
    chart: [
      { label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: 'Reset data to source', onSelect: () => { sheetApi.resetSheet(); setGridGen(n => n + 1) } },
      { label: spec.today ? 'Remove today line' : 'Add today line', onSelect: () => set('today', spec.today ? null : todayISO) },
      { label: 'Right-to-left layout', checked: !!spec.rtl, onSelect: () => set('rtl', spec.rtl ? null : true) },
      hasGroups && { label: spec.groups ? 'Remove group headings' : 'Add group headings', onSelect: () => set('groups', !spec.groups) },
      ...COLS.map(([k, l]) => ({ label: `${cols.includes(k) ? 'Remove' : 'Add'} ${l.toLowerCase()} column`, onSelect: () => toggleCol(k) })),
    ],
    bar: bar ? [
      { label: bar.shape === 'bar' ? 'Switch to process arrow' : 'Switch to bar', onSelect: () => setMap('shapes', bar.key, bar.shape === 'bar' ? 'pentagon' : 'bar') },
      { label: 'Delete bar', onSelect: () => { close(); edit(p => removeItem(p, bar.rowKey, bar.itemKey)) } },
    ] : [],
    milestone: ms ? [
      { label: ms.line ? 'Remove milestone line' : 'Add milestone line', onSelect: () => setMap('lines', ms.key, !ms.line) },
      { label: 'Delete milestone', onSelect: () => { close(); edit(p => removeItem(p, ms.rowKey, ms.itemKey)) } },
    ] : [],
    bracket: br ? [{ label: 'Delete bracket', onSelect: () => { close(); edit(p => removeItem(p, br.rowKey, br.itemKey)) } }] : [],
    shade: shade ? [
      { label: shade.bracket ? 'Remove bracket' : 'Add bracket', onSelect: () => setShade(shade.index, { bracket: shade.bracket ? null : true }) },
      { label: 'Delete shade', onSelect: () => { close(); set('shades', shadeList.filter((_, k) => k !== shade.index)) } },
    ] : [],
    row: row ? rowOps(row.key) : [],
    scale: [
      { label: 'Calendar…', shortcut: 'Double-click', keepOpen: true, onSelect: openCal },
      (spec.from || spec.to) && { label: 'Fit scale to data', onSelect: () => { set('from', null); set('to', null) } },
      { label: spec.weekends === 'shaded' ? 'Show weekends normally' : 'Shade weekends', onSelect: () => set('weekends', spec.weekends === 'shaded' ? null : 'shaded') },
      { label: spec.scaleLabels ? 'Remove scale labels' : 'Add scale labels', onSelect: () => set('scaleLabels', spec.scaleLabels ? null : true) },
      ...GANTT_UNITS.filter(u => (tiers.includes(u) ? tiers.length > 1 : tiers.length < 3)).map(u => ({ label: `${tiers.includes(u) ? 'Remove' : 'Add'} ${UNIT_NAME[u].toLowerCase()} scale`, onSelect: () => toggleTier(u) })),
    ],
    columns: [
      ...COLS.map(([k, l]) => ({ label: `${cols.includes(k) ? 'Remove' : 'Add'} ${l.toLowerCase()} column`, onSelect: () => toggleCol(k) })),
      cols.includes('status') && { label: spec.status === 'checkbox' ? 'Switch to Harvey ball' : 'Switch to checkbox', onSelect: () => set('status', spec.status === 'checkbox' ? null : 'checkbox') },
    ],
    labels: [
      { label: spec.labels === 'none' ? 'Add labels' : 'Remove labels', onSelect: () => set('labels', spec.labels === 'none' ? null : 'none') },
      { label: spec.dateLabels && spec.dateLabels !== 'none' ? 'Remove date labels' : 'Add date labels', onSelect: () => set('dateLabels', spec.dateLabels && spec.dateLabels !== 'none' ? null : 'range') },
    ],
  }
  const dragToday = e => {
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    // The date shows near the cursor during the drag (crosshair).
    const move = ev => { const r = svg.getBoundingClientRect(); const x = pxOf(ev, r); const d = scene.invert(x); set('today', d); setCross({ x, text: `Today ${tipOf(d)}` }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setCross(null) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const go = (o, extra = {}) => e => { setObj(null); setForceCtl(null); if (o !== 'bar' && o !== 'milestone') setSel([]); open(e, { obj: o, ...extra }) }
  // A click that dragged does not open the mini toolbar; Shift+click adds the item to the selection.
  const click = (e, o, extra) => {
    if (dragMoved.v) { setMoved(false); return }
    const k = extra?.key
    setSel(cur => (e.shiftKey ? (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]) : [k]))
    go(o, extra)(e)
  }
  // Double-click: the calendar of the item or of the scale.
  const dbl = (o, extra, ctl) => e => { e.stopPropagation(); go(o, { ...extra, ctl })(e) }
  const pickRow = key => e => { if (dragMoved.v) { setMoved(false); return } setSelRow(key); boxRef.current?.focus({ preventScroll: true }); go('row', { key })(e) }
  // Right-click in a row's date area: its menu, at the clicked date.
  const rowMenuAt = key => e => {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    setSelRow(key); setObj(null); setForceCtl(null)
    open(e, { obj: 'row', key, at: scene.invert(pxOf(e, r)) })
  }

  // Editing a label on the chart (F2, double-click); Alt+arrows move to the next label.
  const editCols = ['activity', ...['responsible', 'remark'].filter(c => cols.includes(c))]
  const editBox = (() => {
    if (!editing || !scene) return null
    const r = scene.rows.find(x => x.key === editing.rowKey)
    if (!r) return null
    const c = scene.columns?.[editing.col]
    const x0 = editing.col === 'activity' ? 4 + r.indent : (c?.x0 ?? 0) + 2
    const x1 = editing.col === 'activity' ? (scene.columns?.activity?.x1 ?? scene.plot.left) - 2 : (c?.x1 ?? x0 + 80) - 2
    const value = editing.col === 'activity' ? r.label : plan.find(p => p.key === r.key)?.[editing.col] ?? ''
    return { left: x0, top: r.y0 + 2, width: Math.max(60, x1 - x0), height: r.y1 - r.y0 - 4, value, key: `${r.key}|${editing.col}` }
  })()
  const commitEdit = (v, nextEditing = null) => {
    if (editing && editBox && v !== editBox.value) edit(p => patchRow(p, editing.rowKey, editing.col === 'activity' ? { label: v } : { [editing.col]: v || null }))
    setEditing(nextEditing)
    if (!nextEditing) refocus()
  }
  const onEditKey = e => {
    const v = e.currentTarget.value
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(v) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); refocus() }
    else if (e.altKey && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      if (editing.col === 'activity') edit(p => indentRow(p, editing.rowKey, e.key === 'ArrowLeft' ? -1 : 1))
    } else if (e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const keys = scene.rows.filter(x => !x.group && !x.events).map(x => x.key)
      const i = keys.indexOf(editing.rowKey), j = editCols.indexOf(editing.col)
      const nx = e.key === 'ArrowUp' ? { rowKey: keys[Math.max(0, i - 1)], col: editing.col } : e.key === 'ArrowDown' ? { rowKey: keys[Math.min(keys.length - 1, i + 1)], col: editing.col }
        : { rowKey: editing.rowKey, col: editCols[Math.max(0, Math.min(editCols.length - 1, j + (e.key === 'ArrowLeft' ? -1 : 1)))] }
      commitEdit(v, nx)
      setSelRow(nx.rowKey)
    }
  }

  // ── The editing layer, through the figure's parts ──
  const clickable = (o, extra, dblCtl) => ({ onClick: go(o, extra), onContextMenu: go(o, extra), ...(dblCtl ? { onDoubleClick: dbl(o, extra ?? {}, dblCtl) } : {}) })
  const isOn = (o, key) => (pick?.obj === o && pick.key === key) || ((o === 'bar' || o === 'milestone') && sel.includes(key))
  const part = (kind, it) => {
    switch (kind) {
      case 'scale': return { className: 'chart-engine-axis chart-engine-clickable', ...clickable('scale', undefined, 'range') }
      case 'header': return { onClick: e => { e.stopPropagation(); go('scale', { cell: it.key })(e) }, children: <>{it.text}<title>{`${it.text} (click: free text, double-click: calendar)`}</title></> }
      case 'rowLabel': return editBox?.key === `${it.key}|activity` ? { children: null } : null
      case 'rowHit': return {
        className: 'chart-engine-clickable', onClick: pickRow(it.key), onContextMenu: pickRow(it.key), onPointerDown: e => startRowDrag(e, it.key),
        onDoubleClick: e => { e.stopPropagation(); close(); setSelRow(it.key); startEdit(it.key, 'activity') },
        children: <title>{`${it.label} (click to format, F2 or double-click to edit, drag to move, right-click to insert)`}</title>,
      }
      case 'rowArea': return { onContextMenu: rowMenuAt(it.key) }
      case 'shade': return { className: 'chart-engine-clickable', ...clickable('shade', { key: it.key }, 'dates') }
      case 'shadeFill': return {
        ...(isOn('shade', it.key) ? { stroke: tok('gold'), strokeWidth: 1.5 } : {}),
        children: <title>{`${it.label ? `${it.label} · ` : ''}${tipOf(it.from)} → ${tipOf(it.to)} (click to format, double-click for the calendar)`}</title>,
      }
      case 'columns': return { className: 'chart-engine-clickable', ...clickable('columns') }
      case 'cell': return editBox?.key === it.key ? { children: null }
        : { onDoubleClick: e => { e.stopPropagation(); close(); const rk = it.key.slice(0, -it.col.length - 1); setSelRow(rk); startEdit(rk, it.col) } }
      case 'bar': return {
        'data-gantt-key': it.key, className: `chart-engine-clickable chart-gantt__bar${isOn('bar', it.key) ? ' is-selected' : ''}`,
        onClick: e => click(e, 'bar', { key: it.key }), onContextMenu: go('bar', { key: it.key }), onPointerDown: e => startDrag(e, 'move', it),
        onDoubleClick: it.shape === 'bar' ? dbl('bar', { key: it.key }, 'dates') : e => { e.stopPropagation(); setMap('shapes', it.key, it.shape === 'chevron' ? 'pentagon' : 'chevron') },
      }
      case 'barShape': return {
        ...(isOn('bar', it.key) ? { stroke: tok('gold'), strokeWidth: 2 } : {}),
        children: <title>{`${it.label ? `${it.label} · ` : ''}${tipOf(it.start)} → ${tipOf(it.end)}${it.done != null ? ` · ${Math.round(it.done * 100)}% done` : ''} · ${sheetRowOf(it)} (drag to move or to another row, Ctrl+drag to copy, Shift+click to select several, ${it.shape === 'bar' ? 'double-click for the calendar' : 'double-click: pentagon / chevron'})`}</title>,
      }
      case 'barHandle': return { className: 'chart-engine-handle', onPointerDown: e => startDrag(e, it.side, it.bar) }
      case 'bracket': return { className: 'chart-engine-clickable', ...clickable('bracket', { key: it.key }, 'dates') }
      case 'bracketPath': return isOn('bracket', it.key) ? { stroke: tok('gold'), strokeWidth: 2 } : null
      case 'milestone': {
        const on = isOn('milestone', it.key)
        return {
          'data-gantt-key': it.key, stroke: on ? tok('black') : tok('surface'), strokeWidth: on ? 2 : 1, className: 'chart-engine-clickable chart-gantt__bar',
          onClick: e => click(e, 'milestone', { key: it.key }), onContextMenu: go('milestone', { key: it.key }), onPointerDown: e => startDrag(e, 'milestone', it),
          onDoubleClick: dbl('milestone', { key: it.key }, 'dates'),
          children: <title>{`${it.label ?? 'Milestone'} · ${it.date} (drag to move, Ctrl+drag to copy, double-click for the calendar)`}</title>,
        }
      }
      case 'label': return { className: 'chart-engine-clickable', ...clickable('labels') }
      case 'todayHandle': return { className: 'chart-engine-handle', onPointerDown: dragToday, children: <title>{`Today: ${it.date} (drag to move)`}</title> }
      default: return null
    }
  }
  const selRowBox = scene?.rows.find(r => !r.group && !r.events && r.key === rowKey)

  if (readOnly) {
    return (
      <div ref={boxRef} className="chart-engine chart-engine-box chart-gantt">
        {scene?.empty && <div className="chart-engine-empty">No dated task yet.</div>}
        <GanttFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} uid={arrowId} />
      </div>
    )
  }

  return (
    <div ref={boxRef} id={`${arrowId}-box`} className="chart-engine chart-engine-box chart-gantt" tabIndex={0} style={reserve ? { paddingTop: reserve } : undefined} onKeyDown={onKey}
      onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }}>
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title="Chart format: colours, labels and layout. Tip: click or right-click any part of the chart" aria-label="Chart format"
          onClick={go('chart')}><IconPalette size={13} /></button>
      </div>
      <EditedNote api={sheetApi} />
      {scene?.empty && <div className="chart-engine-empty">No dated task yet. Double-click or open the data sheet to add one.</div>}
      {scene && !scene.empty && (
        <GanttFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} uid={arrowId} labelStyle={labelTextStyle(P)} part={part}
          onDoubleClick={() => { close(); sheetApi.setSheetOpen(true) }}>
          {selRowBox && <rect x={0.5} y={selRowBox.y0 + 0.5} width={scene.plot.left - 1} height={selRowBox.y1 - selRowBox.y0 - 1} fill="none" stroke={tok('gold')} strokeWidth={1.5} rx={2} pointerEvents="none" />}
          {rowDrop && <line x1={0} x2={scene.width} y1={rowDrop.y} y2={rowDrop.y} stroke={tok('gold')} strokeWidth={2} pointerEvents="none" />}
          {['from', 'to'].map(side => (
            <rect key={side} x={side === 'from' ? scene.plot.left - 3 : scene.plot.right - 3} y={0} width={6} height={scene.plot.top} fill="transparent" className="chart-engine-handle"
              style={{ cursor: 'ew-resize' }} onPointerDown={dragScale(side)} onClick={e => e.stopPropagation()}><title>{`Drag to change the ${side === 'from' ? 'start' : 'end'} of the scale`}</title></rect>
          ))}
          {editBox && (
            // The edit field placed on the label cell (inside the SVG, so it follows the plot).
            <foreignObject x={editBox.left} y={editBox.top} width={editBox.width} height={editBox.height}>
              <input key={editBox.key} className="chart-opts-input" aria-label="Edit label" autoFocus defaultValue={editBox.value} onKeyDown={onEditKey} onBlur={e => { if (editing) commitEdit(e.target.value) }}
                onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                style={{ width: '100%', height: '100%', fontSize: 11, padding: '0 4px', boxSizing: 'border-box', transform: spec.rtl ? 'scaleX(-1)' : undefined, userSelect: 'text' }} />
            </foreignObject>
          )}
          {cross && (
            <g pointerEvents="none">
              <line x1={cross.x} x2={cross.x} y1={0} y2={scene.plot.bottom} stroke={tok('gray-700')} strokeWidth={1} strokeDasharray="2 2" />
              {/* The tooltip stays inside the plot, never on the scale; while dragging an item it
                  sits above it (else below) in a zone clear of any other bar, on a background;
                  near the right edge it flips to the left of the crosshair. */}
              {(() => {
                const w = cross.text.length * 6.6 + 8, h = 16
                const flip = cross.x + 6 + w > scene.width
                const bx = flip ? cross.x - 6 - w : cross.x + 6
                const own = cross.of ? [...(scene.bars ?? []), ...(scene.milestones ?? [])].find(o => o.key === cross.of) : null
                const box = o => (o.width != null ? [o.x, o.y, o.x + o.width, o.y + o.height] : [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r])
                const labBox = l => { const lw = String(l.text).length * 6; const lx = l.anchor === 'end' ? l.x - lw : l.anchor === 'middle' ? l.x - lw / 2 : l.x; return [lx, l.y - 10, lx + lw, l.y + 3] }
                const others = [...[...(scene.bars ?? []), ...(scene.milestones ?? [])].filter(o => o !== own).map(box),
                  ...(scene.labels ?? []).filter(l => !String(l.key).startsWith(`${cross.of}|`) && l.key !== cross.of).map(labBox)]
                const free = y => y >= scene.plot.top && y + h <= scene.plot.bottom && !others.some(([x0, y0, x1, y1]) => bx < x1 && bx + w > x0 && y < y1 && y + h > y0)
                let ty
                if (own) {
                  const [, oy0, , oy1] = box(own)
                  const tries = [oy0 - h - 3, oy1 + 3]
                  ty = tries.find(free) ?? Math.max(scene.plot.top, tries[0])
                } else ty = Math.min(scene.plot.bottom - h, Math.max(scene.plot.top, (cross.y ?? scene.plot.top + 12) - 12))
                return (
                  <>
                    <rect x={bx} y={ty} width={w} height={h} rx={3} fill={tok('surface')} stroke={tok('gray-300')} strokeWidth={1} />
                    <text x={bx + 4} y={ty + 12} fill={tok('black')} fontWeight={600} style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{cross.text}</text>
                  </>
                )
              })()}
            </g>
          )}
        </GanttFigure>
      )}
      {sheetApi.sheetOpen && <DataSheet key={gridGen} api={sheetApi} layout={ganttSheet.layout} onClose={() => sheetApi.setSheetOpen(false)} />}
      {pick && (
        <FormatBar onOpenSheet={() => sheetApi.setSheetOpen(true)} key={`${pick.mode}|${pick.obj}|${pick.key}|${pick.cell ?? ''}|${pick.ctl ?? ''}|${forceCtl?.n ?? 0}`} mode={forceCtl ? 'bar' : pick.mode} anchor={pick.anchor} objects={objects} object={cur}
          initialCtl={forceCtl?.ctl ?? pick.ctl} onObject={setObj} controls={(controls[cur] ?? []).filter(Boolean)} actions={(actions[cur] ?? []).filter(Boolean)}
          onReset={reset} onUndo={undo} canUndo={canUndo} onClose={() => { close(); setObj(null); setForceCtl(null) }} />
      )}
    </div>
  )
}
