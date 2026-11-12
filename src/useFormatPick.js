// ─── epure-charts · open an object's mini toolbar (click) or menu (right-click) ─
// useFormatPick(boxRef) → [pick, open, close]
//   open(event, { obj, …details }): sets the anchor (card, mini-toolbar row,
//   marks not to cover) and the mode ("menu" on right-click, "bar" otherwise).
import { useState } from 'react'
import { cardGeometry } from './cardGeometry.js'
import { targetMark, domMarks } from './useWheelPlacement'

// opts.onTitle: the mini toolbar sits on the card's title row (no reserved row).
export function useFormatPick(boxRef, marksOf, opts = {}) {
  const [pick, setPick] = useState(null)
  const open = (e, obj) => {
    e.preventDefault?.(); e.stopPropagation?.()
    const geo = cardGeometry(boxRef.current)
    // The painted marks of the chart (read from its SVG): the mini toolbar does not cover them.
    const marks = [...(marksOf?.() ?? []), ...domMarks(boxRef.current), ...(geo.headMarks ?? []), ...targetMark(e)]
    const menu = e.type === 'contextmenu'
    setPick({ ...obj, mode: menu ? 'menu' : 'bar', anchor: { x: e.clientX, y: e.clientY, align: menu ? 'cursor' : 'beside', box: geo.box, lineTop: opts.onTitle && geo.box ? geo.box.top + 6 : geo.lineTop, minLeft: geo.minLeft, marks } })
  }
  return [pick, open, () => setPick(null)]
}
