// ─── epure-charts · the scene of a pie / doughnut chart ──────────────────────
// buildPieScene(spec, slices, { width, height, format }) → pure geometry:
//   { width, height, cx, cy, r, r0, arcs, labels, leaders, center, legend, handles, empty }
//
// spec: {
//   donut?: 0..0.85        inner radius (fraction of the radius); 0 = pie
//   sort?: 'desc'|'asc'    slice order (default: the sheet's)
//   start?: degrees        start angle (0 = noon, clockwise), adjustable with the handle
//   direction?: 'cw'|'ccw' slice direction (default: clockwise)
//   labelOffsets?: { [key]: { dx, dy } }   outside labels moved by hand (px)
//   centerTitle?: text     title at the center of the doughnut (under the total if shown)
//   labels?: 'outside'|'inside'|'none'     label placement
//   content?: 'share'|'value'|'both'|'name'|'nameShare'
//   other?: threshold (share, e.g. 0.03): smaller slices are grouped into "Other"
//   explode?: [keys]       slices pulled away from the center
//   total?: true           the total at the center of a doughnut
//   legend?: 'right'|'bottom'|'none'
// }
// slices: [{ key, label, value, color? }], colors as token names.
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): labels are measured,
// spaced and bounded to the frame at their actual size (labelMetrics); the radius keeps a floor
// (30 % of the smaller dimension), outside labels are capped to what fits
// (l.size, px); noRoom = the number of labels left out for lack of room.
// Pure, tested under node --test.
import { pie as d3pie, arc as d3arc } from 'd3-shape'
import { estimateWidth, defaultFormat } from './scene.js'
import { roundToSum } from './numberStyle.js'
import { inkOn, labelMetrics } from './customStyle.js'
import { localeOf, localizedFormat, localizeNumber, t } from './locale.js'
import { accentColor, accentInk } from './accent.js'
import { stamp } from './figureMeta.js'

const CAT = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
const LABEL = 11
const LEGEND_ROW = 18

/** The effective slices: positive, sorted, small slices grouped. */
export function pieSlices(spec = {}, slicesIn = []) {
  let s = slicesIn.filter(x => x && Number.isFinite(x.value) && x.value > 0).map((x, i) => ({ ...x, color: accentColor(spec, x.key, x.color ?? CAT[i % CAT.length]) }))
  if (spec.sort === 'desc') s = [...s].sort((a, b) => b.value - a.value)
  if (spec.sort === 'asc') s = [...s].sort((a, b) => a.value - b.value)
  const total = s.reduce((t, x) => t + x.value, 0)
  if (spec.other > 0 && total > 0) {
    const small = s.filter(x => x.value / total < spec.other)
    if (small.length > 1) {
      s = s.filter(x => !small.includes(x))
      s.push({ key: '__other__', label: `${t('Other', localeOf(spec))} (${small.length})`, value: small.reduce((t, x) => t + x.value, 0), color: accentColor(spec, '__other__', 'gray-400'), members: small.map(x => x.key) })
    }
  }
  return { slices: s, total }
}

export function buildPieScene(spec = {}, slicesIn = [], opts = {}) {
  const width = Math.max(200, Math.round(opts.width ?? 480))
  const height = Math.max(160, Math.round(opts.height ?? 280))
  const L = localeOf(spec)
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const LM = labelMetrics(opts.labelStyle ?? spec, LABEL)
  const LS = LM.size
  // Baseline of a label centered on y (4 px at the default size).
  const BL = LM.base ? 4 : Math.round(LS * 0.35)
  const { slices, total } = pieSlices(spec, slicesIn)
  const base = { width, height, arcs: [], labels: [], leaders: [], center: null, legend: [], handles: null, noRoom: 0, empty: !slices.length || !(total > 0) }
  if (base.empty) return stamp(base, 'pie', spec)

  const content = spec.content ?? 'share'
  // Consistent rounding: the displayed shares sum exactly to 100 %.
  const rounded = roundToSum(slices.map(s => (s.value / total) * 100), spec.decimals ?? 0)
  const byKey = Object.fromEntries(slices.map((s, i) => [s.key, rounded[i]]))
  const pct = (v, key) => localizeNumber(`${(key != null ? byKey[key] : (v / total) * 100).toFixed(spec.decimals ?? 0)}%`, L)
  const textOf = s => ({
    share: pct(s.value, s.key), value: format(s.value), both: `${format(s.value)} (${pct(s.value, s.key)})`,
    name: s.label, nameShare: `${s.label} ${pct(s.value, s.key)}`,
  }[content] ?? pct(s.value, s.key))

  // Legend (right by default; bottom; or none).
  // Narrow card (< 420 px): the legend moves below, the width goes back to the pie.
  const legendPos = (spec.legend ?? 'right') === 'right' && width < 420 ? 'bottom' : spec.legend ?? 'right'
  const legendW = legendPos === 'right' ? Math.min(width * 0.38, Math.max(...slices.map(s => estimateWidth(s.label, LABEL))) + 26) : 0
  const legendRows = legendPos === 'bottom' ? Math.ceil(slices.length / Math.max(1, Math.floor(width / 140))) : 0
  const legendH = legendRows * LEGEND_ROW
  const outside = (spec.labels ?? 'outside') === 'outside'
  const labelPad = outside ? Math.max(...slices.map(s => LM.measure(textOf(s)))) + 18 : 8
  const areaW = width - legendW
  const areaH = height - legendH
  // Guaranteed radius floor (30 % of the smaller dimension): large labels never shrink
  // the doughnut to a line; they are the ones capped to the remaining room (below).
  const rFloor = LM.base ? 30 : Math.max(30, Math.min(0.3 * Math.min(areaW, areaH), areaH / 2 - 8))
  const r = Math.max(rFloor, Math.min(areaW / 2 - labelPad, areaH / 2 - (outside ? 18 : 8)))
  const r0 = Math.max(0, Math.min(0.85, spec.donut ?? 0)) * r
  const cx = areaW / 2
  const cy = areaH / 2
  Object.assign(base, { cx, cy, r, r0, start: spec.start ?? 0 })

  const start = ((spec.start ?? 0) * Math.PI) / 180
  const ccw = spec.direction === 'ccw'
  const layout = d3pie().sort(null).value(d => d.value).startAngle(start).endAngle(start + (ccw ? -2 : 2) * Math.PI)(slices)
  const explode = new Set(spec.explode ?? [])
  const arcGen = d3arc().innerRadius(r0).outerRadius(r).padAngle(0.004)
  for (const a of layout) {
    const mid = (a.startAngle + a.endAngle) / 2
    const off = explode.has(a.data.key) ? r * 0.08 : 0
    const dx = Math.sin(mid) * off
    const dy = -Math.cos(mid) * off
    base.arcs.push({
      key: a.data.key, label: a.data.label, value: a.data.value, share: a.data.value / total, color: a.data.color,
      d: arcGen(a), tx: cx + dx, ty: cy + dy, mid, members: a.data.members ?? null, a0: a.startAngle, a1: a.endAngle,
      // Four handles: at both edges of the sector, on the outer circle and
      // near the center (edge of the hole, or 30 % of a pie's radius); each one rotates the chart.
      handles: [a.startAngle, a.endAngle].flatMap(t => [r + 2, Math.max(r0, r * 0.3)].map(rr => ({ x: cx + dx + Math.sin(t) * rr, y: cy + dy - Math.cos(t) * rr, angle: t }))),
    })
  }

  // Labels: inside (if the slice is wide enough), or outside with a leader line,
  // each side spread vertically so they never overlap.
  const lab = spec.labels ?? 'outside'
  if (lab !== 'none') {
    const sides = { L: [], R: [] }
    // Inside labels: as close as possible to the outer edge if there is room; too
    // close to a neighbor, they slide toward the center; larger than their slice, they get
    // a background in the slice's color (a rectangle under the label).
    const placed = []
    const hit = b => placed.some(q => b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1)
    const rMax = r - LS / 2 - 6
    const rMin = Math.max(r0 + LS / 2 + 3, r * 0.22)
    const inFrame = b => b.x0 >= 0 && b.x1 <= areaW && b.y0 >= 0 && b.y1 <= areaH
    for (const a of base.arcs) {
      const text = textOf(a)
      if (lab === 'inside') {
        const w = LM.measure(text) + 6, h = LS + 4
        const at = rr => {
          const x = a.tx + Math.sin(a.mid) * rr, y = a.ty - Math.cos(a.mid) * rr
          return { rr, x, y, box: { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 } }
        }
        const fits = rr => a.share * 2 * Math.PI * rr > w && (r - r0) > LS + 6
        const steps = []
        for (let rr = Math.max(rMin, rMax); rr >= rMin - 0.01; rr -= 3) steps.push(rr)
        if (!steps.length) steps.push((r0 + r) / 2)
        let pos = steps.map(at).find(p => fits(p.rr) && !hit(p.box) && inFrame(p.box))
        let boxed = false
        if (!pos) { pos = steps.map(at).find(p => !hit(p.box) && inFrame(p.box)) ?? (LM.base ? at(steps[0]) : null); boxed = true }
        // A large size with no free spot: the label is left out rather than overlapping.
        if (!pos) { base.noRoom++; continue }
        placed.push(pos.box)
        base.labels.push({ key: a.key, x: pos.x, y: pos.y + BL, text, anchor: 'middle', color: accentInk(spec, a.color) ?? inkOn(a.color), inner: true,
          ...(boxed ? { box: { x: pos.box.x0, y: pos.box.y0, w: w, h: h, fill: a.color } } : {}) })
        continue
      }
      const side = Math.sin(a.mid) >= 0 ? 'R' : 'L'
      sides[side].push({ a, text, y: a.ty - Math.cos(a.mid) * (r + 14) })
    }
    // Set size: outside labels are capped to what fits, in width
    // (between the ring and the edge of the area, never over the legend) and in height (one line
    // per label on each side), never below 8 px.
    let OS = LS
    if (!LM.base) {
      const avail = Math.max(0, areaW / 2 - r - 13 - 2)
      for (const it of [...sides.L, ...sides.R]) { const w = LM.measure(it.text, LS); if (w > avail) OS = Math.min(OS, (LS * avail) / w) }
      const n = Math.max(sides.L.length, sides.R.length)
      if (n) OS = Math.min(OS, (areaH - 4) / n - 3 - 0.05 * LS)
      OS = Math.max(8, Math.floor(OS))
    }
    const capped = OS < LS
    for (const [side, all0] of Object.entries(sides)) {
      const gap = OS + 3
      // Capped at the floor, a label still too wide is left out (counted in noRoom).
      const fitW = Math.max(0, areaW / 2 - r - 15)
      const all = LM.base ? all0 : all0.filter(it => LM.measure(it.text, OS) <= fitW + 0.5)
      base.noRoom += all0.length - all.length
      let list = [...all].sort((p, q) => p.y - q.y)
      if (LM.base) {
        for (let i = 1; i < list.length; i++) if (list[i].y - list[i - 1].y < gap) list[i].y = list[i - 1].y + gap
        const over = (list.at(-1)?.y ?? 0) - (areaH - 6)
        if (over > 0) for (const it of list) it.y -= over
      } else {
        // Set size: as many labels as the height can hold (the largest slices),
        // then one pass downwards and one upwards, bounded to the frame: never any overlap.
        const yMin = OS * 0.45 + 2, yMax = areaH - OS * 0.6 - 2
        const room = Math.max(0, Math.floor((yMax - yMin) / gap) + 1)
        if (list.length > room) base.noRoom += list.length - room
        if (list.length > room) { const keep = new Set([...list].sort((p, q) => q.a.share - p.a.share).slice(0, room)); list = list.filter(it => keep.has(it)) }
        for (let i = 0; i < list.length; i++) list[i].y = Math.max(list[i].y, i ? list[i - 1].y + gap : yMin)
        for (let i = list.length - 1; i >= 0; i--) list[i].y = Math.min(list[i].y, i < list.length - 1 ? list[i + 1].y - gap : yMax)
      }
      for (const it of list) {
        const { a } = it
        const ex = a.tx + Math.sin(a.mid) * (r + 2)
        const ey = a.ty - Math.cos(a.mid) * (r + 2)
        const lx = side === 'R' ? cx + r + 10 : cx - r - 10
        const off = spec.labelOffsets?.[a.key]
        if (off) {
          // Label moved by hand: the leader line runs straight to it.
          let px = lx + off.dx, py = it.y + off.dy
          const right = px >= cx
          // Set size: the moved label stays within the area (neither off the card nor over the legend).
          if (!LM.base) {
            const w = LM.measure(it.text, OS)
            px = right ? Math.min(px, areaW - 4 - w) : Math.max(px, w + 4)
            py = Math.min(Math.max(py, OS * 0.45 + 2), areaH - OS * 0.6 - 2)
          }
          base.leaders.push({ key: a.key, d: `M${ex},${ey} L${px},${py}` })
          base.labels.push({ key: a.key, x: right ? px + 3 : px - 3, y: py + (capped ? Math.round(OS * 0.35) : BL), text: it.text, anchor: right ? 'start' : 'end', color: 'gray-700', manual: true, ax: lx, ay: it.y, ...(capped ? { size: OS } : {}) })
          continue
        }
        base.leaders.push({ key: a.key, d: `M${ex},${ey} L${(ex + lx) / 2},${it.y} L${lx},${it.y}` })
        base.labels.push({ key: a.key, x: side === 'R' ? lx + 3 : lx - 3, y: it.y + (capped ? Math.round(OS * 0.35) : BL), text: it.text, anchor: side === 'R' ? 'start' : 'end', color: 'gray-700', ax: lx, ay: it.y, ...(capped ? { size: OS } : {}) })
      }
    }
  }

  // The center text is only written if it fits in the hole (never over the slices).
  const fitsHole = t => t == null || estimateWidth(String(t), 13) <= r0 * 1.7
  if (r0 > 0 && spec.total && fitsHole(format(total))) base.center = { x: cx, y: cy, text: format(total), sub: fitsHole(spec.centerTitle || spec.totalLabel || t('Total', L)) ? spec.centerTitle || spec.totalLabel || t('Total', L) : null }
  else if (r0 > 0 && spec.centerTitle && fitsHole(spec.centerTitle)) base.center = { x: cx, y: cy + 5, text: null, sub: null, title: spec.centerTitle }
  // Handles: rotation on the edge, at the start angle; doughnut hole on the same radius.
  base.handles = {
    rotate: { x: cx + Math.sin(start) * (r + 7), y: cy - Math.cos(start) * (r + 7), angle: spec.start ?? 0 },
    hole: { x: cx + Math.sin(start) * r0, y: cy - Math.cos(start) * r0 },
  }

  if (legendPos === 'right') {
    base.legend = base.arcs.map((a, i) => ({ key: a.key, label: a.label, color: a.color, x: areaW + 12, y: Math.max(10, cy - (base.arcs.length * LEGEND_ROW) / 2) + i * LEGEND_ROW + 9 }))
  } else if (legendPos === 'bottom') {
    const per = Math.max(1, Math.floor(width / 140))
    base.legend = base.arcs.map((a, i) => ({ key: a.key, label: a.label, color: a.color, x: (i % per) * 140, y: areaH + Math.floor(i / per) * LEGEND_ROW + 9 }))
  }
  return stamp(base, 'pie', spec)
}

/** The start angle (degrees, 0 = noon) pointed at (x, y); snapped to 0 / 90 / 180 / 270 within ±6°. */
export function pieStartFromPoint(scene, x, y) {
  let deg = (Math.atan2(x - scene.cx, -(y - scene.cy)) * 180) / Math.PI
  deg = ((Math.round(deg) % 360) + 360) % 360
  for (const s of [0, 90, 180, 270, 360]) if (Math.abs(deg - s) <= 6) return s % 360
  return deg
}
/**
 * The rotation when dragging a sector handle placed at `angle` (radians): the edge
 * follows the pointer, the chart rotates by as much. Returns the start angle (degrees, snapped to quarters).
 */
export function pieStartFromHandle(scene, angle, x, y) {
  const ptr = (Math.atan2(x - scene.cx, -(y - scene.cy)) * 180) / Math.PI
  const deg = (scene.start ?? 0) + ptr - (angle * 180) / Math.PI
  let v = ((Math.round(deg) % 360) + 360) % 360
  for (const q of [0, 90, 180, 270, 360]) if (Math.abs(v - q) <= 6) v = q % 360
  return v
}
/** The hole size (fraction of the radius) pointed at (x, y): 0 (pie) near the center, at most 0.85. */
export function pieHoleFromPoint(scene, x, y) {
  const f = Math.hypot(x - scene.cx, y - scene.cy) / scene.r
  if (f < 0.12) return 0
  return Math.min(0.85, Number(f.toFixed(2)))
}
