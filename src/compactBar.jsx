// ─── epure-charts · a mini toolbar that fits on its row ──────────────────────
// A value is never cut in the middle of a word: when space runs short, the bar
// tightens in steps, from the cheapest to the most costly:
//   1. self-explanatory values lose their name ("FY Apr" instead of "Year: FY Apr");
//      all others keep it at every step ("Scale: auto – €150M", "Fill: blue"):
//      an unnamed control no longer says what it sets (compactValue, barPlacement.js);
//   2. controls beyond the 4th move behind "⋯";
//   3. beyond the 2nd.
// Available space = the width the card leaves to the bar (set by useWheelPlacement in
// data-room), compared with the bar's natural width (never a truncated measurement):
// when space comes back, the bar returns to the less compact step.
import { useEffect, useRef, useState } from 'react'
import { IconDots } from '@tabler/icons-react'
import { nextCompactLevel, compactValue } from './barPlacement.js'
import { t } from './locale.js'

export { compactValue }

// The natural width of the bar (without max-width) and its values truncated by their own cap.
function measure(el) {
  const { width, maxWidth } = el.style
  el.style.maxWidth = 'none'
  el.style.width = 'max-content'
  const w = el.getBoundingClientRect().width
  const cut = [...el.querySelectorAll('.chart-bar__val')].some(v => v.scrollWidth > v.clientWidth + 1)
  el.style.width = width
  el.style.maxWidth = maxWidth
  return { w, cut }
}

/** The compactness step of a bar (0 = full), reset to 0 when `key` changes. */
export function useCompactLevel(ref, key) {
  const [state, setState] = useState({ key, level: 0 })
  const level = state.key === key ? state.level : 0
  const seen = useRef({ key, by: [] })
  useEffect(() => {
    // Measured on the next frame (never a synchronous setState inside the effect).
    const id = requestAnimationFrame(() => {
      const el = ref.current
      if (!el?.querySelector('.chart-bar')) return
      if (seen.current.key !== key) seen.current = { key, by: [] }
      const by = seen.current.by
      by[level] = measure(el)
      const room = Number(el.dataset.room) || window.innerWidth - 16
      const next = nextCompactLevel(level, by, room)
      if (next !== level) setState({ key, level: next })
    })
    return () => cancelAnimationFrame(id)
  })
  return level
}

/**
 * The list of a bar's controls, tightened: [object, …controls, (⋯), "+"].
 * `head` = number of fixed leading controls (the object picker), `tail` = trailing ones ("+"),
 * `pin` = id of a control that never collapses (the one currently open), `tr` = the bar's
 * translation function (useT), for the "⋯" control's tooltip.
 */
export function compactList(list, level, { head = 1, tail = 0, display = (t, v) => v, pin = null, tr = (w, v) => t(w, undefined, v) } = {}) {
  const keep = level >= 3 ? 2 : level >= 2 ? 4 : Infinity
  const mid = list.slice(head, list.length - tail)
  if (mid.length <= keep) return list
  let shown = mid.slice(0, keep)
  let rest = mid.slice(keep)
  // The open control (double-click, shortcut) always stays visible: it takes the last slot.
  const pinned = pin != null ? rest.find(c => c[0] === pin) : null
  if (pinned) { rest = [shown[shown.length - 1], ...rest.filter(c => c !== pinned)]; shown = [...shown.slice(0, -1), pinned] }
  const more = ['overflow', IconDots, '', tr('More format controls ({n})', { n: rest.length }), (
    <div className="chart-pop__groups">
      {rest.map(([id, , value, title, body]) => (
        <div key={id} className="chart-pop__group">
          <div className="chart-pop__group-head">{display(title, value) || title}</div>
          {body}
        </div>
      ))}
    </div>
  )]
  return [...list.slice(0, head), ...shown, more, ...list.slice(list.length - tail)]
}
