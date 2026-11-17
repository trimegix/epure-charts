// ─── epure-charts · waterfall (bridge), drawing only ────────────────────────
// <WaterfallFigure scene={buildWaterfallScene(spec, bridge, { width, height })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. WaterfallView draws through it and adds its editing layer:
//   · part(kind, item) → extra props spread on a drawn element (handlers, class, stroke, opacity):
//     'legend' (the legend group, item = legend items), 'connector' (a connector line, item = connector),
//     'bar' (the group of a bar, item = bar), 'netLine' (a net line group), 'values' (the labels group),
//     'label' (a value label), 'axis' (the value axis group), 'xaxis' (the category axis group),
//     'valueLine' (the value line group), 'table' (the data table group), 'tableCell' (one cell);
//   · slot(kind, item) → nodes drawn at a fixed depth: 'backdrop' (under the gridlines),
//     'connector' (after a connector line, under the bars), 'bar' (inside a bar group, over its rect),
//     'netLine', 'axis', 'valueLine' (inside those groups);
//   · children: drawn over the figure;
//   · labelStyle: CSS spread on the value labels (the user's label font, size, color).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs, fsNote } from './customStyle.js'

const none = () => null

/** The figure's numbers, for the hidden data table (what the labels say: indexed when the scene is). */
function waterfallTable(scene) {
  const running = scene.columns.some(c => c.level)
  return {
    head: running ? ['', 'Value', 'Running total'] : ['', 'Value'],
    rows: scene.columns.map(c => (running ? [c.label, c.text, c.level ?? ''] : [c.label, c.text])),
  }
}

function LegendMark({ it }) {
  if (it.kind === 'whisker') return (
    <g stroke={tok(it.color)} strokeWidth={1.5}>
      <line x1={5} x2={5} y1={it.y + 5} y2={it.y - 4} strokeDasharray="3 2" />
      <line x1={1} x2={9} y1={it.y - 4} y2={it.y - 4} />
    </g>
  )
  if (it.kind === 'net') return <line x1={0} x2={10} y1={it.y} y2={it.y} stroke={tok(it.color)} strokeWidth={2.5} />
  if (it.kind === 'outline') return <rect x={0.75} y={it.y - 4.25} width={8.5} height={8.5} rx={2} fill="none" stroke={tok(it.color)} strokeWidth={1.5} strokeDasharray="3 2" />
  return <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={tok(it.color)} />
}

export default function WaterfallFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, slot = none, className = 'chart-waterfall', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const vl = scene.valueLine
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? waterfallTable(scene) : null} className={className} {...rest}>
      <g className="chart-engine-legend" {...part('legend', scene.legend)}>
        {scene.legend.map(it => (
          <g key={it.key} transform={`translate(${it.x},0)`}>
            <LegendMark it={it} />
            <text x={16} y={it.y} dominantBaseline="central">{it.label}</text>
          </g>
        ))}
      </g>

      {slot('backdrop')}

      {scene.gridlines.map((g, i) => (
        <line key={i} x1={g.x1} x2={g.x2} y1={g.y} y2={g.y}
          stroke={tok(g.strong ? 'gray-800' : g.zero ? 'gray-400' : 'gray-200')} strokeWidth={1} shapeRendering="crispEdges" />
      ))}

      {/* Connectors, under the bars */}
      <g>
        {scene.connectors.map(c => (
          <g key={`${c.from}-${c.to}`}>
            {c.distorted
              // Distorted connector: the anchor does not continue the running total, the conflict is visible.
              ? <line x1={c.x1} x2={c.x2} y1={c.y} y2={c.y2} stroke={tok('red')} strokeWidth={1.25} strokeDasharray="3 2" {...part('connector', c)}><title>{`Connector conflict: ${c.text}`}</title></line>
              : <line x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} stroke={tok(c.linked ? 'gray-600' : 'gray-400')} strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" {...part('connector', c)} />}
            {slot('connector', c)}
          </g>
        ))}
      </g>

      {/* Bars */}
      {scene.bars.map(b => (
        <g key={b.part ? `${b.key}|${b.part}` : b.key} {...part('bar', b)}>
          {b.hypothesis
            // Assumption (working mark): no fill, dotted outline.
            ? <rect x={b.x + 0.75} y={b.y + 0.75} width={Math.max(b.width - 1.5, 1)} height={Math.max(b.height - 1.5, 1)} rx={2}
                fill="none" stroke={tok(b.color)} strokeWidth={1.5} strokeDasharray="4 3" />
            : <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={2} fill={tok(b.color)} />}
          {slot('bar', b)}
        </g>
      ))}

      {/* Upside scenario whiskers */}
      {scene.whiskers.map(w => (
        <g key={w.key} stroke={tok(w.color)} strokeWidth={1.5} pointerEvents="none">
          <line x1={w.x} x2={w.x} y1={w.y1} y2={w.y2} strokeDasharray="3 2" />
          <line x1={w.x - w.cap / 2} x2={w.x + w.cap / 2} y1={w.y2} y2={w.y2} />
        </g>
      ))}

      {/* Net lines: a series outside the stack, one stroke at its level. */}
      {(scene.netLines ?? []).map(n => (
        <g key={`net-${n.key}`} {...part('netLine', n)}>
          <line x1={n.x1} x2={n.x2} y1={n.y} y2={n.y} stroke={tok(n.color)} strokeWidth={2.5} />
          {slot('netLine', n)}
          <title>{`${n.label}: ${n.text}`}</title>
        </g>
      ))}

      {/* Value labels */}
      <g className="chart-engine-values" pointerEvents="none" {...part('values', scene.labels)}>
        {scene.labels.map(l => (
          <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} style={{ fontSize: fs(l.size), fontFamily: 'var(--font-mono)', ...labelStyle }} fontWeight={600} fill={tok(l.color)}
            {...part('label', l)}>{l.text}</text>
        ))}
      </g>

      {/* Difference arrows */}
      {scene.annotations.map(a => (
        <g key={`${a.from}-${a.to}`} className="chart-engine-diff" pointerEvents="none">
          <path d={`M${a.xa},${a.ya} V${a.yTop} H${a.xb} V${a.yb - 5}`} fill="none" stroke={tok('gray-500')} strokeWidth={1} />
          <path d={`M${a.xb - 3.5},${a.yb - 6} L${a.xb},${a.yb} L${a.xb + 3.5},${a.yb - 6} Z`} fill={tok('gray-500')} />
          <rect x={(a.xa + a.xb) / 2 - a.pillW / 2} y={a.yTop - 9} width={a.pillW} height={18} rx={9}
            fill={tok('surface')} stroke={tok('gray-300')} />
          <text x={(a.xa + a.xb) / 2} y={a.yTop} dominantBaseline="central" textAnchor="middle"
            style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }} fontWeight={600} fill={tok('black')}>{a.text}</text>
        </g>
      ))}

      {/* Value axis */}
      <g className="chart-engine-axis" {...part('axis', scene.axes.left)}>
        {slot('axis', scene.axes.left)}
        {scene.axes.left.ticks.map(t => (
          <text key={t.value} x={scene.axes.left.x - 6} y={t.y} textAnchor="end" dominantBaseline="central" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>
        ))}
      </g>
      <g className="chart-engine-axis" {...part('xaxis', scene.axes.x)}>
        {scene.axes.x.ticks.map(t => (
          <text key={t.key} x={t.x} y={scene.axes.x.y + 15} textAnchor="middle" style={{ fontSize: fs(scene.axes.x.font) }}>
            {t.lines.map((line, i) => <tspan key={i} x={t.x} dy={i ? 13 : 0}>{line}</tspan>)}
          </text>
        ))}
      </g>

      {/* Value line */}
      {vl && (
        <g {...part('valueLine', vl)}>
          <line x1={vl.x1} x2={vl.x2} y1={vl.y} y2={vl.y} stroke={tok('black')} strokeWidth={1.25} strokeDasharray="5 3" />
          {slot('valueLine', vl)}
          <text x={vl.x2 - 2} y={vl.y - 4} textAnchor="end" fill={tok('black')} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }}>{vl.text}</text>
        </g>
      )}

      {/* Data table under the axis: one cell per column */}
      {scene.table && (
        <g className="chart-engine-axis" {...part('table', scene.table)}>
          {scene.table.heads.map(h => <text key={h.key} x={h.x} y={h.y} textAnchor="end" style={{ fontSize: fsNote(10) }}>{h.text}</text>)}
          {scene.table.rows.map(r => (
            <text key={r.key} x={r.x} y={r.y} textAnchor="middle" fill={tok(r.color)} fontWeight={r.row === 'value' ? 600 : 400} style={{ fontSize: fsNote(10), fontFamily: 'var(--font-mono)' }}
              {...part('tableCell', r)}>{r.text}{r.text !== r.full && <title>{r.full}</title>}</text>
          ))}
        </g>
      )}
      {children}
    </FigureSvg>
  )
}
