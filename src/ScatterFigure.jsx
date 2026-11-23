// ─── epure-charts · scatter and bubble, drawing only ────────────────────────
// <ScatterFigure scene={buildScatterScene(spec, points, { width, height })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. ScatterView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke):
//     'legend' (the legend group, item = scene.legend), 'zone' (a zone path; may carry
//     `children`, e.g. a <title>), 'partition' (the visible dashed line), 'trend' (the
//     trend group), 'trendLine' (its visible path), 'point' (a point's group), 'marker'
//     (the point's marker: stroke, sw), 'label' (a point label's text), 'xaxis' / 'yaxis'
//     (the axis groups, item = scene.axes.x / .y), 'sizeLegend' (the size legend group);
//   · hit areas and handles, drawn only when part returns props for them:
//     'partitionHit' (a wide transparent line over a partition), 'partitionEnd'
//     (a knob at an oblique partition's end, item = { ...partition, end, h }),
//     'trendHit' (a wide transparent path over the trend), 'axisHit' (a transparent
//     rect under an axis, item = 'x' | 'y'), 'sizeHandle' (the reference bubble's knob);
//   · children: drawn over the figure (selection knobs, snapping tips);
//   · labelStyle: CSS spread on the point labels (the user's label font, size, color);
//   · clipId: the id of the plot's clip path (unique per page).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs, fsNote } from './customStyle.js'
import { t } from './locale.js'

const none = () => null

function Marker({ shape, x, y, r, fill, stroke, sw }) {
  if (shape === 'none') return <circle cx={x} cy={y} r={Math.max(r, 6)} fill="transparent" />
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} stroke={stroke} strokeWidth={sw} />
  if (shape === 'diamond') return <path d={`M${x},${y - r * 1.3} L${x + r * 1.3},${y} L${x},${y + r * 1.3} L${x - r * 1.3},${y} Z`} fill={fill} stroke={stroke} strokeWidth={sw} />
  if (shape === 'triangle') return <path d={`M${x},${y - r * 1.2} L${x + r * 1.2},${y + r} L${x - r * 1.2},${y + r} Z`} fill={fill} stroke={stroke} strokeWidth={sw} />
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
}

/** The figure's numbers, for the hidden data table. */
function scatterTable(scene) {
  const size = scene.points.some(p => p.size != null)
  const group = scene.points.some(p => p.group != null)
  return {
    head: ['', scene.axes.x.title ?? 'X', scene.axes.y.title ?? 'Y', ...(size ? [t('Size', scene.meta?.locale)] : []), ...(group ? [t('Group', scene.meta?.locale)] : [])],
    rows: scene.points.map(p => [p.label ?? p.key, p.vx, p.vy, ...(size ? [p.size ?? ''] : []), ...(group ? [p.group ?? ''] : [])]),
  }
}

/** A stable default clip id: the same plot rectangle gives the same id. */
const defaultClip = plot => `scatter-clip-${[plot.left, plot.top, plot.width, plot.height].map(v => Math.round(v)).join('-')}`

export default function ScatterFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, clipId, className = 'chart-scatter', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const { plot, axes } = scene
  const clip = clipId ?? defaultClip(plot)
  const ls = labelStyle ?? {}
  const xHit = part('axisHit', 'x'), yHit = part('axisHit', 'y')
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? scatterTable(scene) : null} className={className} {...rest}>
      <defs><clipPath id={clip}><rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} /></clipPath></defs>
      <g className="chart-engine-legend" {...part('legend', scene.legend)}>
        {scene.legend.map(it => (
          <g key={it.key} transform={`translate(${it.x},0)`}>
            <Marker shape={it.shape} x={5} y={it.y} r={4.5} fill={tok(it.color)} />
            <text x={16} y={it.y} dominantBaseline="central" style={{ fontSize: fs(11) }}>{it.label}</text>
          </g>
        ))}
      </g>
      {scene.zones.map(z => (
        <path key={z.key} d={z.d} fill={z.fill ? tok(z.fill) : 'transparent'} fillOpacity={z.fill ? 0.14 : 0} stroke="none" strokeWidth={0} {...part('zone', z)} />
      ))}
      {scene.gridlines.map((g, i) => <line key={i} x1={g.x1} x2={g.x2} y1={g.y1} y2={g.y2} stroke={tok('gray-200')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />)}
      {scene.zones.filter(z => z.label).map(z => (
        <text key={`zl-${z.key}`} x={z.label.x} y={z.label.y} textAnchor={z.label.anchor} fill={tok(z.fill ?? 'gray-500')} fontWeight={600} pointerEvents="none"
          style={{ fontSize: fs(11), textTransform: 'uppercase', letterSpacing: '0.04em' }}>{z.label.text}</text>
      ))}
      {scene.trend?.fill && <path d={scene.trend.fill.d} fill={tok(scene.trend.fill.color)} fillOpacity={0.12} clipPath={`url(#${clip})`} pointerEvents="none" />}
      {scene.partitions.map(p => {
        const hit = part('partitionHit', p)
        return (
          <g key={p.key}>
            <line x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} stroke={tok('gray-500')} strokeWidth={1.25} strokeDasharray="5 3" pointerEvents="none" {...part('partition', p)} />
            {hit && <line x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} stroke="transparent" strokeWidth={10} {...hit} />}
            {p.axis === 'line' && [['from', p.h1], ['to', p.h2]].map(([end, h]) => {
              const knob = part('partitionEnd', { ...p, end, h })
              return knob ? <circle key={end} cx={h.x} cy={h.y} r={4.5} {...knob} /> : null
            })}
          </g>
        )
      })}
      {scene.trend && (() => {
        const tr = scene.trend
        const hit = part('trendHit', tr)
        return (
          <g {...part('trend', tr)}>
            <path d={tr.d} fill="none" stroke={tok(tr.color ?? 'gray-600')} strokeWidth={1.5} strokeDasharray="6 4" clipPath={`url(#${clip})`} {...part('trendLine', tr)} />
            {hit && <path d={tr.d} fill="none" stroke="transparent" strokeWidth={10} clipPath={`url(#${clip})`} {...hit} />}
            {tr.label && <text x={tr.label.x} y={tr.label.y} textAnchor="end" fill={tok('gray-600')} style={{ fontSize: fsNote(10.5), fontFamily: 'var(--font-mono)' }}>{(tr.label.lines ?? [tr.label.text]).map((l, i) => <tspan key={i} x={tr.label.x} dy={i ? tr.label.lineH : 0}>{l}</tspan>)}</text>}
          </g>
        )
      })()}
      {scene.points.map(p => (
        <g key={p.key} {...part('point', p)}>
          <Marker shape={p.shape} x={p.x} y={p.y} r={p.r} fill={tok(p.color)} stroke={tok('surface')} sw={1} {...part('marker', p)} />
          <title>{`${p.label} · x ${p.vx} · y ${p.vy}${p.size != null ? ` · size ${p.size}` : ''}`}</title>
        </g>
      ))}
      <g>
        {scene.labels.map(l => (
          <g key={l.key}>
            {l.leader && <line x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} stroke={tok('gray-400')} strokeWidth={1} pointerEvents="none" />}
            <text x={l.x} y={l.y} textAnchor="middle" fill={tok('gray-700')} style={{ fontSize: fs(11), ...ls, ...(ls.fontSize && l.size ? { fontSize: fs(l.size) } : {}) }} {...part('label', l)}>
              {l.lines.map((t, i) => <tspan key={i} x={l.x} dy={i ? l.lineH ?? 12 : 0} fill={i ? tok('gray-500') : undefined}>{t}</tspan>)}
            </text>
          </g>
        ))}
      </g>
      <g className="chart-engine-axis" {...part('xaxis', axes.x)}>
        {axes.x.ticks.map(t => <text key={t.value} x={t.x} y={axes.x.y + 15} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>)}
        {/* Shared scale: a discreet marker at the end of the linked axis. */}
        {scene.shared?.x && <text x={plot.right - 2} y={plot.bottom - 4} textAnchor="end" fill={tok('gray-400')} style={{ fontSize: fsNote(9) }}>{scene.shared.x}</text>}
        {scene.shared?.y && <text x={plot.left + 4} y={plot.top + 9} fill={tok('gray-400')} style={{ fontSize: fsNote(9) }}>{scene.shared.y}</text>}
        {axes.x.title && <text x={(plot.left + plot.right) / 2} y={scene.height - 4} textAnchor="middle">{axes.x.title}</text>}
        {xHit && <rect x={plot.left} y={plot.bottom} width={plot.width} height={scene.height - plot.bottom} fill="transparent" {...xHit} />}
      </g>
      <g className="chart-engine-axis" {...part('yaxis', axes.y)}>
        {axes.y.ticks.map(t => <text key={t.value} x={axes.y.x - 6} y={t.y} textAnchor="end" dominantBaseline="central" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>)}
        {axes.y.title && <text x={10} y={(plot.top + plot.bottom) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(plot.top + plot.bottom) / 2})`}>{axes.y.title}</text>}
        {yHit && <rect x={0} y={plot.top} width={plot.left} height={plot.height} fill="transparent" {...yHit} />}
      </g>
      {scene.sizeLegend.length > 0 && (() => {
        const knob = part('sizeHandle', scene.sizeLegend[0])
        return (
          <g className="chart-scatter__sizelegend" {...part('sizeLegend', scene.sizeLegend)}>
            {scene.sizeLegend.map((s, i) => (
              <g key={i} pointerEvents="none">
                <circle cx={s.x} cy={s.y} r={s.r} fill="none" stroke={tok('gray-400')} />
                <text x={s.x + s.r + 4} y={s.y + 3.5} fill={tok('gray-500')} style={{ fontSize: fsNote(9.5) }}>{s.text}</text>
              </g>
            ))}
            {knob && <circle cx={scene.sizeLegend[0].x - scene.sizeLegend[0].r} cy={scene.sizeLegend[0].y} r={3.5} {...knob} />}
          </g>
        )
      })()}
      {children}
    </FigureSvg>
  )
}
