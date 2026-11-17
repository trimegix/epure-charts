// ─── epure-charts · slope chart (before / after), drawing only ──────────────
// <SlopeFigure scene={buildSlopeScene(spec, items, { width, height })} />
// No hooks, no state, no preferences: renders the same on the server and in the browser.
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke):
//     kinds 'line' (a segment, item = scene.lines[i]), 'dot' (an end point, item = { ...line, side }),
//     'label' (item = scene.labels[i]), 'axis' (a column rule and its heading, item = scene.axes[i]);
//   · children: drawn over the figure;
//   · labelStyle: CSS spread on the labels (the user's label font, size, color).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs } from './customStyle.js'

const none = () => null

/** The figure's numbers, for the hidden data table. */
function slopeTable(scene) {
  const [b, a] = scene.axes.map(x => x.label)
  const withChange = scene.lines.some(l => l.change)
  return {
    head: ['', b, a, ...(withChange ? ['Change'] : [])],
    rows: scene.lines.map(l => [l.label, l.before, l.after, ...(withChange ? [l.change ?? ''] : [])]),
  }
}

export default function SlopeFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, className = 'chart-slope', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? slopeTable(scene) : null} className={className} {...rest}>
      {scene.axes.map(a => (
        <g key={a.key} {...part('axis', a)}>
          <line x1={a.x} x2={a.x} y1={a.y1} y2={a.y2} stroke={tok('gray-300')} strokeWidth={1} />
          <text x={a.lx} y={a.ly} textAnchor="middle" fill={tok('gray-500')} fontWeight={600} style={{ fontSize: fs(11) }}>{a.label}</text>
        </g>
      ))}
      {scene.leaders.map(l => <path key={`l-${l.key}`} d={l.d} fill="none" stroke={tok('gray-400')} strokeWidth={1} pointerEvents="none" />)}
      {scene.lines.map(l => (
        <g key={l.key}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={tok(l.color)} strokeWidth={l.emphasis ? 2.5 : 1.75} strokeLinecap="round"
            {...part('line', l)}>
            <title>{`${l.label}: ${l.before} → ${l.after}`}</title>
          </line>
          <circle cx={l.x1} cy={l.y1} r={3} fill={tok(l.color)} {...part('dot', { ...l, side: 'L' })} />
          <circle cx={l.x2} cy={l.y2} r={3} fill={tok(l.color)} {...part('dot', { ...l, side: 'R' })} />
        </g>
      ))}
      {scene.labels.map(l => (
        <text key={`t-${l.key}`} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={l.strong ? 700 : 500}
          style={{ fontSize: fs(11), ...labelStyle }} {...part('label', l)}>
          {l.change ? <>{l.main}<tspan fill={tok('gray-500')} fontWeight={500}>{`  ${l.change}`}</tspan></> : l.text}
        </text>
      ))}
      {children}
    </FigureSvg>
  )
}
