// ─── epure-charts · pie and doughnut ────────────────────────────────────────
// <PieView id slices={[{ key, label, value, color? }]} spec={{ donut, sort, … }} format />
// In-place formatting (FormatBar): clicking a slice, the labels
// or the legend → its format bar; right-click anywhere → its action menu;
// settings button in the corner. View preferences, per browser.
// Handles (selected or hovered chart): rotation on the rim, hole size;
// selected slice: four handles on its edges, each rotates the chart;
// outside labels can be dragged (Reset in the labels menu).
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconPalette, IconChartPie, IconChartDonut, IconTag, IconLayoutList } from '@tabler/icons-react'
import { buildPieScene, pieStartFromPoint, pieStartFromHandle, pieHoleFromPoint } from './pieScene.js'
import { Seg, Check, Line, Swatches, Field } from './ChartWheel'
import FormatBar from './FormatBar'
import { useViewPrefs } from './useViewPrefs.js'
import { useFormatPick } from './useFormatPick.js'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec.js'
import { colorName } from './colorNames'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { pieSheet } from './sheetAdapters.js'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, labelTextStyle, schemeMap, styleSummary } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
const PALETTE = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
const DEFAULTS = { donut: null, sort: null, start: null, direction: null, centerTitle: null, labelOffsets: null, other: null, total: null, labels: null, content: null, decimals: null, legend: null, explode: [], colors: {} }

function useWidth(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setW(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** Follows the pointer until release; onMove(x, y, ev) in SVG coordinates. */
function track(e, onMove, onEnd) {
  e.preventDefault(); e.stopPropagation()
  const svg = e.currentTarget.ownerSVGElement ?? e.currentTarget
  const move = ev => { const r = svg.getBoundingClientRect(); onMove(ev.clientX - r.left, ev.clientY - r.top, ev) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd?.() }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}

export default function PieView({ id = 'pie', spec: baseSpec = {}, slices: slicesIn = [], format, height = 280, label = 'Pie chart' }) {
  const boxRef = useRef(null)
  const movedRef = useRef(false)
  const width = useWidth(boxRef)
  const { prefs: P, set, update, reset, undo, canUndo } = useViewPrefs(`epure-chart-pie-${id}`, DEFAULTS)
  const spec = {
    ...baseSpec,
    ...Object.fromEntries(Object.entries(P).filter(([k, v]) => v != null && !['explode', 'colors'].includes(k))),
    explode: P.explode?.length ? P.explode : baseSpec.explode,
  }
  // The sheet drives the chart: the drawn slices are the ones it returns (source + edits).
  const sheetBase = useMemo(() => pieSheet.toBase(slicesIn), [slicesIn])
  const sheetApi = useSheet(`pie-${id}`, sheetBase, pieSheet.validate)
  const slices = pieSheet.fromSheet(sheetApi.sheet, slicesIn)
  const data = slices.map(s => (P.colors?.[s.key] ? { ...s, color: P.colors[s.key] } : s))
  const specKey = JSON.stringify(spec)
  const scene = useMemo(() => (width > 0 ? buildPieScene(spec, data, { width, height, format }) : null), [specKey, data, width, height, format]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, open, close] = useFormatPick(boxRef)
  const [obj, setObj] = useState(null)
  const cur = obj ?? pick?.obj
  const sliceKey = pick?.key
  const arc = scene?.arcs.find(a => a.key === sliceKey)
  const donut = (spec.donut ?? 0) > 0
  const exploded = new Set(P.explode ?? [])

  const offsets = spec.labelOffsets ?? {}
  const moved = Object.keys(offsets).length
  const ccw = spec.direction === 'ccw'
  const toggleExplode = k => update('explode', cur0 => { const s = new Set(cur0 ?? []); if (s.has(k)) s.delete(k); else s.add(k); return [...s] })
  const objects = {
    chart: { name: donut ? 'Doughnut' : 'Pie', icon: donut ? IconChartDonut : IconChartPie },
    ...(arc ? { slice: { name: arc.label, icon: IconChartPie } } : {}),
    labels: { name: 'Labels', icon: IconTag },
    legend: { name: 'Legend', icon: IconLayoutList },
  }
  const labelPos = spec.labels ?? 'outside'
  const legendPos = spec.legend ?? 'right'
  const controls = {
    chart: [
      ['scheme', null, `Colors: ${P.schemeName ?? 'default'}`, 'Color schemes (named, saved by browser)', (
        <SchemeTools current={(scene?.arcs ?? []).map(a => a.color)} active={P.schemeName}
          onApply={sc => { if (sc) set('colors', schemeMap((scene?.arcs ?? []).map(a => a.key), sc.colors)); set('schemeName', sc?.name ?? null) }} />
      )],
      ['type', null, `Type: ${donut ? `doughnut ${Math.round((spec.donut) * 100)}%` : 'pie'}`, 'Pie or doughnut', (
        <>
          <Line label="Type"><Seg label="Type" value={donut ? 'donut' : 'pie'} onPick={v => set('donut', v === 'donut' ? 0.55 : 0)} items={[['pie', 'Pie'], ['donut', 'Doughnut']]} /></Line>
          {donut && <Line label="Hole"><Seg label="Hole size" value={spec.donut} onPick={v => set('donut', v)} items={[[0.4, 'Small'], [0.55, 'Medium'], [0.7, 'Large']]} /></Line>}
          {donut && <Line label=""><Check on={!!spec.total} onClick={() => set('total', !spec.total)}>Total in the center</Check></Line>}
          {donut && <Line label="Title"><Field label="Center title" wide value={spec.centerTitle ?? ''} placeholder="None" onCommit={v => set('centerTitle', v || null)} /></Line>}
          <div className="chart-pop__note">Or drag the hole handle (to the center for a pie).</div>
        </>
      )],
      ['order', null, `Order: ${{ desc: 'largest first', asc: 'smallest first' }[spec.sort] ?? 'sheet'}, ${ccw ? 'counter-clockwise' : 'clockwise'}`, 'Slice order', (
        <>
          <Line label="Order"><Seg label="Slice order" value={spec.sort ?? null} onPick={v => set('sort', v)} items={[[null, 'Sheet'], ['desc', 'Largest first'], ['asc', 'Smallest first']]} /></Line>
          <Line label="Direction"><Seg label="Direction" value={ccw ? 'ccw' : 'cw'} onPick={v => set('direction', v === 'ccw' ? 'ccw' : null)} items={[['cw', 'Clockwise'], ['ccw', 'Counter-clockwise']]} /></Line>
        </>
      )],
      ['start', null, `Start: ${spec.start ?? 0}°`, 'Start angle', (
        <>
          <Line label="Start"><Seg label="Start angle" value={spec.start ?? 0} onPick={v => set('start', v)} items={[[0, '12 o’clock'], [90, '3 o’clock'], [180, '6 o’clock'], [270, '9 o’clock']]} /></Line>
          <Line label="Angle"><Field label="Degrees" numeric value={spec.start ?? 0} onCommit={v => set('start', v == null ? null : ((Math.round(v) % 360) + 360) % 360)} /></Line>
          <div className="chart-pop__note">Or drag the rotation handle on the edge (snaps to quarters).</div>
        </>
      )],
      ['other', null, `Small slices: ${spec.other ? `grouped < ${Math.round(spec.other * 100)}%` : 'shown'}`, 'Group small slices into “Other”', (
        <Line label="Group"><Seg label="Group small slices" value={spec.other ?? null} onPick={v => set('other', v)} items={[[null, 'Off'], [0.03, '< 3%'], [0.05, '< 5%'], [0.1, '< 10%']]} /></Line>
      )],
    ],
    slice: arc ? [
      ['fill', <span className="chart-bar__dot" style={{ background: tok(arc.color) }} />, `Fill: ${colorName(arc.color)}`, 'Slice color', (
        <Swatches palette={PALETTE} value={P.colors?.[arc.key] ?? arc.color} onPick={c => update('colors', cur0 => ({ ...(cur0 ?? {}), [arc.key]: c }))} />
      )],
      ['explode', null, `Explode: ${exploded.has(arc.key) ? 'on' : 'off'}`, 'Detach this slice', (
        <Line label=""><Check on={exploded.has(arc.key)} onClick={() => toggleExplode(arc.key)}>Detach from the center</Check></Line>
      )],
    ] : [],
    labels: [
      ['textstyle', null, styleSummary(P), 'Label color, font and size', <TextStyle font={P.labelFont} pt={P.labelPt} color={P.labelColor} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} onColor={v => set('labelColor', v)} />],
      // Labels dropped for lack of room (large size): counted; the slice still shows on hover.
      scene?.noRoom > 0 && ['noroom', null, `${scene.noRoom} hidden (no room)`, 'Labels left out for lack of room', (
        <div className="chart-pop__note">{`${scene.noRoom} label${scene.noRoom > 1 ? 's' : ''} did not fit at this size. Hover a slice to read it, or reduce the size in Style.`}</div>
      )],
      ['pos', null, `Position: ${labelPos}`, 'Label position', (
        <Line label="Position"><Seg label="Label position" value={labelPos} onPick={v => set('labels', v === 'outside' ? null : v)} items={[['outside', 'Outside'], ['inside', 'Inside'], ['none', 'None']]} /></Line>
      )],
      ['content', null, `Content: ${{ value: 'value', both: 'value + %', name: 'name', nameShare: 'name + %' }[spec.content] ?? '%'}`, 'Label content', (
        <Line label="Content"><Seg label="Label content" value={spec.content ?? 'share'} onPick={v => set('content', v === 'share' ? null : v)} items={[['share', '%'], ['value', 'Value'], ['both', 'Value + %'], ['name', 'Name'], ['nameShare', 'Name + %']]} /></Line>
      )],
      ['dec', null, `Decimals: ${spec.decimals ?? 0}`, 'Decimals of the %', (
        <Line label="Decimals"><Seg label="Decimals" value={spec.decimals ?? 0} onPick={v => set('decimals', v || null)} items={[[0, '0'], [1, '0.0'], [2, '0.00']]} /></Line>
      )],
      labelPos === 'outside' && ['place', null, `Placement: ${moved ? `${moved} moved` : 'auto'}`, 'Label placement', (
        <>
          <div className="chart-pop__note">Drag an outside label to move it.</div>
          {moved > 0 && <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('labelOffsets', {})}>Reset label positions</button></Line>}
        </>
      )],
    ],
    legend: [
      ['pos', null, `Position: ${legendPos}`, 'Legend position', (
        <Line label="Position"><Seg label="Legend position" value={legendPos} onPick={v => set('legend', v === 'right' ? null : v)} items={[['right', 'Right'], ['bottom', 'Bottom'], ['none', 'Hidden']]} /></Line>
      )],
    ],
  }
  const actions = {
    chart: [
      { label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: 'Reset data to source', onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: donut ? 'Change to pie' : 'Change to doughnut', onSelect: () => set('donut', donut ? 0 : 0.55) },
      exploded.size > 0 && { label: 'Attach all slices', onSelect: () => set('explode', []) },
      { label: ccw ? 'Clockwise' : 'Counter-clockwise', onSelect: () => set('direction', ccw ? null : 'ccw') },
    ],
    slice: arc ? [{ label: exploded.has(arc.key) ? 'Attach this slice' : 'Detach this slice', onSelect: () => toggleExplode(arc.key) }] : [],
    labels: [
      { label: labelPos === 'none' ? 'Add labels' : 'Remove labels', onSelect: () => set('labels', labelPos === 'none' ? null : 'none') },
      moved > 0 && { label: 'Reset label positions', onSelect: () => set('labelOffsets', {}) },
    ],
    legend: [{ label: legendPos === 'none' ? 'Add legend' : 'Remove legend', onSelect: () => set('legend', legendPos === 'none' ? null : 'none') }],
  }

  // ── Direct manipulation: rotation and hole handles, movable labels ──
  // While dragging, the value shows next to the cursor ("90°", "55 %").
  const [dragTip, setDragTip] = useState(null)
  const dragRotate = e => track(e, (x, y) => { const v = pieStartFromPoint(scene, x, y); set('start', v); setDragTip({ x, y, text: `${Math.round(v)}°` }) }, () => setDragTip(null))
  // A slice handle: the dragged edge follows the pointer (the scene at drag start is the reference).
  const dragSliceEdge = (e, h) => { const sc0 = scene; track(e, (x, y) => { const v = pieStartFromHandle(sc0, h.angle, x, y); set('start', v); setDragTip({ x, y, text: `${Math.round(v)}°` }) }, () => setDragTip(null)) }
  const dragHole = e => track(e, (x, y) => { const v = pieHoleFromPoint(scene, x, y); set('donut', v); setDragTip({ x, y, text: v > 0 ? `Hole ${Math.round(v * 100)}%` : 'Pie' }) }, () => setDragTip(null))
  const dragLabel = (e, l) => {
    if (e.button !== 0 || l.ax == null) return
    movedRef.current = false
    const sx = e.clientX, sy = e.clientY
    const o0 = offsets[l.key] ?? { dx: 0, dy: 0 }
    track(e, (x, y, ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!movedRef.current && Math.hypot(dx, dy) < 3) return
      movedRef.current = true
      update('labelOffsets', o => ({ ...(o ?? baseSpec.labelOffsets ?? {}), [l.key]: { dx: Math.round(o0.dx + dx), dy: Math.round(o0.dy + dy) } }))
    })
  }
  const pickLabels = e => { if (e.type === 'click' && movedRef.current) { movedRef.current = false; return } setObj(null); open(e, { obj: 'labels' }) }
  const handlesOn = pick?.obj === 'chart' || cur === 'chart'

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title="Chart format: colours, labels and layout. Tip: click or right-click any part of the chart" aria-label="Chart format"
          onClick={e => open(e, { obj: 'chart' })}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">No data for this chart yet.</div>}
      {scene && !scene.empty && (
        <svg width={scene.width} height={scene.height} role="img" aria-label={label} className="chart-pie">
          {scene.arcs.map(a => (
            <path key={a.key} d={a.d} transform={`translate(${a.tx},${a.ty})`} fill={tok(a.color)}
              stroke={pick?.obj === 'slice' && pick.key === a.key ? tok('gold') : tok('surface')} strokeWidth={pick?.obj === 'slice' && pick.key === a.key ? 2 : 1}
              className={`chart-engine-clickable${pick?.obj === 'slice' && pick.key === a.key ? ' is-selected' : ''}`} tabIndex={0} role="button"
              aria-label={`${a.label}: ${(a.share * 100).toFixed(1)}%`}
              onClick={e => { setObj(null); open(e, { obj: 'slice', key: a.key }) }} onContextMenu={e => { setObj(null); open(e, { obj: 'slice', key: a.key }) }}
              onKeyDown={e => { if (e.key === 'Enter') { setObj(null); open({ ...e, type: 'click', clientX: 0, clientY: 0, preventDefault: () => e.preventDefault(), stopPropagation: () => {} }, { obj: 'slice', key: a.key }) } }}>
              <title>{`${a.label}: ${(a.share * 100).toFixed(1)}%`}</title>
            </path>
          ))}
          {scene.leaders.map(l => <path key={`l-${l.key}`} d={l.d} fill="none" stroke={tok('gray-400')} strokeWidth={1} pointerEvents="none" />)}
          {/* Inside label larger than its slice: a background in the slice color underneath. */}
          {scene.labels.filter(l => l.box).map(l => <rect key={`b-${l.key}`} x={l.box.x} y={l.box.y} width={l.box.w} height={l.box.h} rx={2} fill={tok(l.box.fill)} stroke={tok('surface')} strokeWidth={1} pointerEvents="none" />)}
          {scene.labels.map(l => (
            <text key={`t-${l.key}`} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={600}
              pointerEvents={l.color === 'white' ? 'none' : undefined}
              className={`chart-engine-clickable${l.ax != null ? ' chart-engine-draglabel' : ''}${pick?.obj === 'labels' ? ' is-selected' : ''}`}
              onPointerDown={e => dragLabel(e, l)} onClick={pickLabels} onContextMenu={pickLabels}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', ...labelTextStyle(P), ...(l.size ? { fontSize: l.size } : {}) }}>{l.text}</text>
          ))}
          {scene.center && (
            <g pointerEvents="none">
              {scene.center.text && <text x={scene.center.x} y={scene.center.y} textAnchor="middle" fill={tok('black')} fontWeight={600} style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{scene.center.text}</text>}
              {scene.center.sub && <text x={scene.center.x} y={scene.center.y + 16} textAnchor="middle" fill={tok('gray-500')} style={{ fontSize: 11 }}>{scene.center.sub}</text>}
              {scene.center.title && <text x={scene.center.x} y={scene.center.y} textAnchor="middle" fill={tok('gray-700')} fontWeight={600} style={{ fontSize: 13 }}>{scene.center.title}</text>}
            </g>
          )}
          {dragTip && <text x={dragTip.x + 12} y={dragTip.y - 10} fill={tok('black')} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" pointerEvents="none" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{dragTip.text}</text>}
          {pick?.obj === 'slice' && scene.arcs.find(a => a.key === pick.key)?.handles.map((h, i) => (
            <rect key={`sh-${i}`} x={h.x - 3.5} y={h.y - 3.5} width={7} height={7} className="chart-engine-knob is-on chart-engine-handle--rotate" onPointerDown={e => dragSliceEdge(e, h)}>
              <title>Drag to rotate the chart (snaps to quarters)</title>
            </rect>
          ))}
          <g className={`chart-pie__handles${handlesOn ? ' is-on' : ''}`}>
            <circle cx={scene.handles.rotate.x} cy={scene.handles.rotate.y} r={4.5} className="chart-engine-knob is-on chart-engine-handle--rotate" onPointerDown={dragRotate}>
              <title>{`Drag to rotate (${scene.handles.rotate.angle}°, snaps to quarters)`}</title>
            </circle>
            <rect x={scene.handles.hole.x - 4} y={scene.handles.hole.y - 4} width={8} height={8} rx={1.5} className="chart-engine-knob is-on chart-engine-handle--move" onPointerDown={dragHole}>
              <title>{`Drag to size the hole (${Math.round((spec.donut ?? 0) * 100)}%)`}</title>
            </rect>
          </g>
          <g className={`chart-engine-legend chart-engine-clickable${pick?.obj === 'legend' ? ' is-selected' : ''}`}
            onClick={e => { setObj(null); open(e, { obj: 'legend' }) }} onContextMenu={e => { setObj(null); open(e, { obj: 'legend' }) }}>
            {scene.legend.map(it => (
              <g key={it.key} transform={`translate(${it.x},0)`}>
                <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={tok(it.color)} />
                <text x={16} y={it.y} dominantBaseline="central" style={{ fontSize: 11 }}>{it.label}</text>
              </g>
            ))}
          </g>
        </svg>
      )}
      {pick && (
        <FormatBar onOpenSheet={() => sheetApi.setSheetOpen(true)} key={`${pick.mode}|${pick.obj}|${pick.key}`} mode={pick.mode} anchor={pick.anchor} objects={objects} object={cur}
          onObject={setObj} controls={(controls[cur] ?? []).filter(Boolean)} actions={(actions[cur] ?? []).filter(Boolean)}
          onReset={reset} onUndo={undo} canUndo={canUndo} onClose={() => { close(); setObj(null) }} />
      )}
      {sheetApi.sheetOpen && <DataSheet api={sheetApi} layout={pieSheet.layout} colors={Object.fromEntries((scene?.arcs ?? []).map(a => [a.key, a.color]))} onClose={() => sheetApi.setSheetOpen(false)} />}
    </div>
  )
}
