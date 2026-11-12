// ─── epure-charts · the settings-icon slot ────────────────────────────────────
// Lets a card header carry the chart's settings icon next to its other tools.
// When the host renders the header and the chart separately, link the two:
//   const [slotEl, slot] = useMenuSlot()
//   <CardHeader … menu={slot} />   <MyChart menuSlot={slotEl} />
// ChartView then portals its icon into that slot instead of the plot corner.
import { createElement, useState } from 'react'

/** Returns [slotElement, slotNode]: render slotNode in the header, pass slotElement as `menuSlot`. */
export function useMenuSlot() {
  const [el, setEl] = useState(null)
  return [el, createElement('span', { ref: setEl, className: 'chart-menu-slot' })]
}
