// ─── epure-charts · pie and doughnut ────────────────────────────────────────
// <PieView id slices={[{ key, label, value, color? }]} spec={{ donut, sort, … }} format />
// In-place formatting (FormatBar): clicking a slice, the labels
// or the legend → its format bar; right-click anywhere → its action menu;
// settings button in the corner. View preferences, per browser.
// Handles (selected or hovered chart): rotation on the rim, hole size;
// selected slice: four handles on its edges, each rotates the chart;
// outside labels can be dragged (Reset in the labels menu).
import { useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { IconPalette, IconChartPie, IconChartDonut, IconTag, IconLayoutList } from '@tabler/icons-react'
import PieFigure from './PieFigure.jsx'
import { buildPieScene, pieStartFromPoint, pieStartFromHandle, pieHoleFromPoint } from './pieScene.js'
import { Seg, Check, Line, Swatches, Field } from './wheelControls.jsx'
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
import { SpecLocale, useT } from './uiLocale.js'
const PALETTE = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
const DEFAULTS = { donut: null, sort: null, start: null, direction: null, centerTitle: null, labelOffsets: null, other: null, total: null, labels: null, content: null, decimals: null, legend: null, explode: [], colors: {} }

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

/** Follows the pointer until release; onMove(x, y, ev) in SVG coordinates. */
function track(e, onMove, onEnd) {
  e.preventDefault(); e.stopPropagation()
  const svg = e.currentTarget.ownerSVGElement ?? e.currentTarget
  const move = ev => { const r = svg.getBoundingClientRect(); onMove(ev.clientX - r.left, ev.clientY - r.top, ev) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd?.() }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}

// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences.
// responsive: the SVG scales to its container (width="100%", ratio kept).
// The interface (menus, format bar, messages) speaks the spec's language (spec.locale).
export default function PieView(props) {
  return <SpecLocale spec={props.spec}><PieViewBody {...props} /></SpecLocale>
}

function PieViewBody({ id = 'pie', spec: baseSpec = {}, slices: slicesIn = [], format, height = 280, label: labelIn, width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  // readOnly + applyPrefs: the stored settings and sheet edits drawn, no editing control.
  const tr = useT()
  const label = labelIn ?? tr('Pie chart')
  const plain = readOnly && !applyPrefs
  const boxRef = useRef(null)
  const movedRef = useRef(false)
  const width = useWidth(boxRef, widthProp)
  const prefsApi = useViewPrefs(`epure-chart-pie-${id}`, DEFAULTS)
  const { set, update, reset, undo, canUndo } = prefsApi
  const P = plain ? DEFAULTS : prefsApi.prefs
  const spec = {
    ...baseSpec,
    ...Object.fromEntries(Object.entries(P).filter(([k, v]) => v != null && !['explode', 'colors'].includes(k))),
    explode: P.explode?.length ? P.explode : baseSpec.explode,
  }
  // The sheet drives the chart: the drawn slices are the ones it returns (source + edits).
  const sheetBase = useMemo(() => pieSheet.toBase(slicesIn), [slicesIn])
  const sheetApi = useSheet(`pie-${id}`, sheetBase, pieSheet.validate)
  const slices = plain ? slicesIn : pieSheet.fromSheet(sheetApi.sheet, slicesIn)
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
    chart: { name: donut ? tr('Doughnut') : tr('Pie'), icon: donut ? IconChartDonut : IconChartPie },
    ...(arc ? { slice: { name: arc.label, icon: IconChartPie } } : {}),
    labels: { name: tr('Labels'), icon: IconTag },
    legend: { name: tr('Legend'), icon: IconLayoutList },
  }
  const labelPos = spec.labels ?? 'outside'
  const legendPos = spec.legend ?? 'right'
  const controls = {
    chart: [
      ['scheme', null, tr('Colors: {name}', { name: P.schemeName ?? tr('default') }), tr('Color schemes (named, saved by browser)'), (
        <SchemeTools current={(scene?.arcs ?? []).map(a => a.color)} active={P.schemeName}
          onApply={sc => { if (sc) set('colors', schemeMap((scene?.arcs ?? []).map(a => a.key), sc.colors)); set('schemeName', sc?.name ?? null) }} />
      )],
      ['type', null, tr('Type: {name}', { name: donut ? tr('doughnut {n}%', { n: Math.round((spec.donut) * 100) }) : tr('pie') }), tr('Pie or doughnut'), (
        <>
          <Line label={tr('Type')}><Seg label={tr('Type')} value={donut ? 'donut' : 'pie'} onPick={v => set('donut', v === 'donut' ? 0.55 : 0)} items={[['pie', tr('Pie')], ['donut', tr('Doughnut')]]} /></Line>
          {donut && <Line label={tr('Hole')}><Seg label={tr('Hole size')} value={spec.donut} onPick={v => set('donut', v)} items={[[0.4, tr('Small')], [0.55, tr('Medium')], [0.7, tr('Large')]]} /></Line>}
          {donut && <Line label=""><Check on={!!spec.total} onClick={() => set('total', !spec.total)}>{tr('Total in the center')}</Check></Line>}
          {donut && <Line label={tr('Title')}><Field label={tr('Center title')} wide value={spec.centerTitle ?? ''} placeholder={tr('None')} onCommit={v => set('centerTitle', v || null)} /></Line>}
          <div className="chart-pop__note">{tr('Or drag the hole handle (to the center for a pie).')}</div>
        </>
      )],
      ['order', null, tr('Order: {order}, {direction}', { order: { desc: tr('largest first'), asc: tr('smallest first') }[spec.sort] ?? tr('sheet'), direction: ccw ? tr('counter-clockwise') : tr('clockwise') }), tr('Slice order'), (
        <>
          <Line label={tr('Order')}><Seg label={tr('Slice order')} value={spec.sort ?? null} onPick={v => set('sort', v)} items={[[null, tr('Sheet')], ['desc', tr('Largest first')], ['asc', tr('Smallest first')]]} /></Line>
          <Line label={tr('Direction')}><Seg label={tr('Direction')} value={ccw ? 'ccw' : 'cw'} onPick={v => set('direction', v === 'ccw' ? 'ccw' : null)} items={[['cw', tr('Clockwise')], ['ccw', tr('Counter-clockwise')]]} /></Line>
        </>
      )],
      ['start', null, tr('Start: {n}°', { n: spec.start ?? 0 }), tr('Start angle'), (
        <>
          <Line label={tr('Start')}><Seg label={tr('Start angle')} value={spec.start ?? 0} onPick={v => set('start', v)} items={[[0, tr('12 o’clock')], [90, tr('3 o’clock')], [180, tr('6 o’clock')], [270, tr('9 o’clock')]]} /></Line>
          <Line label={tr('Angle')}><Field label={tr('Degrees')} numeric value={spec.start ?? 0} onCommit={v => set('start', v == null ? null : ((Math.round(v) % 360) + 360) % 360)} /></Line>
          <div className="chart-pop__note">{tr('Or drag the rotation handle on the edge (snaps to quarters).')}</div>
        </>
      )],
      ['other', null, tr('Small slices: {state}', { state: spec.other ? tr('grouped < {n}%', { n: Math.round(spec.other * 100) }) : tr('shown') }), tr('Group small slices into “Other”'), (
        <Line label={tr('Group')}><Seg label={tr('Group small slices')} value={spec.other ?? null} onPick={v => set('other', v)} items={[[null, tr('Off')], [0.03, tr('< {n}%', { n: 3 })], [0.05, tr('< {n}%', { n: 5 })], [0.1, tr('< {n}%', { n: 10 })]]} /></Line>
      )],
    ],
    slice: arc ? [
      ['fill', <span className="chart-bar__dot" style={{ background: tok(arc.color) }} />, tr('Fill: {name}', { name: colorName(arc.color) }), tr('Slice color'), (
        <Swatches palette={PALETTE} value={P.colors?.[arc.key] ?? arc.color} onPick={c => update('colors', cur0 => ({ ...(cur0 ?? {}), [arc.key]: c }))} />
      )],
      ['explode', null, tr('Explode: {state}', { state: exploded.has(arc.key) ? tr('on') : tr('off') }), tr('Detach this slice'), (
        <Line label=""><Check on={exploded.has(arc.key)} onClick={() => toggleExplode(arc.key)}>{tr('Detach from the center')}</Check></Line>
      )],
    ] : [],
    labels: [
      ['textstyle', null, styleSummary(P), tr('Label color, font and size'), <TextStyle font={P.labelFont} pt={P.labelPt} color={P.labelColor} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} onColor={v => set('labelColor', v)} />],
      // Labels dropped for lack of room (large size): counted; the slice still shows on hover.
      scene?.noRoom > 0 && ['noroom', null, tr('{n} hidden (no room)', { n: scene.noRoom }), tr('Labels left out for lack of room'), (
        <div className="chart-pop__note">{scene.noRoom > 1 ? tr('{n} labels did not fit at this size. Hover a slice to read it, or reduce the size in Style.', { n: scene.noRoom }) : tr('{n} label did not fit at this size. Hover a slice to read it, or reduce the size in Style.', { n: scene.noRoom })}</div>
      )],
      ['pos', null, tr('Position: {name}', { name: { outside: tr('outside'), inside: tr('inside'), none: tr('none') }[labelPos] ?? labelPos }), tr('Label position'), (
        <Line label={tr('Position')}><Seg label={tr('Label position')} value={labelPos} onPick={v => set('labels', v === 'outside' ? null : v)} items={[['outside', tr('Outside')], ['inside', tr('Inside')], ['none', tr('None')]]} /></Line>
      )],
      ['content', null, tr('Content: {name}', { name: { value: tr('value'), both: tr('value + %'), name: tr('name'), nameShare: tr('name + %') }[spec.content] ?? '%' }), tr('Label content'), (
        <Line label={tr('Content')}><Seg label={tr('Label content')} value={spec.content ?? 'share'} onPick={v => set('content', v === 'share' ? null : v)} items={[['share', '%'], ['value', tr('Value')], ['both', tr('Value + %')], ['name', tr('Name')], ['nameShare', tr('Name + %')]]} /></Line>
      )],
      ['dec', null, tr('Decimals: {n}', { n: spec.decimals ?? 0 }), tr('Decimals of the %'), (
        <Line label={tr('Decimals')}><Seg label={tr('Decimals')} value={spec.decimals ?? 0} onPick={v => set('decimals', v || null)} items={[[0, '0'], [1, tr('0.0')], [2, tr('0.00')]]} /></Line>
      )],
      labelPos === 'outside' && ['place', null, tr('Placement: {name}', { name: moved ? tr('{n} moved', { n: moved }) : tr('auto') }), tr('Label placement'), (
        <>
          <div className="chart-pop__note">{tr('Drag an outside label to move it.')}</div>
          {moved > 0 && <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('labelOffsets', {})}>{tr('Reset label positions')}</button></Line>}
        </>
      )],
    ],
    legend: [
      ['pos', null, tr('Position: {name}', { name: { right: tr('right'), bottom: tr('bottom'), none: tr('none') }[legendPos] ?? legendPos }), tr('Legend position'), (
        <Line label={tr('Position')}><Seg label={tr('Legend position')} value={legendPos} onPick={v => set('legend', v === 'right' ? null : v)} items={[['right', tr('Right')], ['bottom', tr('Bottom')], ['none', tr('Hidden')]]} /></Line>
      )],
    ],
  }
  const actions = {
    chart: [
      { label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: tr('Reset data to source'), onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: donut ? tr('Change to pie') : tr('Change to doughnut'), onSelect: () => set('donut', donut ? 0 : 0.55) },
      exploded.size > 0 && { label: tr('Attach all slices'), onSelect: () => set('explode', []) },
      { label: ccw ? tr('Clockwise') : tr('Counter-clockwise'), onSelect: () => set('direction', ccw ? null : 'ccw') },
    ],
    slice: arc ? [{ label: exploded.has(arc.key) ? tr('Attach this slice') : tr('Detach this slice'), onSelect: () => toggleExplode(arc.key) }] : [],
    labels: [
      { label: labelPos === 'none' ? tr('Add labels') : tr('Remove labels'), onSelect: () => set('labels', labelPos === 'none' ? null : 'none') },
      moved > 0 && { label: tr('Reset label positions'), onSelect: () => set('labelOffsets', {}) },
    ],
    legend: [{ label: legendPos === 'none' ? tr('Add legend') : tr('Remove legend'), onSelect: () => set('legend', legendPos === 'none' ? null : 'none') }],
  }

  // ── Direct manipulation: rotation and hole handles, movable labels ──
  // While dragging, the value shows next to the cursor ("90°", "55 %").
  const [dragTip, setDragTip] = useState(null)
  const dragRotate = e => track(e, (x, y) => { const v = pieStartFromPoint(scene, x, y); set('start', v); setDragTip({ x, y, text: `${Math.round(v)}°` }) }, () => setDragTip(null))
  // A slice handle: the dragged edge follows the pointer (the scene at drag start is the reference).
  const dragSliceEdge = (e, h) => { const sc0 = scene; track(e, (x, y) => { const v = pieStartFromHandle(sc0, h.angle, x, y); set('start', v); setDragTip({ x, y, text: `${Math.round(v)}°` }) }, () => setDragTip(null)) }
  const dragHole = e => track(e, (x, y) => { const v = pieHoleFromPoint(scene, x, y); set('donut', v); setDragTip({ x, y, text: v > 0 ? tr('Hole {n}%', { n: Math.round(v * 100) }) : tr('Pie') }) }, () => setDragTip(null))
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

  const sel = (kind, key) => pick?.obj === kind && (key == null || pick.key === key)
  const pickSlice = (e, a) => { setObj(null); open(e, { obj: 'slice', key: a.key }) }
  const part = readOnly ? undefined : (kind, it) => {
    if (kind === 'slice') return {
      stroke: sel('slice', it.key) ? tok('gold') : tok('surface'), strokeWidth: sel('slice', it.key) ? 2 : 1,
      className: `chart-engine-clickable${sel('slice', it.key) ? ' is-selected' : ''}`, tabIndex: 0, role: 'button',
      'aria-label': `${it.label}: ${(it.share * 100).toFixed(1)}%`,
      onClick: e => pickSlice(e, it), onContextMenu: e => pickSlice(e, it),
      onKeyDown: e => { if (e.key === 'Enter') pickSlice({ ...e, type: 'click', clientX: 0, clientY: 0, preventDefault: () => e.preventDefault(), stopPropagation: () => {} }, it) },
    }
    if (kind === 'label') return {
      pointerEvents: it.color === 'white' ? 'none' : undefined,
      className: `chart-engine-clickable${it.ax != null ? ' chart-engine-draglabel' : ''}${sel('labels') ? ' is-selected' : ''}`,
      onPointerDown: e => dragLabel(e, it), onClick: pickLabels, onContextMenu: pickLabels,
    }
    if (kind === 'legend') return {
      className: `chart-engine-legend chart-engine-clickable${sel('legend') ? ' is-selected' : ''}`,
      onClick: e => { setObj(null); open(e, { obj: 'legend' }) }, onContextMenu: e => { setObj(null); open(e, { obj: 'legend' }) },
    }
    return null
  }

  if (readOnly) {
    return (
      <div ref={boxRef} className="chart-engine chart-engine-box">
        {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
        <PieFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title={tr('Chart format: colours, labels and layout. Tip: click or right-click any part of the chart')} aria-label={tr('Chart format')}
          onClick={e => open(e, { obj: 'chart' })}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
      {scene && !scene.empty && (
        <PieFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} labelStyle={labelTextStyle(P)} part={part}>
          {dragTip && <text x={dragTip.x + 12} y={dragTip.y - 10} fill={tok('black')} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" pointerEvents="none" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{dragTip.text}</text>}
          {pick?.obj === 'slice' && scene.arcs.find(a => a.key === pick.key)?.handles.map((h, i) => (
            <rect key={`sh-${i}`} x={h.x - 3.5} y={h.y - 3.5} width={7} height={7} className="chart-engine-knob is-on chart-engine-handle--rotate" onPointerDown={e => dragSliceEdge(e, h)}>
              <title>{tr('Drag to rotate the chart (snaps to quarters)')}</title>
            </rect>
          ))}
          <g className={`chart-pie__handles${handlesOn ? ' is-on' : ''}`}>
            <circle cx={scene.handles.rotate.x} cy={scene.handles.rotate.y} r={4.5} className="chart-engine-knob is-on chart-engine-handle--rotate" onPointerDown={dragRotate}>
              <title>{tr('Drag to rotate ({n}°, snaps to quarters)', { n: scene.handles.rotate.angle })}</title>
            </circle>
            <rect x={scene.handles.hole.x - 4} y={scene.handles.hole.y - 4} width={8} height={8} rx={1.5} className="chart-engine-knob is-on chart-engine-handle--move" onPointerDown={dragHole}>
              <title>{tr('Drag to size the hole ({n}%)', { n: Math.round((spec.donut ?? 0) * 100) })}</title>
            </rect>
          </g>
        </PieFigure>
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
