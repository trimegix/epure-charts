// ─── epure-charts · scatter and bubble ──────────────────────────────────────
// <ScatterView id points={[{ key, label, x, y, size?, group?, color? }]} spec format formatX formatSize />
// In-place formatting (FormatBar): clicking a point, the labels,
// an axis, the legend, the trend, a partition or a zone → its format bar;
// right-click → its action menu. Direct manipulation: drag a partition
// (Ctrl = copy it, Shift = constrained angle for an oblique line), its ends,
// a label (Reset in the labels menu), the edge of a bubble (size), the bubble
// of the size legend (its value), a linear trend (it becomes a partition).
// Shift+click on a point: its whole group (color, order, labels).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { IconPalette, IconChartScatter, IconChartBubble, IconTag, IconArrowsHorizontal, IconArrowsVertical, IconLayoutList, IconTrendingUp, IconLine, IconSquare } from '@tabler/icons-react'
import ScatterFigure from './ScatterFigure.jsx'
import { buildScatterScene, normPartitions, constrainAngle, bubbleScaleFromDrag, snapEndpoint, snapValue, sizeLegendFromDrag } from './scatterScene.js'
import { Seg, Check, Line, Swatches, Field } from './wheelControls.jsx'
import FormatBar from './FormatBar'
import { useViewPrefs } from './useViewPrefs.js'
import { useFormatPick } from './useFormatPick.js'
import { COLOR_TOKENS, NEUTRAL_TOKENS } from './spec.js'
import { colorName } from './colorNames'
import { publishDomain, withdrawDomain, unionFor, useSameScaleVersion, groupCount } from './sameScale'
import DataSheet, { EditedNote } from './DataSheet.jsx'
import { useSheet } from './useSheet.js'
import { scatterSheet } from './sheetAdapters.js'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, labelTextStyle, schemeMap, styleSummary } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
import { SpecLocale, useT, useLocale } from './uiLocale.js'
const PALETTE = [...COLOR_TOKENS, ...NEUTRAL_TOKENS]
const DEFAULTS = {
  bubble: null, bubbleScale: null, sizeBy: null, marker: null, markers: null, dataFill: null, labels: null, labelContent: null, label2: null, labelOffsets: null,
  trend: null, trendLabel: null, trendFill: null, trendFillColor: null, trendWeighted: null, trendGroup: null, sizeLegend: null, partitions: null, zones: null, legend: null, front: null, back: null,
  x: {}, y: {}, colors: {}, hiddenLabels: [],
}
// Trend types: [value, name, action label], in the interface language.
const trendsOf = tr => [
  ['linear', tr('Linear'), tr('Linear trend')], ['exp', tr('Exponential'), tr('Exponential trend')], ['power', tr('Power'), tr('Power trend')],
  ['log', tr('Logarithmic'), tr('Logarithmic trend')], ['poly2', tr('Poly 2'), tr('Poly 2 trend')], ['poly3', tr('Poly 3'), tr('Poly 3 trend')], ['poly4', tr('Poly 4'), tr('Poly 4 trend')],
]
const CONTENT_KEYS = ['name', 'x', 'y', 'size']
const contentOf = tr => [['name', tr('Name')], ['x', 'X'], ['y', 'Y'], ['size', tr('Size')]]
const newKey = () => `p${Math.random().toString(36).slice(2, 7)}`

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
function track(e, onMove) {
  e.preventDefault(); e.stopPropagation()
  const svg = e.currentTarget.ownerSVGElement ?? e.currentTarget
  const move = ev => { const r = svg.getBoundingClientRect(); onMove(ev.clientX - r.left, ev.clientY - r.top, ev) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}

// width: fixed drawing width (no measuring; also the first width on hydration).
// readOnly: the figure only: no format bar, menus, data sheet or per-browser preferences;
//   it reads a shared scale but never publishes its own extent.
// responsive: the SVG scales to its container (width="100%", ratio kept).
// dataTable: the points as a visually hidden table next to the SVG.
// The interface (menus, format bar, messages) speaks the spec's language (spec.locale).
export default function ScatterView(props) {
  return <SpecLocale spec={props.spec}><ScatterViewBody {...props} /></SpecLocale>
}

function ScatterViewBody({ id = 'scatter', spec: baseSpec = {}, points: pointsIn = [], format, formatX: formatXIn, formatSize, height = 320, label: labelIn, width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false }) {
  // readOnly + applyPrefs: the stored settings and sheet edits drawn, no editing control.
  const tr = useT()
  const locale = useLocale()
  const TRENDS = trendsOf(tr)
  const TREND_NAME = Object.fromEntries(TRENDS)
  const CONTENT = contentOf(tr)
  const label = labelIn ?? tr('Scatter chart')
  const plain = readOnly && !applyPrefs
  const boxRef = useRef(null)
  const movedRef = useRef(false)
  const width = useWidth(boxRef, widthProp)
  const prefsApi = useViewPrefs(`epure-chart-scatter-${id}`, DEFAULTS)
  const { set, update, reset, undo, canUndo } = prefsApi
  const P = plain ? DEFAULTS : prefsApi.prefs
  // The sheet drives the chart: the drawn points are the ones it returns (source + edits).
  const sheetBase = useMemo(() => scatterSheet.toBase(pointsIn, baseSpec), [pointsIn, baseSpec])
  const sheetApi = useSheet(`scatter-${id}`, sheetBase, scatterSheet.validate)
  const points = plain ? pointsIn : scatterSheet.fromSheet(sheetApi.sheet, pointsIn)
  // Dates typed in X: the X axis becomes a date axis (month-formatted ticks).
  const dateX = !readOnly && sheetApi.sheet.rows.some(r => /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(r.cells[0]?.raw ?? ''))
  const formatX = dateX ? v => new Date(v * 864e5).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : formatXIn
  const hasSize = points.some(p => Number.isFinite(p.size))
  const hasColors = points.some(p => p.color)
  const spec = {
    ...baseSpec,
    ...Object.fromEntries(Object.entries(P).filter(([k, v]) => v != null && !['x', 'y', 'colors', 'hiddenLabels'].includes(k))),
    x: { ...(baseSpec.x ?? {}), ...(P.x ?? {}) }, y: { ...(baseSpec.y ?? {}), ...(P.y ?? {}) },
  }
  const data = points.map(p => (P.colors?.[p.key] ? { ...p, color: P.colors[p.key] } : p))
  const specKey = JSON.stringify(spec)
  const natural = useMemo(() => (width > 0 ? buildScatterScene(spec, data, { width, height, format, formatX, formatSize }) : null), [specKey, data, width, height, format, formatX, formatSize]) // eslint-disable-line react-hooks/exhaustive-deps
  // Shared scale (X AND Y axes): each scatter publishes its
  // natural extent; members of the same group draw the union.
  const sameV = useSameScaleVersion()
  const domKey = natural?.domains ? JSON.stringify(natural.domains) : ''
  useEffect(() => {
    for (const ax of ['x', 'y']) {
      const g = spec[ax]?.same
      const d = natural?.domains?.[ax]
      const manualAx = Number.isFinite(P[ax]?.min) || Number.isFinite(P[ax]?.max)
      if (readOnly || !g || !d || manualAx) withdrawDomain(`${id}|${ax}`)
      else publishDomain(`${id}|${ax}`, `scatter-${ax}|${g === true ? '*' : g}`, d[0], d[1])
    }
    return () => { withdrawDomain(`${id}|x`); withdrawDomain(`${id}|y`) }
  }, [domKey, specKey, id, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useMemo(() => {
    if (!natural || !(spec.x?.same || spec.y?.same)) return natural
    const forced = { ...spec }
    for (const ax of ['x', 'y']) {
      const g = spec[ax]?.same
      const u = g ? unionFor(`scatter-${ax}|${g === true ? '*' : g}`) : null
      if (u && !(Number.isFinite(P[ax]?.min) || Number.isFinite(P[ax]?.max))) forced[ax] = { ...spec[ax], min: u[0], max: u[1] }
    }
    return buildScatterScene(forced, data, { width, height, format, formatX, formatSize })
  }, [natural, sameV, specKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, open, close] = useFormatPick(boxRef)
  const [obj, setObj] = useState(null)
  const cur = obj ?? pick?.obj
  const pt = pick?.obj === 'point' ? scene?.points.find(p => p.key === pick?.key) : null
  // The selected group (Shift+click on a point): all its points.
  const grpKeys = pick?.obj === 'group' ? (scene?.points ?? []).filter(p => (p.group ?? '') === pick.key).map(p => p.key) : []
  const groupNames = [...new Set(points.map(p => p.group ?? ''))].filter(g => g !== '')
  const hidden = new Set(P.hiddenLabels ?? [])
  const bubble = !!spec.bubble && hasSize
  const marker = spec.marker ?? 'circle'
  const mean = k => { const v = points.map(p => p[k]).filter(Number.isFinite); return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toPrecision(3)) : 0 }
  const ext = (k, f) => { const v = points.map(p => p[k]).filter(Number.isFinite); return v.length ? f(...v) : 0 }
  const parts = normPartitions(spec.partitions)
  const part = pick?.obj === 'partition' ? parts.find(p => p.key === pick.key) : null
  const zone = pick?.obj === 'zone' ? scene?.zones.find(z => z.key === pick.key) ?? { key: pick.key } : null
  const zones = spec.zones ?? {}
  const ttype = spec.trend === true ? 'linear' : spec.trend || null
  const content = spec.labelContent ?? ['name']
  const labelsAuto = scene?.labelsAuto ?? 'all'
  const labelsOn = (spec.labels ?? labelsAuto) === 'all'
  const content2 = spec.label2 ?? []
  const offsets = spec.labelOffsets ?? {}
  const moved = Object.keys(offsets).length
  const setAxis = (ax, k, v) => update(ax, c => { const n = { ...(c ?? {}) }; if (v == null || v === '') delete n[k]; else n[k] = v; return n })
  // Partitions: always written as a list, from the most recent saved state.
  const setParts = fn => update('partitions', c => fn(normPartitions(c ?? baseSpec.partitions)))
  const patchPart = (key, patch) => setParts(list => list.map(p => (p.key === key ? { ...p, ...patch } : p)))
  const addPart = axis => setParts(list => [...list, axis === 'line'
    ? { key: newKey(), axis, from: { x: ext('x', Math.min), y: ext('y', Math.min) }, to: { x: ext('x', Math.max), y: ext('y', Math.max) } }
    : { key: newKey(), axis, value: mean(axis) }])
  const removePart = key => setParts(list => list.filter(p => p.key !== key))
  const setZone = (key, patch) => update('zones', z0 => {
    const z = { ...(z0 ?? baseSpec.zones ?? {}) }
    const n = { ...(z[key] ?? {}), ...patch }
    for (const k of Object.keys(n)) if (n[k] == null || n[k] === '') delete n[k]
    if (Object.keys(n).length) z[key] = n; else delete z[key]
    return z
  })
  const toggleIn = (name, k, fallback) => update(name, c => { const s = new Set(c ?? fallback); if (s.has(k)) s.delete(k); else s.add(k); return CONTENT_KEYS.filter(v => s.has(v)) })
  const toggleHidden = k => update('hiddenLabels', h => { const s = new Set(h ?? []); if (s.has(k)) s.delete(k); else s.add(k); return [...s] })
  const toFront = k => { const ks = [].concat(k); update('front', f => [...(f ?? []).filter(x => !ks.includes(x)), ...ks]); update('back', b => (b ?? []).filter(x => !ks.includes(x))) }
  const toBack = k => { const ks = [].concat(k); update('back', b => [...ks, ...(b ?? []).filter(x => !ks.includes(x))]); update('front', f => (f ?? []).filter(x => !ks.includes(x))) }
  const setHiddenMany = (ks, hide) => update('hiddenLabels', h => { const s = new Set(h ?? []); for (const k of ks) { if (hide) s.add(k); else s.delete(k) } return [...s] })
  // Partition ⇄ trend (partition type): an oblique line becomes the linear
  // trend of all points or of a group; a moved trend becomes a partition.
  const partToTrend = (key, g) => { removePart(key); set('trendGroup', g === '*' ? null : g); set('trend', 'linear'); close() }
  const trendToPart = (dx = 0, dy = 0) => {
    const t = scene?.trend
    if (!t || t.type !== 'linear') return
    const at = (x, y) => ({ x: Number(scene.invert.x(x + dx).toPrecision(3)), y: Number(scene.invert.y(y + dy).toPrecision(3)) })
    const k = newKey()
    setParts(list => [...list, { key: k, axis: 'line', from: at(t.x1, t.y1), to: at(t.x2, t.y2) }])
    set('trend', null)
    return k
  }
  const partName = p => (p.axis === 'x' ? tr('Vertical partition') : p.axis === 'y' ? tr('Horizontal partition') : tr('Oblique partition'))
  const zoneName = k => ({ tl: tr('Top-left zone'), tr: tr('Top-right zone'), bl: tr('Bottom-left zone'), br: tr('Bottom-right zone'), left: tr('Left zone'), right: tr('Right zone'), top: tr('Top zone'), bottom: tr('Bottom zone') }[k]
    ?? (k.startsWith('above:') ? tr('Zone above the line') : k.startsWith('below:') ? tr('Zone below the line') : tr('Zone {name}', { name: k })))

  const objects = {
    chart: { name: bubble ? tr('Bubble chart') : tr('Scatter chart'), icon: bubble ? IconChartBubble : IconChartScatter },
    ...(pt ? { point: { name: pt.label, icon: IconChartScatter } } : {}),
    ...(grpKeys.length ? { group: { name: tr('{name} ({n} points)', { name: pick.key, n: grpKeys.length }), icon: IconChartScatter } } : {}),
    labels: { name: tr('Labels'), icon: IconTag },
    xaxis: { name: tr('X axis'), icon: IconArrowsHorizontal },
    yaxis: { name: tr('Y axis'), icon: IconArrowsVertical },
    ...(scene?.legend.length ? { legend: { name: tr('Legend'), icon: IconLayoutList } } : {}),
    ...(scene?.trend ? { trend: { name: tr('Trend line'), icon: IconTrendingUp } } : {}),
    ...(part ? { partition: { name: partName(part), icon: IconLine } } : {}),
    ...(zone ? { zone: { name: zoneName(zone.key), icon: IconSquare } } : {}),
  }
  const axisControls = ax => {
    const o = spec[ax] ?? {}
    return [
      ['scale', null, tr('Scale: {range}', { range: Number.isFinite(o.min) || Number.isFinite(o.max) ? `${o.min ?? tr('auto')} – ${o.max ?? tr('auto')}` : tr('auto') }) + (o.log ? tr(' · log') : ''), tr('Scale'), (
        <>
          <Line label={tr('Range')}>
            <Field label={tr('Min')} numeric value={P[ax]?.min ?? ''} placeholder={tr('Auto')} onCommit={v => setAxis(ax, 'min', v)} />
            <Field label={tr('Max')} numeric value={P[ax]?.max ?? ''} placeholder={tr('Auto')} onCommit={v => setAxis(ax, 'max', v)} />
          </Line>
          <Line label={tr('Options')}><Check on={!!o.log} onClick={() => setAxis(ax, 'log', o.log ? null : true)} title={tr('Positive values only')}>{tr('Logarithmic')}</Check></Line>
        </>
      )],
      ['title', null, tr('Title: {name}', { name: o.title || tr('none') }), tr('Axis title'), (
        <Line label=""><Field label={tr('Axis title')} wide value={P[ax]?.title ?? o.title ?? ''} placeholder={tr('None')} onCommit={v => setAxis(ax, 'title', v)} /></Line>
      )],
    ]
  }
  const zoneBody = (key, title) => (
    <>
      <Line label={title ?? tr('Fill')}>
        <Swatches palette={PALETTE} value={zones[key]?.fill ?? null} onPick={c => setZone(key, { fill: c })} />
      </Line>
      {zones[key]?.fill && <Line label=""><button type="button" className="chart-pop__link" onClick={() => setZone(key, { fill: null })}>{tr('No fill')}</button></Line>}
      <Line label={tr('Label')}><Field label={tr('Zone label')} wide value={zones[key]?.label ?? ''} placeholder={tr('None')} onCommit={v => setZone(key, { label: v })} /></Line>
    </>
  )
  const trendBody = (
    <>
      <Line label={tr('Type')}><Seg label={tr('Trend type')} value={ttype} onPick={v => set('trend', v)} items={TRENDS.map(([v, l]) => [v, l])} /></Line>
      <Line label={tr('Show')}><Seg label={tr('Equation and R²')} value={spec.trendLabel ?? 'none'} onPick={v => set('trendLabel', v === 'none' ? null : v)} items={[['none', tr('Nothing')], ['equation', tr('Equation')], ['r2', 'R²'], ['both', tr('Both')]]} /></Line>
      <Line label={tr('Fill')}><Seg label={tr('Background fill')} value={spec.trendFill ?? 'none'} onPick={v => set('trendFill', v === 'none' ? null : v)} items={[['none', tr('None')], ['above', tr('Above')], ['below', tr('Below')]]} /></Line>
      {spec.trendFill && <Swatches palette={PALETTE} value={spec.trendFillColor ?? 'cat-1'} onPick={c => set('trendFillColor', c)} />}
      {groupNames.length > 1 && <Line label={tr('Points')}><Seg label={tr('Trend of')} value={spec.trendGroup ?? '*'} onPick={v => set('trendGroup', v === '*' ? null : v)} items={[['*', tr('All')], ...groupNames.map(g => [g, g])]} /></Line>}
      {bubble && <Line label=""><Check on={!!spec.trendWeighted} onClick={() => set('trendWeighted', spec.trendWeighted ? null : true)}>{tr('Weight by bubble size')}</Check></Line>}
    </>
  )
  const controls = {
    chart: [
      // Named scheme: one color per group (otherwise per point), in order.
      ['scheme', null, tr('Colors: {name}', { name: P.schemeName ?? tr('default') }), tr('Color schemes (named, saved by browser)'), (() => {
        const pts = scene?.points ?? []
        const units = groupNames.length ? groupNames : pts.map(p => p.key)
        const keysOf = u => (groupNames.length ? pts.filter(p => (p.group ?? '') === u).map(p => p.key) : [u])
        const current = units.map(u => pts.find(p => p.key === keysOf(u)[0])?.color ?? 'gray-400')
        return <SchemeTools current={current} active={P.schemeName}
          onApply={sc => { if (sc) { const by = schemeMap(units, sc.colors); set('colors', Object.fromEntries(units.flatMap(u => keysOf(u).map(k => [k, by[u]])))) } set('schemeName', sc?.name ?? null) }} />
      })()],
      hasSize && ['kind', null, tr('Type: {name}', { name: bubble ? (spec.sizeBy === 'diameter' ? tr('bubbles by diameter') : tr('bubbles by area')) : tr('points') }), tr('Scatter or bubble'), (
        <>
          <Line label={tr('Type')}><Seg label={tr('Type')} value={bubble ? 'bubble' : 'scatter'} onPick={v => set('bubble', v === 'bubble')} items={[['scatter', tr('Points')], ['bubble', tr('Bubbles (size)')]]} /></Line>
          {bubble && <Line label={tr('Size')}><Seg label={tr('Bubble size')} value={spec.bubbleScale ?? 1} onPick={v => set('bubbleScale', v === 1 ? null : v)} items={[[0.6, tr('Small')], [1, tr('Medium')], [1.5, tr('Large')]]} /></Line>}
          {bubble && <Line label={tr('Size is')}><Seg label={tr('Size represented by')} value={spec.sizeBy ?? 'area'} onPick={v => set('sizeBy', v === 'area' ? null : v)} items={[['area', tr('Area')], ['diameter', tr('Diameter')]]} /></Line>}
          {bubble && <div className="chart-pop__note">{tr('Or drag the edge of a selected bubble.')}</div>}
        </>
      )],
      !bubble && ['marker', null, tr('Marker: {name}', { name: spec.markers === 'group' ? tr('by group') : ({ circle: tr('circle'), square: tr('square'), diamond: tr('diamond'), triangle: tr('triangle'), none: tr('none') }[marker] ?? marker) }), tr('Marker shape'), (
        <>
          <Line label={tr('Marker')}><Seg label={tr('Marker shape')} value={spec.markers === 'group' ? null : marker} onPick={v => { set('markers', null); set('marker', v === 'circle' ? null : v) }}
            items={[['circle', '●'], ['square', '■'], ['diamond', '◆'], ['triangle', '▲'], ['none', tr('None')]]} /></Line>
          <Line label=""><Check on={spec.markers === 'group'} onClick={() => set('markers', spec.markers === 'group' ? null : 'group')}>{tr('One shape per group')}</Check></Line>
        </>
      )],
      hasColors && ['fillsrc', null, tr('Colors: {name}', { name: spec.dataFill === false ? tr('by group') : tr('from data') }), tr('Point colors'), (
        <Line label=""><Check on={spec.dataFill !== false} onClick={() => set('dataFill', spec.dataFill === false ? null : false)}>{tr('Use the data sheet colors')}</Check></Line>
      )],
      ['trend', null, tr('Trend: {name}', { name: ttype ? TREND_NAME[ttype].toLowerCase() : tr('off') }), tr('Trend line'), (
        <>
          <Line label=""><Check on={!!ttype} onClick={() => set('trend', ttype ? null : 'linear')}>{tr('Trend line')}</Check></Line>
          {ttype && trendBody}
        </>
      )],
      ['parts', null, tr('Partitions: {n}', { n: parts.length || tr('none') }), tr('Partition lines'), (
        <>
          <Line label={tr('Add')}>
            <button type="button" className="chart-pop__link" onClick={() => addPart('x')}>{tr('Vertical')}</button>
            <button type="button" className="chart-pop__link" onClick={() => addPart('y')}>{tr('Horizontal')}</button>
            <button type="button" className="chart-pop__link" onClick={() => addPart('line')}>{tr('Oblique')}</button>
          </Line>
          {parts.length > 0 && <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('partitions', [])}>{tr('Remove all partitions')}</button></Line>}
          <div className="chart-pop__note">{tr('Drag a line to move it, Ctrl+drag to copy it, Shift to snap an oblique line’s angle. Click a zone to fill or name it.')}</div>
        </>
      )],
    ],
    point: pt ? [
      ['fill', <span className="chart-bar__dot" style={{ background: tok(pt.color) }} />, tr('Fill: {name}', { name: colorName(pt.color) }), tr('Point color'), (
        <Swatches palette={PALETTE} value={P.colors?.[pt.key] ?? pt.color} onPick={c => update('colors', c0 => ({ ...(c0 ?? {}), [pt.key]: c }))} />
      )],
      ['label', null, tr('Label: {state}', { state: hidden.has(pt.key) ? tr('hidden') : offsets[pt.key] ? tr('moved') : tr('shown') }), tr('This point’s label'), (
        <>
          <Line label=""><Check on={!hidden.has(pt.key)} onClick={() => toggleHidden(pt.key)}>{tr('Show this label')}</Check></Line>
          {offsets[pt.key] && <Line label=""><button type="button" className="chart-pop__link" onClick={() => update('labelOffsets', o => { const n = { ...(o ?? {}) }; delete n[pt.key]; return n })}>{tr('Place automatically')}</button></Line>}
        </>
      )],
      ['order', null, tr('Order: {name}', { name: (spec.front ?? []).includes(pt.key) ? tr('front') : (spec.back ?? []).includes(pt.key) ? tr('back') : tr('auto') }), tr('Drawing order'), (
        <Line label="">
          <button type="button" className="chart-pop__link" onClick={() => toFront(pt.key)}>{tr('Bring to front')}</button>
          <button type="button" className="chart-pop__link" onClick={() => toBack(pt.key)}>{tr('Send to back')}</button>
        </Line>
      )],
    ] : [],
    group: grpKeys.length ? [
      ['fill', <span className="chart-bar__dot" style={{ background: tok(scene.points.find(p => p.key === grpKeys[0])?.color) }} />, tr('Fill: {name}', { name: colorName(scene.points.find(p => p.key === grpKeys[0])?.color) }), tr('Color of every point in the group'), (
        <Swatches palette={PALETTE} value={null} onPick={c => update('colors', c0 => ({ ...(c0 ?? {}), ...Object.fromEntries(grpKeys.map(k => [k, c])) }))} />
      )],
      ['order', null, tr('Order'), tr('Drawing order of the group'), (
        <Line label="">
          <button type="button" className="chart-pop__link" onClick={() => toFront(grpKeys)}>{tr('Bring to front')}</button>
          <button type="button" className="chart-pop__link" onClick={() => toBack(grpKeys)}>{tr('Send to back')}</button>
        </Line>
      )],
    ] : [],
    labels: [
      ['textstyle', null, styleSummary(P), tr('Label color, font and size'), <TextStyle font={P.labelFont} pt={P.labelPt} color={P.labelColor} onFont={v => set('labelFont', v)} onPt={v => set('labelPt', v)} onColor={v => set('labelColor', v)} />],
      ['show', null, tr('Labels: {name}', { name: labelsOn ? tr('all') : tr('none') }), tr('Point labels'), (
        <>
          <Line label={tr('Show')}><Seg label={tr('Point labels')} value={labelsOn ? 'all' : 'none'} onPick={v => set('labels', v === labelsAuto ? null : v)} items={[['all', tr('All')], ['none', tr('None')]]} /></Line>
          {labelsAuto === 'none' && <div className="chart-pop__note">{tr('Over 300 points, labels are off by default.')}</div>}
        </>
      )],
      ['content', null, tr('Content: {name}', { name: `${content.map(k => CONTENT.find(c => c[0] === k)[1]).join(' + ') || tr('none')}${content2.length ? ` / ${content2.map(k => CONTENT.find(c => c[0] === k)[1]).join(' + ')}` : ''}` }), tr('Label content'), (
        <>
          <Line label={tr('Line 1')}>{CONTENT.filter(([k]) => k !== 'size' || hasSize).map(([k, l]) => <Check key={k} on={content.includes(k)} onClick={() => toggleIn('labelContent', k, ['name'])}>{l}</Check>)}</Line>
          <Line label={tr('Line 2')}>{CONTENT.filter(([k]) => k !== 'size' || hasSize).map(([k, l]) => <Check key={k} on={content2.includes(k)} onClick={() => toggleIn('label2', k, [])}>{l}</Check>)}</Line>
        </>
      )],
      ['place', null, tr('Placement: {name}', { name: moved ? tr('{n} moved', { n: moved }) : tr('auto') }), tr('Label placement'), (
        <>
          <div className="chart-pop__note">{tr('Drag a label to place it by hand; the others make room.')}</div>
          {moved > 0 && <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('labelOffsets', {})}>{tr('Place all labels automatically')}</button></Line>}
        </>
      )],
      // Labels dropped for lack of room (large size): counted, the value still shows on point hover.
      scene?.noRoom > 0 && ['noroom', null, tr('{n} hidden (no room)', { n: scene.noRoom }), tr('Labels left out for lack of room'), (
        <div className="chart-pop__note">{scene.noRoom > 1 ? tr('{n} labels did not fit at this size. Hover a point to read it, or reduce the size in Style.', { n: scene.noRoom }) : tr('{n} label did not fit at this size. Hover a point to read it, or reduce the size in Style.', { n: scene.noRoom })}</div>
      )],
      hidden.size > 0 && ['restore', null, tr('{n} hidden', { n: hidden.size }), tr('Labels hidden one by one'), (
        <Line label=""><button type="button" className="chart-pop__link" onClick={() => set('hiddenLabels', [])}>{tr('Show all hidden labels')}</button></Line>
      )],
    ],
    xaxis: axisControls('x'),
    yaxis: axisControls('y'),
    legend: [
      ['pos', null, tr('Legend: {name}', { name: (spec.legend ?? 'top') === 'none' ? tr('hidden') : tr('top') }), tr('Legend'), (
        <Line label={tr('Position')}><Seg label={tr('Legend')} value={spec.legend ?? 'top'} onPick={v => set('legend', v === 'top' ? null : v)} items={[['top', tr('Top')], ['none', tr('Hidden')]]} /></Line>
      )],
    ],
    trend: scene?.trend ? [
      ['type', null, tr('Type: {name}', { name: `${TREND_NAME[scene.trend.type].toLowerCase()}${scene.trend.group != null ? ` · ${scene.trend.group}` : ''}${scene.trend.weighted ? tr(' · weighted') : ''}` }), tr('Trend type and display'), trendBody],
      ['stats', null, `R² ${scene.trend.r2.toFixed(2)}`, tr('Fit of the trend line'), (
        <div className="chart-pop__note">{`${scene.trend.equation} · R² ${scene.trend.r2.toFixed(3)}`}</div>
      )],
    ] : [],
    partition: part ? [
      part.axis !== 'line' && ['at', null, tr('At: {n}', { n: part.value }), tr('Position'), (
        <Line label={tr('At')}><Field label={part.axis} numeric value={part.value} onCommit={v => v != null && patchPart(part.key, { value: v })} /></Line>
      )],
      part.axis === 'line' && ['at', null, tr('From ({x1}, {y1}) to ({x2}, {y2})', { x1: part.from.x, y1: part.from.y, x2: part.to.x, y2: part.to.y }), tr('Two points on the line'), (
        <>
          <Line label={tr('From')}>
            <Field label="x" numeric value={part.from.x} onCommit={v => v != null && patchPart(part.key, { from: { ...part.from, x: v } })} />
            <Field label="y" numeric value={part.from.y} onCommit={v => v != null && patchPart(part.key, { from: { ...part.from, y: v } })} />
          </Line>
          <Line label={tr('To')}>
            <Field label="x" numeric value={part.to.x} onCommit={v => v != null && patchPart(part.key, { to: { ...part.to, x: v } })} />
            <Field label="y" numeric value={part.to.y} onCommit={v => v != null && patchPart(part.key, { to: { ...part.to, y: v } })} />
          </Line>
          <div className="chart-pop__note">{tr('Drag an end to rotate (Shift snaps to 15°), the line to move it.')}</div>
        </>
      )],
      part.axis === 'line' && ['ptype', null, tr('Type: partition'), tr('Partition type'), (
        <Line label={tr('Type')}><Seg label={tr('Partition type')} value="partition" onPick={v => v !== 'partition' && partToTrend(part.key, v)}
          items={[['partition', tr('Partition')], ['*', tr('Trend: all points')], ...(groupNames.length > 1 ? groupNames.map(g => [g, tr('Trend: {name}', { name: g })]) : [])]} /></Line>
      )],
      part.axis === 'line' && ['above', null, tr('Above: {name}', { name: zones[`above:${part.key}`]?.fill ?? tr('none') }), tr('Zone above the line'), zoneBody(`above:${part.key}`)],
      part.axis === 'line' && ['below', null, tr('Below: {name}', { name: zones[`below:${part.key}`]?.fill ?? tr('none') }), tr('Zone below the line'), zoneBody(`below:${part.key}`)],
    ] : [],
    zone: zone ? [
      ['fill', zones[zone.key]?.fill ? <span className="chart-bar__dot" style={{ background: tok(zones[zone.key].fill) }} /> : null, tr('Fill: {name}', { name: zones[zone.key]?.fill ? colorName(zones[zone.key].fill) : tr('none') }), tr('Zone fill'), zoneBody(zone.key)],
    ] : [],
  }
  const actions = {
    chart: [
      { label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => sheetApi.setSheetOpen(true) },
      sheetApi.sheetEdited && { label: tr('Reset data to source'), onSelect: () => sheetApi.resetSheet() },
      '-',
      { label: ttype ? tr('Remove trend line') : tr('Add trend line'), onSelect: () => set('trend', ttype ? null : 'linear') },
      { label: tr('Add vertical partition'), onSelect: () => addPart('x') },
      { label: tr('Add horizontal partition'), onSelect: () => addPart('y') },
      { label: tr('Add oblique partition'), onSelect: () => addPart('line') },
      parts.length > 0 && { label: tr('Remove all partitions'), onSelect: () => set('partitions', []) },
    ],
    point: pt ? [
      { label: tr('Bring to front'), onSelect: () => toFront(pt.key) },
      { label: tr('Send to back'), onSelect: () => toBack(pt.key) },
      { label: hidden.has(pt.key) ? tr('Show this label') : tr('Hide this label'), onSelect: () => toggleHidden(pt.key) },
      pt.group != null && groupNames.length > 1 && { label: tr('Select group “{name}”', { name: pt.group }), shortcut: tr('Shift+click'), onSelect: () => open({ type: 'click', clientX: pick.anchor?.x ?? 0, clientY: pick.anchor?.y ?? 0, preventDefault() {}, stopPropagation() {} }, { obj: 'group', key: pt.group }) },
      { label: tr('Draw partition lines through {name}', { name: pt.label }), onSelect: () => setParts(list => [...list.filter(p => p.axis === 'line'), { key: 'x', axis: 'x', value: pt.vx }, { key: 'y', axis: 'y', value: pt.vy }]) },
    ] : [],
    group: grpKeys.length ? [
      { label: tr('Bring group to front'), onSelect: () => toFront(grpKeys) },
      { label: tr('Send group to back'), onSelect: () => toBack(grpKeys) },
      { label: tr('Hide the group’s labels'), onSelect: () => setHiddenMany(grpKeys, true) },
      { label: tr('Show the group’s labels'), onSelect: () => setHiddenMany(grpKeys, false) },
      { label: tr('Trend line of this group'), onSelect: () => { set('trendGroup', pick.key); set('trend', ttype ?? 'linear') } },
    ] : [],
    labels: [
      { label: labelsOn ? tr('Remove labels') : tr('Add labels'), onSelect: () => set('labels', labelsOn ? (labelsAuto === 'none' ? null : 'none') : (labelsAuto === 'all' ? null : 'all')) },
      moved > 0 && { label: tr('Place all labels automatically'), onSelect: () => set('labelOffsets', {}) },
    ],
    xaxis: [
      { label: spec.x?.log ? tr('Linear scale') : tr('Logarithmic scale'), onSelect: () => setAxis('x', 'log', spec.x?.log ? null : true) },
      { label: spec.x?.same ? tr('Same scale ({n} charts)', { n: groupCount('scatter-x|*') }) : tr('Same scale as other charts'), checked: !!spec.x?.same, onSelect: () => setAxis('x', 'same', spec.x?.same ? null : true) },
    ],
    yaxis: [
      { label: spec.y?.log ? tr('Linear scale') : tr('Logarithmic scale'), onSelect: () => setAxis('y', 'log', spec.y?.log ? null : true) },
      { label: spec.y?.same ? tr('Same scale ({n} charts)', { n: groupCount('scatter-y|*') }) : tr('Same scale as other charts'), checked: !!spec.y?.same, onSelect: () => setAxis('y', 'same', spec.y?.same ? null : true) },
    ],
    legend: [{ label: tr('Remove legend'), onSelect: () => set('legend', 'none') }],
    trend: [
      ...TRENDS.map(([v, , a]) => ({ label: a, checked: ttype === v, onSelect: () => set('trend', v) })),
      '-',
      ttype === 'linear' && { label: tr('Change to partition line'), onSelect: () => { trendToPart(); close() } },
      { label: tr('Remove trend line'), onSelect: () => set('trend', null) },
    ],
    partition: part ? [
      part.axis === 'line' && { label: tr('Change to trend line'), onSelect: () => partToTrend(part.key, '*') },
      { label: tr('Duplicate'), onSelect: () => setParts(list => [...list, { ...part, key: newKey() }]) },
      { label: tr('Remove this partition'), onSelect: () => { removePart(part.key); close() } },
    ] : [],
    zone: zone ? [
      zones[zone.key]?.fill && { label: tr('Remove fill'), onSelect: () => setZone(zone.key, { fill: null }) },
      zones[zone.key]?.label && { label: tr('Remove label'), onSelect: () => setZone(zone.key, { label: null }) },
    ] : [],
  }

  // ── Direct manipulation ──
  // A partition: dragging moves it; Ctrl+drag drops a copy.
  const dragPart = (e, p) => {
    if (e.button !== 0) return
    movedRef.current = false
    const sx = e.clientX, sy = e.clientY
    let key = p.key
    const copy = e.ctrlKey || e.metaKey
    track(e, (x, y, ev) => {
      if (!movedRef.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return
      if (!movedRef.current && copy) { key = newKey(); const k = key; setParts(list => [...list, { ...list.find(q => q.key === p.key), key: k }]) }
      movedRef.current = true
      // Snaps to the value of a nearby point (Alt = free).
      if (p.axis === 'x') patchPart(key, { value: ev.altKey ? Number(scene.invert.x(x).toPrecision(3)) : snapValue(scene, 'x', x) })
      else if (p.axis === 'y') patchPart(key, { value: ev.altKey ? Number(scene.invert.y(y).toPrecision(3)) : snapValue(scene, 'y', y) })
      else {
        const dx = ev.clientX - sx, dy = ev.clientY - sy
        const at = h => ({ x: Number(scene.invert.x(h.x + dx).toPrecision(3)), y: Number(scene.invert.y(h.y + dy).toPrecision(3)) })
        patchPart(key, { from: at(p.h1), to: at(p.h2) })
      }
    })
  }
  // An oblique line's end: rotates it (Shift = 15° angle steps); without Shift, it
  // snaps to a nearby data point (ends snap to values).
  const [snapTip, setSnapTip] = useState(null)
  const dragEnd = (e, p, end) => {
    const other = end === 'from' ? p.h2 : p.h1
    const up = () => { setSnapTip(null); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointerup', up)
    track(e, (x, y, ev) => {
      if (ev.shiftKey) {
        const q = constrainAngle(other, { x, y })
        setSnapTip(null)
        patchPart(p.key, { [end]: { x: Number(scene.invert.x(q.x).toPrecision(3)), y: Number(scene.invert.y(q.y).toPrecision(3)) } })
        return
      }
      const v = snapEndpoint(scene, { x, y })
      const sp = v.snapped ? scene.points.find(q => q.key === v.snapped) : null
      setSnapTip(sp ? { x: sp.x, y: sp.y, r: sp.r, text: sp.label } : null)
      patchPart(p.key, { [end]: { x: v.x, y: v.y } })
    })
  }
  // A dragged linear trend becomes a free partition that follows the pointer.
  const dragTrend = e => {
    if (e.button !== 0 || scene?.trend?.type !== 'linear') return
    movedRef.current = false
    const sx = e.clientX, sy = e.clientY
    const t = scene.trend
    let key = null
    track(e, (x, y, ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!movedRef.current && Math.hypot(dx, dy) < 4) return
      movedRef.current = true
      const at = (px, py) => ({ x: Number(scene.invert.x(px + dx).toPrecision(3)), y: Number(scene.invert.y(py + dy).toPrecision(3)) })
      if (!key) key = trendToPart(dx, dy)
      else patchPart(key, { from: at(t.x1, t.y1), to: at(t.x2, t.y2) })
    })
  }
  // The size legend bubble: dragging its edge changes its reference value.
  const dragLegendSize = (e, s) => track(e, x => { const v = sizeLegendFromDrag(scene, Math.abs(x - s.x)); if (v) set('sizeLegend', v) })
  // A label: placed by hand (offset in px from its point).
  const dragLabel = (e, l) => {
    if (e.button !== 0) return
    const p = scene.points.find(q => q.key === l.key)
    if (!p) return
    movedRef.current = false
    const sx = e.clientX, sy = e.clientY
    const dx0 = l.cx - p.x, dy0 = l.cy - p.y
    track(e, (x, y, ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!movedRef.current && Math.hypot(dx, dy) < 3) return
      movedRef.current = true
      update('labelOffsets', o => ({ ...(o ?? baseSpec.labelOffsets ?? {}), [l.key]: { dx: Math.round(dx0 + dx), dy: Math.round(dy0 + dy) } }))
    })
  }
  // A bubble's edge: all bubbles rescale together.
  const dragSize = (e, p) => {
    const s0 = spec.bubbleScale ?? 1
    track(e, (x, y) => set('bubbleScale', bubbleScaleFromDrag(s0, p.r, Math.hypot(x - p.x, y - p.y))))
  }
  const go = (o, extra = {}) => e => { if (e.type === 'click' && movedRef.current) { movedRef.current = false; return } setObj(null); open(e, { obj: o, ...extra }) }
  const clipId = `scatter-clip-${id}`
  const selPart = key => pick?.obj === 'partition' && pick.key === key
  // Labels hidden one by one are left out of the drawn scene.
  const shown = scene && !scene.empty && hidden.size ? { ...scene, labels: scene.labels.filter(l => !hidden.has(l.key)) } : scene
  const goPoint = p => e => (e.shiftKey && p.group != null ? go('group', { key: p.group }) : go('point', { key: p.key }))(e)
  const isOn = p => (pick?.obj === 'point' && pick.key === p.key) || grpKeys.includes(p.key)
  const partProps = readOnly ? undefined : (kind, it) => {
    switch (kind) {
      case 'legend': return { className: 'chart-engine-legend chart-engine-clickable', onClick: go('legend'), onContextMenu: go('legend') }
      case 'zone': {
        const on = pick?.obj === 'zone' && pick.key === it.key
        return { stroke: on ? tok('gold') : 'none', strokeWidth: on ? 1.5 : 0, className: 'chart-engine-clickable', onClick: go('zone', { key: it.key }), onContextMenu: go('zone', { key: it.key }), children: <title>{zoneName(it.key)}</title> }
      }
      case 'partition': return { stroke: tok(selPart(it.key) ? 'gold' : 'gray-500') }
      case 'partitionHit': return {
        className: it.axis === 'x' ? 'chart-engine-handle' : it.axis === 'y' ? 'chart-engine-handle--y' : 'chart-engine-handle--move',
        onPointerDown: e => dragPart(e, it), onClick: go('partition', { key: it.key }), onContextMenu: go('partition', { key: it.key }),
        children: <title>{tr('Drag to move the partition (Ctrl+drag to copy)')}</title>,
      }
      case 'partitionEnd': return {
        className: `chart-engine-knob${selPart(it.key) ? ' is-on' : ''}`, onPointerDown: e => dragEnd(e, it, it.end),
        children: <title>{tr('Drag to rotate (Shift snaps to 15°)')}</title>,
      }
      case 'trend': return { className: `chart-engine-clickable${it.type === 'linear' ? ' chart-engine-handle--move' : ''}`, onClick: go('trend'), onContextMenu: go('trend'), onPointerDown: dragTrend }
      case 'trendLine': return { stroke: tok(cur === 'trend' && pick ? 'gold' : it.color ?? 'gray-600') }
      case 'trendHit': return it.type === 'linear' ? { children: <title>{tr('Drag to turn the trend line into a partition')}</title> } : {}
      case 'point': return {
        className: `chart-engine-clickable${isOn(it) ? ' is-selected' : ''}`, onClick: goPoint(it), onContextMenu: goPoint(it),
        tabIndex: 0, role: 'button', 'aria-label': `${it.label}: ${it.vx}, ${it.vy}`,
      }
      case 'marker': return isOn(it) ? { stroke: tok('gold'), sw: 2 } : null
      case 'label': return {
        className: `chart-engine-clickable chart-engine-draglabel${cur === 'labels' && pick ? ' is-selected' : ''}`,
        onPointerDown: e => dragLabel(e, it), onClick: go('labels'), onContextMenu: go('labels'),
      }
      case 'xaxis': return { className: 'chart-engine-axis chart-engine-clickable', onClick: go('xaxis'), onContextMenu: go('xaxis') }
      case 'yaxis': return { className: 'chart-engine-axis chart-engine-clickable', onClick: go('yaxis'), onContextMenu: go('yaxis') }
      case 'axisHit': return {}
      case 'sizeHandle': return {
        className: `chart-engine-knob chart-engine-handle${spec.sizeLegend ? ' is-on' : ''}`,
        onPointerDown: e => dragLegendSize(e, it), onDoubleClick: e => { e.stopPropagation(); set('sizeLegend', null) },
        children: <title>{tr('Drag to change the reference bubble (double-click: largest bubble)')}</title>,
      }
      default: return null
    }
  }

  if (readOnly) {
    return (
      <div ref={boxRef} className="chart-engine chart-engine-box">
        {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
        <ScatterFigure scene={scene} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} clipId={clipId} />
      </div>
    )
  }

  return (
    <div ref={boxRef} className="chart-engine chart-engine-box" onContextMenu={e => { if (!e.defaultPrevented) open(e, { obj: 'chart' }) }} onDoubleClick={e => { if (!e.target.closest?.('.chart-datasheet, .chart-wheel, .chart-pop')) { close(); setObj(null); sheetApi.setSheetOpen(true) } }}>
      <EditedNote api={sheetApi} />
      <div className="chart-engine-float-menu">
        <button type="button" data-wheel-anchor className="chart-opts-btn" title={tr('Chart format: colours, labels and layout. Tip: click or right-click any part of the chart')} aria-label={tr('Chart format')}
          onClick={go('chart')}><IconPalette size={13} /></button>
      </div>
      {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}</div>}
      {scene && !scene.empty && (
        <ScatterFigure scene={shown} interactive={!readOnly} label={label} responsive={responsive} dataTable={dataTable} labelStyle={labelTextStyle(P)} part={partProps} clipId={clipId}>
          {bubble && pt && pick?.obj === 'point' && (
            <circle cx={pt.x + pt.r} cy={pt.y} r={4} className="chart-engine-knob is-on chart-engine-handle" onPointerDown={e => dragSize(e, pt)}>
              <title>{tr('Drag to resize all bubbles')}</title>
            </circle>
          )}
          {snapTip && (
            <g pointerEvents="none">
              <circle cx={snapTip.x} cy={snapTip.y} r={snapTip.r + 3} fill="none" stroke={tok('gold')} strokeWidth={1.5} />
              <text x={snapTip.x + snapTip.r + 6} y={snapTip.y - snapTip.r - 4} fill={tok('black')} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" style={{ fontSize: 10.5 }}>{snapTip.text}</text>
            </g>
          )}
        </ScatterFigure>
      )}
      {pick && (
        <FormatBar onOpenSheet={() => sheetApi.setSheetOpen(true)} key={`${pick.mode}|${pick.obj}|${pick.key}`} mode={pick.mode} anchor={pick.anchor} objects={objects} object={cur}
          onObject={setObj} controls={(controls[cur] ?? []).filter(Boolean)} actions={(actions[cur] ?? []).filter(Boolean)}
          onReset={reset} onUndo={undo} canUndo={canUndo} onClose={() => { close(); setObj(null) }} />
      )}
      {sheetApi.sheetOpen && <DataSheet api={sheetApi} layout={scatterSheet.layout} colors={Object.fromEntries((scene?.points ?? []).map(pt => [pt.key, pt.color]))} onClose={() => sheetApi.setSheetOpen(false)} />}
    </div>
  )
}
