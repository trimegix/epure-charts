// ─── epure-charts · horizontal bar view ─────────────────────────────────────
// Measures its container, calls buildBarhScene, draws. No layout computation
// here. `onSelectRow(key)` makes each row clickable (keyboard included);
// `selectedKey` highlights it; the tooltip details the row's series.
// View settings (useBarhPrefs) are edited in place (BarhBar): right-click
// anywhere = action menu; click on a bar (when it has no business action), on
// the values or the axis = format bar; settings button in the plot corner.
// `id` names the preferences; `unit` ('M', 'x', '%'…) drives number formatting.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildBarhScene } from './barhScene'
import { useBarhPrefs } from './useBarhPrefs'
import { BarhBar, BarhBarButton } from './BarhBar'
import { makeFormatter } from './numberStyle'
import { cardGeometry } from './cardGeometry'
import { targetMark, domMarks } from './useWheelPlacement'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { barhSheet } from './sheetAdapters.js'
import PatternDefs from './patterns.jsx'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, colorId, labelTextStyle, labelPrefs } from './customStyle.js'
// A real number for the format preview: the first value, not a total.
const sampleOf = r => (!r ? null : r.range ? r.range[1] : Object.values(r.values ?? {}).find(Number.isFinite) ?? null)
const rowTotalOf = r => (!r ? null : r.range ? r.range[1] : Object.values(r.values ?? {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0))

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

// `onRotate`: the selected chart shows the rotation handle; dragged a quarter turn,
// the bars turn back into columns (rotated view of a column chart).
export default function BarhView({ spec: specIn, rows: rowsIn, format: baseFormat, onSelectRow, selectedKey, label = 'Bar chart', id, unit, reading = true, chartActions = [], muted = false, menuSlot = null, onRotate = null }) {
  const boxRef = useRef(null)
  const width = useWidth(boxRef)
  const [hover, setHover] = useState(null)
  // The sheet drives the chart (except in the rotated view of a column chart, which has its own).
  const sheetBase = useMemo(() => barhSheet.toBase(rowsIn ?? [], specIn?.series ?? [{ id: 'value', label: 'Value' }]), [rowsIn, specIn?.series])
  const sheetApi = useSheet(`barh-${id ?? label}`, sheetBase)
  const fromSheet = reading ? barhSheet.fromSheet(sheetApi.sheet, rowsIn ?? [], specIn?.series ?? [{ id: 'value', label: 'Value' }]) : null
  const baseRows = fromSheet ? fromSheet.rows : rowsIn
  const baseSpec = fromSheet && specIn?.series ? { ...specIn, series: fromSheet.series } : specIn
  const [effSpec, effRows, readApi] = useBarhPrefs(baseSpec, baseRows, id ?? label)
  const api = reading ? readApi : null
  const allActions = reading ? [{ label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => sheetApi.setSheetOpen(true) }, ...(sheetApi.sheetEdited ? [{ label: 'Reset data to source', onSelect: () => sheetApi.resetSheet() }] : []), '-', ...chartActions] : chartActions
  const spec = api ? effSpec : baseSpec
  const rows = api ? effRows : baseRows
  const P = api?.prefs
  // The configured number format (decimals, magnitude, separators…), on top of the host's.
  const format = useMemo(() => {
    const f = baseFormat ?? (v => String(v))
    if (!P) return f
    const full = makeFormatter((v, _u, d) => f(v, d), P.decimals ?? null, P.magnitude ?? null, P.num ?? null)
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
  const series = spec?.series ?? []

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
        <svg width={scene.width} height={scene.height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          <defs><PatternDefs scope={patScope} items={[...scene.bars, ...(scene.legend ?? [])]} /></defs>
          <g className="chart-engine-legend">
            {scene.legend.map(it => (
              it.anchor === 'end' || it.anchor === 'start'
                // Butterfly: each series name above its side.
                ? <text key={it.key} x={it.x} y={it.y} textAnchor={it.anchor} dominantBaseline="central" fill={tok(it.color)} fontWeight={600}>{it.label}</text>
                : <g key={it.key} transform={`translate(${it.x},0)`}>
                {it.line ? <line x1={0} x2={11} y1={it.y} y2={it.y} stroke={tok(it.color)} strokeWidth={2} /> : <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={it.pattern ? `url(#${patScope}-pt-${it.pattern}-${colorId(it.color)})` : tok(it.color)} stroke={it.pattern ? tok(it.color) : undefined} strokeWidth={it.pattern ? 0.75 : undefined} />}
                <text x={16} y={it.y} dominantBaseline="central">{it.label}</text>
                  </g>
            ))}
          </g>

          {scene.rows.map(r => (
            <rect key={`h-${r.key}`} x={0} y={r.y0} width={scene.width} height={r.y1 - r.y0}
              fill={hover === r.key || selectedKey === r.key ? tok('gray-100') : 'transparent'}
              onMouseEnter={() => setHover(r.key)}
              className={onSelectRow || api ? 'chart-engine-clickable' : undefined}
              onClick={onSelectRow ? () => onSelectRow(r.key) : api ? e => open(e, rowObj(r)) : undefined}
              onContextMenu={api ? e => open(e, rowObj(r)) : undefined} />
          ))}

          {scene.gridlines.map((g, i) => (
            <line key={i} x1={g.x} x2={g.x} y1={g.y1} y2={g.y2} stroke={tok(g.zero ? 'gray-400' : 'gray-200')}
              strokeWidth={1} strokeDasharray={g.dash ? '3 3' : undefined} shapeRendering="crispEdges" pointerEvents="none" />
          ))}

          {/* A stacked bar is formatted segment by segment (the clicked series); otherwise the whole row. */}
          <g pointerEvents={api && spec.stacked && !onSelectRow ? undefined : 'none'}>
            {scene.bars.map(b => {
              const on = pick?.obj === 'row' && pick.rowKey === b.key && (!pick.seriesId || pick.seriesId === b.seriesId)
              const segObj = { ...rowObj({ key: b.key, full: rowOf(b.key)?.label }), seriesId: b.seriesId, rowLabel: spec.series?.find(s => s.id === b.seriesId)?.label }
              return (
                <rect key={`${b.key}|${b.seriesId}`} x={b.x} y={b.y} width={b.width} height={b.height} rx={2}
                  fill={b.pattern ? `url(#${patScope}-pt-${b.pattern}-${colorId(b.color)})` : tok(b.color)} opacity={selectedKey && selectedKey !== b.key ? 0.35 : 1}
                  className={api && spec.stacked ? 'chart-engine-clickable' : undefined}
                  onClick={api && spec.stacked ? e => open(e, segObj) : undefined} onContextMenu={api && spec.stacked ? e => open(e, segObj) : undefined}
                  stroke={on ? tok('gold') : b.pattern ? tok(b.color) : undefined} strokeWidth={on ? 1.5 : b.pattern ? 1 : undefined} />
              )
            })}
            {/* Profile (and combo lines, over the bars): one line per series, row to row, with its points. */}
            {(scene.profiles ?? []).map(pr => (
              <g key={`pf-${pr.seriesId}`} pointerEvents="none">
                <path d={pr.d} fill="none" stroke={tok(pr.color)} strokeWidth={2} strokeDasharray={pr.dash ?? undefined} />
                {pr.points.map(p => <circle key={p.key} cx={p.x} cy={p.y} r={4} fill={tok(pr.color)} stroke={tok('surface')} strokeWidth={1.5} />)}
              </g>
            ))}
          </g>

          {/* Row labels, left-aligned; keyboard-clickable when the row is */}
          <g className="chart-engine-axis">
            {scene.rows.map(r => (
              <text key={`l-${r.key}`} x={r.center ? scene.plot.center : 0} y={r.y + 4} textAnchor={r.center ? 'middle' : 'start'}
                style={{ fontSize: 11, fontWeight: r.emphasis ? 600 : 400, fill: r.emphasis ? 'var(--black)' : undefined }}
                tabIndex={onSelectRow ? 0 : undefined} role={onSelectRow ? 'button' : undefined}
                aria-label={onSelectRow ? r.full : undefined}
                className={onSelectRow ? 'chart-engine-clickable' : undefined}
                onClick={onSelectRow ? () => onSelectRow(r.key) : undefined}
                onKeyDown={onSelectRow ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRow(r.key) } } : undefined}>
                <title>{r.full}</title>{r.label}
              </text>
            ))}
          </g>

          <g pointerEvents={api ? undefined : 'none'}>
            {scene.labels.map(l => (
              <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color ?? 'gray-700')} fontWeight={600}
                // A number written INSIDE a segment leaves the click to the segment.
                pointerEvents={l.color === 'white' ? 'none' : undefined}
                className={api ? `chart-engine-clickable${pick?.obj === 'values' ? ' is-selected' : ''}` : undefined}
                onClick={api ? e => open(e, { obj: 'values' }) : undefined} onContextMenu={api ? e => open(e, { obj: 'values' }) : undefined}
                style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', ...labelTextStyle(P) }}>{l.text}</text>
            ))}
            {scene.annotations.map((a, i) => (
              <g key={`a${i}`}>
                <line x1={a.x} x2={a.x} y1={a.y1} y2={a.y2} stroke={tok(a.color)} strokeWidth={1.25} strokeDasharray={a.dash} />
                {a.text && <text x={a.tx} y={a.y1 - 4} textAnchor={a.anchor} fill={tok(a.color)} style={{ fontSize: 10.5 }}>{a.text}</text>}
              </g>
            ))}
          </g>

          {onRotate && (() => {
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

          {scene.axis && (
            <g className={`chart-engine-axis${api ? ' chart-engine-clickable' : ''}`} pointerEvents={api ? undefined : 'none'}
              onClick={api ? e => open(e, { obj: 'axis' }) : undefined} onContextMenu={api ? e => open(e, { obj: 'axis' }) : undefined}>
              {scene.axis.ticks.map(t => (
                <text key={t.value} x={t.x} y={scene.axis.y} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>
              ))}
            </g>
          )}
        </svg>
      )}
      {pick && api && (
        <BarhBar key={`${pick.mode}|${pick.obj}|${pick.rowKey}`} api={api} pick={pick} anchor={pick.anchor} onClose={() => setPick(null)}
          format={format} money={money} sample={sampleOf(baseRows[0])} chartActions={allActions} />
      )}
      {/* No hover tooltip while an object is selected (its format bar handles it). */}
      {hovered && hoveredRow && !muted && !pick && (
        <div className="chart-engine-tip"
          style={{ left: scene.plot.left + scene.plot.width * 0.5, top: hovered.y1 + 2 }}>
          <div className="chart-engine-tip-head">{hovered.full}</div>
          {hoveredRow.range
            ? <div className="chart-engine-tip-row"><span className="chart-engine-tip-label">Range</span>
                <span className="chart-engine-tip-value">{format(hoveredRow.range[0])} → {format(hoveredRow.range[1])}</span></div>
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
