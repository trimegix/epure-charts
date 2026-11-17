// ─── epure-charts · Mekko, drawing only ─────────────────────────────────────
// <MekkoFigure scene={buildMekkoScene(spec, columns, { width, height, format })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. MekkoView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke), spread
//     after the defaults. Kinds:
//       'legend'          the legend group (item: scene.legend);
//       'segment'         one segment rect (item: the scene segment);
//       'label'           one segment label or column total (item: the scene label);
//       'valueLine'       the value line group (item: scene.valueLine);
//       'valueLineStroke' its visible line (item: scene.valueLine; selection color);
//       'hundred'         the "100%" indicator text (item: scene.hundred);
//       'grandTotal'      the grand total text (item: scene.grandTotal);
//       'tableHead'       a data table row header (item: the head);
//       'tableCell'       a data table cell (item: the cell);
//       'yaxis'           the value axis group (item: scene.axes.y);
//   · children: drawn over the figure (the "Other" handle, drag tips);
//   · labelStyle: CSS spread on the segment labels (the user's label font, size, color).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs, fsNote } from './customStyle.js'

const none = () => null

/** The figure's numbers, for the hidden data table: one row per column, one cell per series. */
function mekkoTable(scene) {
  const ids = [...new Set(scene.segments.map(s => s.seriesId))]
  const labelOf = id => scene.segments.find(s => s.seriesId === id)?.label ?? id
  return {
    head: ['', ...ids.map(labelOf), 'Total'],
    rows: scene.columns.map(c => [c.label, ...ids.map(id => scene.segments.find(s => s.colKey === c.key && s.seriesId === id)?.value ?? ''), c.total]),
  }
}

export default function MekkoFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, className = 'chart-mekko', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const mono = { fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? mekkoTable(scene) : null} className={className} {...rest}>
      <g className="chart-engine-legend" {...part('legend', scene.legend)}>
        {scene.legend.map(it => (
          <g key={it.key} transform={`translate(${it.x},0)`}>
            {it.line ? <line x1={0} x2={11} y1={it.y} y2={it.y} stroke={tok(it.color)} strokeWidth={2.5} /> : <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={tok(it.color)} />}
            <text x={16} y={it.y} dominantBaseline="central" style={{ fontSize: fs(11) }}>{it.label}</text>
          </g>
        ))}
      </g>
      {scene.axes.y.ticks.map(t => <line key={t.value} x1={scene.plot.left} x2={scene.plot.right} y1={t.y} y2={t.y} stroke={tok('gray-200')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />)}
      {scene.segments.map(s => (
        <rect key={s.key} x={s.x} y={s.y} width={Math.max(0, s.width)} height={Math.max(0, s.height)} fill={tok(s.color)}
          stroke={s.stroke ? tok(s.stroke.color) : 'none'} strokeWidth={s.stroke?.width ?? 0} {...part('segment', s)}>
          <title>{`${s.label} · ${s.shareText} · ${s.valueText}`}</title>
        </rect>
      ))}
      {/* Net lines: one stroke per column, at the series value. */}
      {(scene.netLines ?? []).map(n => <line key={`net-${n.key}`} x1={n.x1} x2={n.x2} y1={n.y} y2={n.y} stroke={tok(n.color)} strokeWidth={2.5} pointerEvents="none" />)}
      {scene.ridges.map(r => <rect key={`ridge-${r.key}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" stroke={tok('black')} strokeWidth={1.75} pointerEvents="none" />)}
      {scene.labels.filter(l => l.leader).map(l => <line key={`lead-${l.key}`} x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} stroke={tok('gray-500')} strokeWidth={0.75} pointerEvents="none" />)}
      {scene.labels.map(l => (
        <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={600} pointerEvents={l.color === 'white' ? 'none' : undefined}
          style={{ ...mono, ...labelStyle }} {...part('label', l)}>{l.text}</text>
      ))}
      {scene.valueLine && (() => {
        const v = scene.valueLine
        return (
          <g {...part('valueLine', v)}>
            <line x1={v.x1} x2={v.x2} y1={v.y} y2={v.y} stroke={tok('black')} strokeWidth={1.25} strokeDasharray="5 3" {...part('valueLineStroke', v)} />
            <line x1={v.x1} x2={v.x2} y1={v.y} y2={v.y} stroke="transparent" strokeWidth={10} />
            <text x={v.labelX} y={v.labelY} textAnchor="start" fill={tok('black')} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" style={mono}>{v.text}</text>
            <title>{v.name ? `${v.name} · ${v.text}` : v.text}</title>
          </g>
        )
      })()}
      {scene.hundred && (
        <text x={scene.hundred.x} y={scene.hundred.y} textAnchor={scene.hundred.anchor} fill={tok('gray-700')} fontWeight={600}
          style={mono} {...part('hundred', scene.hundred)}>{scene.hundred.text}</text>
      )}
      {scene.grandTotal && (
        <text x={scene.grandTotal.x} y={scene.grandTotal.y} textAnchor={scene.grandTotal.anchor} fill={tok('black')} fontWeight={600}
          style={mono} {...part('grandTotal', scene.grandTotal)}>{scene.grandTotal.text}</text>
      )}
      {scene.table.heads.length > 0 && (
        <g className="chart-engine-axis">
          {scene.table.heads.map(h => (
            <text key={h.seriesId} x={h.x} y={h.y} textAnchor="end" {...part('tableHead', h)}>{h.text}</text>
          ))}
          {scene.table.rows.map(r => (
            <text key={r.key} x={r.x} y={r.y} textAnchor="middle" style={{ fontSize: fsNote(10), fontFamily: 'var(--font-mono)' }}
              {...part('tableCell', r)}>{r.text}{r.text !== r.full && <title>{r.full}</title>}</text>
          ))}
        </g>
      )}
      <g className="chart-engine-axis" {...part('yaxis', scene.axes.y)}>
        {scene.axes.y.ticks.map(t => <text key={t.value} x={scene.plot.left - 6} y={t.y} textAnchor="end" dominantBaseline="central" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>)}
        <rect x={0} y={scene.plot.top} width={scene.plot.left} height={scene.plot.height} fill="transparent" />
      </g>
      <g className="chart-engine-axis" pointerEvents="none">
        {scene.axes.x.ticks.map(t => (
          <g key={t.key}>
            <text x={t.x} y={scene.axes.x.y + 14} textAnchor="middle">{t.label}</text>
            {t.share && <text x={t.x} y={scene.axes.x.y + 27} textAnchor="middle" style={{ fontSize: fsNote(10), fontFamily: 'var(--font-mono)' }}>{t.share}</text>}
          </g>
        ))}
      </g>
      {children}
    </FigureSvg>
  )
}
