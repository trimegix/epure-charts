// ─── epure-charts · chart view ──────────────────────────────────────────────
// Measures its container, resolves the series, calls buildScene, draws the scene
// through ChartFigure (the drawing, hook-free) and adds the editing layer
// (selection, menus, handles, data sheet). NO layout computation here: a wrong
// pixel is fixed in scene.js. Colors are tokens read as var(--…): the theme
// follows without CSS recoloring.
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { createPortal } from 'react-dom'
import { useCharts } from './useCharts'
import ChartHeader from './ChartHeader'
import { validateChartSpec, withDataDefaults } from './spec'
import { withDefaults } from './defaults'
import { buildScene, buildProfileScene, formatX, ROLE_TOKEN, estimateWidth, snapDateLo } from './scene'
import { useReadingPrefs } from './useReadingPrefs'
import { ChartWheel, ChartWheelButton } from './ChartWheel'
import DataSheet, { EditedNote } from './DataSheet'
import { makeFormatter } from './numberStyle'
import { cardGeometry } from './cardGeometry'
import { publishDomain, withdrawDomain, unionFor, breakFor, useSameScaleVersion, sameRangeFor, groupCount, offerX, xPartners, linkX, unlinkX, linkedTitles, fitSameScene, newXGroup } from './sameScale'
import { targetMark } from './useWheelPlacement'
import { lineMarks } from './barPlacement.js'
import { beginStep, endStep } from './chartPrefs'
import { devWarn } from './devWarn.js'
import BarhView from './BarhView.jsx'
import ChartFigure from './ChartFigure.jsx'
import { Swatch } from './chartMarks.jsx'

// A color is a palette token, or a user-picked hex (custom style).
import { tok, fsNote } from './customStyle.js'
import { SpecLocale, useT } from './uiLocale.js'

// Selection across the charts of the page (for "Set Same Scale"): the last
// selected scale object, per axis (y: value axis, segment, point; x: numeric X axis).
// Ctrl + click on another chart's axis puts them on the same scale; Ctrl + click on a segment
// or a point of another chart opens its menu with "Set same scale".
const crossAxis = { cur: null, x: null, n: 0 }
const rememberAxis = entry => { crossAxis.cur = entry }
const rememberX = entry => { crossAxis.x = entry }
// A unique name (timestamp): never a group saved by a previous session.
const newScaleGroup = () => newXGroup()

const grainSub = (tr, grain) => ({ quarter: tr('Quarterly'), year: tr('Annual'), category: tr('By company') })[grain]

// The box width: follows the CURRENT element (it changes when the chart rotates into bars)
// and ignores a detached element (its zero width would make the chart disappear).
// `fixed` (the `width` prop): no measuring at all (server rendering, static pages).
function useWidth(ref, fixed) {
  const [width, setWidth] = useState(fixed ?? 0)
  const obs = useRef({ el: null, ro: null })
  // No dependencies on purpose: the observed element can change between renders;
  // the guard (same element → nothing) prevents any loop.
  useIsoLayoutEffect(() => {
    if (fixed != null) return
    const el = ref.current
    if (el === obs.current.el) return
    obs.current.ro?.disconnect()
    obs.current = { el, ro: null }
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => { if (entry.target.isConnected && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width)) })
    ro.observe(el)
    obs.current.ro = ro
  })
  // On unmount (including strict mode's simulated unmount), the element is forgotten: the
  // remount reattaches it instead of assuming it is already observed.
  useEffect(() => () => { obs.current.ro?.disconnect(); obs.current = { el: null, ro: null } }, [])
  return fixed ?? width
}

// `selectedId` (optional): highlighted series, driven by the parent (the editor);
// `undefined` = the view manages it alone. `headerSlot`: controls to the right of the title
// (e.g. an edit pencil). `reading`: the view settings icon
// (useReadingPrefs), everywhere except in the editor preview, which
// carries its own content menu. `reading` can also be view settings that
// the host built itself (useReadingPrefs → { spec, sections, api })
// when it carries the icon in its own header (`bare` chart).
//
// For a host that already has its own closed list of series:
// `resolved` provides fully resolved series (the catalog is not read),
// `format(v, unit, dec)` the number formatter, `bare` removes the header
// (the host carries its own), `height` fixes the height, `legend={false}` removes
// the SVG legend.
//
// Static rendering: `width` fixes the drawing width (no measuring: server rendering,
// static pages; also the first width on hydration); `readOnly` draws the figure only
// (the spec and the series as given: no view settings, format bar, menus, data sheet
// or per-browser preferences, no shared scale); `responsive` scales the SVG to its
// container (ratio kept); `dataTable` adds the numbers as a visually hidden table.
// `applyPrefs` (with readOnly): the figure as its stored view settings and sheet edits
// draw it (a published format, see configurePrefs), still without any editing control.
//
// Small multiples (SmallMultiplesView): `basePrefs` layers this chart's view settings over
// a block's (useReadingPrefs `base`); `settingsButton={false}` leaves the settings icon to
// the block, a click on the chart still formats it alone.
// The interface (menus, format bar, messages) speaks the spec's language (spec.locale).
export default function ChartView(props) {
  return <SpecLocale spec={props.spec}><ChartViewBody {...props} /></SpecLocale>
}

function ChartViewBody({
  spec: specIn, currentId, onSelectSeries, selectedId, headerSlot, reading: readingIn = true,
  resolved: provided, format: formatProp, bare = false, height: fixedHeight, legend = true, menuSlot = null,
  width: widthProp, readOnly = false, responsive = false, dataTable = false, applyPrefs = false,
  basePrefs, settingsButton = true,
}) {
  const tr = useT()
  // Series passed in: the spec needs no catalog fields (version, kind, refs).
  const baseSpec = useMemo(() => (provided ? withDataDefaults(specIn) : specIn), [specIn, provided])
  const reading = readOnly ? false : readingIn
  const applied = !!reading || (readOnly && applyPrefs)
  const boxRef = useRef(null)
  const width = useWidth(boxRef, widthProp)
  const [hover, setHover] = useState(null)
  const [ownFocus, setFocus] = useState(null)
  const controlled = selectedId !== undefined
  const focus = controlled ? selectedId : ownFocus

  // Series: passed in (`resolved`), otherwise resolved by the host application (ChartsProvider).
  const charts = useCharts()
  const format = formatProp ?? charts.formatValue
  const Header = charts.Header ?? ChartHeader
  const resolved = useMemo(() => provided ?? charts.resolveSeries(baseSpec, { currentId }), [provided, baseSpec, currentId, charts])
  // View settings touch neither the series nor their references: `resolved` holds for both.
  const [readSpec, readingApi] = useReadingPrefs(baseSpec, resolved, { base: basePrefs })
  const external = reading && typeof reading === 'object' ? reading : null
  const spec = external ? external.spec : applied ? readSpec : baseSpec
  const api = external ? external.api : applied ? readingApi : null
  const [pick, setPick] = useState(null)
  // A label drag must not open its format bar on release.
  const labelDragged = useRef(false)
  // The plot frame: a manual scale (min / max) clips what falls outside.
  const clipId = `plot-${useId().replace(/:/g, '')}`
  // Number format: the chosen decimals rewrite the number of the
  // host-formatted figure, its scale included (€1.50B → €1.5B);
  // the magnitude (k / M / B) rewrites a euro amount entirely.
  const dec = api?.decimals ?? null
  const mag = api?.magnitude ?? null
  // Separators, symbol, negatives in parentheses, prefix / suffix (from the typed example).
  const num = api?.fmt?.num ?? null
  // The edited data sheet replaces the input series (the source data stays read-only).
  const all = api?.sheetResolved ?? resolved
  const fmt = useMemo(() => makeFormatter(format, dec, mag, num), [format, dec, mag, num])
  // The axis can keep its own format (one format per object).
  const ax = api?.fmt?.axisNum
  const fmtAxis = useMemo(() => (ax ? makeFormatter(format, ax.decimals ?? null, ax.magnitude ?? null, ax.num ?? null) : null), [format, ax])
  // The real formatters, for the format preview in the format bar.
  const formatters = useMemo(() => ({ value: fmt, axis: fmtAxis ?? fmt }), [fmt, fmtAxis])
  const full = useMemo(() => withDefaults(spec, all), [spec, all])
  // The one validation of the live and the static entries (buildScene → scene.errors).
  const errors = useMemo(() => validateChartSpec(full, { resolved: all }), [full, all])
  // Fluid height: follows the width within a readable range.
  const height = fixedHeight ?? Math.round(Math.min(320, Math.max(220, width * 0.4)))
  // The settings button floats in the plot corner (chart without header or slot): its area is reserved.
  const floatMenu = bare && reading === true && settingsButton && !menuSlot
  const natural = useMemo(
    () => (width > 0 ? buildScene(full, all, { width, height, format: fmt, formatAxis: fmtAxis, legend, ...(floatMenu ? { menuBox: { w: 34, h: 30 } } : {}) }) : null),
    [full, all, width, height, fmt, fmtAxis, legend, floatMenu],
  )
  // Shared scale ("Set Same Scale"): the natural extent is
  // published, the union of the group's charts is drawn.
  // A named group ("A", "B"): only its members share the scale; true = the whole page.
  // A group set by the host (spec.scaleGroup: the charts of one page) applies by default;
  // "Reset to independent scale" turns it off (same: false).
  const ownSame = api?.fmt?.yAxis?.left?.same
  // Read-only: a static figure, from its own data (neither published nor read from a group).
  const sameGroup = readOnly || ownSame === false ? null : ownSame ?? spec.scaleGroup ?? null
  const same = !!sameGroup
  const groupKey = sameGroup === true ? '*' : String(sameGroup ?? '')
  const sameV = useSameScaleVersion()
  const leftAx = natural?.axes?.left
  const natUnit = leftAx?.unit
  const natLo = leftAx?.domain?.[0]
  const natHi = leftAx?.domain?.[1]
  // A manually scaled chart does not publish its extent: it does not impose it on others.
  const manualOwn = Number.isFinite(full.format?.yAxis?.left?.min) || Number.isFinite(full.format?.yAxis?.left?.max)
  // A member's axis break propagates to the whole group.
  const ownBreak = full.format?.yAxis?.left?.break ?? null
  useEffect(() => {
    if (!same || manualOwn || natLo == null || natHi == null) { withdrawDomain(clipId); return undefined }
    publishDomain(clipId, `${groupKey}|${natUnit}`, natLo, natHi, ownBreak)
    return () => withdrawDomain(clipId)
  }, [same, manualOwn, natUnit, natLo, natHi, clipId, groupKey, ownBreak])
  // Same scale on the X axis (two line charts cover the same date range):
  // a numeric X axis (dates, numbers) publishes its extent, the group's union is drawn.
  const xSame = api?.fmt?.xAxis?.same ?? null
  const xGroupKey = xSame === true ? '*' : String(xSame ?? '')
  const natX = natural?.axes?.x
  const xKind = natX?.kind
  const xLo = natX?.domain?.[0]
  const xHi = natX?.domain?.[1]
  // The plot width is published too: same scale = same days per pixel.
  const natPlotW = natural?.plot?.width ? Math.round(natural.plot.width * 100) / 100 : null
  useEffect(() => {
    const xid = `${clipId}|x`
    if (!xSame || !xKind || xLo == null || xHi == null) { withdrawDomain(xid); return undefined }
    publishDomain(xid, `x|${xGroupKey}|${xKind}`, xLo, xHi, null, natPlotW)
    return () => withdrawDomain(xid)
  }, [xSame, xGroupKey, xKind, xLo, xHi, natPlotW, clipId])
  const scene = useMemo(() => {
    if (!natural) return natural
    const fs = full.format ?? {}
    let format = fs
    // A manual min / max wins over the shared scale.
    const manualL = Number.isFinite(fs.yAxis?.left?.min) || Number.isFinite(fs.yAxis?.left?.max)
    const u = same && !manualL && leftAx ? unionFor(`${groupKey}|${leftAx.unit}`) : null
    if (u) {
      const gb = fs.yAxis?.left?.break ?? breakFor(`${groupKey}|${leftAx.unit}`)
      format = { ...format, yAxis: { ...(fs.yAxis ?? {}), left: { ...(fs.yAxis?.left ?? {}), min: u[0], max: u[1], break: gb ?? undefined } } }
    }
    const xf = fs.xAxis ?? {}
    const xRange = w => sameRangeFor(`x|${xGroupKey}|${xKind}`, w,
      xKind === 'date' ? (lo, hi) => snapDateLo(lo, hi, xf.dateUnit, Number(xf.weekStart) || 0) : undefined, [xLo, xHi])
    const ux = xSame && xKind ? xRange(natPlotW) : null
    const build = f => buildScene({ ...full, format: f }, all, { width, height, format: fmt, formatAxis: fmtAxis, legend, ...(floatMenu ? { menuBox: { w: 34, h: 30 } } : {}) })
    // Same X scale: the range follows the plot width actually drawn (same px per day everywhere).
    if (ux) return fitSameScene(r => build({ ...format, xAxis: { ...(fs.xAxis ?? {}), min: r[0], max: r[1] } }), xRange, natPlotW)
    if (format === fs) return natural
    return build(format)
    // sameV: the union changed elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, same, sameV, xSame, full, all, width, height, fmt, fmtAxis, legend])
  // Development: say why a requested annotation is not drawn (once per message).
  useEffect(() => { for (const w of scene?.warnings ?? []) devWarn(`chart "${spec.id}": ${w}`) }, [scene, spec.id])
  // The drawn plot width is republished: the other members match their density to it.
  const drawnW = scene?.plot?.width ? Math.round(scene.plot.width * 100) / 100 : null
  useEffect(() => {
    if (xSame && xKind && xLo != null && xHi != null && drawnW && drawnW !== natPlotW) publishDomain(`${clipId}|x`, `x|${xGroupKey}|${xKind}`, xLo, xHi, null, drawnW)
  }, [xSame, xGroupKey, xKind, xLo, xHi, natPlotW, drawnW, clipId])
  // This chart offers itself to others for "Set same scale with <title>" (numeric X axis only).
  const offerRef = useRef(null)
  useEffect(() => { offerRef.current = { api, title: spec.title } })
  const hasApi = !!api
  useEffect(() => {
    if (!hasApi || !xKind) return undefined
    return offerX(`${clipId}|x`, {
      kind: xKind, get title() { return offerRef.current?.title }, alive: () => !!boxRef.current?.isConnected,
      group: () => offerRef.current?.api?.fmt?.xAxis?.same ?? null,
      link: g => offerRef.current?.api?.setFmt('xAxis.same', g),
    })
  }, [hasApi, xKind, clipId])
  // The value axis offers itself too: a Ctrl + click group left with a single chart dissolves (unlinkX).
  useEffect(() => {
    if (!hasApi) return undefined
    return offerX(`${clipId}|y`, {
      kind: 'y', get title() { return offerRef.current?.title }, alive: () => !!boxRef.current?.isConnected,
      group: () => offerRef.current?.api?.fmt?.yAxis?.left?.same ?? null,
      link: g => offerRef.current?.api?.setFmt('yAxis.left.same', g),
    })
  }, [hasApi, clipId])
  // The subtitle states the grain; a date axis (YYYY-MM-DD categories) gets none.
  // `spec.subtitle` overrides the subtitle derived from the grain ('' or false: none). The
  // grain subtitle describes a catalog chart; series passed in (`resolved`) get none.
  const subtitle = baseSpec.subtitle !== undefined ? (baseSpec.subtitle || undefined)
    : provided || scene?.axes?.x?.kind === 'date' ? undefined : grainSub(tr, baseSpec.x?.grain ?? spec.x?.grain) || undefined

  // Profile chart: lines rotated by 90°, one row
  // per category (tall enough to read), lines only.
  const profileOn = !!api?.fmt?.profile && !!natural && !natural.empty && natural.bars.length === 0
  const rowsN = natural?.columns?.filter(c => !String(c.key).startsWith('_')).length ?? 0
  const pScene = useMemo(
    () => (profileOn && width > 0 ? buildProfileScene(full, all, { width, height: Math.max(height, rowsN * 30 + 70), format: fmt, formatAxis: fmtAxis, legend }) : null),
    [profileOn, full, all, width, height, rowsN, fmt, fmtAxis, legend],
  )

  const select = id => {
    if (!controlled) setFocus(f => (f === id ? null : id))
    onSelectSeries?.(id)
  }
  const dim = id => (focus && focus !== id ? 0.25 : 1)

  const onMove = e => {
    if (!scene || scene.empty) return
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = scene.columns.findIndex(c => mx >= c.x0 && mx < c.x1)
    // During a drag (button down), no hover: the band would follow the pointer.
    setHover(i >= 0 && !(e.buttons & 1) ? i : null)
    if (e.shiftKey !== shiftOn) setShiftOn(e.shiftKey)
  }

  // ── Annotations adjustable with the mouse (handles) ─────────────────────────
  // Clicking the label of a CAGR, a difference arrow or a value line
  // added from the wheel selects it: its handles adjust it (snapped
  // to columns), Delete or the cross removes it, Escape deselects it.
  // Markers added by the host itself are not selectable.
  const [sel, setSel] = useState(null) // { kind: 'cagr', i } | { kind: 'diff' } | { kind: 'vline' }
  // An arrow or line from the list (format.diffs / format.valueLines) carries its index `i`;
  // without an index, it is the one from the original view settings (only one).
  const removeSel = cur => {
    if (cur?.kind === 'cagr') api.removeCagr(cur.i)
    if (cur?.kind === 'diff') { if (cur.i != null) api.removeDiff(cur.i); else api.setDiff('', '') }
    if (cur?.kind === 'vline') { if (cur.i != null) api.removeValueLine(cur.i); else api.setValueLine(null, '') }
  }
  // Hint shown when a handle is dragged back to automatic ("Automatic" tooltip).
  const [dragHint, setDragHint] = useState(null)
  // Spots offered while dragging a label (highlighted positions).
  const [labelCands, setLabelCands] = useState(null)
  // Shift + hover: the range a Shift + click would select.
  const [shiftOn, setShiftOn] = useState(false)
  // Dragging the value axis: the two possible positions, the target highlighted.
  const [axisDrop, setAxisDrop] = useState(null)
  const [band, setBand] = useState(null)
  const axisMoved = useRef(false)
  const lo = api?.fmt?.legendOffset
  const legendShift = lo && Number.isFinite(lo.dx) && Number.isFinite(lo.dy) ? lo : null
  const keyNear = mx => scene.columns.filter(c => !String(c.key).startsWith('_'))
    .reduce((b, c) => (!b || Math.abs(c.cx - mx) < Math.abs(b.cx - mx) ? c : b), null)?.key
  const valueNear = (side, my) => {
    const ax = scene.axes[side] ?? scene.axes.left
    const t = ax?.allTicks ?? []
    if (t.length < 2) return null
    // The exact inverse of the scale (breaks and log included); otherwise interpolation between ticks.
    const v = ax.invert ? ax.invert(my) : t[0].value + ((my - t[0].y) * (t.at(-1).value - t[0].value)) / (t.at(-1).y - t[0].y)
    const step = Math.abs(t[1].value - t[0].value) / 10 || 1
    const dec = Math.max(0, -Math.floor(Math.log10(step)))
    return Number((Math.round(v / step) * step).toFixed(dec))
  }
  const drag = (e, onMove, onUp) => {
    e.preventDefault(); e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    const move = ev => { const r = svg.getBoundingClientRect(); onMove(ev.clientX - r.left, ev.clientY - r.top, ev) }
    // One drag = a single undo step (Ctrl+Z).
    beginStep()
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onUp?.(); endStep() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // Spots offered for a value label (drag icon, highlighted
  // positions): above, top, middle, bottom of a bar; above,
  // below, right, left of a line point. As offsets from its original position.
  const labelSpots = l => {
    const [sid, k] = String(l.key).split('|')
    const w = estimateWidth(l.text, l.size)
    const homeX = l.moved ? l.ox : l.x
    const homeY = l.moved ? l.oy + l.size * 0.35 : l.y
    // The text center at its original position (the anchor can be at the start or the end).
    const cx0 = l.anchor === 'start' ? homeX + w / 2 : l.anchor === 'end' ? homeX - w / 2 : homeX
    const b = scene.bars.find(x => x.seriesId === sid && x.key === k)
    const p = !b && scene.lines.find(x => x.seriesId === sid)?.points.find(q => q.key === k)
    const mid = b ? b.x + b.width / 2 : p ? p.x : null
    if (mid == null) return []
    const spots = b
      ? [[mid, b.y - 4], [mid, b.y + l.size + 3], [mid, b.y + b.height / 2 + l.size * 0.36], [mid, b.y + b.height - 4]].filter((_, i) => i === 0 || b.height >= l.size + 6)
      : [[mid, p.y - 7], [mid, p.y + l.size + 6], [mid + 8 + w / 2, p.y + l.size * 0.36], [mid - 8 - w / 2, p.y + l.size * 0.36]]
    return [{ dx: 0, dy: 0, home: true, x: cx0, y: homeY, w, h: l.size }, ...spots.map(([x, y]) => ({ dx: x - cx0, dy: y - homeY, x, y, w, h: l.size }))]
      .filter((c, i, arr) => arr.findIndex(o => Math.hypot(o.dx - c.dx, o.dy - c.dy) < 4) === i)
  }
  const dragLabel = (e, l) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || l.rotate) return
    const svg = e.currentTarget.ownerSVGElement
    const r0 = svg.getBoundingClientRect()
    const x0 = e.clientX - r0.left, y0 = e.clientY - r0.top
    // Shift + drag: all selected labels move together.
    const group = e.shiftKey && isLabelSel(l) ? scene.labels.filter(isLabelSel).map(x => x.key) : [l.key]
    const before = api.fmt.labels?.offsets ?? {}
    labelDragged.current = false
    // A single label: its offered spots, as offsets from its original position.
    const cands = group.length === 1 ? labelSpots(l) : []
    let last = null
    let lastPt = null
    // The drag and the final snap form a single step: Ctrl+Z puts the label back where it came from.
    beginStep()
    const move = ev => {
      const r = svg.getBoundingClientRect()
      const dx = ev.clientX - r.left - x0, dy = ev.clientY - r.top - y0
      if (!labelDragged.current && Math.hypot(dx, dy) < 4) return
      lastPt = { x: ev.clientX, y: ev.clientY }
      if (!labelDragged.current && cands.length) setLabelCands(cands)
      labelDragged.current = true
      const next = { ...before }
      for (const k of group) { const p0 = before[k] ?? { dx: 0, dy: 0 }; next[k] = { dx: Math.round(p0.dx + dx), dy: Math.round(p0.dy + dy) } }
      last = next[l.key]
      api.setFmt('labels.offsets', next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setLabelCands(null)
      // The dragged label stays selected (its format bar comes back at its new position).
      if (labelDragged.current && lastPt && group.length === 1) {
        const pt = lastPt
        setTimeout(() => openLabel({ type: 'click', clientX: pt.x, clientY: pt.y - 12, currentTarget: null, target: null, preventDefault() {}, stopPropagation() {} }, l.key, l.text), 0)
      }
      // Released near an offered spot: it snaps there (the original spot clears the offset).
      const near = last && cands.reduce((b, c) => { const d = Math.hypot(c.dx - last.dx, c.dy - last.dy); return d < 16 && (!b || d < b.d) ? { ...c, d } : b }, null)
      if (near) {
        const next = { ...(api.fmt.labels?.offsets ?? {}) }
        if (near.home) delete next[l.key]
        else next[l.key] = { dx: Math.round(near.dx), dy: Math.round(near.dy) }
        api.setFmt('labels.offsets', Object.keys(next).length ? next : null)
      }
      endStep()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // Moves an end (fromKey / toKey) without ever placing it on the other one.
  const dragEnd = (e, a, end, apply) => {
    let cur = end === 'from' ? a.fromKey : a.toKey
    const other = end === 'from' ? a.toKey : a.fromKey
    drag(e, mx => { const k = keyNear(mx); if (k && k !== cur && k !== other) { cur = k; apply(k) } })
  }
  // The annotations owned by the wheel, with their geometry in the scene.
  const owned = !api || !scene || scene.empty ? [] : scene.annotations.flatMap(a => {
    if (a.type === 'cagr') {
      const i = (api.cagrs ?? []).findIndex(c => c.from === a.fromKey && c.to === a.toKey)
      return i < 0 ? [] : [{ a, id: { kind: 'cagr', i }, px: a.mx, py: a.my, w: a.pillW }]
    }
    if (a.type === 'diff') return [{ a, id: a.fi != null ? { kind: 'diff', i: a.fi } : { kind: 'diff' }, px: a.px ?? (a.xa + a.xb) / 2, py: a.py ?? a.yTop, w: a.pillW }]
    if (a.type === 'valueLine' && a.user) return [{ a, id: a.fi != null ? { kind: 'vline', i: a.fi } : { kind: 'vline' } }]
    return []
  })
  const isSel = id => sel && sel.kind === id.kind && (id.kind === 'note' || (sel.i ?? null) === (id.i ?? null))

  // ── Chart objects are selectable ────────────────────────────────────────────
  // Left or right click on an object: the panel opens on that object's tab
  // (series, value axis, category axis, label, legend,
  // annotation); right-click on the plot background: the chart tab.
  // Ctrl / Cmd / Shift + click on a bar adds it to the selection.
  const ids = (spec.series ?? []).map(sr => sr.id)
  // Left click: the object's format bar; right-click (or the Menu key): its action menu.
  const open = (e, obj) => {
    if (!api) return
    e.preventDefault(); e.stopPropagation()
    const ctrl = e.ctrlKey || e.metaKey
    // Both charts join the same scale group (the first one's, otherwise a new one).
    const join = (prev, path) => { const g = prev.group() || newScaleGroup(); prev.apply(g); api.setFmt(path, g) }
    const entry = path => ({ id: clipId, apply: g => api.setFmt(path, g), alive: () => !!boxRef.current?.isConnected,
      group: () => { const v = path.split('.').reduce((o, k) => o?.[k], api.fmt); return typeof v === 'string' ? v : null } })
    const leftObj = (obj.tab === 'yaxis' && (obj.side ?? 'left') === 'left') || (obj.tab === 'series' && (api.axisOf?.(obj.seriesId) ?? 'left') === 'left')
    if (leftObj) {
      const prev = crossAxis.cur
      if (ctrl && prev && prev.id !== clipId && prev.alive()) {
        // An axis: immediately; a segment or a point: its menu offers "Set same scale".
        if (obj.tab === 'yaxis') { join(prev, 'yAxis.left.same'); obj = { ...obj, sameWith: true } }
        else obj = { ...obj, crossScale: () => join(prev, 'yAxis.left.same'), forceMenu: true }
      }
      rememberAxis(entry('yAxis.left.same'))
      obj = { ...obj, ySameCount: same && natUnit ? groupCount(`${groupKey}|${natUnit}`) : 0, yUnlink: () => unlinkX(`${clipId}|y`) }
    }
    // Numeric X axis (dates, numbers): same gesture, a group specific to the X axis.
    if (obj.tab === 'xaxis' && scene?.axes?.x?.kind) {
      const prev = crossAxis.x
      if (ctrl && prev && prev.id !== clipId && prev.alive()) { join(prev, 'xAxis.same'); obj = { ...obj, sameWith: true } }
      rememberX(entry('xAxis.same'))
      // How many charts already share the X scale (the menu shows the active state).
      // Other charts with the same axis type: "Set same scale with <title>" links them one by one.
      const xid = `${clipId}|x`
      obj = { ...obj, xNumeric: true, xPartners: xPartners(scene.axes.x.kind, xid),
        xLink: ids => linkX(xid, ids), xUnlink: () => unlinkX(xid), xLinked: () => linkedTitles(xid) }
    }
    setSel(null)
    // The format bar sits above the object (its top), the menu at the cursor.
    const r = e.currentTarget?.getBoundingClientRect?.()
    const cx = e.clientX || (r ? r.left + r.width / 2 : 0)
    const cy = e.type === 'contextmenu' ? (e.clientY || (r ? r.top + r.height / 2 : 0)) : (r ? r.top : e.clientY)
    // The whole card (header included): the format bar never leaves it.
    const geo = cardGeometry(boxRef.current)
    const box = geo.box
    const svgR = boxRef.current?.querySelector('svg')?.getBoundingClientRect()
    // Menu of a vertical axis: next to its line, without covering its ticks.
    const menuX = e.type === 'contextmenu' && obj.tab === 'yaxis' && svgR && scene
      ? (obj.side === 'right' ? svgR.left + scene.plot.right - 8 : svgR.left + scene.plot.left + 8) : cx
    const menuY = cy
    // The chart's marks (bars, numbers, annotations), in screen coordinates: a menu
    // opens on the side that covers the fewest.
    const marks = svgR && scene ? [
      ...scene.bars.map(b => ({ x: b.x, y: b.y, w: b.width, h: b.height, weight: 1 })),
      ...scene.labels.map(l => ({ x: l.x - 22, y: l.y - 11, w: 44, h: 14, weight: 4 })),
      ...scene.annotations.filter(a => a.pillW).map(a => ({ x: (a.mx ?? a.px ?? (a.xa + a.xb) / 2) - a.pillW / 2, y: (a.my ?? a.py ?? a.yTop) - 9, w: a.pillW, h: 18, weight: 4 })),
      ...scene.legend.map(it => ({ x: it.x, y: scene.legendY + it.y - 9, w: it.width, h: 18, weight: 4 })),
      // Curves (Plan…): the format bar does not sit on them.
      ...scene.lines.flatMap(l => lineMarks(l.points, 2)),
      // The clicked object's ticks are never covered (very high weight).
      ...scene.axes.x.ticks.map(t => ({ x: t.x - 22, y: scene.axes.x.y + 2, w: 44, h: 30, weight: obj.tab === 'xaxis' ? 200 : 3 })),
      ...['left', 'right'].flatMap(sd => (scene.axes[sd]?.ticks ?? []).map(t => ({ x: sd === 'left' ? scene.axes[sd].x - 50 : scene.axes[sd].x, y: t.y - 7, w: 50, h: 14, weight: obj.tab === 'yaxis' ? 200 : 3 }))),
    ].map(m => ({ x: svgR.left + m.x, y: svgR.top + m.y, w: m.w, h: m.h, weight: m.weight })).concat(geo.headMarks ?? [], targetMark(e)) : []
    // The clicked point, as a fraction of the plot: where "Add text label" places its text.
    const at = svgR && scene?.plot ? { atFx: Math.max(0, Math.min(1, (e.clientX - svgR.left - scene.plot.left) / scene.plot.width)), atFy: Math.max(0, Math.min(1, (e.clientY - svgR.top - scene.plot.top) / scene.plot.height)) } : {}
    // A column break only affects the scale's outlier (the highest value).
    if (obj.tab === 'xaxis' && obj.key && scene) {
      const topOf = k => { const vs = scene.bars.filter(b => b.key === k).map(b => b.value); return api.bars === 'clustered' ? Math.max(...vs, -Infinity) : vs.filter(v => v > 0).reduce((a, v) => a + v, 0) }
      const colTop = topOf(obj.key)
      const others = [...scene.columns.filter(c => c.key !== obj.key).map(c => topOf(c.key)), ...scene.lines.flatMap(l => l.points.map(p => p.value))]
      obj = { ...obj, breakable: Number.isFinite(colTop) && colTop > Math.max(...others, -Infinity) }
    }
    // Rotated view: the geometry is that of the drawn horizontal bars (read from the DOM).
    const marksOut = api.fmt?.horizontal && boxRef.current
      // The bars and numbers actually painted (not the rows' transparent click areas)
      // (neither transparent click areas nor a row's gray hover band).
      ? [...boxRef.current.querySelectorAll('svg rect, svg text')].filter(el => el.tagName === 'text' || !/^(transparent|none)$|gray-100/.test(el.getAttribute('fill') ?? ''))
        .map(el => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height, weight: el.tagName === 'text' ? 4 : 3 } })
        .filter(m => m.w > 0 && m.h > 0 && m.w < 2000).concat(geo.headMarks ?? [])
      : marks
    // Rotated view, right-click: the menu opens to the right of the neighbouring rows' bars (the empty area),
    // never over their ends and numbers.
    let menuXOut = menuX
    let menuYOut = menuY
    if (api.fmt?.horizontal && e.type === 'contextmenu' && box) {
      // The vertical band (one menu high) whose bars and numbers end early enough
      // for the menu to fit on their right; the one nearest the click.
      // Within the chart only (from its legend row down): never over the header and its settings button.
      const MENU_W = 215, MENU_H = 180
      const top0 = svgR ? svgR.top : box.top + 8
      const painted = marksOut.filter(m => m.weight >= 3)
      const tops = [...new Set([top0, ...painted.map(m => Math.round(m.y))])].filter(y => y >= top0 && y + MENU_H <= box.bottom).sort((a, b) => Math.abs(a - menuY) - Math.abs(b - menuY))
      const fit = tops.map(y => ({ y, right: Math.max(box.left, ...painted.filter(m => m.y < y + MENU_H && m.y + m.h > y).map(m => m.x + m.w)) + 10 }))
        .find(c => c.right + MENU_W <= box.right - 4)
      if (fit) { menuXOut = fit.right; menuYOut = fit.y }
      // The card header (title, settings button) is a heavy obstacle: the menu stays inside the chart.
      marksOut.push({ x: box.left, y: box.top, w: box.right - box.left, h: Math.max(0, top0 - box.top), weight: 60 })
    }
    setPick({ ...obj, ...at, mode: e.type === 'contextmenu' || obj.forceMenu ? 'menu' : 'mini', cx: menuXOut, cy: menuYOut, marks: marksOut, plotTop: svgR && scene ? svgR.top + scene.plot.top : null, lineTop: geo.lineTop, minLeft: geo.minLeft, auditRight: geo.auditRight, box: box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null })
  }
  // Keyboard: Enter opens the format bar, Shift+F10 or the Menu key opens the action menu.
  const onObjKey = (e, obj) => {
    if (e.key === 'Enter' || e.key === ' ') open(e, obj)
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) open({ ...e, type: 'contextmenu', preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), currentTarget: e.currentTarget, clientX: 0, clientY: 0 }, obj)
  }
  const openLabel = (e, labelKey, labelText) => {
    const [head, key] = String(labelKey ?? '').split('|')
    // A stack total is formatted as such (not like a series' labels).
    if (head === 'total') return open(e, { tab: 'labels', labelKey, total: true, seriesId: ids[0] })
    const seriesId = ids.includes(head) ? head : ids[0]
    const k = ids.includes(head) && key ? key : null
    open(e, { tab: 'labels', seriesId, labelKey, labelText, key: k, keyLabel: k ? formatX(k, spec.x?.grain) : null })
  }
  // The axis being edited is visible: line and ticks in the accent color (like a bar's outline).
  const isBarSel = b => pick?.tab === 'series' && (pick.points ?? (pick.key ? [{ seriesId: pick.seriesId, key: pick.key }] : [])).some(q => q.seriesId === b.seriesId && q.key === b.key)
  // All labels being edited light up (the "On Sales" scope), not only the clicked one.
  // A click selects ONE label; Ctrl+A extends to the series' labels (pick.allLabels).
  const isLabelSel = l => pick?.tab === 'labels' && (pick.allLabels === 'chart' || (pick.total ? l.key.startsWith('total|') : pick.labelKey && !pick.allLabels ? l.key === pick.labelKey : l.key.startsWith(`${pick.seriesId}|`)))
  const isAxisSel = side => pick?.tab === 'yaxis' && (pick.side ?? 'left') === side
  // The category axis, with the category under the cursor (to break the axis there).
  const xAxisObj = e => {
    const mx = e.clientX - e.currentTarget.ownerSVGElement.getBoundingClientRect().left
    const k = keyNear(mx)
    return { tab: 'xaxis', key: k ?? null, keyLabel: k ? formatX(k, spec.x?.grain) : null }
  }
  const openLine = (e, l) => {
    if (!api) select(l.seriesId)
    const mx = e.clientX - e.currentTarget.ownerSVGElement.getBoundingClientRect().left
    const near = l.points.reduce((b, p) => (!b || Math.abs(p.x - mx) < Math.abs(b.x - mx) ? p : b), null)
    // Ctrl / Cmd + click: the point is added to the selection (connectors, arrows between two points).
    if ((e.ctrlKey || e.metaKey) && pick?.tab === 'series' && near) {
      e.preventDefault(); e.stopPropagation()
      const pts = pick.points ?? (pick.key ? [{ seriesId: pick.seriesId, key: pick.key }] : [])
      const has = pts.some(p => p.seriesId === l.seriesId && p.key === near.key)
      setPick({ ...pick, points: has ? pts.filter(p => !(p.seriesId === l.seriesId && p.key === near.key)) : [...pts, { seriesId: l.seriesId, key: near.key }] })
      return
    }
    open(e, { tab: 'series', seriesId: l.seriesId, key: near?.key ?? null, keyLabel: near ? formatX(near.key, spec.x?.grain) : null })
  }
  const openBar = (e, b) => {
    // The selection shows by its outline: the other series do not fade.
    if (!api) select(b.seriesId)
    const multi = (e.ctrlKey || e.metaKey || e.shiftKey) && pick?.tab === 'series'
    // Shift+click: the whole range of the same series, from the selected segment to this one.
    if (multi && e.shiftKey && pick.key && pick.seriesId === b.seriesId) {
      e.preventDefault()
      const ks = scene.columns.map(c => c.key)
      const [i0, i1] = [ks.indexOf(pick.key), ks.indexOf(b.key)].sort((p, q) => p - q)
      setPick({ ...pick, points: ks.slice(i0, i1 + 1).filter(k => scene.bars.some(x => x.seriesId === b.seriesId && x.key === k)).map(k => ({ seriesId: b.seriesId, key: k })) })
      return
    }
    if (multi) {
      e.preventDefault()
      const pts = pick.points ?? (pick.key ? [{ seriesId: pick.seriesId, key: pick.key }] : [])
      const has = pts.some(p => p.seriesId === b.seriesId && p.key === b.key)
      setPick({ ...pick, points: has ? pts.filter(p => !(p.seriesId === b.seriesId && p.key === b.key)) : [...pts, { seriesId: b.seriesId, key: b.key }] })
      return
    }
    open(e, { tab: 'series', seriesId: b.seriesId, key: b.key, keyLabel: formatX(b.key, spec.x?.grain) })
  }
  // A selected annotation can also be adjusted with the keyboard: the value
  // line moves up or down one step with the arrow keys.
  const nudge = dir => {
    const side = owned.find(o => o.id.kind === 'vline' && (o.id.i ?? null) === (sel?.i ?? null))?.a.axis ?? 'left'
    // One step = one unit of the displayed format (1 if values are ≥ 10, otherwise 0.1).
    const top = Math.abs(scene.axes[side]?.domain?.[1] ?? 10)
    const step = top >= 10 ? 1 : 0.1
    if (sel?.i != null) {
      const v = api.valueLines?.[sel.i]?.value
      if (Number.isFinite(v)) api.setValueLineAt(sel.i, { value: Number((v + dir * step).toFixed(6)) })
      return
    }
    const cur = Number(String(api.prefs.valueLine).replace(',', '.'))
    if (Number.isFinite(cur)) api.setValueLine(Number((cur + dir * step).toFixed(6)))
  }
  const resetValueLine = () => api.setValueLine(api.meanOfTotals())

  useEffect(() => {
    if (!sel) return undefined
    const onKey = e => {
      if (e.key === 'Escape') setSel(null)
      if (sel.kind === 'vline' && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault(); nudge(e.key === 'ArrowUp' ? 1 : -1)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault(); removeSel(sel); setSel(null)
      }
    }
    const onDown = e => { if (!e.target.closest?.('[data-ann]')) setSel(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  })

  // Ctrl / Cmd + A in stages: the series, then all elements of the same type;
  // on a label: all labels of its series.
  useEffect(() => {
    if (pick?.tab === 'labels' && scene) {
      const onKeyL = e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); setPick(cur => ({ ...cur, allLabels: cur.allLabels ? 'chart' : true })) }
      }
      document.addEventListener('keydown', onKeyL)
      return () => document.removeEventListener('keydown', onKeyL)
    }
    if (pick?.tab !== 'series' || !scene) return undefined
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault()
        setPick(cur => {
          const ofSeries = scene.bars.filter(b => b.seriesId === cur.seriesId)
          const has = (cur.points ?? []).length
          // 1st press: the whole series; 2nd: all bars of the chart; 3rd: all labels.
          if (has >= scene.bars.length && scene.bars.length && scene.labels.length) return { ...cur, tab: 'labels', labelKey: null, allLabels: 'chart', points: undefined }
          const pts = has >= ofSeries.length && ofSeries.length ? scene.bars : ofSeries
          return { ...cur, points: pts.map(b => ({ seriesId: b.seriesId, key: b.key })) }
        })
      }
      // Ctrl+Alt+Shift + arrow: extends the selection to the neighbouring bar of the
      // series (right / left in time, above / below in the stack).
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key.startsWith('Arrow') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault()
        setPick(cur => {
          const pts = cur.points ?? (cur.key ? [{ seriesId: cur.seriesId, key: cur.key }] : [])
          if (!pts.length) return cur
          const last = pts.at(-1)
          const ks = scene.columns.map(c => c.key)
          let next = null
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const i = ks.indexOf(last.key) + (e.key === 'ArrowRight' ? 1 : -1)
            if (i >= 0 && i < ks.length && scene.bars.some(b => b.seriesId === last.seriesId && b.key === ks[i])) next = { seriesId: last.seriesId, key: ks[i] }
          } else {
            const col = scene.bars.filter(b => b.key === last.key).sort((a, b) => a.y - b.y)
            const i = col.findIndex(b => b.seriesId === last.seriesId) + (e.key === 'ArrowUp' ? -1 : 1)
            if (i >= 0 && i < col.length) next = { seriesId: col[i].seriesId, key: last.key }
          }
          if (!next || pts.some(p => p.seriesId === next.seriesId && p.key === next.key)) return cur
          return { ...cur, points: [...pts, next] }
        })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pick?.tab, scene])

  // Keyboard selection (Alt + arrows): from a segment to its neighbour (left / right
  // in the series, above / below in the column); its format bar follows.
  useEffect(() => {
    if (!scene || !api || !pick) return undefined
    const onKey = e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return
      // Tab / Shift+Tab act as Alt+→ / Alt+← (from an element to the next one of the same type),
      // except inside the format bar, where Tab cycles through its controls.
      const tab = e.key === 'Tab' && !e.altKey && !e.target.closest?.('.chart-wheel')
      if (!tab && (!e.altKey || e.shiftKey || !e.key.startsWith('Arrow'))) return
      const dir = tab ? (e.shiftKey ? 'ArrowLeft' : 'ArrowRight') : e.key
      const step = dir === 'ArrowRight' || dir === 'ArrowDown' ? 1 : -1
      // Labels: the next one in reading order (left → right, top → bottom).
      if (pick.tab === 'labels' && pick.labelKey) {
        const ls = scene.labels.filter(l => !l.key.startsWith('total|') || pick.total).sort((a, b) => a.x - b.x || a.y - b.y)
        const i = ls.findIndex(l => l.key === pick.labelKey)
        const nx = ls[i + step]
        if (i < 0 || !nx) return
        e.preventDefault(); e.stopImmediatePropagation()
        const svgR = boxRef.current?.querySelector('svg')?.getBoundingClientRect()
        openLabel({ type: 'click', clientX: svgR ? svgR.left + nx.x : 0, clientY: svgR ? svgR.top + nx.y - nx.size : 0, currentTarget: null, target: null, preventDefault() {}, stopPropagation() {} }, nx.key, nx.text)
        return
      }
      // Annotations: the next one among those owned by the view settings.
      if (pick.tab === 'annotation' && pick.ann && pick.ann.kind !== 'note') {
        const i = owned.findIndex(o => o.id.kind === pick.ann.kind && (o.id.i ?? null) === (pick.ann.i ?? null))
        const nx = owned[(i + step + owned.length) % owned.length]
        if (i < 0 || !nx || owned.length < 2) return
        e.preventDefault(); e.stopImmediatePropagation()
        const svgR = boxRef.current?.querySelector('svg')?.getBoundingClientRect()
        const ax = nx.px ?? (nx.a.x1 + nx.a.x2) / 2, ay = nx.py ?? nx.a.y
        open({ type: 'click', clientX: svgR ? svgR.left + ax : 0, clientY: svgR ? svgR.top + ay - 9 : 0, currentTarget: null, target: null, preventDefault() {}, stopPropagation() {} }, { tab: 'annotation', ann: nx.id })
        setSel(nx.id)
        return
      }
      if (pick.tab !== 'series' || !pick.key) return
      const ks = scene.columns.map(c => c.key).filter(k => !String(k).startsWith('_'))
      const sid = pick.seriesId
      let next = null
      if (dir === 'ArrowLeft' || dir === 'ArrowRight') {
        const d = step
        for (let i = ks.indexOf(pick.key) + d; i >= 0 && i < ks.length && !next; i += d) {
          if (scene.bars.some(b => b.seriesId === sid && b.key === ks[i]) || scene.lines.some(l => l.seriesId === sid && l.points.some(p => p.key === ks[i]))) next = { seriesId: sid, key: ks[i] }
        }
      } else {
        const col = scene.bars.filter(b => b.key === pick.key).sort((a, b) => a.y - b.y)
        const i = col.findIndex(b => b.seriesId === sid) + (dir === 'ArrowUp' ? -1 : 1)
        if (i >= 0 && i < col.length) next = { seriesId: col[i].seriesId, key: pick.key }
      }
      if (!next) return
      e.preventDefault(); e.stopImmediatePropagation()
      const el = boxRef.current?.querySelector(`[aria-label="${next.seriesId} ${next.key}"]`)
      el?.focus({ preventScroll: true })
      // A line point has no element of its own: the format bar is placed at its coordinates.
      const svgR = boxRef.current?.querySelector('svg')?.getBoundingClientRect()
      const lp = scene.lines.find(l => l.seriesId === next.seriesId)?.points.find(p => p.key === next.key)
      const px = svgR && lp ? svgR.left + lp.x : 0, py = svgR && lp ? svgR.top + lp.y : 0
      open({ type: 'click', clientX: px, clientY: py, target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} },
        { tab: 'series', seriesId: next.seriesId, key: next.key, keyLabel: formatX(next.key, spec.x?.grain) })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // A period without any number (a gap in the time axis) opens no tooltip.
  // While editing an object that is not a series, no hover band: it would suggest a single year is being edited.
  const col = hover != null && !api?.sheetOpen && scene?.columns[hover]?.items.length && (!pick || pick.tab === 'series') ? scene.columns[hover] : null

  // The chart's format bar / menu (shared by the column view and the rotated view).
  const wheel = pick && api && (
          <ChartWheel formatters={formatters} key={`${pick.mode}|${pick.tab}|${pick.seriesId}|${pick.key}|${pick.side}|${pick.labelKey}|${pick.points?.length ?? 0}|${pick.ann?.kind ?? ''}${pick.ann?.i ?? ''}`} api={api} pick={pick}
            labelInfo={scene?.noRoom > 0 || scene?.labelCap ? { noRoom: scene.noRoom, cap: scene.labelCap ?? null } : null}
            onResetValueLineAt={i => api.setValueLineAt(i, { value: api.meanOfTotals() })}
            anchor={{ x: pick.cx, y: pick.cy, align: pick.mode === 'menu' ? 'cursor' : 'beside', box: pick.box, plotTop: pick.plotTop, lineTop: pick.lineTop, minLeft: pick.minLeft, auditRight: pick.auditRight, marks: pick.marks }}
            onMode={(mode, ctl) => setPick(p => ({ ...p, mode, ctl: ctl ?? null }))}
            onDeleteLabel={k => { api.setFmt('labels.hidden', [...new Set([...(api.fmt.labels?.hidden ?? []), k])]); setPick(null) }}
            onResetValueLine={resetValueLine}
            // An added annotation is selected right away (handles and its format bar).
            onAnnAdded={(kind, i) => { setTimeout(() => { const id = i != null ? { kind, i } : { kind }; setSel(id); setPick(p => ({ ...p, tab: 'annotation', ann: id, mode: 'bar' })) }, 0) }}
            // An added text opens right away in edit mode (its field focused, as with F2).
            onAddNote={() => {
              const notes = [...(api.fmt.notes ?? []), { fx: pick.atFx ?? 0.5, fy: pick.atFy ?? 0.1, text: tr('Text') }]
              api.setFmt('notes', notes)
              setPick(p => ({ ...p, tab: 'annotation', ann: { kind: 'note', i: notes.length - 1 }, mode: 'bar', ctl: 'text' }))
            }}
            // Closing releases all series (no more highlighting).
            onClose={() => { setPick(null); if (!controlled) setFocus(null) }} />
        )

  // An empty chart opens its sheet automatically, once.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (scene?.empty && api && !api.sheetOpen && !autoOpened.current) { autoOpened.current = true; api.setSheetOpen(true) }
  }, [scene?.empty, api])
  // Free text linked to the sheet: "{B2}" shows that cell's value and follows its edits.
  const noteText = t => String(t || tr('Text')).replace(/\{([A-Z]{1,2})(\d+)\}/g, (m, col, row) => {
    const sh = api?.sheet
    const r = sh?.rows?.[Number(row) - 2]
    const ci = [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 2
    if (!r) return m
    if (ci < 0) return r.name
    const c = r.cells?.[ci]
    return c?.value == null ? '–' : typeof c.value === 'number' ? fmt(c.value, api.unitOf?.(r.id) ?? 'M') : String(c.value)
  })
  if (pScene && !pScene.empty) {
    const P = pScene
    const openP = (e, l) => open(e, { tab: 'series', seriesId: l.seriesId })
    const catClick = c => (api ? { className: 'chart-engine-clickable', onClick: e => open(e, { tab: 'xaxis', key: c.key, keyLabel: c.label }), onContextMenu: e => open(e, { tab: 'xaxis', key: c.key, keyLabel: c.label }) } : null)
    const valueClick = api ? { className: 'chart-engine-clickable', onClick: e => open(e, { tab: 'yaxis', side: 'left' }), onContextMenu: e => open(e, { tab: 'yaxis', side: 'left' }) } : null
    const profilePart = (kind, it) => {
      if (kind === 'legend') return { onContextMenu: e => open(e, { tab: 'legend' }) }
      if (kind === 'line') return {
        className: 'chart-engine-clickable', onClick: e => openP(e, it), onContextMenu: e => openP(e, it),
        tabIndex: api ? 0 : undefined, role: api ? 'button' : undefined, 'aria-label': tr('{series} profile line', { series: it.seriesId }),
        onKeyDown: api ? e => onObjKey(e, { tab: 'series', seriesId: it.seriesId }) : undefined,
      }
      if (kind === 'catTick') return catClick(it)
      if (kind === 'valueTick') return valueClick
      return null
    }
    return (
      <div className="chart-engine" onContextMenu={api ? e => { if (!e.defaultPrevented) open(e, { tab: 'chart' }) } : undefined}>
        {!bare && (
          <Header title={spec.title} sub={subtitle}
            menu={reading && settingsButton ? <>{headerSlot}<ChartWheelButton api={api} formatters={formatters} /></> : headerSlot} />
        )}
        <div ref={boxRef} className="chart-engine-box">
          <ChartFigure scene={P} interactive={!readOnly} scope={clipId} label={spec.title} responsive={responsive} dataTable={dataTable} part={profilePart}
            layers={{ under: api && !readOnly && <rect x={P.plot.left} y={P.plot.top} width={P.plot.width} height={P.plot.height} fill="transparent" onContextMenu={e => open(e, { tab: 'chart' })} /> }}
            onDoubleClick={api ? () => { setPick(null); api.setSheetOpen(true) } : undefined} />
          {wheel}
        </div>
        {api?.sheetOpen && (
          <DataSheet api={api} format={fmt} grain={spec.x?.grain}
            colors={Object.fromEntries((full.series ?? []).map(sr => [sr.id, ROLE_TOKEN[sr.style?.color] ?? sr.style?.color]))}
            onClose={() => api.setSheetOpen(false)} />
        )}
      </div>
    )
  }
  // Rotated: the same bars, horizontal (BarhView);
  // a title button brings the columns back.
  // Combo: lines follow the rotation, read row to row over the bars.
  if (api?.fmt?.horizontal && scene && !scene.empty && scene.bars.length) {
    const sers = (full.series ?? []).filter(s => (s.mark ?? 'bar') !== 'area')
    const rows = scene.columns.map(c => ({ key: c.key, label: c.label, values: Object.fromEntries(c.items.map(it => [it.seriesId, it.value])) }))
    // A single precision for all numbers (labels and axis), as in columns.
    const allV = rows.flatMap(r => Object.values(r.values)).filter(Number.isFinite)
    const hDec = api.decimals ?? (Math.max(...allV.map(Math.abs)) >= 10 ? 0 : 1)
    const unitH = sers[0] ? api.unitOf?.(sers[0].id) : 'M'
    // A single owner: the chart's format bar and menu (the column ones); the horizontal view
    // only draws. Click or right-click anywhere → the chart menu.
    return (
      <div className="chart-engine" onContextMenu={e => { e.preventDefault(); open(e, { tab: 'chart' }) }}>
        {!bare && (
          <Header title={spec.title} sub={subtitle}
            menu={reading && settingsButton ? <>{headerSlot}<ChartWheelButton api={api} formatters={formatters} /></> : headerSlot} />
        )}
        {/* The measured box stays the same: the width follows, and switching back to columns is immediate. */}
        <div ref={boxRef} className="chart-engine-box chart-engine-clickable" onClickCapture={e => { e.stopPropagation(); open(e, { tab: 'chart' }) }}>
        <BarhView id={`${spec.id}-h`} rows={rows} readOnly={readOnly} format={v => fmt(v, unitH, hDec)}
          reading={false} muted={!!pick}
          onRotate={pick?.tab === 'chart' ? () => { api.setFmt('horizontal', null); setPick(null) } : null}
          spec={{ series: sers.map(s => ({ id: s.id, mark: s.mark === 'line' ? 'line' : undefined, label: scene.legend.find(l => l.seriesId === s.id)?.label ?? scene.endLabels.find(l => l.seriesId === s.id)?.text ?? s.id, color: scene.bars.find(b => b.seriesId === s.id)?.color ?? scene.lines.find(l => l.seriesId === s.id)?.color, pattern: api.fmt.patterns?.[s.id] ?? null })), stacked: api.bars !== 'clustered', stacked100: api.bars === 'stacked100',
            // Grouped: a row tall enough for each bar to carry its number legibly.
            rowHeight: api.bars === 'clustered' ? Math.max(28, sers.length * 15 + 10) : 28 }} />
        </div>
        {wheel}
        {/* The sheet of a rotated chart: categories as rows. */}
        {api.sheetOpen && (
          <DataSheet api={api} format={fmt} grain={spec.x?.grain}
            colors={Object.fromEntries((full.series ?? []).map(sr => [sr.id, ROLE_TOKEN[sr.style?.color] ?? sr.style?.color]))}
            onClose={() => api.setSheetOpen(false)} />
        )}
      </div>
    )
  }

  // ── The editing layer, drawn through ChartFigure ────────────────────────────
  // part(kind, item): handlers, selection and highlight of each drawn element;
  // layers: hit areas, outlines and handles at their depth in the drawing.
  const isSelSide = side => isAxisSel(side)
  const legendItemKey = (e, it) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (api) open(e, { tab: 'legend' }); else select(it.seriesId) } }
  const part = readOnly ? undefined : (kind, it) => {
    switch (kind) {
      case 'legend': return {
        className: `chart-engine-legend${pick?.tab === 'legend' ? ' is-selected' : ''}`,
        onContextMenu: e => open(e, { tab: 'legend' }),
        onPointerDown: api && pick?.tab === 'legend' ? e => {
          if (e.button !== 0) return
          const r0 = e.currentTarget.ownerSVGElement.getBoundingClientRect()
          const sx = e.clientX - r0.left, sy = e.clientY - r0.top
          const o = legendShift ?? { dx: 0, dy: 0 }
          drag(e, (mx, my) => api.setFmt('legendOffset', { dx: Math.round(o.dx + mx - sx), dy: Math.round(o.dy + my - sy) }))
        } : undefined,
        onDoubleClick: api && legendShift ? e => { e.stopPropagation(); api.setFmt('legendOffset', null) } : undefined,
      }
      // With view settings, a click selects the legend; without, it highlights the series.
      case 'legendItem': return {
        opacity: dim(it.seriesId), className: 'chart-engine-clickable',
        onClick: e => (api ? open(e, { tab: 'legend' }) : select(it.seriesId)),
        tabIndex: 0, role: 'button', 'aria-label': it.text, onKeyDown: e => legendItemKey(e, it),
      }
      case 'area': return { fillOpacity: it.opacity * dim(it.seriesId) }
      case 'bar': return {
        opacity: it.opacity * dim(it.seriesId), className: `chart-engine-clickable${isBarSel(it) ? ' is-selected' : ''}`,
        onClick: e => openBar(e, it), onContextMenu: e => openBar(e, it),
        tabIndex: api ? 0 : undefined, role: api ? 'button' : undefined, 'aria-label': api ? `${it.seriesId} ${it.key}` : undefined,
        onKeyDown: api ? e => onObjKey(e, { tab: 'series', seriesId: it.seriesId, key: it.key, keyLabel: formatX(it.key, spec.x?.grain) }) : undefined,
      }
      case 'line': return {
        opacity: dim(it.seriesId), className: 'chart-engine-clickable',
        onClick: e => openLine(e, it), onContextMenu: e => openLine(e, it),
        tabIndex: api ? 0 : undefined, role: api ? 'button' : undefined,
        'aria-label': `${scene.legend.find(x => x.seriesId === it.seriesId)?.label ?? scene.endLabels.find(x => x.seriesId === it.seriesId)?.text ?? it.seriesId} line`,
        onKeyDown: api ? e => onObjKey(e, { tab: 'series', seriesId: it.seriesId }) : undefined,
      }
      // The text of a user-added value line is clickable (its format bar), double-click = average.
      case 'valueLineText': {
        const on = api && it.user
        return {
          'data-ann': it.user ? '' : undefined, pointerEvents: on ? 'auto' : 'none', className: on ? 'chart-engine-clickable' : undefined,
          onClick: on ? e => { const id = it.fi != null ? { kind: 'vline', i: it.fi } : { kind: 'vline' }; open(e, { tab: 'annotation', ann: id }); setSel(id) } : undefined,
          onDoubleClick: on ? e => { e.stopPropagation(); if (it.fi != null) api.setValueLineAt(it.fi, { value: api.meanOfTotals() }); else resetValueLine() } : undefined,
        }
      }
      case 'connector': case 'errorBar': case 'cagr': return { opacity: dim(it.seriesId) }
      // Free texts: a click edits them, a drag moves them.
      case 'note': return api ? {
        className: `chart-engine-clickable${pick?.ann?.kind === 'note' && pick.ann.i === it.i ? ' is-selected' : ''}`, pointerEvents: undefined,
        onPointerDown: e => {
          if (e.button !== 0) return
          const svg = e.currentTarget.ownerSVGElement
          const r0 = svg.getBoundingClientRect()
          const sx = e.clientX - r0.left, sy = e.clientY - r0.top
          labelDragged.current = false
          drag(e, (mx, my) => {
            if (!labelDragged.current && Math.hypot(mx - sx, my - sy) < 4) return
            labelDragged.current = true
            const notes = [...(api.fmt.notes ?? [])]
            notes[it.i] = { ...notes[it.i], fx: Math.max(0, Math.min(1, (mx - scene.plot.left) / scene.plot.width)), fy: Math.max(0, Math.min(1, (my - scene.plot.top) / scene.plot.height)) }
            api.setFmt('notes', notes)
          })
        },
        onClick: e => { if (labelDragged.current) { labelDragged.current = false; return } open(e, { tab: 'annotation', ann: { kind: 'note', i: it.i } }) },
        onContextMenu: e => open(e, { tab: 'annotation', ann: { kind: 'note', i: it.i } }),
      } : null
      case 'labels': return { pointerEvents: api ? undefined : 'none' }
      case 'label': return {
        opacity: focus && !it.key.startsWith(`${focus}|`) && !it.key.startsWith('total|') ? 0.25 : 1,
        ...(api ? {
          className: `chart-engine-clickable${isLabelSel(it) ? ' is-selected' : ''}`,
          onClick: e => { if (labelDragged.current) { labelDragged.current = false; return } openLabel(e, it.key, it.text) },
          // Dragging a label moves it; the position is kept, "Reset label positions" restores it.
          onPointerDown: e => dragLabel(e, it), onContextMenu: e => openLabel(e, it.key, it.text),
        } : {}),
        // Drawn on a fill (inside its bar): the selection shows as an underline (the
        // selection color would be illegible on the segment).
        style: it.on && isLabelSel(it) ? { textDecoration: 'underline' } : undefined,
      }
      case 'endLabel': return {
        opacity: dim(it.seriesId), className: 'chart-engine-clickable',
        // The name at the end of a line selects its series (its format bar), by click or keyboard.
        onClick: api ? ev => open(ev, { tab: 'series', seriesId: it.seriesId }) : () => select(it.seriesId),
        tabIndex: api ? 0 : undefined, role: api ? 'button' : undefined, 'aria-label': `${it.text} series`,
        onKeyDown: api ? ev => onObjKey(ev, { tab: 'series', seriesId: it.seriesId }) : undefined,
        onContextMenu: api ? ev => open(ev, { tab: 'legend', seriesLabels: true }) : undefined,
        // Dragging a series name onto the legend moves it into the legend.
        onPointerDown: api ? ev => {
          if (ev.button !== 0) return
          const svg = ev.currentTarget.ownerSVGElement
          let lastY = null
          const move = m => { lastY = m.clientY - svg.getBoundingClientRect().top }
          const up = () => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
            if (lastY != null && lastY < scene.plot.top - 4) api.setFmt(api.fmt.legend === 'series' ? 'legend' : 'endLabels', api.fmt.legend === 'series' ? null : false)
          }
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
        } : undefined,
      }
      // Table columns: click the header to bring the category back to the chart.
      case 'tableHead': return api ? {
        className: 'chart-engine-clickable', pointerEvents: undefined,
        onClick: e => open(e, { tab: 'xaxis', key: it.key, keyLabel: it.header }), onContextMenu: e => open(e, { tab: 'xaxis', key: it.key, keyLabel: it.header }),
      } : null
      // The axis being edited is visible: line and ticks in the accent color.
      case 'yAxisLine': return isSelSide(it.side) ? { stroke: tok('gold'), strokeWidth: 2 } : null
      case 'yTick': return isSelSide(it.side) ? { style: { fill: 'var(--gold-dark)', fontWeight: 600 } } : null
      // Axis title: can be dragged along the axis.
      case 'yTitle': return api ? {
        className: 'chart-engine-handle--y', pointerEvents: undefined,
        onPointerDown: e => { if (e.button !== 0) return; const base = it.y - (it.axis.titleOffset ?? 0); drag(e, (_, my) => api.setFmt(`yAxis.${it.side}.titleOffset`, Math.round(Math.max(scene.plot.top, Math.min(scene.plot.bottom, my)) - base))) },
        onDoubleClick: () => api.setFmt(`yAxis.${it.side}.titleOffset`, null),
      } : null
      case 'xAxisLine': return pick?.tab === 'xaxis' ? { stroke: tok('gold'), strokeWidth: 2 } : null
      case 'xTick': return pick?.tab === 'xaxis' ? { style: { fill: 'var(--gold-dark)', fontWeight: 600 } } : null
      case 'xTitle': return api ? {
        className: 'chart-engine-handle', pointerEvents: undefined,
        onPointerDown: e => { if (e.button !== 0) return; const mid = (scene.plot.left + scene.plot.right) / 2; drag(e, mx => api.setFmt('xAxis.titleOffset', Math.round(Math.max(scene.plot.left, Math.min(scene.plot.right, mx)) - mid))) },
        onDoubleClick: () => api.setFmt('xAxis.titleOffset', null),
      } : null
      // Data table row headers (a series moved under the axis).
      case 'rowHead': return api ? { className: 'chart-engine-clickable', pointerEvents: undefined, onClick: e => open(e, { tab: 'series', seriesId: it.seriesId }) } : null
      default: return null
    }
  }
  // A value axis is clickable (its tab), and draggable to the other side when selected.
  const axisClick = (side, e) => {
    const ax = scene.axes[side]
    if (axisMoved.current) { axisMoved.current = false; return }
    // The break is placed where the user clicked ("Add Break" at the pointer): one step wide.
    const my = e.clientY - e.currentTarget.ownerSVGElement.getBoundingClientRect().top
    const v = valueNear(side, my), [lo, hi] = ax.domain ?? []
    const half = (ax.step || 0) / 2
    const atBreak = !ax.log && v != null && half > 0 && v - half > lo && v + half < hi ? { from: Number((v - half).toFixed(10)), to: Number((v + half).toFixed(10)) } : null
    open(e, { tab: 'yaxis', side, atBreak })
  }
  // Selected axis: drag it to the other side of the plot (highlighted positions).
  const axisDrag = (side, e) => {
    if (e.button !== 0 || !isAxisSel(side)) return
    const svgEl = e.currentTarget.ownerSVGElement
    const sx = e.clientX - svgEl.getBoundingClientRect().left
    axisMoved.current = false
    let target = null
    drag(e, mx => {
      if (!axisMoved.current && Math.abs(mx - sx) < 6) return
      axisMoved.current = true
      const mid = (scene.plot.left + scene.plot.right) / 2
      target = (side === 'left' ? mx > mid : mx < mid) ? (side === 'left' ? 'right' : 'left') : null
      setAxisDrop({ side, target })
    }, () => {
      setAxisDrop(null)
      if (target) api.series.filter(x => api.axisOf(x.value) === side).forEach(x => api.setSeries(x.value, { axis: target }))
    })
  }
  const layers = readOnly || !scene || scene.empty ? undefined : {
    under: <>
      {/* Selected legend: its width handle (resize the frame, the text wraps). */}
      {api && pick?.tab === 'legend' && scene.legend.length > 1 && (() => {
        const right = Math.max(...scene.legend.map(it => it.x + (it.width ?? 60)))
        const top = scene.legendY + Math.min(...scene.legend.map(it => it.y)) - 8
        return (
          <rect data-wheel-anchor x={right + 4} y={top} width={6} height={16} rx={2} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
            className="chart-engine-handle" onPointerDown={e => drag(e, mx => api.setFmt('legendWidth', Math.round(Math.max(80, mx))))}
            onDoubleClick={() => api.setFmt('legendWidth', null)}><title>{tr('Drag to resize the legend (double-click: full width)')}</title></rect>
        )
      })()}
      {/* The plot background: right-click → the chart menu. */}
      {api && <rect x={scene.plot.left} y={scene.plot.top} width={scene.plot.width} height={scene.plot.height} fill="transparent"
        onContextMenu={e => open(e, { tab: 'chart' })}
        // Selection rectangle (rubber band): dragging over the background selects the bars it touches.
        onPointerDown={e => {
          if (e.button !== 0) return
          const r0 = e.currentTarget.ownerSVGElement.getBoundingClientRect()
          const sx = e.clientX - r0.left, sy = e.clientY - r0.top
          let box = null, last = null
          drag(e, (mx, my, ev) => {
            last = ev
            if (!box && Math.hypot(mx - sx, my - sy) < 5) return
            box = { x0: Math.min(sx, mx), x1: Math.max(sx, mx), y0: Math.min(sy, my), y1: Math.max(sy, my) }
            setBand(box)
          }, () => {
            setBand(null)
            if (!box) return
            const hit = scene.bars.filter(b => b.x < box.x1 && b.x + b.width > box.x0 && b.y < box.y1 && b.y + b.height > box.y0)
            if (!hit.length) return
            const f = hit[0]
            open({ type: 'click', clientX: last?.clientX ?? 0, clientY: last?.clientY ?? 0, preventDefault() {}, stopPropagation() {}, currentTarget: null },
              { tab: 'series', seriesId: f.seriesId, key: f.key, keyLabel: formatX(f.key, spec.x?.grain), points: hit.map(b => ({ seriesId: b.seriesId, key: b.key })) })
          })
        }} />}
      {band && <rect x={band.x0} y={band.y0} width={band.x1 - band.x0} height={band.y1 - band.y0} fill={tok('gold-light')} fillOpacity={0.25} stroke={tok('gold')} strokeDasharray="3 2" pointerEvents="none" />}
      {/* Hover: period band */}
      {col && !pick && !sel && <rect x={col.x0} y={scene.plot.top} width={col.x1 - col.x0} height={scene.plot.height} fill={tok('gray-100')} />}
    </>,
    // A gridline is clickable: the value axis tab, gridlines section.
    grid: api && scene.gridlines.map((g, i) => (
      <line key={`gh${i}`} x1={g.x1} x2={g.x2} y1={g.y} y2={g.y} stroke="transparent" strokeWidth={4} className="chart-engine-clickable"
        onClick={e => open(e, { tab: 'yaxis', side: 'left', section: 'grid' })} onContextMenu={e => open(e, { tab: 'yaxis', side: 'left', section: 'grid' })} />
    )),
    // Selected bars (Ctrl + click): an accent outline.
    bars: pick?.tab === 'series' && (pick.points ?? (pick.key ? [{ seriesId: pick.seriesId, key: pick.key }] : [])).map(p => {
      const b = scene.bars.find(x => x.seriesId === p.seriesId && x.key === p.key)
      if (b) return <rect key={`sel-${p.seriesId}|${p.key}`} x={b.x - 2} y={b.y - 2} width={b.width + 4} height={b.height + 4} rx={3}
        fill="none" stroke={tok('gold')} strokeWidth={1.5} pointerEvents="none" />
      // A selected line point: an accent ring (only in multiple selection).
      const lp = pick.points && scene.lines.find(l => l.seriesId === p.seriesId)?.points.find(q => q.key === p.key)
      return lp ? <circle key={`sel-${p.seriesId}|${p.key}`} cx={lp.x} cy={lp.y} r={6} fill="none" stroke={tok('gold')} strokeWidth={1.5} pointerEvents="none" /> : null
    }),
    breaks: <>
      {/* Selected axis with a break: two handles set its extent. */}
      {['left', 'right'].map(sd => {
        const b = scene.axes[sd]?.brk
        if (!b || !api || pick?.tab !== 'yaxis' || (pick.side ?? 'left') !== sd) return null
        const setBrk = (k, my) => {
          const v = valueNear(sd, my)
          if (v == null) return
          const next = { from: b.from, to: b.to, [k]: v }
          if (next.from < next.to) api.setFmt(`yAxis.${sd}.break`, next)
        }
        return [['to', b.y - b.gap / 2 - 5], ['from', b.y + b.gap / 2 + 5]].map(([k, hy]) => (
          <rect key={`${sd}-${k}`} data-wheel-anchor x={scene.plot.left + 14} y={hy - 4} width={16} height={8} rx={2} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
            className="chart-engine-handle--y" onPointerDown={e => drag(e, (_, my) => setBrk(k, my))}><title>{k === 'to' ? tr('Drag to set where the axis resumes') : tr('Drag to set where the axis breaks')}</title></rect>
        ))
      })}
      {/* Selected category axis: the column width handle (gap width). */}
      {pick?.tab === 'xaxis' && scene.bars.length > 0 && scene.columns.length > 1 && (() => {
        const c0 = scene.columns.find(c => scene.bars.some(b => b.key === c.key))
        const group = scene.bars.filter(b => b.key === c0.key)
        const right = Math.max(...group.map(b => b.x + b.width))
        const step = scene.columns[1].cx - scene.columns[0].cx
        // On the axis line, in the gap between the first two columns: where it is dragged.
        const hx = (right + (c0.cx + step - (right - c0.cx))) / 2
        return (
          <rect data-wheel-anchor x={hx - 4} y={scene.plot.bottom - 5} width={8} height={10} rx={2} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
            className="chart-engine-handle" aria-label={tr('Drag to change the column width')}
            onPointerDown={e => drag(e, mx => {
              const half = Math.max(2, Math.abs(mx - c0.cx))
              const g = Math.max(0, Math.min(0.9, 1 - (2 * half) / step))
              const gr = Math.round(g * 20) / 20
              api.setFmt('gap', gr)
              // Tooltip while dragging: the gap as a % of the column width.
              setDragHint({ x: mx + 10, y: scene.plot.bottom - 14, side: 'left', text: tr('Gap {pct}%', { pct: Math.round((gr / (1 - gr)) * 100) }) })
            }, () => setDragHint(null))}>
            <title>{tr('Drag to change the column width')}</title>
          </rect>
        )
      })()}
    </>,
    marks: <>
      {/* Shared scale: a discreet marker at the top of the linked axis. */}
      {same && <text x={scene.plot.left + 4} y={scene.plot.top + 9} fill={tok('gray-400')} pointerEvents="none" style={{ fontSize: fsNote(9) }}>{tr('shared scale')}</text>}
      {/* Error bars of the edited series: a handle at the top end sets the deviation (± %). */}
      {api && pick?.tab === 'series' && scene.annotations.filter(a => a.type === 'errorBar' && a.byPct && !a.pair && a.seriesId === pick.seriesId && a.value).map(a => (
        <circle key={`ebh-${a.key}`} data-wheel-anchor cx={a.x} cy={a.y1} r={4.5} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5} className="chart-engine-handle--y"
          onPointerDown={e => drag(e, (_, my) => {
            const v = valueNear(a.axis ?? 'left', my)
            if (v == null) return
            const pct = Math.round((Math.abs(v - a.top) / Math.abs(a.value)) * 1000) / 10
            api.setFmt('errorBars', { ...(api.fmt.errorBars ?? {}), [a.seriesId]: { ...(api.fmt.errorBars?.[a.seriesId] ?? {}), pct } })
          })}><title>{tr('Drag to set the error (± %)')}</title></circle>
      ))}
    </>,
    // Label with typed text: a "!" on its right; a click restores the original text.
    labels: api && scene.labels.filter(l => l.overwritten && !l.rotate).map(l => {
      const w = estimateWidth(l.text, l.size)
      const x1 = l.anchor === 'end' ? l.x : l.anchor === 'start' ? l.x + w : l.x + w / 2
      return (
        <text key={`ow-${l.key}`} x={x1 + 3} y={l.y - l.size * 0.45} fill={tok('gold-dark')} fontWeight={700} className="chart-engine-clickable" style={{ fontSize: fsNote(9) }}
          onClick={e => { e.stopPropagation(); api.setFmt('labels.texts', { ...(api.fmt.labels?.texts ?? {}), [l.key]: undefined }) }}>
          !<title>{tr('Text typed over the data: click to restore the linked value')}</title>
        </text>
      )
    }),
    over: <>
      {/* Hovered point on each line */}
      {col && !pick && !sel && scene.lines.map(l => {
        const p = l.points.find(pt => pt.key === col.key)
        return p ? <circle key={`h-${l.seriesId}`} cx={p.x} cy={p.y} r={3.5} fill={tok(l.color)} stroke={tok('white')} strokeWidth={1.5} pointerEvents="none" /> : null
      })}

      {/* Selection layer: clickable labels, handles, cross */}
      {owned.map(o => {
        const { a, id } = o
        const on = isSel(id)
        const key = `ann-${id.kind}${id.i ?? ''}`
        if (id.kind === 'vline') {
          const hx = (a.x1 + a.x2) / 2
          // The line from the original view settings, or one from the list (format.valueLines).
          const setV = v => (id.i != null ? api.setValueLineAt(id.i, { value: v }) : api.setValueLine(v))
          const back = () => (id.i != null ? api.setValueLineAt(id.i, { value: api.meanOfTotals() }) : resetValueLine())
          return (
            <g key={key} data-ann>
              <line x1={a.x1} x2={a.x2} y1={a.y} y2={a.y} stroke="transparent" strokeWidth={10}
                className="chart-engine-handle--y" onPointerDown={e => { if (e.button !== 0) return; setSel(id); drag(e, (_, my) => { const v = valueNear(a.axis, my); if (v != null) setV(v) }) }}
                // Click: its format bar (value, label), like any annotation.
                onClick={e => { open(e, { tab: 'annotation', ann: id }); setSel(id) }}
                onContextMenu={e => { open(e, { tab: 'annotation', ann: id }); setSel(id) }}
                // Double-click: back to the average.
                onDoubleClick={e => { e.stopPropagation(); back() }} />
              {on && <>
                <line x1={a.x1} x2={a.x2} y1={a.y} y2={a.y} stroke={tok('gold')} strokeWidth={1.5} pointerEvents="none" />
                <rect x={hx - 5} y={a.y - 5} width={10} height={10} rx={2} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
                  className="chart-engine-handle--y" onPointerDown={e => drag(e, (_, my) => { const v = valueNear(a.axis, my); if (v != null) setV(v) })} />

              </>}
            </g>
          )
        }
        const setEnd = (end, k) => (id.kind === 'cagr'
          ? api.setCagr(id.i, end, k)
          : id.i != null
            ? api.setDiffAt(id.i, { [end]: { ...(api.diffs[id.i]?.[end] ?? {}), key: k } })
            : api.setDiff(end === 'from' ? k : a.fromKey, end === 'to' ? k : a.toKey))
        return (
          <g key={key} data-ann>
            <rect x={o.px - o.w / 2} y={o.py - 9} width={o.w} height={18} rx={9} fill="transparent"
              stroke={on ? tok('gold') : 'none'} strokeWidth={1.5} className="chart-engine-ann"
              // Click: the arrow is selected (handles at its ends) AND its format bar opens,
              // with "From → to" (choose the columns); right-click: its menu.
              onClick={e => { open(e, { tab: 'annotation', ann: id }); setSel(id) }}
              onContextMenu={e => { open(e, { tab: 'annotation', ann: id }); setSel(id) }}
              // Double-click on a difference arrow: its next mode.
              onDoubleClick={e => {
                e.stopPropagation()
                if (id.kind !== 'diff') return
                const modes = ['abs', 'pct', 'both']
                const nx = modes[(modes.indexOf(api.fmt.diffMode ?? 'abs') + 1) % modes.length]
                api.setFmt('diffMode', nx === 'abs' ? null : nx)
              }} />
            {on && <>
              {[['from', a.xa, a.ya], ['to', a.xb, a.yb]].map(([end, x, y]) => (
                <circle key={end} cx={x} cy={y} r={5} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
                  className="chart-engine-handle" onPointerDown={e => dragEnd(e, a, end, k => setEnd(end, k))} />
              ))}

            </>}
          </g>
        )
      })}

      {/* Dragging a label: its offered spots, dotted in the accent color. */}
      {labelCands?.map((c, i) => (
        <rect key={`lc${i}`} x={c.x - c.w / 2 - 2} y={c.y - c.h - 1} width={c.w + 4} height={c.h + 4} rx={2} fill={tok('gold-light')} fillOpacity={0.35}
          stroke={tok('gold')} strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
      ))}
      {/* A label selected on its own shows the drag icon (it moves to an offered spot). */}
      {api && !labelCands && pick?.tab === 'labels' && pick.labelKey && !pick.allLabels && (() => {
        const l = scene.labels.find(x => x.key === pick.labelKey && !x.rotate)
        if (!l) return null
        const w = estimateWidth(l.text, l.size)
        const x0 = (l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2) - 9
        const y0 = l.y - l.size * 0.35
        return (
          <path d={`M${x0},${y0 - 4} V${y0 + 4} M${x0 - 4},${y0} H${x0 + 4} M${x0 - 1.5},${y0 - 2.5} L${x0},${y0 - 4} L${x0 + 1.5},${y0 - 2.5} M${x0 - 1.5},${y0 + 2.5} L${x0},${y0 + 4} L${x0 + 1.5},${y0 + 2.5} M${x0 - 2.5},${y0 - 1.5} L${x0 - 4},${y0} L${x0 - 2.5},${y0 + 1.5} M${x0 + 2.5},${y0 - 1.5} L${x0 + 4},${y0} L${x0 + 2.5},${y0 + 1.5}`}
            fill="none" stroke={tok('gold-dark')} strokeWidth={1} pointerEvents="none"><title>{tr('Drag the label: it snaps to the highlighted places')}</title></path>
        )
      })()}
      {/* Selected chart: the rotation handle, top right of the plot;
          dragged a quarter turn, columns become bars (and the profile, lines). */}
      {api && pick?.tab === 'chart' && (api.hasBars || api.hasLines) && (() => {
        const hx = scene.plot.right - 6, hy = scene.plot.top + 6
        return (
          <g data-wheel-anchor className="chart-engine-handle" onPointerDown={e => {
            const r0 = e.currentTarget.ownerSVGElement.getBoundingClientRect()
            const sx = e.clientX - r0.left, sy = e.clientY - r0.top
            let far = false
            drag(e, (mx, my) => { if (Math.hypot(mx - sx, my - sy) > 15) far = true }, () => {
              if (!far) return
              if (api.hasBars) api.setFmt('horizontal', true)
              else api.setFmt('profile', api.fmt.profile ? null : true)
              setPick(null)
            })
          }}>
            <circle cx={hx} cy={hy} r={7} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5} />
            <path d={`M${hx - 3},${hy + 2} A3.5,3.5 0 1 1 ${hx + 2},${hy + 2.5}`} fill="none" stroke={tok('gold-dark')} strokeWidth={1.2} />
            <title>{api.hasBars ? tr('Drag to rotate to horizontal bars') : tr('Drag to rotate to a profile chart')}</title>
          </g>
        )
      })()}
      {axisDrop && ['left', 'right'].map(sd => (
        <line key={`ad-${sd}`} x1={sd === 'left' ? scene.plot.left : scene.plot.right} x2={sd === 'left' ? scene.plot.left : scene.plot.right} y1={scene.plot.top} y2={scene.plot.bottom}
          stroke={tok('gold')} strokeWidth={axisDrop.target === sd ? 3 : 1} strokeDasharray={axisDrop.target === sd ? undefined : '3 3'} pointerEvents="none" />
      ))}
      {/* Handle dragged back to the automatic scale. */}
      {dragHint?.text && (
        <text x={dragHint.x} y={dragHint.y} textAnchor={dragHint.side === 'left' ? 'start' : 'end'} dominantBaseline="central" fill={tok('gold-dark')} fontWeight={600}
          stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" pointerEvents="none" style={{ fontSize: 10.5 }}>{dragHint.text}</text>
      )}
      {/* Shift + hover: the range a Shift + click would select. */}
      {shiftOn && col && pick?.tab === 'series' && pick.key && (() => {
        const ks = scene.columns.map(c => c.key)
        const [i0, i1] = [ks.indexOf(pick.key), ks.indexOf(col.key)].sort((a, b) => a - b)
        if (i0 < 0) return null
        return scene.bars.filter(b => b.seriesId === pick.seriesId && ks.indexOf(b.key) >= i0 && ks.indexOf(b.key) <= i1).map(b => (
          <rect key={`sh-${b.key}`} x={b.x - 2} y={b.y - 2} width={b.width + 4} height={b.height + 4} rx={3} fill="none" stroke={tok('gold')} strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
        ))
      })()}
    </>,
    axesUnder: <>
      {/* Selected category axis: a handle on the baseline before each category; dragged
          to the right, it opens a gap of one to four column widths (category gap). */}
      {api && pick?.tab === 'xaxis' && scene.columns.filter(c => !String(c.key).startsWith('_')).length > 1 && (() => {
        const real = scene.columns.filter(c => !String(c.key).startsWith('_'))
        const step = real[1].cx - real[0].cx
        return real.slice(1).filter(c => !api.gapBefore?.(c.key)).map(c => {
          const gaps = api.fmt.catGaps ?? []
          const n0 = gaps.includes(c.key) ? Math.max(1, Math.min(4, Math.round(Number(api.fmt.catGapSize?.[c.key]) || 1))) : 0
          const prev = scene.columns[scene.columns.indexOf(c) - 1]
          const hx = n0 ? c.x0 : (prev.cx + c.cx) / 2
          return (
            <path key={`gh-${c.key}`} data-wheel-anchor d={`M${hx},${scene.axes.x.y + 3} l4,5 l-4,5 l-4,-5 Z`} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.25}
              className="chart-engine-handle"
              onPointerDown={e => {
                const sx = e.clientX
                drag(e, (mx, my, ev) => {
                  const n = Math.max(0, Math.min(4, n0 + Math.round((ev.clientX - sx) / Math.max(8, step))))
                  const rest = (api.fmt.catGaps ?? []).filter(k => k !== c.key)
                  const sizes = { ...(api.fmt.catGapSize ?? {}) }
                  delete sizes[c.key]
                  if (n > 1) sizes[c.key] = n
                  api.setFmt('catGaps', n ? [...rest, c.key] : rest.length ? rest : null)
                  api.setFmt('catGapSize', Object.keys(sizes).length ? sizes : null)
                })
              }}>
              <title>{n0 > 1 ? tr('Drag right to open a gap before {label} ({n} columns)', { label: c.label, n: n0 }) : n0 ? tr('Drag right to open a gap before {label} ({n} column)', { label: c.label, n: n0 }) : tr('Drag right to open a gap before {label} (none)', { label: c.label })}</title>
            </path>
          )
        })
      })()}

      {/* Axes: a click (left or right) opens their tab. */}
      {api && ['left', 'right'].filter(sd => scene.axes[sd]).map(side => {
        const ax = scene.axes[side]
        const ys = ax.allTicks.map(t => t.y)
        return (
          <rect key={`yh-${side}`} x={side === 'left' ? 0 : ax.x} y={Math.min(...ys) - 8} width={Math.max(8, side === 'left' ? ax.x : scene.width - ax.x)} height={Math.max(...ys) - Math.min(...ys) + 16} fill="transparent"
            className={`chart-engine-clickable${isAxisSel(side) ? ' is-selected' : ''}`}
            // (event handlers: the compiler cannot tell they never run during render)
            // eslint-disable-next-line react-hooks/refs
            onClick={e => axisClick(side, e)} onContextMenu={e => axisClick(side, e)} onPointerDown={e => axisDrag(side, e)}
            // eslint-disable-next-line react-hooks/refs
            tabIndex={0} role="button" aria-label={side === 'left' ? tr('Left value axis') : tr('Right value axis')} onKeyDown={e => onObjKey(e, { tab: 'yaxis', side })} />
        )
      })}
      {api && <rect x={scene.plot.left} y={scene.axes.x.y} width={scene.plot.width} height={Math.min(36, Math.max(10, scene.height - scene.axes.x.y - (scene.legendY ? scene.height - scene.legendY : 0)))}
        fill="transparent" className={`chart-engine-clickable${pick?.tab === 'xaxis' ? ' is-selected' : ''}`}
        onClick={e => open(e, xAxisObj(e))} onContextMenu={e => open(e, xAxisObj(e))}
        tabIndex={0} role="button" aria-label={tr('Category axis')} onKeyDown={e => onObjKey(e, { tab: 'xaxis' })} />}
    </>,
    axesOver: ['left', 'right'].map(side => {
      const ax = scene.axes[side]
      if (!ax) return null
      return (
        <Fragment key={`ys-${side}`}>
          {/* Selected axis: its scale handles, max at the top, min at the bottom. */}
          {pick?.tab === 'yaxis' && (pick.side ?? 'left') === side && !ax.log && ax.allTicks.length > 1 && (() => {
            const [t0, t1] = [ax.allTicks[0], ax.allTicks.at(-1)]
            const yOf = v => t0.y + ((v - t0.value) * (t1.y - t0.y)) / (t1.value - t0.value)
            const ends = [['max', ax.domain[1]], ['min', ax.domain[0]]]
            // Middle handle (tick mark spacing): on the 2nd tick,
            // drag it to set the step, rounded to 1 / 2 / 2.5 / 5 × 10ⁿ.
            const s0 = ax.allTicks[0], s1 = ax.allTicks[1]
            const niceStep = d => { const e = 10 ** Math.floor(Math.log10(d)); const m = d / e; return (m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * e }
            const stepHandle = s1 && (
              <circle key="step" data-wheel-anchor cx={side === 'left' ? ax.x + 8 : ax.x - 8} cy={s1.y} r={4.5} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
                className="chart-engine-handle--y" aria-label={tr('Drag to set the tick spacing')}
                onPointerDown={e => drag(e, (_, my, ev) => {
                  const nv = valueNear(side, my)
                  if (nv == null || !(Math.abs(nv - s0.value) > 0)) return
                  const st = niceStep(Math.abs(nv - s0.value))
                  // Automatic step reached: the setting is cleared ("Automatic").
                  // Alt + drag keeps the manual setting.
                  const auto = !ev?.altKey && ax.autoStep != null && Math.abs(st - ax.autoStep) < ax.autoStep * 1e-6
                  api.setFmt(`yAxis.${side}.step`, auto ? null : st)
                  setDragHint({ x: side === 'left' ? ax.x + 16 : ax.x - 16, y: my, side, text: auto ? tr('Automatic') : null })
                }, () => setDragHint(null))}
                onDoubleClick={() => api.setFmt(`yAxis.${side}.step`, null)}><title>{tr('Drag to set the tick spacing (double-click: automatic)')}</title></circle>
            )
            return [stepHandle, ...ends.map(([k, v]) => (
              <rect key={k} data-wheel-anchor x={side === 'left' ? ax.x + 3 : ax.x - 13} y={yOf(v) - 5} width={10} height={10} rx={2} fill={tok('white')} stroke={tok('gold')} strokeWidth={1.5}
                className="chart-engine-handle--y" aria-label={k === 'max' ? tr('Drag to set the axis max') : tr('Drag to set the axis min')}
                title={k === 'max' ? tr('Drag to set the axis max') : tr('Drag to set the axis min')}
                onPointerDown={e => drag(e, (_, my, ev) => {
                  // Dragged to the automatic bound (within 6 px), the handle snaps back to it: "Automatic".
                  const av = ax.autoDomain?.[k === 'max' ? 1 : 0]
                  const auto = !ev?.altKey && Number.isFinite(av) && Math.abs(my - yOf(av)) < 6
                  // The bound snaps to the tick step (Alt + drag: to a tenth of a step).
                  const fine = valueNear(side, my)
                  const st = ax.step > 0 && !ev?.altKey ? ax.step : null
                  const nv = auto || fine == null ? null : st ? Number((Math.round(fine / st) * st).toFixed(10)) : fine
                  if (auto || nv != null) api.setFmt(`yAxis.${side}.${k}`, nv)
                  // Value tooltip while dragging, "Automatic" on the automatic bound.
                  setDragHint({ x: side === 'left' ? ax.x + 16 : ax.x - 16, y: my, side, text: auto ? tr('Automatic') : nv != null ? formatters.axis(nv, ax.unit) : null })
                }, () => setDragHint(null))} />
            ))]
          })()}
        </Fragment>
      )
    }),
  }
  // Free texts linked to the sheet ("{B2}") read the current value.
  const figScene = scene?.notes?.length && api ? { ...scene, notes: scene.notes.map(n => ({ ...n, text: noteText(n.text) })) } : scene

  return (
    // A right-click anywhere in the chart (margins, legend, axis titles…) opens our
    // menu (the target object's if it already handled it, otherwise the chart's), never the browser's.
    <div className="chart-engine" onContextMenu={api ? e => { if (!e.defaultPrevented) open(e, { tab: 'chart' }) } : undefined}>
      {!bare && (
        <Header title={spec.title} sub={subtitle}
          menu={reading && settingsButton ? <>{headerSlot}<ChartWheelButton api={api} formatters={formatters} /></> : headerSlot} />
      )}
      {errors.length > 0 && (
        <div className="chart-engine-error" role="alert">
          {tr('This chart definition is invalid:')} {errors.join(' · ')}
        </div>
      )}
      {/* A discreet note (not a box); cells in error are counted there. */}
      <EditedNote api={api} />
      <div ref={boxRef} className="chart-engine-box">
        {/* Without its own header (bare) and without host-provided view settings, the
            settings icon sits in the plot corner: no chart is left without settings. */}
        {bare && reading === true && settingsButton && (menuSlot
          ? createPortal(<ChartWheelButton api={api} formatters={formatters} />, menuSlot)
          : <div className="chart-engine-float-menu"><ChartWheelButton api={api} formatters={formatters} /></div>)}
        {/* Empty chart: the data sheet opens with one click. */}
        {scene?.empty && <div className="chart-engine-empty">{tr('No data for this chart yet.')}{api && <> <button type="button" className="chart-editor-pill" onClick={() => api.setSheetOpen(true)}>{tr('Open data sheet')}</button></>}</div>}
        {scene && !scene.empty && (
          <ChartFigure scene={figScene} interactive={!readOnly} scope={clipId} label={spec.title} responsive={responsive} dataTable={dataTable} part={part} layers={layers}
            onMouseMove={readOnly ? undefined : onMove} onMouseLeave={readOnly ? undefined : () => setHover(null)}
            // Double-click: the data sheet.
            onDoubleClick={api ? () => { setPick(null); api.setSheetOpen(true) } : undefined} />
        )}
        {wheel}
        {col && !pick && !sel && (
          // A readout line at the top right of the chart (level with the legend): it covers
          // no bar, number or annotation; the column being read stays marked by its band.
          <div className="chart-engine-tip chart-engine-tip--line" role="status" style={{ right: 0, top: scene.legendY ? 0 : 0 }}>
            <span className="chart-engine-tip-head">{col.label}</span>
            {col.items.map(it => (
              <span key={it.seriesId} className="chart-engine-tip-row">
                <svg width={14} height={10} aria-hidden="true"><Swatch item={it} x={0} y={5} /></svg>
                <span className="chart-engine-tip-label">{it.label}{it.type === 'forecast' ? ' (fcst)' : ''}</span>
                <span className="chart-engine-tip-value">{it.text}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {api?.sheetOpen && (
        <DataSheet api={api} format={fmt} grain={spec.x?.grain}
          // A role (actual, plan…) is read as its token, as in the scene.
          colors={Object.fromEntries((full.series ?? []).map(sr => [sr.id, ROLE_TOKEN[sr.style?.color] ?? sr.style?.color]))}
          onClose={() => api.setSheetOpen(false)} />
      )}
    </div>
  )
}
