// ─── epure-charts · horizontal bars, drawing only ───────────────────────────
// <BarhFigure scene={buildBarhScene(spec, rows, { width, format })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. BarhView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke), spread
//     after the defaults. Kinds:
//       'band'     a row's full-width background rect (item: the scene row; hover, select);
//       'bars'     the group of bars and profile lines (item: the scene);
//       'bar'      one bar or segment (item: the scene bar);
//       'marker'   the marker on a range bar (item: the scene row);
//       'rowLabel' a row label (item: the scene row);
//       'values'   the group of value labels and value lines (item: the scene);
//       'value'    one value label (item: the scene label);
//       'axis'     the value axis group (item: scene.axis);
//       'legend'   the legend group (item: scene.legend);
//   · children: drawn over the figure (rotation handle);
//   · labelStyle: CSS spread on the value labels (the user's label font, size, color);
//   · patternScope: the id prefix of the fill patterns (unique per chart on a page).
import FigureSvg from './FigureSvg.jsx'
import { sceneDrawn } from './sceneProbe.js'
import PatternDefs from './patterns.jsx'
import { tok, fs, fsNote, colorId } from './customStyle.js'

const none = () => null

/** The figure's numbers, for the hidden data table: one row per bar row. */
function barhTable(scene) {
  const ranged = scene.bars.some(b => b.range)
  const marked = scene.rows.some(r => r.marker)
  if (ranged) {
    return {
      head: ['', 'Low', 'High', ...(marked ? ['Marker'] : [])],
      rows: scene.rows.map(r => {
        const b = scene.bars.find(z => z.key === r.key)
        return [r.full, b?.range?.[0] ?? '', b?.range?.[1] ?? '', ...(marked ? [r.marker?.value ?? ''] : [])]
      }),
    }
  }
  const ids = [...new Set(scene.bars.map(b => b.seriesId))]
  const cols = scene.columns ?? []
  return {
    head: ['', ...ids.map(id => scene.legend.find(l => l.key === id)?.label ?? id), ...cols.map(c => c.label)],
    rows: scene.rows.map(r => [r.full, ...ids.map(id => scene.bars.find(b => b.key === r.key && b.seriesId === id)?.value ?? ''),
      ...cols.map(c => c.cells.find(cell => cell.rowKey === r.key)?.text ?? '')]),
  }
}

export default function BarhFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, patternScope = 'barh', className = 'chart-barh', children = null, ...rest }) {
  sceneDrawn(scene)
  if (!scene || scene.empty) return null
  const fill = b => (b.pattern ? `url(#${patternScope}-pt-${b.pattern}-${colorId(b.color)})` : tok(b.color))
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? barhTable(scene) : null} className={className} {...rest}>
      <defs><PatternDefs scope={patternScope} items={[...scene.bars, ...(scene.legend ?? [])]} /></defs>
      <g className="chart-engine-legend" {...part('legend', scene.legend)}>
        {scene.legend.map(it => (
          it.anchor === 'end' || it.anchor === 'start'
            // Butterfly: each series name above its side.
            ? <text key={it.key} x={it.x} y={it.y} textAnchor={it.anchor} dominantBaseline="central" fill={tok(it.color)} fontWeight={600}>{it.label}</text>
            : <g key={it.key} transform={`translate(${it.x},0)`}>
              {it.line ? <line x1={0} x2={11} y1={it.y} y2={it.y} stroke={tok(it.color)} strokeWidth={2} /> : <rect x={0} y={it.y - 5} width={10} height={10} rx={2} fill={fill(it)} stroke={it.pattern ? tok(it.color) : undefined} strokeWidth={it.pattern ? 0.75 : undefined} />}
              <text x={16} y={it.y} dominantBaseline="central">{it.label}</text>
            </g>
        ))}
      </g>

      {scene.rows.map(r => (
        <rect key={`h-${r.key}`} x={0} y={r.y0} width={scene.width} height={r.y1 - r.y0} fill="transparent" {...part('band', r)} />
      ))}

      {scene.gridlines.map((g, i) => (
        <line key={i} x1={g.x} x2={g.x} y1={g.y1} y2={g.y2} stroke={tok(g.zero ? 'gray-400' : 'gray-200')}
          strokeWidth={1} strokeDasharray={g.dash ? '3 3' : undefined} shapeRendering="crispEdges" pointerEvents="none" />
      ))}

      <g pointerEvents="none" {...part('bars', scene)}>
        {scene.bars.map(b => (
          <rect key={`${b.key}|${b.seriesId}`} x={b.x} y={b.y} width={b.width} height={b.height} rx={2} fill={fill(b)}
            stroke={b.pattern ? tok(b.color) : undefined} strokeWidth={b.pattern ? 1 : undefined} {...part('bar', b)} />
        ))}
        {/* Profile (and combo lines, over the bars): one line per series, row to row, with its points. */}
        {(scene.profiles ?? []).map(pr => (
          <g key={`pf-${pr.seriesId}`} pointerEvents="none">
            <path d={pr.d} fill="none" stroke={tok(pr.color)} strokeWidth={2} strokeDasharray={pr.dash ?? undefined} />
            {pr.points.map(p => <circle key={p.key} cx={p.x} cy={p.y} r={4} fill={tok(pr.color)} stroke={tok('surface')} strokeWidth={1.5} />)}
          </g>
        ))}
        {/* Range marker (median, mean or the row's own): a dot or a tick on the range bar. */}
        {scene.rows.filter(r => r.marker).map(r => {
          const m = r.marker
          return (
            <g key={`mk-${r.key}`} {...part('marker', r)}>
              {m.shape === 'line'
                ? <line x1={m.x} x2={m.x} y1={m.y - m.h / 2} y2={m.y + m.h / 2} stroke={tok(m.color)} strokeWidth={2.5} />
                : <circle cx={m.x} cy={m.y} r={m.r} fill={tok(m.color)} stroke={tok('surface')} strokeWidth={1.5} />}
              {m.text && <text x={m.tx} y={m.ty} textAnchor="middle" fill={tok(m.color)} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke"
                style={{ fontSize: fsNote(10), fontFamily: 'var(--font-mono)' }}>{m.text}</text>}
            </g>
          )
        })}
      </g>

      {/* Row labels, left-aligned (centered on a butterfly). */}
      <g className="chart-engine-axis">
        {scene.rows.map(r => (
          <text key={`l-${r.key}`} x={r.center ? scene.plot.center : 0} y={r.lines ? r.y - 2.5 : r.y + 4} textAnchor={r.center ? 'middle' : 'start'}
            style={{ fontSize: fs(11), fontWeight: r.emphasis ? 600 : 400, fill: r.emphasis ? 'var(--black)' : undefined }}
            {...part('rowLabel', r)}>
            <title>{r.full}</title>
            {/* A long label wraps onto two lines (scene row.lines) before being shortened. */}
            {r.lines ? r.lines.map((l, i) => <tspan key={i} x={r.center ? scene.plot.center : 0} dy={i ? 13 : 0}>{l}</tspan>) : r.label}
          </text>
        ))}
      </g>

      {/* Extra value columns (spec.columns): header above the rows, figures right-aligned. */}
      {(scene.columns ?? []).length > 0 && (
        <g className="chart-engine-columns" pointerEvents="none">
          {scene.columns.map(c => (
            <g key={`c-${c.key}`}>
              {c.header && <text x={c.header.x} y={c.header.y} textAnchor="end" fill={tok('gray-500')} style={{ fontSize: fs(10), fontWeight: 600 }}>{c.header.text}</text>}
              {c.cells.map(cell => (
                <text key={cell.rowKey} x={cell.x} y={cell.y} textAnchor="end" fill={tok('gray-700')} style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }}>{cell.text}</text>
              ))}
            </g>
          ))}
        </g>
      )}

      <g pointerEvents="none" {...part('values', scene)}>
        {scene.labels.map(l => (
          <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color ?? 'gray-700')} fontWeight={600}
            // A number written INSIDE a segment leaves the click to the segment.
            pointerEvents={l.color === 'white' ? 'none' : undefined}
            style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)', ...labelStyle }} {...part('value', l)}>{l.text}</text>
        ))}
        {scene.annotations.map((a, i) => (
          <g key={`a${i}`}>
            <line x1={a.x} x2={a.x} y1={a.y1} y2={a.y2} stroke={tok(a.color)} strokeWidth={1.25} strokeDasharray={a.dash} />
            {a.text && <text x={a.tx} y={a.y1 - 4} textAnchor={a.anchor} fill={tok(a.color)} style={{ fontSize: fs(10.5) }}>{a.text}</text>}
          </g>
        ))}
      </g>

      {scene.axis && (
        <g className="chart-engine-axis" pointerEvents="none" {...part('axis', scene.axis)}>
          {scene.axis.ticks.map(t => (
            <text key={t.value} x={t.x} y={scene.axis.y} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }}>{t.label}</text>
          ))}
        </g>
      )}
      {children}
    </FigureSvg>
  )
}
