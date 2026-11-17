// ─── epure-charts · the scene of a slope chart (before / after) ─────────────
// buildSlopeScene(spec, items, { width, height, format }) → pure geometry:
//   { width, height, plot, axes, lines, labels, leaders, domain, noRoom, empty }
//
// spec: {
//   before?: text           left column heading (default: "Before", localized)
//   after?: text            right column heading (default: "After", localized)
//   labels?: 'both'|'end'|'none'   where the names go: both sides (default), the right
//                           side only (the left one keeps the value), or nowhere (lines only)
//   change?: true|'pct'|'pts'|'abs'  the change written at the end of each line: true picks
//                           points for a 'pct' unit, a relative % otherwise
//   unit?, decimals?        passed to the formatter (format(v, unit, decimals))
//   scale?: { min, max }    the value domain set by hand (shared scale, small multiples)
//   accent?: 'single', emphasis?: [keys]   single-accent mode (accent.js)
//   locale?, title?, source?…               see locale.js / figureMeta.js
// }
// items: [{ key, label, before, after, color? }], colors as token names.
// One scale for both columns. The labels of each column are spread vertically so they never
// overlap (sorted, one pass down and one pass up, bounded to the plot); a label moved away from
// its point gets a short leader. When the height cannot hold them all, the emphasized items and
// the largest values keep theirs (noRoom = the number left out).
// spec.labelPt / spec.labelFont (or opts.labelStyle): labels measured at their actual size.
// Pure, tested under node --test.
import { scaleLinear } from 'd3-scale'
import { defaultFormat } from './scene.js'
import { labelMetrics } from './customStyle.js'
import { localeOf, localizedFormat, localizeNumber, t } from './locale.js'
import { accentColor, emphasisOf } from './accent.js'
import { stamp } from './figureMeta.js'

const CAT = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8']
const LABEL = 11
const HEAD = 11
const HEAD_H = 22
const PAD = 8

function ellipsize(text, maxW, measure) {
  const s = String(text ?? '')
  if (measure(s) <= maxW) return s
  let cut = s
  while (cut.length > 1 && measure(`${cut}…`) > maxW) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** The change from `a` to `b` as text ('+12%', '−3.5 pts', '+€4.0M'), null when undefined. */
function changeText(mode, a, b, fmt, spec) {
  const sign = d => (d > 0 ? '+' : d < 0 ? '−' : '')
  const dec = spec.decimals ?? null
  if (mode === 'pts') {
    const d = (b - a) * 100
    return `${sign(d)}${Math.abs(d).toFixed(dec ?? 1)} pts`
  }
  if (mode === 'abs') {
    const d = b - a
    return `${sign(d)}${fmt(Math.abs(d), spec.unit, dec)}`
  }
  if (!a) return null
  const d = ((b - a) / Math.abs(a)) * 100
  return `${sign(d)}${Math.abs(d).toFixed(dec ?? 0)}%`
}

/**
 * Spreads labels { y, key } sorted by y with a minimum gap, bounded to [yMin, yMax].
 * Keeps at most what fits (priority: `rank`, smallest first); returns the kept ones.
 */
function spread(list, gap, yMin, yMax) {
  const room = Math.max(0, Math.floor((yMax - yMin) / gap) + 1)
  let kept = list
  if (kept.length > room) {
    const keep = new Set([...kept].sort((p, q) => p.rank - q.rank).slice(0, room))
    kept = kept.filter(it => keep.has(it))
  }
  kept = [...kept].sort((p, q) => p.y0 - q.y0)
  for (let i = 0; i < kept.length; i++) kept[i].y = Math.max(kept[i].y0, i ? kept[i - 1].y + gap : yMin)
  for (let i = kept.length - 1; i >= 0; i--) kept[i].y = Math.min(kept[i].y, i < kept.length - 1 ? kept[i + 1].y - gap : yMax)
  return kept
}

export function buildSlopeScene(spec = {}, itemsIn = [], opts = {}) {
  spec = spec ?? {}
  const width = Math.max(200, Math.round(opts.width ?? 480))
  const height = Math.max(140, Math.round(opts.height ?? 320))
  const L = localeOf(spec)
  const format = localizedFormat(opts.format ?? defaultFormat, L)
  const fmt = v => format(v, spec.unit, spec.decimals ?? null)
  const LM = labelMetrics(opts.labelStyle ?? spec, LABEL)
  const LS = LM.size
  const BL = Math.round(LS * 0.35)
  const emph = emphasisOf(spec)
  const items = itemsIn
    .filter(x => x && Number.isFinite(x.before) && Number.isFinite(x.after))
    .map((x, i) => ({ ...x, key: String(x.key ?? i), color: accentColor(spec, x.key ?? i, x.color ?? CAT[i % CAT.length]) }))
  const base = { width, height, plot: null, axes: [], lines: [], labels: [], leaders: [], domain: null, noRoom: 0, empty: !items.length }
  if (base.empty) return stamp(base, 'slope', spec)

  // ── Domain: one scale for both columns (a hand-set scale wins) ──
  const vals = items.flatMap(x => [x.before, x.after])
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const sc = spec.scale ?? {}
  // A bound set by hand replaces the natural one (values beyond it are clamped to the frame);
  // an inconsistent pair hands control back to the data.
  const sLo = Number.isFinite(sc.min) ? sc.min : lo, sHi = Number.isFinite(sc.max) ? sc.max : hi
  if (sLo < sHi) { lo = sLo; hi = sHi }
  if (lo === hi) { lo -= 1; hi += 1 }
  base.domain = [lo, hi]

  // ── Texts: "name value" on the left, "value name" on the right, the change after ──
  const mode = spec.change === true ? (spec.unit === 'pct' ? 'pts' : 'pct') : ['pct', 'pts', 'abs'].includes(spec.change) ? spec.change : null
  const names = spec.labels ?? 'both'
  const leftText = x => (names === 'both' ? `${x.label} ${fmt(x.before)}` : fmt(x.before))
  const changeOf = x => (mode ? localizeNumber(changeText(mode, x.before, x.after, (v, u, d) => format(v, u, d), spec), L) : null)
  const rightText = x => {
    const ch = changeOf(x)
    return names === 'none' ? (ch ?? fmt(x.after)) : `${fmt(x.after)} ${x.label}${ch ? `  ${ch}` : ''}`
  }
  const maxGutter = width * 0.36
  const leftW = names === 'none' ? PAD : Math.min(maxGutter, Math.max(...items.map(x => LM.measure(leftText(x))))) + 10
  const rightW = names === 'none' && !mode ? PAD : Math.min(maxGutter, Math.max(...items.map(x => LM.measure(rightText(x))))) + 10

  const headBefore = spec.before ?? t('Before', L)
  const headAfter = spec.after ?? t('After', L)
  const plot = { left: leftW, right: width - rightW, top: HEAD_H + LS * 0.5, bottom: height - PAD - LS * 0.4 }
  // A narrow card: the lines keep at least 30 % of the width, the names are shortened.
  const minPlot = width * 0.3
  if (plot.right - plot.left < minPlot) {
    const k = (width - minPlot) / (leftW + rightW)
    plot.left = leftW * k
    plot.right = width - rightW * k
  }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot
  const y = scaleLinear().domain([lo, hi]).range([plot.bottom, plot.top]).clamp(true)

  // ── Axes: two vertical rules with their heading ──
  const headX = (x, text) => { const w = LM.measure(text, HEAD) / 2; return Math.max(w + 2, Math.min(width - w - 2, x)) }
  base.axes = [
    { key: 'before', x: plot.left, y1: plot.top - 4, y2: plot.bottom + 4, label: headBefore, lx: headX(plot.left, headBefore), ly: HEAD - 1 + 4 },
    { key: 'after', x: plot.right, y1: plot.top - 4, y2: plot.bottom + 4, label: headAfter, lx: headX(plot.right, headAfter), ly: HEAD - 1 + 4 },
  ]

  // ── Lines: one segment per item; emphasized ones drawn last (on top) ──
  const ordered = [...items].sort((a, b) => Number(emph.has(a.key)) - Number(emph.has(b.key)))
  base.lines = ordered.map(x => ({
    key: x.key, label: x.label, before: x.before, after: x.after, color: x.color, emphasis: emph.has(x.key),
    change: changeOf(x), x1: plot.left, y1: y(x.before), x2: plot.right, y2: y(x.after),
  }))

  // ── Labels: each column spread without overlap ──
  if (names !== 'none' || mode) {
    const gap = LS + 3
    const yMin = plot.top - LS * 0.3, yMax = plot.bottom + LS * 0.3
    // Priority: emphasized first, then the largest values.
    const rankOf = (x, v) => (emph.has(x.key) ? 0 : 1) * 1e6 + (hi - v) / ((hi - lo) || 1)
    const cols = [
      { side: 'L', x: plot.left - 6, anchor: 'end', text: leftText, v: x => x.before, avail: plot.left - 8 },
      { side: 'R', x: plot.right + 6, anchor: 'start', text: rightText, v: x => x.after, avail: width - plot.right - 8 },
    ]
    for (const c of cols) {
      if (c.side === 'L' && names === 'none') continue
      const list = items.map(x => ({ x, y0: y(c.v(x)), rank: rankOf(x, c.v(x)) }))
      const kept = spread(list, gap, yMin, yMax)
      base.noRoom += list.length - kept.length
      for (const it of kept) {
        const { x } = it
        const full = c.text(x)
        const text = ellipsize(full, c.avail, s => LM.measure(s))
        const ch = c.side === 'R' ? changeOf(x) : null
        base.labels.push({
          key: `${x.key}|${c.side}`, item: x.key, side: c.side, x: c.x, y: it.y + BL, text, anchor: c.anchor,
          color: 'gray-700', strong: emph.has(x.key),
          // The change, drawn as a lighter run at the end of the right label (when it was not cut).
          ...(ch && text === full && names !== 'none' ? { change: ch, main: text.slice(0, text.length - ch.length).trimEnd() } : {}),
        })
        if (Math.abs(it.y - it.y0) > 2) {
          const px = c.side === 'L' ? plot.left : plot.right
          const qx = c.side === 'L' ? plot.left - 4 : plot.right + 4
          base.leaders.push({ key: `${x.key}|${c.side}`, d: `M${px},${it.y0} L${qx},${it.y}` })
        }
      }
    }
  }
  return stamp(base, 'slope', spec)
}
