// ─── epure-charts · legend swatch and line marker of the cartesian chart ─────
// Hook-free; shared by ChartFigure and ChartView (the hover readout).
import { tok } from './customStyle.js'
import { patternId } from './chartGeom.js'

/** A legend swatch: a square for a bar (its pattern when `scope` is given), a stroke for a line. */
export function Swatch({ item, x, y, scope }) {
  if (item.mark === 'bar') {
    return <rect x={x} y={y - 5} width={10} height={10} rx={2} fill={item.pattern && scope ? `url(#${patternId(scope, item.pattern, item.color)})` : tok(item.color)}
      stroke={item.pattern && scope ? tok(item.color) : undefined} strokeWidth={item.pattern ? 0.75 : undefined} />
  }
  return (
    <line x1={x} x2={x + 14} y1={y} y2={y} stroke={tok(item.color)} strokeWidth={2}
      strokeDasharray={item.dash ?? undefined} strokeLinecap={item.dash ? 'butt' : 'round'} />
  )
}

/** A line marker, in its shape. */
export function Marker({ shape, x, y, r = 3, fill, stroke }) {
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} stroke={stroke} strokeWidth={1.5} />
  if (shape === 'diamond') return <path d={`M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z`} fill={fill} stroke={stroke} strokeWidth={1.5} />
  if (shape === 'triangle') return <path d={`M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z`} fill={fill} stroke={stroke} strokeWidth={1.5} />
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1.75} />
}
