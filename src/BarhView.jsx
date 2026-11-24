// ─── epure-charts · horizontal bar view ─────────────────────────────────────
// Measures its container, calls buildBarhScene, draws. No layout computation
// here. `onSelectRow(key)` makes each row clickable (keyboard included);
// `selectedKey` highlights it; the tooltip details the row's series.
// View settings (useBarhPrefs) are edited in place (BarhBar): right-click
// anywhere = action menu; click on a bar (when it has no business action), on
// the values or the axis = format bar; settings button in the plot corner.
// `id` names the preferences; `unit` ('M', 'x', '%'…) drives number formatting.
import { useId, useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { createPortal } from 'react-dom'
import { buildBarhScene } from './barhScene'
import { defaultFormat } from './scene.js'
import { asFormatter } from './locale.js'
import BarhFigure from './BarhFigure.jsx'
import { useBarhPrefs } from './useBarhPrefs'
import { BarhBar, BarhBarButton } from './BarhBar'
import { makeFormatter } from './numberStyle'
import { cardGeometry } from './cardGeometry'
import { targetMark, domMarks } from './useWheelPlacement'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { barhSheet } from './sheetAdapters.js'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, labelTextStyle, labelPrefs } from './customStyle.js'
// A real number for the format preview: the first value, not a total.
const sampleOf = r => (!r ? null : r.range ? r.range[1] : Object.values(r.values ?? {}).find(Number.isFinite) ?? null)
const rowTotalOf = r => (!r ? null : r.range ? r.range[1] : Object.values(r.values ?? {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0))

// The drawing width: the `width` prop when given (no measuring: server rendering,
// static pages), else the box's width, followed with a ResizeObserver.
function useWidth(ref, fixed) {
  const [width, setWidth] = useState(fixed ?? 0)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || fixed != null) return undefined
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fixed])
  return fixed ?? width
}

// `onRotate`: the selected chart shows the rotation handle; dragged a quarter turn,
// the bars turn back into columns (rotated view of a column chart).
// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences
// (with applyPrefs: the stored preferences and sheet edits drawn, still no control).
// responsive: the SVG scales to its container (width="100%", ratio kept); dataTable: a
// visually hidden table of the numbers next to the SVG.
export default function BarhView({ spec: specIn, rows: rowsIn, format: baseFormat, onSelectRow, selectedKey, label = 'Bar chart', id, unit, reading: readingIn = true, chartActions = [], muted = false, menuSlot = null, onRotate = null, width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  const boxRef = useRef(null)
  const width = useWidth(boxRef, widthProp)
  const reading = readingIn && !readOnly
  // readOnly + applyPrefs: stored settings and sheet edits drawn, no editing control.
  const applied = reading || (readOnly && applyPrefs)
  const [hover, setHover] = useState(null)
  // The sheet drives the chart (except in the rotated view of a column chart, which has its own).
  const sheetBase = useMemo(() => barhSheet.toBase(rowsIn ?? [], specIn?.series ?? [{ id: 'value', label: 'Value' }]), [rowsIn, specIn?.series])
  const sheetApi = useSheet(`barh-${id ?? label}`, sheetBase)
  const fromSheet = applied ? barhSheet.fromSheet(sheetApi.sheet, rowsIn ?? [], specIn?.series ?? [{ id: 'value', label: 'Value' }]) : null
  const baseRows = fromSheet ? fromSheet.rows : rowsIn
  const baseSpec = fromSheet && specIn?.series ? { ...specIn, series: fromSheet.series } : specIn
  const [effSpec, effRows, readApi] = useBarhPrefs(baseSpec, baseRows, id ?? label)
  const api = reading ? readApi : null
  const allActions = reading ? [{ label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => sheetApi.setSheetOpen(true) }, ...(sheetApi.sheetEdited ? [{ label: 'Reset data to source', onSelect: () => sheetApi.resetSheet() }] : []), '-', ...chartActions] : chartActions
  const spec = applied ? effSpec : baseSpec
  const rows = applied ? effRows : baseRows
  const P = applied ? readApi.prefs : undefined
  // The configured number format (decimals, magnitude, separators…), on top of the host's.
  const format = useMemo(() => {
    // No number setting: the host's formatter as is, or the engine's default (barhScene), the
    // same decimals as the static figure (decimals.js).
    if (!P || (P.decimals == null && P.magnitude == null && P.num == null)) return baseFormat
    const host = asFormatter(baseFormat)
    const f = host ?? ((v, d) => defaultFormat(v, undefined, d))
    const full = makeFormatter((v, _u, d) => (host ? host(v, undefined, d) : f(v, d)), P.decimals ?? null, P.magnitude ?? null, P.num ?? null)
    return v => full(v, unit ?? '')
  }, [baseFormat, P, unit])
  const money = unit === 'M'
  const [pick, setPick] = useState(null)
  const open = (e, obj) => {
    if (!api) return
    e.preventDefault(); e.stopPropagation()
    const geo = cardGeometry(boxRef.current)
    setPick({ ...obj, mode: e.type === 'contextmenu' ? 'menu' : 'bar', anchor: { x: e.clientX, y: e.clientY, align: e.type === 'contextmenu' ? 'cursor' : 'beside', box: geo.box, lineTop: geo.lineTop, minLeft: geo.minLeft, marks: [...domMarks(boxRef.current), ...(geo.headMarks ?? []), ...targetMark(e)] } })
  }
  const scene = useMemo(() => (width > 0 ? buildBarhScene(spec, rows, { width, format, labelStyle: labelPrefs(P) }) : null), [spec, rows, width, format, P?.labelPt, P?.labelFont]) // eslint-disable-line react-hooks/exhaustive-deps
  const patScope = `barh-${useId().replace(/:/g, '')}`
  const rowOf = key => rows.find(r => r.key === key)
  const rowObj = r => ({ obj: 'row', rowKey: r.key, rowLabel: r.full, rowValue: rowTotalOf(rowOf(r.key)), color: rowOf(r.key)?.color ?? spec.series?.[0]?.color })
  const hovered = hover != null ? scene?.rows.find(r => r.key === hover) : null
  const hoveredRow = hovered ? rowOf(hovered.key) : null
  // A range as drawn (a row with points spans their extent).
  const hoveredRange = hoveredRow ? hoveredRow.range ?? scene?.bars.find(b => b.key === hovered.key)?.range ?? null : null
  const series = spec?.series ?? []

  // The editing layer, passed to the figure: hover and selection, clicks and menus.
  const stackPick = api && spec.stacked
  const part = (kind, it) => {
    if (kind === 'band') return {
      fill: hover === it.key || selectedKey === it.key ? tok('gray-100') : 'transparent',
      onMouseEnter: () => setHover(it.key),
      className: onSelectRow || api ? 'chart-engine-clickable' : undefined,
      onClick: onSelectRow ? () => onSelectRow(it.key) : api ? e => open(e, rowObj(it)) : undefined,
      onContextMenu: api ? e => open(e, rowObj(it)) : undefined,
    }
    // A stacked bar is formatted segment by segment (the clicked series); otherwise the whole row.
    if (kind === 'bars') return { pointerEvents: stackPick && !onSelectRow ? undefined : 'none' }
    if (kind === 'bar') {
      const on = pick?.obj === 'row' && pick.rowKey === it.key && (!pick.seriesId || pick.seriesId === it.seriesId)
      const segObj = { ...rowObj({ key: it.key, full: rowOf(it.key)?.label }), seriesId: it.seriesId, rowLabel: spec.series?.find(s => s.id === it.seriesId)?.label }
      return {
        opacity: selectedKey && selectedKey !== it.key ? 0.35 : 1,
        className: stackPick ? 'chart-engine-clickable' : undefined,
        onClick: stackPick ? e => open(e, segObj) : undefined, onContextMenu: stackPick ? e => open(e, segObj) : undefined,
        ...(on ? { stroke: tok('gold'), strokeWidth: 1.5 } : {}),
      }
    }
    if (kind === 'marker') return { opacity: selectedKey && selectedKey !== it.key ? 0.35 : 1 }
    if (kind === 'rowLabel') return onSelectRow ? {
      tabIndex: 0, role: 'button', 'aria-label': it.full, className: 'chart-engine-clickable',
      onClick: () => onSelectRow(it.key),
      onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRow(it.key) } },
    } : null
    if (kind === 'values') return { pointerEvents: api ? undefined : 'none' }
    if (kind === 'value') return api ? {
      className: `chart-engine-clickable${pick?.obj === 'values' ? ' is-selected' : ''}`,
      onClick: e => open(e, { obj: 'values' }), onContextMenu: e => open(e, { obj: 'values' }),
    } : null
    if (kind === 'axis') return api ? {
      className: 'chart-engine-axis chart-engine-clickable', pointerEvents: undefined,
      onClick: e => open(e, { obj: 'axis' }), onContextMenu: e => open(e, { obj: 'axis' }),
    } : null
    return null
  }

  return (
    // A right-click anywhere in the chart opens our menu, never the browser's.
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={api ? e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) } : undefined} onDoubleClick={reading ? e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { setPick(null); sheetApi.setSheetOpen(true) } } : undefined}>
      {reading && <EditedNote api={sheetApi} />}
      {/* The settings icon goes in the card header when the host gives it
          a slot (menuSlot, as in ChartView); otherwise in the plot corner. */}
      {api && (menuSlot
        ? createPortal(<BarhBarButton api={api} format={format} money={money} sample={sampleOf(baseRows[0])} chartActions={allActions} />, menuSlot)
        : (
        <div className="chart-engine-float-menu">
          <BarhBarButton api={api} format={format} money={money} sample={sampleOf(baseRows[0])} chartActions={allActions} />
        </div>
      ))}
      {scene?.empty && <div className="chart-engine-empty">No data for this chart yet.</div>}
      {scene && !scene.empty && (
        <BarhFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} labelStyle={labelTextStyle(P)} part={readOnly ? undefined : part} patternScope={patScope}
          onMouseLeave={() => setHover(null)}>
          {onRotate && !readOnly && (() => {
            const hx = scene.plot.right - 6, hy = Math.max(8, scene.plot.top - 2)
            const rotate = e => {
              if (e.button !== 0) return
              e.preventDefault(); e.stopPropagation()
              const x0 = e.clientX, y0 = e.clientY
              let far = false
              const move = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 15) far = true }
              const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (far) onRotate() }
              window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
            }
            return (
              <g data-wheel-anchor className="chart-engine-handle" onPointerDown={rotate}>
                <circle cx={hx} cy={hy} r={7} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5} />
                <path d={`M${hx - 3},${hy + 2} A3.5,3.5 0 1 1 ${hx + 2},${hy + 2.5}`} fill="none" stroke={tok('gold-dark')} strokeWidth={1.2} />
                <title>Drag to rotate back to columns</title>
              </g>
            )
          })()}
        </BarhFigure>
      )}
      {pick && api && (
        <BarhBar key={`${pick.mode}|${pick.obj}|${pick.rowKey}`} api={api} pick={pick} anchor={pick.anchor} onClose={() => setPick(null)}
          format={format} money={money} sample={sampleOf(baseRows[0])} chartActions={allActions} />
      )}
      {/* No hover tooltip while an object is selected (its format bar handles it). */}
      {hovered && hoveredRow && !muted && !pick && !readOnly && (
        <div className="chart-engine-tip"
          style={{ left: scene.plot.left + scene.plot.width * 0.5, top: hovered.y1 + 2 }}>
          <div className="chart-engine-tip-head">{hovered.full}</div>
          {hovered.marker && (
            <div className="chart-engine-tip-row"><span className="chart-engine-tip-label">{{ median: 'Median', mean: 'Mean' }[spec?.rangeMarker] ?? 'Marker'}</span>
              <span className="chart-engine-tip-value">{format(hovered.marker.value)}</span></div>
          )}
          {hoveredRange
            ? <div className="chart-engine-tip-row"><span className="chart-engine-tip-label">Range</span>
                <span className="chart-engine-tip-value">{format(hoveredRange[0])} → {format(hoveredRange[1])}</span></div>
            : series.filter(s => Number.isFinite(hoveredRow.values?.[s.id])).map(s => (
              <div key={s.id} className="chart-engine-tip-row">
                <svg width={10} height={10} aria-hidden="true"><rect width={10} height={10} rx={2} fill={tok(hoveredRow.color ?? s.color)} /></svg>
                <span className="chart-engine-tip-label">{s.label}</span>
                <span className="chart-engine-tip-value">{format(hoveredRow.values[s.id])}</span>
              </div>
            ))}
        </div>
      )}
      {reading && sheetApi.sheetOpen && <DataSheet api={sheetApi} colors={Object.fromEntries((scene?.rows ?? []).map(r => [r.key, scene.bars.find(b => b.key === r.key)?.color]).filter(([, c]) => c))} layout={{ ...barhSheet.layout, title: spec?.sort ? `Sheet · rows (sorted ${spec.sort === 'desc' ? '↓' : '↑'})` : barhSheet.layout.title }} onClose={() => sheetApi.setSheetOpen(false)} />}
    </div>
  )
}
