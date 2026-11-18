// ─── epure-charts · where to place a format bar or an action menu ───────────
// Shared by chart formatting (ChartWheel) and bridge formatting (BridgeBar).
//   · menu (right-click): stuck to the cursor, inside the card, on the side that covers
//     the fewest chart marks (anchor.marks, weighted);
//   · format bar: stuck to the clicked object, at the spot (above, below, left, right,
//     moving away if needed) that covers the fewest weighted marks (barPlacement.barSpot),
//     bounded by the object's card, never over it; without an object (background, header
//     button): the card's selector row (anchor.lineTop / minLeft), right-aligned; without a
//     card, below the button. The room left by the card (data-room) sets compactness (compactBar).
//   · on scroll or resize, bar and menu follow the object; a bar that would leave the
//     viewport is placed elsewhere (below the object); when the object leaves the viewport,
//     they hide (and come back with it).
//   · after a manipulation (dragged handle, changed scale, edited series), the chart moves
//     under the bar: on release (never during the drag), if it now covers a label, a tick
//     or a line, it is re-placed from the marks read back from the SVG.
import { useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { barSpot, coverOf, lineMarks } from './barPlacement.js'

// A format bar never stretches across a whole large card: beyond that, its controls fold ("⋯").
const BAR_MAX = 760
const roomOf = box => Math.max(120, Math.min(BAR_MAX, box.right - box.left - 16))

/**
 * Positions a format bar or action menu (`mode`) next to its anchor, avoiding chart marks.
 * @returns the computed position (null until measured).
 */
export function useWheelPlacement(ref, anchor, mode) {
  const [pos, setPos] = useState(null)
  const { x: ax, y: ay, align } = anchor
  const box = anchor.box
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    // The tracked object: the clicked element (targetMark), otherwise what lies under the anchor point.
    let follow = (anchor.marks ?? []).find(m => m.el)?.el ?? null
    if (!follow && Number.isFinite(ax) && Number.isFinite(ay) && document.elementFromPoint) {
      const vis = el.style.visibility
      el.style.visibility = 'hidden'
      follow = document.elementFromPoint(ax - 1, ay - 1)
      el.style.visibility = vis
      if (follow && (el.contains(follow) || follow === document.body || follow === document.documentElement)) follow = null
    }
    const r0 = follow?.getBoundingClientRect?.()
    let base = null
    let shift = [0, 0]
    // The last applied position (screen): the one the re-placement compares against.
    let last = null
    // The position computed on open, shifted by the distance the object has moved since.
    const apply = () => {
      if (!base) return
      let out = false
      if (follow && r0 && follow.isConnected) {
        const r = follow.getBoundingClientRect()
        shift = [r.left - r0.left, r.top - r0.top]
        out = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth
      }
      el.style.visibility = out ? 'hidden' : ''
      let left = base.left + shift[0]
      let top = base.top + shift[1]
      // The bar would leave the viewport (scroll): it is re-placed elsewhere around the object.
      if (base.respot && !out && (top < 8 || top + base.h > window.innerHeight - 8)) {
        ;({ left, top } = base.respot(shift))
      }
      last = { left, top }
      setPos(p => (p && p.left === left && p.top === top ? p : { left, top }))
    }
    const place = () => {
      const { width: w, height: h } = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left, top
      let respot = null
      // The width used for bounds (the bar's, once capped).
      let ww = w
      if (mode === 'menu') {
        // Top-left corner at the cursor, on the side with room, and inside the card.
        const r = box ? box.right - 8 : vw - 8
        const b = box ? box.bottom - 8 : vh - 8
        // Among the four corners around the cursor, the one covering the fewest chart marks
        // (bars, numbers, annotations, legend); on a tie, bottom-right.
        // The four corners are first bounded to the card (a menu never leaves it);
        // a number, an annotation or the legend weighs more than a bar (still readable half covered).
        const L0 = box ? box.left + 8 : 8
        const T0 = box ? box.top + 8 : 8
        // The 4 corners, then, on each side of the cursor, every height of the card (16 px steps):
        // the menu finds the nearest gap.
        // Always stuck to the cursor (24 px at most): a menu stays tied to the clicked object. On each
        // side, the menu slides vertically as long as its edge touches the cursor.
        const sides = [ax + 8, ax - w - 8]
        const cands = [[ax + 4, ay + 6], [ax - w - 4, ay + 6], [ax + 4, ay - h - 6], [ax - w - 4, ay - h - 6],
          ...sides.flatMap(l => Array.from({ length: Math.max(1, Math.floor((h - 16) / 16) + 1) }, (_, i) => [l, ay - h + 8 + i * 16]))]
          .map(([l, t]) => [Math.max(L0, Math.min(l, r - w)), Math.max(T0, Math.min(t, b - h))])
          .filter(([l, t]) => Math.max(0, l - ax, ax - (l + w)) <= 24 && Math.max(0, t - ay, ay - (t + h)) <= 24)
        if (!cands.length) cands.push([Math.max(L0, Math.min(ax + 4, r - w)), Math.max(T0, Math.min(ay + 6, b - h))])
        const cover = ([l, t]) => (anchor.marks ?? []).reduce((sum, m) => {
          const ix = Math.max(0, Math.min(l + w, m.x + m.w) - Math.max(l, m.x))
          const iy = Math.max(0, Math.min(t + h, m.y + m.h) - Math.max(t, m.y))
          return sum + ix * iy * (m.weight ?? 1)
        }, 0) + (l <= ax && ax <= l + w && t <= ay && ay <= t + h ? 1e7 : 0)
        // At equal coverage, the closest to the cursor.
        const dist = ([l, t]) => Math.hypot(l + w / 2 - ax, t + h / 2 - ay)
        const score = c => cover(c) + dist(c) * 2
        ;[left, top] = cands.reduce((best, c) => (score(c) < score(best) ? c : best), cands[0])
      } else if (box) {
        const T = (anchor.marks ?? []).find(m => m.weight >= 1000)
        if (T) {
          const cap = roomOf(box)
          el.style.maxWidth = `${cap}px`
          el.dataset.room = String(cap)
          // The actual width (content that does not shrink can exceed max-width).
          const fw = Math.max(Math.min(w, cap), Math.min(el.scrollWidth || 0, box.right - box.left - 16))
          const at = ([dx, dy]) => barSpot({
            T: { ...T, x: T.x + dx, y: T.y + dy }, box: { left: box.left + dx, right: box.right + dx, top: box.top + dy, bottom: box.bottom + dy },
            w: fw, h, marks: dx || dy ? anchor.marks.map(m => ({ ...m, x: m.x + dx, y: m.y + dy })) : anchor.marks, vw, vh: window.innerHeight,
          })
          ;({ left, top } = at([0, 0]))
          respot = at
          ww = fw
        } else {
          // Without an object (the whole chart): the reading selector row, right-aligned,
          // never before it. Too long: its controls fold.
          const minLeft = Number.isFinite(anchor.minLeft) ? anchor.minLeft : box.left + 16
          const room = Math.min(BAR_MAX, box.right - 24 - minLeft)
          el.style.maxWidth = `${Math.max(240, room)}px`
          el.dataset.room = String(Math.max(240, room))
          const fw = Math.min(w, Math.max(240, room))
          left = Math.max(minLeft, box.right - fw - 24)
          top = anchor.lineTop ?? box.top + 40
        }
      } else {
        left = align === 'right' ? ax - w : ax - w / 2
        top = align === 'right' ? ay + 6 : (anchor.plotTop ?? ay) - h - 6
      }
      // An incomplete anchor (object added from a menu) must never yield NaN.
      if (!Number.isFinite(left)) left = vw - w - 24
      if (!Number.isFinite(top)) top = 8
      left = Math.max(8, Math.min(left, vw - ww - 8))
      top = Math.max(8, Math.min(top, vh - h - 8))
      base = { left, top, h, fw: ww, spot: respot ? { box } : null, respot: respot && (sh => { const p = respot(sh); return { left: Math.max(8, Math.min(p.left, vw - ww - 8)), top: p.top } }) }
      apply()
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    // Scroll (of the page or a container) and resize: the bar follows the object.
    window.addEventListener('scroll', apply, true)
    window.addEventListener('resize', apply)
    // ── Re-placement after a manipulation ──
    // The chart's (outermost) SVG, and the marks outside it (card header) kept as is.
    let svg = follow?.closest?.('svg') ?? null
    while (svg?.parentElement?.closest?.('svg')) svg = svg.parentElement.closest('svg')
    const s0 = svg?.getBoundingClientRect()
    const outside = s0 ? (anchor.marks ?? []).filter(m => m.weight < 1000 && !(m.x < s0.right && m.x + m.w > s0.left && m.y < s0.bottom && m.y + m.h > s0.top)) : []
    let dirty = false
    let down = false
    let raf = 0
    const replace = () => {
      raf = 0
      if (!dirty || down || !base?.spot || !svg?.isConnected || !follow?.isConnected) return
      // An open control (input in progress): the bar waits for it to close.
      if (el.querySelector('.chart-pop')) return
      dirty = false
      const r = follow.getBoundingClientRect()
      if (!(r.width > 0 || r.height > 0) || !last) return
      const T = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8, weight: 1000 }
      const marks = [...outside.map(m => ({ ...m, x: m.x + shift[0], y: m.y + shift[1] })), ...svgMarks(svg), T]
      const { fw, h } = base
      // What counts: a label, a tick, a line, the object (a covered bar stays readable).
      const strong = marks.filter(m => (m.weight ?? 1) >= 2)
      const now = coverOf(last.left, last.top, fw, h, strong)
      if (now < 400) return
      const b = base.spot.box
      const vw = window.innerWidth
      const vh = window.innerHeight
      const next = barSpot({ T, box: { left: b.left + shift[0], right: b.right + shift[0], top: b.top + shift[1], bottom: b.bottom + shift[1] }, w: fw, h, marks, vw, vh })
      const left = Math.max(8, Math.min(next.left, vw - fw - 8))
      const top = Math.max(8, Math.min(next.top, vh - h - 8))
      if (coverOf(left, top, fw, h, strong) >= now) return
      base = { ...base, left: left - shift[0], top: top - shift[1] }
      apply()
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(replace) }
    const mo = svg && typeof MutationObserver !== 'undefined' ? new MutationObserver(recs => {
      if (recs.some(rec => svg.contains(rec.target))) dirty = true
      schedule()
    }) : null
    if (mo) {
      mo.observe(svg, { attributes: true, childList: true, subtree: true, characterData: true })
      // The bar: a control closing triggers a new check.
      mo.observe(el, { childList: true, subtree: true })
    }
    const onDown = () => { down = true }
    const onUp = () => { down = false; schedule() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    return () => {
      ro.disconnect(); mo?.disconnect(); if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', apply, true); window.removeEventListener('resize', apply)
      window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true)
    }
  }, [ref, ax, ay, align, box, mode, anchor.plotTop, anchor.lineTop, anchor.minLeft, anchor.marks])
  return pos
}

/**
 * The clicked object's box, as a mark of infinite weight: neither the bar nor the menu
 * is placed over it (you want to see what you adjust). Nothing for a background click.
 */
export function targetMark(e) {
  const t = e?.target
  if (!t?.getBoundingClientRect || t.tagName === 'svg' || t.tagName === 'DIV') return []
  const r = t.getBoundingClientRect()
  if (!(r.width > 0 && r.height > 0) || r.width > 420 || r.height > 320) return []
  // `el`: the object the bar follows on scroll.
  return [{ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8, weight: 1000, el: t }]
}

/**
 * The painted marks of a chart, read from its SVG (for views that do not provide them):
 * a text weighs 4 (label, legend, tick), a shape 1 (bar, slice, bubble).
 * Transparent hit areas and large backgrounds do not count.
 */
export function domMarks(root) {
  return svgMarks(root?.querySelector?.('svg'))
}

/**
 * The painted marks of an SVG (see domMarks). A line (stroke without fill, long enough)
 * is read as small marks along its path (weight 2) rather than as one box.
 */
export function svgMarks(svg) {
  if (!svg) return []
  const sr = svg.getBoundingClientRect()
  const big = sr.width * sr.height * 0.4
  const blank = v => !v || /^(transparent|none)$/.test(v)
  return [...svg.querySelectorAll('text, rect, path, circle, ellipse, line, polyline, polygon')].flatMap(el => {
    if (el.closest('defs, clipPath, pattern, mask, marker')) return []
    if (el.tagName !== 'text' && blank(el.getAttribute('fill')) && blank(el.getAttribute('stroke'))) return []
    const q = el.getBoundingClientRect()
    if (!(q.width > 0 || q.height > 0)) return []
    if (el.tagName === 'path' && blank(el.getAttribute('fill')) && (q.width > 40 || q.height > 40)) {
      try {
        const len = el.getTotalLength()
        const m = el.getScreenCTM()
        const n = Math.min(200, Math.max(2, Math.ceil(len / 12)))
        const pts = Array.from({ length: n + 1 }, (_, i) => { const p = el.getPointAtLength((len * i) / n); return new DOMPoint(p.x, p.y).matrixTransform(m) })
        return lineMarks(pts, 2)
      } catch { /* unreadable path: use its box, like a shape */ }
    }
    if (q.width * q.height > big) return []
    return [{ x: q.left, y: q.top, w: Math.max(q.width, 2), h: Math.max(q.height, 2), weight: el.tagName === 'text' ? 4 : 1 }]
  })
}
