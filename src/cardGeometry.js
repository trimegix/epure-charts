// ─── Chart engine · the geometry of a chart card ─────────────────────────────
// Where to place the formatting mini toolbar without covering the title, the plot or the legend:
// a single row, the one of the reading selector (Annual / Quarterly…), after it;
// without a selector, the row under the subtitle.

const textRight = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right }

/** Returns `{ box, lineTop, minLeft }`: the card, the mini-toolbar row, its minimum left edge. */
export function cardGeometry(el) {
  const card = el?.closest?.('.card, .chart-card') ?? el?.closest?.('.chart-engine') ?? el
  const r = card?.getBoundingClientRect?.()
  if (!r) return { box: null, lineTop: null, minLeft: null }
  const seg = card.querySelector('.card-head__seg, .chart-head__seg')
  const sub = card.querySelector('.card-head__sub, .chart-head__sub')
  const title = card.querySelector('.card-head__title, .chart-head__title')
  let lineTop = r.top + 40
  let minLeft = r.left + 16
  if (seg) {
    const s = seg.getBoundingClientRect()
    lineTop = s.top + s.height / 2 - 15
    minLeft = s.right + 12
  } else if (sub || title) {
    const s = (sub ?? title).getBoundingClientRect()
    lineTop = s.bottom + 6
  }
  const headRight = [title, sub].filter(Boolean).map(textRight)
  // Text placed just under the mini-toolbar row (the source of a figure, "approved by…"):
  // its menus open to its right, never over it (it is audit information).
  let auditRight = null
  // The header (title, subtitle, selector) and the source line: a menu never covers them (weight ×4).
  const headMarks = [...card.querySelectorAll('.card-head__title, .card-head__sub, .card-head__seg, .chart-head__title, .chart-head__sub, .chart-head__seg')].map(h => {
    const b = h.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, weight: 4 }
  })
  const svg = card.querySelector('.chart-engine svg')
  const plotTop = svg ? svg.getBoundingClientRect().top : r.bottom
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || n.parentElement?.closest('svg, .card-head__row, .chart-head, .chart-wheel')) continue
    const range = document.createRange(); range.selectNodeContents(n)
    const t = range.getBoundingClientRect()
    if (t.top >= lineTop + 26 && t.bottom <= plotTop && t.width) {
      auditRight = Math.max(auditRight ?? 0, t.right)
      headMarks.push({ x: t.left, y: t.top, w: t.width, h: t.height, weight: 4 })
    }
  }
  return { box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, lineTop, minLeft, auditRight, headMarks, headRight: headRight.length ? Math.max(...headRight) : null }
}
