// ─── epure-charts · waterfall (bridge) view ─────────────────────────────────
// Measures its container, resolves the bridge, calls buildWaterfallScene, draws.
// NO layout computation here (waterfallScene.js). Colors as var(--…).
//
// `scope`: the entities selected by the host (for a '$scope' subject).
// `context`: what the data layer computed for an effects bridge
// ({ effects, fromLabel, toLabel }), never a typed number.
// `selectedStep` / `onSelectStep(step)`: the highlighted step, driven by
// the host (e.g. drilling down into a driver).
// `api` (useWaterfallPrefs): view settings, edited in place (BridgeBar):
// right-click on an object (bar, values, background) = its action menu; click on
// the values, the axis, the legend (or on a bar when the host gives it no
// business action via onSelectStep) = the object's format bar. Double-click =
// steps table. Dragging a connector onto an earlier column: the bar restarts from
// that level and the whole bridge is recomputed. Data table under the axis (spec.table).
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyBridgeEdits } from './bridgeEdits'
import { useCharts } from './useCharts'
import ChartHeader from './ChartHeader'
import { validateSpec } from './spec'
import { buildWaterfallScene } from './waterfallScene'
import WaterfallFigure from './WaterfallFigure.jsx'
import { BridgeBar, BridgeBarButton } from './BridgeBar'
import { makeFormatter } from './numberStyle'
import { cardGeometry } from './cardGeometry'
import { targetMark } from './useWheelPlacement'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { bridgeSheet } from './sheetAdapters.js'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, labelTextStyle, labelPrefs } from './customStyle.js'


// The drawing width: the `width` prop when given (no measuring: server rendering,
// static pages), else the box's width, followed with a ResizeObserver.
function useWidth(ref, fixed) {
  const [width, setWidth] = useState(fixed ?? 0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || fixed != null) return undefined
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fixed])
  return fixed ?? width
}

// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no header, format bar, menus, data sheet nor sheet edits.
// responsive: the SVG scales to its container (width="100%", ratio kept).
// dataTable: the figure's numbers as a visually hidden table next to the SVG.
export default function WaterfallView({ bridge: providedBridge, spec, currentId, scope, context, selectedStep, onSelectStep, bare = false, headerSlot, height: fixedHeight, api: apiIn, floatMenu = false, width: widthProp, readOnly = false, responsive = false, dataTable = false }) {
  const boxRef = useRef(null)
  const width = useWidth(boxRef, widthProp)
  const api = readOnly ? undefined : apiIn
  const [hover, setHover] = useState(null)
  const [linkDrag, setLinkDrag] = useState(null) // { to, src } while dragging a connector
  const [vlDrag, setVlDrag] = useState(null) // the value line while dragging

  // The bridge: passed in (`bridge`), otherwise resolved by the host application (ChartsProvider).
  const charts = useCharts()
  const formatValue = charts.formatValue
  const Header = charts.Header ?? ChartHeader
  const raw = useMemo(() => providedBridge ?? charts.resolveBridge(spec, { currentId, scope, ...context }), [providedBridge, spec, currentId, scope, context, charts])
  // View edits (grouped drivers, subtotals): the numbers do not change.
  // The sheet drives the bridge: typed anchor and movement values, added steps; the
  // totals are recomputed ("e"). Untouched, it returns the input bridge as is.
  // Stacked segments: one value column per segment; "e" at the top = start computed
  // backwards; in a downward bridge, a positive movement is subtracted (sheetAdapters).
  const sheetBase = useMemo(() => bridgeSheet.toBase(raw, { backCalc: !!spec.backCalc }), [raw, spec.backCalc])
  const sheetApi = useSheet(`bridge-${spec.id}`, sheetBase, sh => ({ ...bridgeSheet.validate(sh), ...bridgeSheet.closing(sh, raw, { netLines: spec.netLines }) }))
  const fromSheet = readOnly ? raw : bridgeSheet.fromSheet(sheetApi.sheet, raw, { direction: spec.direction, netLines: spec.netLines })
  const sheetKey = JSON.stringify(sheetApi.edits)
  const bridge = useMemo(() => applyBridgeEdits(fromSheet, spec), [raw, spec, sheetKey, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet can ask for the computed start ("e" typed on the first row).
  const sceneSpec = useMemo(() => {
    let sp = bridge.backCalc && !spec.backCalc ? { ...spec, backCalc: true } : spec
    // Connector drag preview: the bridge is recomputed under the pointer.
    if (linkDrag) {
      const links = { ...(sp.links ?? {}) }
      if (linkDrag.src == null) delete links[linkDrag.to]; else links[linkDrag.to] = linkDrag.src
      sp = { ...sp, links }
    }
    if (vlDrag != null) sp = { ...sp, valueLine: vlDrag }
    return sp
  }, [spec, bridge, linkDrag, vlDrag])
  const errors = useMemo(() => validateSpec(spec), [spec])
  const height = fixedHeight ?? Math.round(Math.min(300, Math.max(240, width * 0.34)))
  // The value axis number format (axis format bar), on top of the host's.
  const ax = api?.prefs
  const axisFormat = useMemo(() => (ax && (ax.axisDec != null || ax.axisMag || Object.keys(ax.axisNum ?? {}).length)
    ? makeFormatter(formatValue, ax.axisDec ?? null, ax.axisMag ?? null, ax.axisNum ?? null) : null), [formatValue, ax])
  const scene = useMemo(
    () => (width > 0 ? buildWaterfallScene(sceneSpec, bridge, { width, height, format: formatValue, axisFormat, labelStyle: labelPrefs(ax) }) : null),
    [sceneSpec, bridge, width, height, formatValue, axisFormat, ax?.labelPt, ax?.labelFont], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Each step's color as a band in column A of the sheet (the first segment of a stacked step).
  const sheetColors = useMemo(() => {
    const out = {}
    for (const b of scene?.bars ?? []) if (!(b.key in out)) out[b.key] = b.color
    return out
  }, [scene])
  // The segment order setting appears as soon as the sheet stacks segments.
  const barApi = useMemo(() => (api && !api.hasParts && bridge.steps.some(s => s.parts?.length) ? { ...api, hasParts: true } : api), [api, bridge])
  const stepOf = key => bridge.steps.find(s => s.key === key)
  const select = key => onSelectStep?.(stepOf(key))

  const onMove = e => {
    if (!scene || scene.empty) return
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = scene.columns.findIndex(c => mx >= c.x0 && mx < c.x1)
    setHover(i >= 0 ? i : null)
  }
  // ── Formatting an object (BridgeBar) ──
  const [pick, setPick] = useState(null)
  const open = (e, obj) => {
    if (!api) return
    e.preventDefault(); e.stopPropagation()
    const geo = cardGeometry(boxRef.current)
    const svgR = boxRef.current?.querySelector('svg')?.getBoundingClientRect()
    const marks = svgR && scene ? [
      ...scene.bars.map(b => ({ x: b.x, y: b.y, w: b.width, h: b.height, weight: 1 })),
      ...scene.labels.map(l => ({ x: l.x - 22, y: l.y - 11, w: 44, h: 14, weight: 4 })),
      ...scene.annotations.map(a => ({ x: (a.xa + a.xb) / 2 - a.pillW / 2, y: a.yTop - 9, w: a.pillW, h: 18, weight: 4 })),
      ...scene.axes.x.ticks.map(t => ({ x: t.x - 30, y: scene.axes.x.y + 2, w: 60, h: 28, weight: 3 })),
    ].map(m => ({ x: svgR.left + m.x, y: svgR.top + m.y, w: m.w, h: m.h, weight: m.weight })).concat(geo.headMarks ?? [], obj.mark ? [obj.mark] : targetMark(e)) : []
    delete obj.mark
    setPick({ ...obj, mode: e.type === 'contextmenu' ? 'menu' : 'bar', anchor: { x: e.clientX, y: e.clientY, align: e.type === 'contextmenu' ? 'cursor' : 'beside', box: geo.box, lineTop: geo.lineTop, minLeft: geo.minLeft, marks } })
  }
  const col = hover != null && !pick && !api?.sheetOpen && !linkDrag ? scene?.columns[hover] : null
  // Dragging a connector: its start lands on the earlier column under the pointer;
  // the previous bar (or beyond the bridge) = the normal chaining.
  // The value line: dragging sets it by hand (double-click: back to the start level).
  const dragValueLine = e => {
    if (!api?.setPref || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement, sc = scene
    let last = null
    const move = ev => { const v = sc.yInvert(ev.clientY - svg.getBoundingClientRect().top); last = Number(v.toPrecision(3)); setVlDrag(last) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (last != null) api.setPref('valueLine', last); setVlDrag(null) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const dragConnector = (e, c) => {
    if (!api?.setLink || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    const keys = scene.columns.map(k => k.key)
    const j = keys.indexOf(c.to)
    const pickSrc = clientX => {
      const mx = clientX - svg.getBoundingClientRect().left
      const i = scene.columns.findIndex(k => mx >= k.x0 && mx < k.x1)
      return i >= 0 && i < j - 1 ? keys[i] : null
    }
    let src = c.linked ? c.from : null
    const src0 = src
    const hit = e.currentTarget
    const x0 = e.clientX, y0 = e.clientY
    let moved = false
    setLinkDrag({ to: c.to, src })
    const move = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 3) moved = true; src = pickSrc(ev.clientX); setLinkDrag({ to: c.to, src }) }
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setLinkDrag(null)
      if (moved && src !== src0) { api.setLink(c.to, src); return }
      // A click (without dragging) selects the connector: its format bar.
      if (!moved) {
        const r = svg.getBoundingClientRect()
        open({ type: 'click', clientX: ev.clientX, clientY: ev.clientY, preventDefault() {}, stopPropagation() {} },
          { obj: 'connector', stepKey: c.from, connTo: c.to, mark: { x: r.left + c.x1, y: r.top + c.y - 6, w: c.x2 - c.x1, h: 12, weight: 1000, el: hit } })
      }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── Editing layer, drawn through the figure (part: props on a mark; slot: nodes at a depth) ──
  const dimmed = key => (selectedStep && selectedStep !== key ? 0.35 : 1)
  const stepObjOf = b => ({ obj: 'step', stepKey: b.key, part: b.part ?? null, color: b.color, onDetail: onSelectStep ? () => select(b.key) : null })
  const clickable = !!(onSelectStep || api)
  const part = (kind, it) => {
    if (kind === 'legend') return { className: `chart-engine-legend${api ? ' chart-engine-clickable' : ''}`, onClick: api ? e => open(e, { obj: 'bridge' }) : undefined }
    if (kind === 'connector') return it.distorted ? null : { stroke: tok(linkDrag?.to === it.to ? 'gold' : it.linked ? 'gray-600' : 'gray-400'), strokeWidth: linkDrag?.to === it.to ? 1.5 : 1 }
    if (kind === 'bar') {
      // A click keeps its business action if there is one; otherwise it opens the bar's format bar.
      // A right-click always opens its action menu. A step's detail (in the host): double-click or menu entry.
      const b = it
      const stepObj = stepObjOf(b)
      const editing = pick?.obj === 'step' && pick.stepKey === b.key
      return {
        opacity: dimmed(b.key),
        className: clickable ? `chart-engine-clickable${editing ? ' is-selected' : ''}` : undefined,
        onClick: api ? e => open(e, stepObjOf(b)) : onSelectStep ? () => select(b.key) : undefined,
        onDoubleClick: api && onSelectStep ? e => { e.stopPropagation(); setPick(null); select(b.key) } : undefined,
        onContextMenu: api ? e => open(e, stepObjOf(b)) : undefined,
        tabIndex: clickable ? 0 : undefined, role: clickable ? 'button' : undefined,
        'aria-pressed': onSelectStep ? selectedStep === b.key : undefined,
        'aria-label': clickable ? `${stepOf(b.key)?.label}: ${scene.columns.find(c => c.key === b.key)?.text}` : undefined,
        onKeyDown: clickable ? e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onSelectStep) select(b.key); else open(e, stepObj) }
          if (api && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) open({ ...e, type: 'contextmenu', preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), clientX: e.currentTarget.getBoundingClientRect().left, clientY: e.currentTarget.getBoundingClientRect().top }, stepObj)
        } : undefined,
      }
    }
    if (kind === 'netLine') {
      const obj = { obj: 'step', stepKey: it.stepKey, part: it.part, net: true, color: it.color }
      return {
        className: api ? `chart-engine-clickable${pick?.obj === 'step' && pick.stepKey === it.stepKey && pick.part === it.part ? ' is-selected' : ''}` : undefined,
        onClick: api ? e => open(e, obj) : undefined, onContextMenu: api ? e => open(e, obj) : undefined,
      }
    }
    if (kind === 'values') return { pointerEvents: api ? undefined : 'none' }
    if (kind === 'label') return {
      className: api ? `chart-engine-clickable${pick?.obj === 'values' ? ' is-selected' : ''}` : undefined,
      onClick: api ? e => open(e, { obj: 'values' }) : undefined, onContextMenu: api ? e => open(e, { obj: 'values' }) : undefined,
      opacity: dimmed(it.key),
    }
    if (kind === 'axis') return {
      className: `chart-engine-axis${api ? ` chart-engine-clickable${pick?.obj === 'axis' ? ' is-selected' : ''}` : ''}`,
      onClick: api ? e => open(e, { obj: 'axis' }) : undefined, onContextMenu: api ? e => open(e, { obj: 'axis' }) : undefined,
    }
    if (kind === 'xaxis') return { className: `chart-engine-axis${api ? ' chart-engine-clickable' : ''}`, onClick: api ? e => open(e, { obj: 'bridge' }) : undefined }
    if (kind === 'valueLine') return {
      className: api ? 'chart-engine-clickable chart-engine-handle--y' : undefined, onPointerDown: dragValueLine,
      onDoubleClick: api ? e => { e.stopPropagation(); api.setPref('valueLine', true) } : undefined,
    }
    if (kind === 'table') return {
      className: `chart-engine-axis${api ? ' chart-engine-clickable' : ''}`,
      onClick: api ? e => open(e, { obj: 'values' }) : undefined, onContextMenu: api ? e => open(e, { obj: 'values' }) : undefined,
    }
    if (kind === 'tableCell') return { opacity: dimmed(it.stepKey) }
    return null
  }
  const slot = (kind, it) => {
    if (kind === 'backdrop') return col ? <rect x={col.x0} y={scene.plot.top} width={col.x1 - col.x0} height={scene.plot.height} fill={tok('gray-100')} /> : null
    if (kind === 'connector') {
      const c = it
      return (
        <>
          {/* Selected connector: in gold, with a handle at each end. */}
          {pick?.obj === 'connector' && pick.connTo === c.to && (
            <g pointerEvents="none">
              <line x1={c.x1} x2={c.x2} y1={c.y} y2={c.distorted ? c.y2 : c.y} stroke={tok('gold')} strokeWidth={1.5} />
              {[[c.x1, c.y], [c.x2, c.distorted ? c.y2 : c.y]].map(([hx, hy], k) => (
                <rect key={k} x={hx - 3} y={hy - 3} width={6} height={6} rx={1} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.25} />
              ))}
            </g>
          )}
          {/* Draggable: the start lands on an earlier column. */}
          {api?.setLink && (
            <line x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} stroke="transparent" strokeWidth={8} className="chart-engine-handle" data-wheel-anchor
              onPointerDown={e => dragConnector(e, c)} onDoubleClick={e => { e.stopPropagation(); if (c.linked) api.setLink(c.to, null) }}
              onContextMenu={e => { const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(); open(e, { obj: 'connector', stepKey: c.from, connTo: c.to, mark: { x: r.left + c.x1, y: r.top + c.y - 6, w: c.x2 - c.x1, h: 12, weight: 1000, el: e.currentTarget } }) }}>
              <title>{c.linked ? 'Click to format, drag to reconnect (double-click: back to the previous bar)' : 'Click to format, drag onto an earlier bar to start this bar from its level'}</title>
            </line>
          )}
        </>
      )
    }
    if (kind === 'bar') {
      const b = it
      return (
        <>
          {selectedStep === b.key && <rect x={b.x - 2} y={b.y - 2} width={b.width + 4} height={b.height + 4} rx={3}
            fill="none" stroke={tok(b.color)} strokeWidth={2} strokeOpacity={0.5} />}
          {pick?.obj === 'step' && pick.stepKey === b.key && <rect x={b.x - 2} y={b.y - 2} width={b.width + 4} height={b.height + 4} rx={3}
            fill="none" stroke={tok('gold')} strokeWidth={1.5} pointerEvents="none" />}
        </>
      )
    }
    if (kind === 'netLine') return <line x1={it.x1} x2={it.x2} y1={it.y} y2={it.y} stroke="transparent" strokeWidth={10} />
    if (kind === 'axis') return api ? <rect x={0} y={scene.plot.top} width={Math.max(8, scene.axes.left.x - 2)} height={scene.plot.height} fill="transparent" /> : null
    if (kind === 'valueLine') return (
      <>
        <line x1={it.x1} x2={it.x2} y1={it.y} y2={it.y} stroke="transparent" strokeWidth={10} />
        {api && <title>{`Value line · ${it.text} · drag to move, double-click: start level`}</title>}
      </>
    )
    return null
  }

  if (readOnly) {
    return (
      <div className="chart-engine">
        <div ref={boxRef} className="chart-engine-box">
          {scene?.empty && <div className="chart-engine-empty">No data for this bridge yet.</div>}
          <WaterfallFigure scene={scene} interactive={!readOnly} label={spec.title} responsive={responsive} dataTable={dataTable} />
        </div>
      </div>
    )
  }

  return (
    // A right-click anywhere in the bridge opens our menu, never the browser's.
    <div className="chart-engine" onContextMenu={api ? e => { if (!e.defaultPrevented) open(e, { obj: 'bridge' }) } : undefined}>
      {/* The format button in the card header, like the other charts. */}
      {!bare && <Header title={spec.title} menu={api ? <>{headerSlot}<BridgeBarButton api={barApi} /></> : headerSlot} />}
      <EditedNote api={{ ...sheetApi, sheetOpen: !!api?.sheetOpen, setSheetOpen: v => api?.setSheetOpen(v) }} />
      {errors.length > 0 && (
        <div className="chart-engine-error" role="alert">This chart definition is invalid: {errors.join(' · ')}</div>
      )}
      <div ref={boxRef} className="chart-engine-box">
        {/* No header of our own (bare) and no host-provided button: the button in the corner, like the other charts. */}
        {bare && floatMenu && api && <div className="chart-engine-float-menu"><BridgeBarButton api={barApi} /></div>}
        {scene?.empty && <div className="chart-engine-empty">No data for this bridge yet.</div>}
        {scene && !scene.empty && (
          <WaterfallFigure scene={scene} interactive={!readOnly} label={spec.title} responsive={responsive} dataTable={dataTable}
            labelStyle={labelTextStyle(api?.prefs)} part={part} slot={slot}
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}
            onDoubleClick={api ? () => api.setSheetOpen(true) : undefined}
            // Right-click on the background: the bridge menu.
            onContextMenu={api ? e => open(e, { obj: 'bridge' }) : undefined} />
        )}
        {pick && api && (
          <BridgeBar key={`${pick.mode}|${pick.obj}|${pick.stepKey}|${pick.part ?? ''}|${pick.net ? 1 : 0}`} api={barApi} pick={pick} anchor={pick.anchor} onClose={() => setPick(null)}
            axisPreview={v => (axisFormat ?? formatValue)(v, bridge.unit ?? 'M', 0)} axisSample={scene?.axes.left?.ticks.at(-1)?.value} />
        )}
        {col && (
          <div className={`chart-engine-tip${col.cx > scene.width * 0.6 ? ' chart-engine-tip--left' : ''}`}
            style={{ left: col.cx, top: scene.plot.top }}>
            <div className="chart-engine-tip-head">{col.label}{col.projected ? ' (projected)' : ''}</div>
            <div className="chart-engine-tip-row">
              <span className="chart-engine-tip-label">{col.tone === 'anchor' ? 'Value' : 'Move'}</span>
              <span className="chart-engine-tip-value" style={{ color: tok(col.color) }}>{col.text}</span>
            </div>
            {col.level && (
              <div className="chart-engine-tip-row">
                <span className="chart-engine-tip-label">Running total</span>
                <span className="chart-engine-tip-value">{col.level}</span>
              </div>
            )}
            {col.high && (
              <div className="chart-engine-tip-row">
                <span className="chart-engine-tip-label">High scenario</span>
                <span className="chart-engine-tip-value">{col.high}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {api?.sheetOpen && <DataSheet api={sheetApi} layout={bridgeSheet.layout} colors={sheetColors} onClose={() => api.setSheetOpen(false)} />}
    </div>
  )
}
