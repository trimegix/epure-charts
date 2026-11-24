// ─── epure-charts · pie and doughnut, drawing only ──────────────────────────
// <PieFigure scene={buildPieScene(spec, slices, { width, height })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. PieView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke):
//     kinds 'slice', 'label', 'legend';
//   · children: drawn over the figure (handles, drag tips);
//   · labelStyle: CSS spread on the labels (the user's label font, size, color).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs } from './customStyle.js'
import { t } from './locale.js'

const none = () => null

/** The figure's numbers, for the hidden data table. */
function pieTable(scene) {
  return { head: ['', t('Value', scene.meta?.locale), t('Share', scene.meta?.locale)], rows: scene.arcs.map(a => [a.label, a.value, `${(a.share * 100).toFixed(1)}%`]) }
}

export default function PieFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, className = 'chart-pie', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? pieTable(scene) : null} className={className} {...rest}>
      {scene.arcs.map(a => (
        <path key={a.key} d={a.d} transform={`translate(${a.tx},${a.ty})`} fill={tok(a.color)} stroke={tok('surface')} strokeWidth={1}
          {...part('slice', a)}>
          <title>{`${a.label}: ${(a.share * 100).toFixed(1)}%`}</title>
        </path>
      ))}
      {scene.leaders.map(l => <path key={`l-${l.key}`} d={l.d} fill="none" stroke={tok('gray-400')} strokeWidth={1} pointerEvents="none" />)}
      {/* Inside label larger than its slice: a background in the slice color underneath. */}
      {scene.labels.filter(l => l.box).map(l => <rect key={`b-${l.key}`} x={l.box.x} y={l.box.y} width={l.box.w} height={l.box.h} rx={2} fill={tok(l.box.fill)} stroke={tok('surface')} strokeWidth={1} pointerEvents="none" />)}
      {scene.labels.map(l => (
        <text key={`t-${l.key}`} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={600}
          style={{ fontSize: fs(11), fontFamily: 'var(--font-mono)', ...labelStyle, ...(l.size ? { fontSize: fs(l.size) } : {}) }}
          {...part('label', l)}>{l.text}</text>
      ))}
      {scene.center && (
        <g pointerEvents="none">
          {scene.center.text && <text x={scene.center.x} y={scene.center.y} textAnchor="middle" fill={tok('black')} fontWeight={600} style={{ fontSize: fs(16), fontFamily: 'var(--font-mono)' }}>{scene.center.text}</text>}
          {scene.center.sub && <text x={scene.center.x} y={scene.center.y + 16} textAnchor="middle" fill={tok('gray-500')} style={{ fontSize: fs(11) }}>{scene.center.sub}</text>}
          {scene.center.title && <text x={scene.center.x} y={scene.center.y} textAnchor="middle" fill={tok('gray-700')} fontWeight={600} style={{ fontSize: fs(13) }}>{scene.center.title}</text>}
        </g>
      )}
      {scene.legend.length > 0 && (
        <g className="chart-engine-legend" {...part('legend', scene.legend)}>
          {scene.legend.map(it => (
            <g key={it.key} transform={`translate(${it.x},0)`}>
              <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={tok(it.color)} />
              <text x={16} y={it.y} dominantBaseline="central" fill={tok('gray-500')} style={{ fontSize: fs(11) }}>{it.label}</text>
            </g>
          ))}
        </g>
      )}
      {children}
    </FigureSvg>
  )
}
