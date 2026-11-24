// ─── epure-charts · Mekko (% or units) ───────────────────────────────────────
// <MekkoView id spec={{ series, mode }} columns={[{ key, label, extent?, values }]} format />
// `extent`: each column's independent width (unit Mekko, "X extent row").
// Formatting (FormatBar): click on a segment, a column
// (its label), the labels, the axis or the legend → its format bar; right-click → menu.
// Decorations: value line (weighted mean, draggable), "100%" indicator, grand
// total; a series can move into a data table below the axis (segment menu).
import { useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { IconPalette, IconLayoutBoard, IconChartBar, IconTag, IconArrowsVertical, IconLayoutList } from '@tabler/icons-react'
import MekkoFigure from './MekkoFigure.jsx'
import { buildMekkoScene, MEKKO_OTHER, mekkoHundredSideFromX, mekkoOtherFromY, mekkoValueFromY } from './mekkoScene.js'
import { Seg, Check, Line, Swatches, Field } from './wheelControls.jsx'
import FormatBar from './FormatBar'
import { useViewPrefs } from './useViewPrefs.js'
import { useFormatPick } from './useFormatPick.js'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec.js'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { mekkoSheet } from './sheetAdapters.js'

// A color: a palette token, or a hex picked by the user (custom style).
import { tok, fs, labelTextStyle, schemeMap, styleSummary } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
import { SpecLocale, useT } from './uiLocale.js'
const PALETTE = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
const DEFAULTS = { netLines: null, mode: null, labels: null, totals: null, widths: null, sort: null, gap: null, legend: null, other: null, segmentOrder: null, xLabels: null, outline: null, ridges: null, extent: null, toOther: null, valueLine: null, hundred: null, grandTotal: null, table: null, seriesColors: {}, cellColors: {} }

// Chart width, and the row to reserve above the plot when the card header
// has no room for the format bar (it never covers the chart).
// `fixed`: the `width` prop (no measuring: server rendering, static pages).
function useBox(ref, fixed) {
  const [box, setBox] = useState({ width: fixed ?? 0, reserve: 0 })
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || fixed != null) return undefined
    const measure = () => {
      const r = el.getBoundingClientRect()
      // The bar sits on the title row: no reserved row above the plot.
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
// A color's name, for "Fill: teal".
const COLOR_NAME = { 'cat-1': 'teal', 'cat-2': 'blue', 'cat-3': 'orange', 'cat-4': 'purple', 'cat-5': 'raspberry', 'cat-6': 'cyan', 'cat-7': 'slate', 'cat-8': 'bronze' }
const colorName = t => COLOR_NAME[t] ?? String(t ?? '').replace(/-\d+$/, '')

// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences.
// responsive: the SVG scales to its container (width="100%", ratio kept); dataTable: a
// visually hidden table of the numbers next to the SVG.
// The interface (menus, format bar, messages) speaks the spec's language (spec.locale).
export default function MekkoView(props) {
  return <SpecLocale spec={props.spec}><MekkoViewBody {...props} /></SpecLocale>
}

function MekkoViewBody({ id = 'mekko', spec: specIn = {}, columns: columnsIn = [], format, height = 320, label: labelIn, width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  const tr = useT()
  const label = labelIn ?? tr('Mekko chart')
  // readOnly + applyPrefs: the stored settings and sheet edits drawn, no editing control.
  const plain = readOnly && !applyPrefs
  const boxRef = useRef(null)
  const { width, reserve } = useBox(boxRef, widthProp)
  const [drag, setDrag] = useState(null) // the "Other" threshold while dragging
  const [hDrag, setHDrag] = useState(null) // offset of the "100%" indicator while dragging
  const [vlDrag, setVlDrag] = useState(null) // the value line while dragging
  const prefsApi = useViewPrefs(`epure-chart-mekko-${id}`, DEFAULTS)
  const { set, update, reset, undo, canUndo } = prefsApi
  const P = plain ? DEFAULTS : prefsApi.prefs
  // The sheet drives the chart: columns, segments and widths come from it (source + edits).
  const sheetBase = useMemo(() => mekkoSheet.toBase(columnsIn, specIn.series ?? [], specIn), [columnsIn, specIn])
  const sheetApi = useSheet(`mekko-${id}`, sheetBase, mekkoSheet.validate)
  const fromSheet = plain ? null : mekkoSheet.fromSheet(sheetApi.sheet, columnsIn, specIn.series ?? [])
  const columns = fromSheet ? fromSheet.columns : columnsIn
  const baseSpec = fromSheet ? { ...specIn, series: fromSheet.series } : specIn
  const spec = {
    ...baseSpec,
    ...Object.fromEntries(Object.entries(P).filter(([k, v]) => v != null && !['seriesColors', 'cellColors'].includes(k))),
    series: (baseSpec.series ?? []).map(s => (P.seriesColors?.[s.id] ? { ...s, color: P.seriesColors[s.id] } : s)),
    ...(drag ? { other: drag.value } : {}),
    ...(vlDrag != null ? { valueLine: vlDrag } : {}),
  }
  const cols = columns.map(c => ({ ...c, colors: Object.fromEntries(Object.entries(P.cellColors ?? {}).filter(([k]) => k.startsWith(`${c.key}|`)).map(([k, v]) => [k.split('|')[1], v])) }))
  const specKey = JSON.stringify(spec)
  const colsKey = JSON.stringify(cols)
  const scene = useMemo(() => (width > 0 ? buildMekkoScene(spec, cols, { width, height, format }) : null), [specKey, colsKey, width, height, format]) // eslint-disable-line react-hooks/exhaustive-deps
  // The clicked object (its on-screen box): a mark of infinite weight, never covered.
  const hit = useRef(null)
  const [pick, open0, close] = useFormatPick(boxRef, () => (hit.current ? [hit.current] : []), { onTitle: true })
  const open = (e, o) => {
    const r = e.currentTarget?.getBoundingClientRect?.()
    hit.current = r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, weight: 1e6 } : null
    open0(e, o)
  }
  const [obj, setObj] = useState(null)
  const [scope, setScope] = useState('series')
  const cur = obj ?? pick?.obj
  const seg = scene?.segments.find(s => s.key === pick?.key)
  const col = scene?.columns.find(c => c.key === (pick?.col ?? seg?.colKey))
  const seriesOf = sid => (spec.series ?? []).find(s => s.id === sid)
  const percent = (spec.mode ?? 'percent') === 'percent'
  const xLabels = spec.widths === false ? 'none' : (spec.xLabels ?? 'share')
  const ORDER = { sheet: tr('sheet'), reverse: tr('reversed'), desc: tr('largest at bottom'), asc: tr('smallest at bottom') }
  // "Move to Other": a whole series, or this single segment; "Restore" takes them back out.
  const pooled = new Set(spec.toOther ?? [])
  const addOther = k => set('toOther', [...pooled, k])
  const dropOther = ks => { const next = [...pooled].filter(k => !ks.includes(k)); set('toOther', next.length ? next : []) }
  const manualIn = s => (s?.members ?? []).filter(id => pooled.has(id) || pooled.has(`${s.colKey}|${id}`))
  // Data table: the series moved below the axis.
  const inTable = new Set(spec.table ?? [])
  const setTable = (sid, on) => { const next = on ? [...inTable, sid] : [...inTable].filter(x => x !== sid); set('table', next.length ? next : null) }
  const vlOn = spec.valueLine != null && spec.valueLine !== false

  const objects = {
    chart: { name: 'Mekko', icon: IconLayoutBoard },
    ...(pick?.obj === 'valueline' && scene?.valueLine ? { valueline: { name: tr('Value line'), icon: IconArrowsVertical } } : {}),
    ...(pick?.obj === 'tablerow' ? { tablerow: { name: tr('Table row · {name}', { name: seriesOf(pick.key)?.label ?? '' }), icon: IconLayoutList } } : {}),
    ...(seg ? { segment: { name: `${seriesOf(seg.seriesId)?.label ?? tr('Other')} · ${col?.label}`, icon: IconChartBar } } : {}),
    labels: { name: tr('Labels'), icon: IconTag },
    yaxis: { name: tr('Value axis'), icon: IconArrowsVertical },
    legend: { name: tr('Legend'), icon: IconLayoutList },
  }
  const controls = {
    chart: [
      ['scheme', null, tr('Colors: {name}', { name: P.schemeName ?? tr('default') }), tr('Color schemes (named, saved by browser)'), (
        <SchemeTools current={spec.series.map(s => scene?.segments.find(g => g.seriesId === s.id)?.color ?? s.color ?? 'gray-400')} active={P.schemeName}
          onApply={sc => { if (sc) set('seriesColors', schemeMap(spec.series.map(s => s.id), sc.colors)); set('schemeName', sc?.name ?? null) }} />
      )],
      ['mode', null, tr('Axis: {name}', { name: percent ? '%' : tr('units') }), tr('Mekko in % or in units'), (
        <Line label={tr('Axis')}><Seg label={tr('Mekko mode')} value={percent ? 'percent' : 'units'} onPick={v => set('mode', v === 'percent' ? null : v)} items={[['percent', tr('% (shares)')], ['units', tr('Units (values)')]]} /></Line>
      )],
      ['order', null, tr('Order: {name}', { name: { desc: tr('largest first'), asc: tr('smallest first') }[spec.sort] ?? tr('sheet') }), tr('Column order'), (
        <Line label={tr('Order')}><Seg label={tr('Column order')} value={spec.sort ?? null} onPick={v => set('sort', v)} items={[[null, tr('Sheet')], ['desc', tr('Largest first')], ['asc', tr('Smallest first')]]} /></Line>
      )],
      ['segorder', null, tr('Segments: {name}', { name: ORDER[spec.segmentOrder ?? 'sheet'] }), tr('Order of the segments within each column'), (
        <Line label={tr('Order')}><Seg label={tr('Segment order')} value={spec.segmentOrder ?? 'sheet'} onPick={v => set('segmentOrder', v === 'sheet' ? null : v)} items={[['sheet', tr('Sheet')], ['reverse', tr('Reverse')], ['desc', tr('Largest at bottom')], ['asc', tr('Smallest at bottom')]]} /></Line>
      )],
      scene?.hasExtent && ['extent', null, tr('Widths: {name}', { name: scene.extent ? tr('width row') : tr('column totals') }), tr('What sets the column widths'), (
        <>
          <Line label={tr('Widths')}><Seg label={tr('Column widths')} value={scene.extent ? 'row' : 'totals'} onPick={v => set('extent', v === 'row' ? null : false)} items={[['row', tr('Width row (units)')], ['totals', tr('Column totals')]]} /></Line>
          <div className="chart-pop__note">{tr("The width row sets each column's X extent independently of its height.")}</div>
        </>
      )],
      ['show', null, tr('Totals: {name}', { name: spec.totals ? tr('shown') : tr('off') }), tr('What the chart shows'), (
        <Line label="">
          <div className="chart-pop__stack">
            <Check on={!!spec.totals} onClick={() => set('totals', !spec.totals)}>{tr('Column totals')}</Check>
          </div>
        </Line>
      )],
      ['under', null, tr('Under axis: {name}', { name: { share: tr('width %'), value: tr('width value'), none: tr('nothing') }[xLabels] }), tr('What each column shows under the axis'), (
        <Line label={tr('Under axis')}><Seg label={tr('Under the axis')} value={xLabels} onPick={v => { set('widths', null); set('xLabels', v === 'share' ? null : v) }} items={[['share', tr('Width %')], ['value', tr('Width value')], ['none', tr('None')]]} /></Line>
      )],
      ['outline', null, spec.ridges ? tr('Outline: {name} + ridges', { name: tr(spec.outline ?? 'thin') }) : tr('Outline: {name}', { name: tr(spec.outline ?? 'thin') }), tr('Segment outline and column ridges'), (
        <>
          <Line label={tr('Segments')}><Seg label={tr('Segment outline')} value={spec.outline ?? 'thin'} onPick={v => set('outline', v === 'thin' ? null : v)} items={[['none', tr('None')], ['thin', tr('Thin')], ['dark', tr('Dark')]]} /></Line>
          <Line label=""><Check on={!!spec.ridges} onClick={() => set('ridges', spec.ridges ? null : true)}>{tr('Ridges (bold outline of each column)')}</Check></Line>
        </>
      )],
      ['decor', null, tr('Decorations: {name}', { name: [vlOn && tr('value line'), scene?.hundred && tr('100%'), spec.grandTotal && tr('grand total')].filter(Boolean).join(', ') || tr('none') }), tr('Value line, 100% indicator and grand total'), (
        <Line label="">
          <div className="chart-pop__stack">
            <Check on={vlOn} onClick={() => set('valueLine', vlOn ? null : true)}>{tr('Value line (weighted mean)')}</Check>
            {percent && <Check on={!!spec.hundred} onClick={() => set('hundred', spec.hundred ? null : 'left')}>{tr('100% indicator')}</Check>}
            <Check on={!!spec.grandTotal} onClick={() => set('grandTotal', spec.grandTotal ? null : true)}>{tr('Grand total')}</Check>
          </div>
        </Line>
      )],
      ['gap', null, tr('Gap: {n}px', { n: spec.gap ?? 2 }), tr('Gap between columns'), (
        <Line label={tr('Gap')}><Seg label={tr('Gap between columns')} value={spec.gap ?? 2} onPick={v => set('gap', v === 2 ? null : v)} items={[[0, tr('None')], [2, tr('Thin')], [6, tr('Wide')]]} /></Line>
      )],
      ['other', null, tr('Other: {name}', { name: [spec.other && tr('< {n}%', { n: Math.round(spec.other * 100) }), pooled.size && tr('{n} moved', { n: pooled.size })].filter(Boolean).join(', ') || tr('off') }), tr('Group small segments into “Other”'), (
        <>
          <Line label={tr('Group')}><Seg label={tr('Group small segments')} value={spec.other ?? null} onPick={v => set('other', v)} items={[[null, tr('Off')], [0.05, tr('< {n}%', { n: 5 })], [0.1, tr('< {n}%', { n: 10 })]]} /></Line>
          {pooled.size > 0 && <Line label=""><button type="button" className="chart-pop__more" onClick={() => set('toOther', [])}>{pooled.size > 1 ? tr('Restore the {n} moved segments', { n: pooled.size }) : tr('Restore the {n} moved segment', { n: pooled.size })}</button></Line>}
          <div className="chart-pop__note">{tr('Right-click a segment to move it to “Other”, or drag the handle at the right of the chart.')}</div>
        </>
      )],
    ],
    segment: seg ? [
      ['fill', <span className="chart-bar__dot" style={{ background: tok(seg.color) }} />, tr('Fill: {name}', { name: tr(colorName(seg.color)) }), scope === 'cell' ? tr('Fill color (this segment)') : tr('Fill color (all “{name}”)', { name: seriesOf(seg.seriesId)?.label ?? tr('Other') }), (
        <>
          <Line label={tr('Apply to')}><Seg label={tr('Fill scope')} value={scope} onPick={setScope} items={[['series', tr('All “{name}”', { name: seriesOf(seg.seriesId)?.label ?? tr('Other') })], ['cell', tr('This segment only')]]} /></Line>
          <Swatches palette={PALETTE} value={seg.color} onPick={c => (scope === 'cell' ? update('cellColors', x => ({ ...(x ?? {}), [seg.key]: c })) : update('seriesColors', x => ({ ...(x ?? {}), [seg.seriesId]: c })))} />
        </>
      )],
    ] : [],
    valueline: scene?.valueLine ? [
      ['at', null, scene.valueLine.auto ? tr('At: {name} (weighted mean)', { name: scene.valueLine.text }) : tr('At: {name}', { name: scene.valueLine.text }), tr('Value line position'), (
        <>
          <Line label={tr('At')}><Field label={tr('Value')} numeric value={percent ? Number((scene.valueLine.value * 100).toFixed(1)) : Number(scene.valueLine.value.toPrecision(4))} onCommit={v => set('valueLine', v == null ? true : percent ? v / 100 : v)} /></Line>
          {!scene.valueLine.auto && <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('valueLine', true)}>{tr('Back to the weighted mean')}</button></Line>}
          <div className="chart-pop__note">{tr('Or drag the line.')}</div>
        </>
      )],
    ] : [],
    labels: [
      ['textstyle', null, styleSummary(P), tr('Label color, font and size'), <TextStyle font={P.labelFont} pt={P.labelPt} color={P.labelColor} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} onColor={v => set('labelColor', v)} />],
      // Labels removed for lack of room: counted; the value remains on segment hover.
      scene?.noRoom > 0 && ['noroom', null, tr('{n} hidden (no room)', { n: scene.noRoom }), tr('Labels left out for lack of room'), (
        <div className="chart-pop__note">{scene.noRoom > 1 ? tr('{n} labels did not fit at this size. Hover a segment to read it, or reduce the size in Style.', { n: scene.noRoom }) : tr('{n} label did not fit at this size. Hover a segment to read it, or reduce the size in Style.', { n: scene.noRoom })}</div>
      )],
      ['content', null, tr('Labels: {name}', { name: { value: tr('value'), none: tr('none') }[spec.labels] ?? '%' }), tr('Segment labels'), (
        <Line label={tr('Show')}><Seg label={tr('Segment labels')} value={spec.labels ?? 'share'} onPick={v => set('labels', v === 'share' ? null : v)} items={[['share', '%'], ['value', tr('Value')], ['none', tr('None')]]} /></Line>
      )],
    ],
    yaxis: [
      ['mode', null, tr('Axis: {name}', { name: percent ? '%' : tr('units') }), tr('Axis values'), (
        <Line label={tr('Values')}><Seg label={tr('Mekko mode')} value={percent ? 'percent' : 'units'} onPick={v => set('mode', v === 'percent' ? null : v)} items={[['percent', '%'], ['units', tr('Units')]]} /></Line>
      )],
    ],
    legend: [
      ['pos', null, tr('Legend: {name}', { name: (spec.legend ?? 'top') === 'none' ? tr('hidden') : tr('top') }), tr('Legend'), (
        <Line label={tr('Position')}><Seg label={tr('Legend')} value={spec.legend ?? 'top'} onPick={v => set('legend', v === 'top' ? null : v)} items={[['top', tr('Top')], ['none', tr('Hidden')]]} /></Line>
      )],
    ],
  }
  const actions = {
    chart: [
      { label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: tr('Reset data to source'), onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: spec.totals ? tr('Remove column totals') : tr('Add column totals'), onSelect: () => set('totals', !spec.totals) },
      { label: vlOn ? tr('Remove value line') : tr('Add value line'), onSelect: () => set('valueLine', vlOn ? null : true) },
      percent && { label: spec.hundred ? tr('Remove 100% indicator') : tr('Add 100% indicator'), onSelect: () => set('hundred', spec.hundred ? null : 'left') },
      { label: spec.grandTotal ? tr('Remove grand total') : tr('Add grand total'), onSelect: () => set('grandTotal', spec.grandTotal ? null : true) },
      inTable.size > 0 && { label: tr('Move all series to chart ({n} in table)', { n: inTable.size }), onSelect: () => set('table', null) },
      (spec.netLines ?? []).length > 0 && { label: tr('Show net lines as segments ({n})', { n: spec.netLines.length }), onSelect: () => set('netLines', null) },
      { label: percent ? tr('Change to Mekko in units') : tr('Change to Mekko in %'), onSelect: () => set('mode', percent ? 'units' : null) },
    ],
    segment: !seg ? [] : seg.seriesId === MEKKO_OTHER
      ? manualIn(seg).map(id => ({ label: tr('Restore “{name}” from Other', { name: seriesOf(id)?.label ?? id }), onSelect: () => dropOther([id, `${seg.colKey}|${id}`]) }))
      : [
        { label: tr('Move “{name}” to Other (all columns)', { name: seriesOf(seg.seriesId)?.label }), onSelect: () => addOther(seg.seriesId) },
        { label: tr('Move this segment to Other'), onSelect: () => addOther(seg.key) },
        '-',
        { label: tr('Move series to table'), onSelect: () => { setTable(seg.seriesId, true); close() } },
        // A series as net lines (one stroke per column, outside the stack).
        { label: tr('Show series as net lines'), onSelect: () => { set('netLines', [...(spec.netLines ?? []), seg.seriesId]); close() } },
      ],
    valueline: [
      scene?.valueLine && !scene.valueLine.auto && { label: tr('Back to the weighted mean'), onSelect: () => set('valueLine', true) },
      { label: tr('Remove value line'), onSelect: () => { set('valueLine', null); close() } },
    ],
    tablerow: pick?.obj === 'tablerow' ? [
      { label: tr('Move series to chart'), onSelect: () => { setTable(pick.key, false); close() } },
      inTable.size > 1 && { label: tr('Move all series to chart'), onSelect: () => { set('table', null); close() } },
    ] : [],
    labels: [
      { label: spec.labels === 'none' ? tr('Add labels') : tr('Remove labels'), onSelect: () => set('labels', spec.labels === 'none' ? null : 'none') },
      { label: spec.totals ? tr('Remove column totals') : tr('Add column totals'), onSelect: () => set('totals', !spec.totals) },
    ],
    yaxis: [{ label: percent ? tr('Change to Mekko in units') : tr('Change to Mekko in %'), onSelect: () => set('mode', percent ? 'units' : null) }],
    legend: [{ label: (spec.legend ?? 'top') === 'none' ? tr('Add legend') : tr('Remove legend'), onSelect: () => set('legend', (spec.legend ?? 'top') === 'none' ? null : 'none') }],
  }
  const go = (o, extra = {}) => e => { setObj(null); open(e, { obj: o, ...extra }) }
  // The "Other" handle: dragging up groups more segments, down fewer.
  const dragOther = e => {
    e.preventDefault(); e.stopPropagation()
    const sc = scene, svg = e.currentTarget.ownerSVGElement
    let last = sc.otherHandle.value || null
    const move = ev => { last = mekkoOtherFromY(sc, ev.clientY - svg.getBoundingClientRect().top); setDrag({ value: last }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); set('other', last); setDrag(null) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // The value line: dragging places it by hand (double-click: back to the weighted mean).
  const dragValueLine = e => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const sc = scene, svg = e.currentTarget.ownerSVGElement
    let last = null
    const move = ev => { last = mekkoValueFromY(sc, ev.clientY - svg.getBoundingClientRect().top); setVlDrag(last) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (last != null) set('valueLine', last); setVlDrag(null) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // The "100%" indicator: dragging it to the other side of the plot puts it there; a click toggles.
  const dragHundred = e => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const sc = scene, svg = e.currentTarget.ownerSVGElement, x0 = e.clientX
    let dx = 0
    const move = ev => { dx = ev.clientX - x0; setHDrag(dx) }
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setHDrag(null)
      const side = Math.abs(dx) < 3 ? (sc.hundred.side === 'left' ? 'right' : 'left') : mekkoHundredSideFromX(sc, ev.clientX - svg.getBoundingClientRect().left)
      if (side !== sc.hundred.side) set('hundred', side)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const nudgeOther = e => {
    const d = { ArrowUp: 0.01, ArrowDown: -0.01 }[e.key]
    if (!d) return
    e.preventDefault()
    const v = Math.round(Math.max(0, Math.min(0.5, (spec.other ?? 0) + d)) * 100) / 100
    set('other', v > 0 ? v : null)
  }

  // The editing layer, passed to the figure: selection, clicks, menus and drags.
  const part = (kind, it) => {
    if (kind === 'legend') return { className: 'chart-engine-legend chart-engine-clickable', onClick: go('legend'), onContextMenu: go('legend') }
    if (kind === 'segment') {
      const on = pick?.obj === 'segment' && pick.key === it.key
      return {
        ...(on ? { stroke: tok('gold'), strokeWidth: 2 } : {}),
        className: `chart-engine-clickable${on ? ' is-selected' : ''}`, onClick: go('segment', { key: it.key }), onContextMenu: go('segment', { key: it.key }),
      }
    }
    if (kind === 'label') return { className: 'chart-engine-clickable', onClick: go('labels'), onContextMenu: go('labels') }
    if (kind === 'valueLine') return {
      className: 'chart-engine-clickable chart-engine-handle--y', onPointerDown: dragValueLine, onClick: go('valueline'), onContextMenu: go('valueline'),
      onDoubleClick: e => { e.stopPropagation(); set('valueLine', true) },
    }
    if (kind === 'valueLineStroke') return pick?.obj === 'valueline' ? { stroke: tok('gold') } : null
    if (kind === 'hundred') return {
      x: it.x + (hDrag ?? 0), className: 'chart-engine-clickable', onPointerDown: dragHundred, onContextMenu: go('chart'),
      style: { fontSize: fs(10.5), fontFamily: 'var(--font-mono)', cursor: 'ew-resize' },
    }
    if (kind === 'grandTotal') return { className: 'chart-engine-clickable', onClick: go('labels'), onContextMenu: go('chart') }
    if (kind === 'tableHead') return {
      className: `chart-engine-clickable${pick?.obj === 'tablerow' && pick.key === it.seriesId ? ' is-selected' : ''}`,
      onClick: go('tablerow', { key: it.seriesId }), onContextMenu: go('tablerow', { key: it.seriesId }),
    }
    if (kind === 'tableCell') return { className: 'chart-engine-clickable', onClick: go('tablerow', { key: it.seriesId }), onContextMenu: go('tablerow', { key: it.seriesId }) }
    if (kind === 'yaxis') return { className: 'chart-engine-axis chart-engine-clickable', onClick: go('yaxis'), onContextMenu: go('yaxis') }
    return null
  }

  if (readOnly) {
    return (
      <div ref={boxRef} className="chart-engine chart-engine-box">
        {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
        <MekkoFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" style={reserve ? { paddingTop: reserve } : undefined} onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title={tr('Chart format: colours, labels and layout. Tip: click or right-click any part of the chart')} aria-label={tr('Chart format')}
          onClick={go('chart')}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
      {scene && !scene.empty && (
        <MekkoFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} labelStyle={labelTextStyle(P)} part={part}>
          {scene.otherHandle && (() => {
            const h = scene.otherHandle
            const txt = h.value ? (h.pooled === 1 ? tr('Other < {pct}% · {n} segment', { pct: Math.round(h.value * 100), n: h.pooled }) : tr('Other < {pct}% · {n} segments', { pct: Math.round(h.value * 100), n: h.pooled })) : tr('Drag up to group small segments into Other')
            return (
              <g className={`chart-engine-handle chart-engine-handle--y chart-mekko-other${drag || h.value ? ' is-on' : ''}`} tabIndex={0} role="slider" aria-label={tr('Other threshold')}
                aria-valuemin={0} aria-valuemax={50} aria-valuenow={Math.round(h.value * 100)} onPointerDown={dragOther} onKeyDown={nudgeOther}>
                <line x1={h.x + 3} x2={h.x + 3} y1={scene.plot.top} y2={scene.plot.bottom} stroke={tok('gray-200')} strokeWidth={1} />
                <path d={`M${h.x - 2},${h.y} L${h.x + 8},${h.y - 5} L${h.x + 8},${h.y + 5} Z`} fill={tok(h.value ? 'gray-700' : 'gray-400')} />
                <rect x={h.x - 4} y={scene.plot.top - 6} width={14} height={scene.plot.height + 12} fill="transparent" />
                {drag && <text x={h.x - 6} y={h.y - 8} textAnchor="end" fill={tok('gray-700')} style={{ fontSize: 10.5 }}>{txt}</text>}
                <title>{txt}</title>
              </g>
            )
          })()}
        </MekkoFigure>
      )}
      {pick && (
        <FormatBar onOpenSheet={() => sheetApi.setSheetOpen(true)} key={`${pick.mode}|${pick.obj}|${pick.key}`} mode={pick.mode} anchor={pick.anchor} objects={objects} object={cur}
          onObject={setObj} controls={(controls[cur] ?? []).filter(Boolean)} actions={(actions[cur] ?? []).filter(Boolean)}
          onReset={reset} onUndo={undo} canUndo={canUndo} onClose={() => { close(); setObj(null) }} />
      )}
      {sheetApi.sheetOpen && <DataSheet api={sheetApi} layout={mekkoSheet.layout} colors={Object.fromEntries((spec.series ?? []).map((s, i) => [s.id, s.color ?? `cat-${(i % 8) + 1}`]))} onClose={() => sheetApi.setSheetOpen(false)} />}
    </div>
  )
}
