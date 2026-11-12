// ─── epure-charts · fill patterns ────────────────────────────────────────────
// One SVG <pattern> per pattern × color pair: strokes in the bar's color (token),
// on the card background. The id follows `${scope}-pt-${pattern}-${color}`
// (scope = an id unique to the chart); a bar refers to it with fill="url(#…)".
// A color is a palette token, or a user-picked hex (custom style).
import { tok, colorId } from './customStyle.js'
const PATHS = {
  hatch: 'M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2',
  hatchBack: 'M-1,5 l2,2 M0,0 l6,6 M5,-1 l2,2',
  cross: 'M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2 M-1,5 l2,2 M0,0 l6,6 M5,-1 l2,2',
  lines: 'M0,1.5 H6 M0,4.5 H6',
}

/** items: [{ pattern, color }] (bars, legend); duplicates yield a single pattern. */
export default function PatternDefs({ scope, items }) {
  const seen = new Map()
  for (const it of items) if (it?.pattern) seen.set(`${it.pattern}|${it.color}`, it)
  return [...seen.values()].map(({ pattern, color }) => (
    <pattern key={`${pattern}|${color}`} id={`${scope}-pt-${pattern}-${colorId(color)}`} patternUnits="userSpaceOnUse" width={6} height={6}>
      <rect width={6} height={6} fill={tok('surface')} />
      {pattern === 'dots'
        ? <circle cx={3} cy={3} r={1.2} fill={tok(color)} />
        : <path d={PATHS[pattern] ?? PATHS.hatch} stroke={tok(color)} strokeWidth={1.2} fill="none" />}
    </pattern>
  ))
}
