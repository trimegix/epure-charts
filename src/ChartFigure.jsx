// ─── epure-charts · cartesian chart (bars, lines, areas), drawing only ──────
// <ChartFigure scene={buildScene(spec, resolved, { width, height })} />
// <ChartFigure scene={buildProfileScene(spec, resolved, { width, height })} /> (profile chart)
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. ChartView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, opacity,
//     selection stroke), spread after the defaults. A `style` returned for a 'label'
//     is merged into the label's own style. Kinds:
//       'legend' (the legend group; item: the entries), 'legendItem' (an entry),
//       'area', 'bar', 'line' (the group of a line: path, markers),
//       'valueLineText', 'connector', 'errorBar', 'note', 'labels' (the labels group),
//       'label', 'cagr', 'endLabel', 'tableHead' (header of a table column),
//       'yAxisLine' ({ side, axis }: returning props also draws a line the scene left out),
//       'yTick' ({ side, tick }), 'yTitle' ({ side, axis, y }),
//       'xAxisLine' (the x axis; same rule as 'yAxisLine'), 'xTick' (a tick group),
//       'xTitle', 'rowHead' (a data table row header);
//     profile chart: 'legend', 'line', 'catTick', 'valueTick';
//   · layers: editing elements that must sit at a given depth (hit areas under the
//     marks, outlines over the bars…), each drawn at its place:
//       under (after the legend, under everything), grid (over the gridlines),
//       bars (over the bars), breaks (over the axis breaks), marks (over the error bars
//       and connectors), labels (over the value labels), over (over the annotations,
//       under the table columns and axes), axesUnder / axesOver (first / last in the
//       axes group); profile chart: under;
//   · children: drawn over the whole figure;
//   · scope: the id prefix of the clip path and patterns (unique per chart on a page;
//     by default a hash of the scene, stable between server and browser).
import FigureSvg from './FigureSvg.jsx'
import PatternDefs from './patterns.jsx'
import { tok, fontFamily, fs, fsNote } from './customStyle.js'
import { estimateWidth } from './scene.js'
import { t } from './locale.js'
import { arrowHead, patternId, sceneScope } from './chartGeom.js'
import { Swatch, Marker } from './chartMarks.jsx'

const none = () => null
const NO_LAYERS = {}

// The plot frame: the axes' extent (min → max). A series beyond a manual max is
// clipped at the frame; in automatic mode, a 4 px margin keeps markers whole.
function clipRect(scene) {
  const axs = [scene.axes.left, scene.axes.right].filter(a => a?.frame)
  const manual = axs.some(a => a.manual)
  const top = axs.length ? Math.min(...axs.map(a => a.frame[0])) - (manual ? 1 : 4) : scene.plot.top - 4
  const bot = axs.length ? Math.max(...axs.map(a => a.frame[1])) + (manual ? 1 : 0) : scene.plot.bottom
  return { x: 0, y: top, width: scene.width, height: Math.max(0, bot - top) }
}

/** The figure's numbers, for the hidden data table: one row per category, one column per series. */
function chartTable(scene) {
  const cols = scene.columns.filter(c => !String(c.key).startsWith('_'))
  const series = []
  for (const c of cols) for (const it of c.items) if (!series.some(s => s.id === it.seriesId)) series.push({ id: it.seriesId, label: it.label })
  return { head: ['', ...series.map(s => s.label)], rows: cols.map(c => [c.label, ...series.map(s => c.items.find(it => it.seriesId === s.id)?.text ?? '')]) }
}

function profileTable(scene) {
  const name = id => scene.legend.find(it => it.seriesId === id)?.label ?? id
  return {
    head: ['', ...scene.lines.map(l => name(l.seriesId))],
    rows: scene.axes.cat.map(c => [c.label, ...scene.lines.map(l => l.points.find(p => p.key === c.key)?.value ?? '')]),
  }
}

// Wavy band across the plot (axis break), or a straight one.
function breakPath(scene, b, y0) {
  if (b.shape === 'straight') return `M${scene.plot.left - 6},${y0} H${scene.plot.right + 6}`
  let d = `M${scene.plot.left - 6},${y0}`
  for (let x = scene.plot.left - 6; x < scene.plot.right + 6; x += 8) d += ' q2,-3 4,0 q2,3 4,0'
  return d
}

// Wave at the exact width of a bar (last step shortened): column break, cut bar.
function barWave(a, y0) {
  let d = `M${a.x},${y0}`
  let x = a.x
  while (x < a.x + a.width - 0.5) { const st = Math.min(6, a.x + a.width - x); d += ` q${st / 4},-2.5 ${st / 2},0 q${st / 4},2.5 ${st / 2},0`; x += st }
  return d
}

function ErrorBar({ a, extra }) {
  if (a.thick) return <rect x={a.x - a.cap / 2} y={Math.min(a.y1, a.y2)} width={a.cap} height={Math.abs(a.y2 - a.y1)} fill={tok(a.color ?? 'gray-400')} opacity={0.55} pointerEvents="none" />
  const c = tok(a.color ?? 'gray-700')
  // An end in its shape: line, none, dot, arrowhead (pointing outward).
  const cap = (yy, shape, dir) => (shape === 'none' ? null
    : shape === 'dot' ? <circle cx={a.x} cy={yy} r={2.5} fill={c} />
    : shape === 'arrow' ? <path d={`M${a.x - 3.5},${yy - dir * 5} L${a.x},${yy} L${a.x + 3.5},${yy - dir * 5} Z`} fill={c} />
    : <path d={`M${a.x - a.cap / 2},${yy} H${a.x + a.cap / 2}`} stroke={c} strokeWidth={a.weight ?? 1} />)
  const up = a.y1 <= a.y2 ? -1 : 1
  return (
    <g pointerEvents="none" {...extra}>
      <path d={`M${a.x},${a.y1} V${a.y2}`} stroke={c} strokeWidth={a.weight ?? 1} fill="none" />
      {cap(a.y1, a.capHi, up)}
      {cap(a.y2, a.capLo, -up)}
    </g>
  )
}

function Profile({ scene: P, layers: L, part, children, table, rest }) {
  return (
    <FigureSvg width={P.width} height={P.height} {...table} {...rest}>
      <g className="chart-engine-legend" style={{ fontSize: fs(11) }} {...part('legend', P.legend)}>
        {P.legend.map(it => (
          <g key={it.seriesId} transform={`translate(${it.x},0)`} opacity={it.empty ? 0.5 : 1}>
            <Swatch item={it} x={0} y={it.y} />
            <text x={20} y={it.y} dominantBaseline="central">{it.text}</text>
          </g>
        ))}
      </g>
      {L.under}
      {P.gridlines.map((g, i) => (
        <line key={`pg${i}`} x1={g.x} x2={g.x} y1={g.y1} y2={g.y2} stroke={tok(g.zero ? 'gray-400' : 'gray-200')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />
      ))}
      {P.lines.map(l => (
        <g key={l.seriesId} {...part('line', l)}>
          {l.d && <path d={l.d} fill="none" stroke={tok(l.color)} strokeWidth={l.strokeWidth} strokeDasharray={l.dash ?? undefined} strokeLinejoin="round" />}
          {l.d && <path d={l.d} fill="none" stroke="transparent" strokeWidth={10} />}
          {l.markerShape && l.points.map(m => <Marker key={m.key} shape={l.markerShape} x={m.x} y={m.y} fill={tok('white')} stroke={tok(l.color)} />)}
        </g>
      ))}
      {P.labels.map(l => (
        <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={600} stroke={tok('surface')} strokeWidth={3} paintOrder="stroke"
          pointerEvents="none" style={{ fontSize: fs(l.size), fontFamily: 'var(--font-mono)' }}>{l.text}</text>
      ))}
      <g className="chart-engine-axis" style={{ fontSize: fs(11) }}>
        {P.axes.cat.map(c => (
          <text key={c.key} x={P.plot.left - 8} y={c.y} textAnchor="end" dominantBaseline="central" {...part('catTick', c)}>{c.label}</text>
        ))}
        {P.axes.value.map(t => (
          <text key={`pv${t.value}`} x={t.x} y={P.plot.bottom + 15} textAnchor="middle" {...part('valueTick', t)}>{t.label}</text>
        ))}
      </g>
      {children}
    </FigureSvg>
  )
}

export default function ChartFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, layers = NO_LAYERS, scope: scopeIn, className, children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const shell = { meta: scene.meta, label, responsive, dataTable, className }
  if (scene.profile) {
    return <Profile scene={scene} layers={layers} part={part} table={{ ...shell, table: dataTable ? profileTable(scene) : null }} rest={rest}>{children}</Profile>
  }
  const S = scene
  const L = layers
  const clip = clipRect(S)
  const scope = scopeIn ?? sceneScope(S, clip)
  const clipUrl = `url(#${scope}-clip)`
  const off = S.legendOffset
  const X = S.axes.x
  const xLine = part('xAxisLine', X)
  return (
    <FigureSvg width={S.width} height={S.height} {...shell} table={dataTable ? chartTable(S) : null} {...rest}>
      {/* Legend (and its frame), moved as a whole when dragged by hand. */}
      <g transform={off ? `translate(${off.dx},${off.dy})` : undefined}>
        {S.legendFrame && <rect x={S.legendFrame.x} y={S.legendFrame.y} width={S.legendFrame.width} height={S.legendFrame.height} rx={3} fill="none"
          stroke={tok(S.legendFrame.color ?? 'gray-300')} strokeDasharray={{ dash: '4 3', dot: '1.5 2' }[S.legendFrame.style]} pointerEvents="none" />}
        <g className="chart-engine-legend" transform={`translate(0,${S.legendY})`} style={{ fontSize: fs(11 * (S.legendScale ?? S.fontScale)) }} {...part('legend', S.legend)}>
          {S.legend.map(it => (
            <g key={it.seriesId} transform={`translate(${it.x},0)`} opacity={it.empty ? 0.5 : 1} {...(it.empty ? null : part('legendItem', it))}>
              <Swatch item={it} x={0} y={it.y} scope={scope} />
              <text x={20} y={it.y} dominantBaseline="central">{it.text}</text>
            </g>
          ))}
        </g>
      </g>
      {L.under}

      {/* Reference bands (under everything else) */}
      {S.annotations.filter(a => a.type === 'band').map((a, i) => (
        <rect key={`b${i}`} x={a.x} y={a.y} width={a.width} height={a.height} fill={tok(a.color)} fillOpacity={0.7} pointerEvents="none" />
      ))}

      {/* Gridlines */}
      {S.gridlines.map((g, i) => (
        <line key={`g${i}`} x1={g.x1} x2={g.x2} y1={g.y} y2={g.y}
          stroke={tok(g.zero ? 'gray-400' : S.gridColor ?? (S.gridTone === 'dark' ? 'gray-300' : 'gray-200'))} strokeWidth={1}
          strokeDasharray={S.gridStyle === 'dash' && !g.zero ? '3 3' : undefined} shapeRendering="crispEdges" />
      ))}
      {L.grid}

      <defs>
        <PatternDefs scope={scope} items={[...S.bars, ...S.legend]} />
        <clipPath id={`${scope}-clip`}><rect x={clip.x} y={clip.y} width={clip.width} height={clip.height} /></clipPath>
      </defs>

      {/* Areas and bars */}
      <g clipPath={clipUrl}>
        {S.areas.map(a => a.d && (
          <path key={a.seriesId} d={a.d} fill={tok(a.color)} fillOpacity={a.opacity} stroke="none" {...part('area', a)} />
        ))}
        {S.bars.map(b => (
          <rect key={`${b.seriesId}|${b.key}`} x={b.x} y={b.y} width={Math.max(0, b.width)} height={Math.max(0, b.height)}
            rx={1.5} fill={b.hollow ? tok('surface') : b.pattern ? `url(#${patternId(scope, b.pattern, b.color)})` : tok(b.color)} opacity={b.opacity}
            // Outline: an assumption's (dotted), otherwise the chosen one; a patterned bar keeps a thin rule in its color.
            stroke={b.hollow ? tok(b.color) : b.stroke ? tok(b.stroke) : b.pattern ? tok(b.color) : undefined}
            strokeWidth={b.hollow ? 1.5 : b.stroke ? b.strokeWidth : b.pattern ? 1 : undefined}
            strokeDasharray={b.hollow ? '3 2' : b.strokeDash ?? undefined}
            {...part('bar', b)} />
        ))}
      </g>
      {L.bars}

      {/* Lines (forecast paler) and markers */}
      <g clipPath={clipUrl}>
        {S.lines.map(l => (
          <g key={l.seriesId} {...part('line', l)}>
            {l.d && <path d={l.d} fill="none" stroke={tok(l.color)} strokeWidth={l.strokeWidth}
              strokeDasharray={l.dash ?? undefined} strokeLinejoin="round" strokeLinecap={l.dash ? 'butt' : 'round'} />}
            {l.dConn && <path d={l.dConn} fill="none" stroke={tok(l.color)} strokeWidth={0.75} strokeDasharray="2 2" />}
            {l.dForecast && <path d={l.dForecast} fill="none" stroke={tok(l.color)} strokeWidth={l.strokeWidth}
              strokeDasharray={l.dash ?? '3 3'} strokeOpacity={0.55} />}
            {/* Widened hit area: a 2 px line is hard to point at. */}
            {(l.d || l.dForecast) && <path d={[l.d, l.dForecast].filter(Boolean).join(' ')} fill="none" stroke="transparent" strokeWidth={10} />}
            {l.markers.map((m, i) => (
              <Marker key={i} shape={l.markerShape} x={m.x} y={m.y} fill={tok('white')} stroke={tok(m.color ?? l.color)} />
            ))}
          </g>
        ))}
      </g>

      {/* Axis break: a band in the background color edged by two wavy lines, across the plot. */}
      {['left', 'right'].map(sd => {
        const b = S.axes[sd]?.brk
        if (!b) return null
        return (
          <g key={`brk-${sd}`} pointerEvents="none">
            <rect x={S.plot.left - 6} y={b.y - b.gap / 2} width={S.plot.width + 12} height={b.gap} fill={tok('surface')} />
            <path d={breakPath(S, b, b.y - b.gap / 2)} fill="none" stroke={tok('gray-400')} strokeWidth={1} />
            <path d={breakPath(S, b, b.y + b.gap / 2)} fill="none" stroke={tok('gray-400')} strokeWidth={1} />
          </g>
        )
      })}
      {L.breaks}

      {/* Value lines (target, threshold) */}
      {S.annotations.filter(a => a.type === 'valueLine').map((a, i) => (
        <g key={`v${i}`} pointerEvents="none">
          <line x1={a.x1} x2={a.x2} y1={a.y} y2={a.y} stroke={tok(a.color)} strokeWidth={1.25} strokeDasharray={a.dash} />
          {a.text && <text x={a.tx} y={a.ty} textAnchor={a.anchor} fill={tok(a.textColor)} style={{ fontSize: fsNote(10), fontFamily: 'var(--font)' }}
            pointerEvents="none" {...part('valueLineText', a)}>{a.text}</text>}
        </g>
      ))}

      {/* Vertical markers (e.g. an event date) */}
      {S.annotations.filter(a => a.type === 'xMarker').map((a, i) => (
        <g key={`x${i}`} pointerEvents="none">
          <line x1={a.x} x2={a.x} y1={a.y1} y2={a.y2} stroke={tok(a.color)} strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.8} />
          {a.text && <text x={a.x + 4} y={a.y1 + 10} fill={tok(a.color)} style={{ fontSize: fsNote(10), fontFamily: 'var(--font)' }}>{a.text}</text>}
        </g>
      ))}

      {/* Min / max: the point (its number is among the labels) */}
      {S.annotations.filter(a => a.type === 'extremes').flatMap(a => a.items.map(it => (
        <circle key={`${a.seriesId}-${it.kind}`} cx={it.x} cy={it.y} r={3} fill={tok('gray-700')} pointerEvents="none" />
      )))}

      {/* Series connectors and error bars */}
      {S.annotations.filter(a => a.type === 'connector').map((a, i) => (
        <line key={`cn${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={tok('gray-500')} strokeWidth={0.75} strokeDasharray="3 2" pointerEvents="none" {...part('connector', a)} />
      ))}
      {S.annotations.filter(a => a.type === 'errorBar').map(a => (
        <ErrorBar key={`eb-${a.seriesId}-${a.key}-${a.pair ?? 0}`} a={a} extra={a.thick ? null : part('errorBar', a)} />
      ))}
      {/* Broken column, or a bar cut by a manual axis max: a wavy band across the bar. */}
      {S.annotations.filter(a => a.type === 'colBreak' || a.type === 'overflowCut').map(a => (
        <g key={`${a.type}-${a.key}-${a.seriesId}`} pointerEvents="none">
          <rect x={a.x} y={a.y - 3} width={a.width} height={6} fill={tok('surface')} />
          <path d={barWave(a, a.y - 3)} fill="none" stroke={tok('gray-500')} strokeWidth={1} />
          <path d={barWave(a, a.y + 3)} fill="none" stroke={tok('gray-500')} strokeWidth={1} />
        </g>
      ))}
      {/* Universal connectors: elbow above the higher of the two (or a straight line). */}
      {S.annotations.filter(a => a.type === 'link').map(a => {
        const top = Math.min(a.y1, a.y2) - 12
        const d = a.elbow ? `M${a.x1},${a.y1} V${top} H${a.x2} V${a.y2}` : `M${a.x1},${a.y1} L${a.x2},${a.y2}`
        return <path key={`lk${a.i}`} d={d} fill="none" stroke={tok('gray-600')} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
      })}
      {L.marks}

      {/* Labels placed outside their segment, linked by a leader line */}
      {S.labels.filter(l => l.leader && !l.moved).map(l => (
        <line key={`lk-${l.key}`} x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} stroke={tok('gray-400')} strokeWidth={0.75} pointerEvents="none" />
      ))}
      {/* Background of a label wider than its segment */}
      {S.labels.filter(l => l.backdrop).map(l => (
        <rect key={`bd-${l.key}`} x={l.x - l.backdropW / 2} y={l.y - l.size * 0.85} width={l.backdropW} height={l.size * 1.2} rx={2} fill={tok(l.backdrop)} pointerEvents="none" />
      ))}
      {/* Free texts */}
      {(S.notes ?? []).map(n => (
        <text key={`note${n.i}`} x={n.x} y={n.y} textAnchor={n.anchor ?? 'start'} fill={tok('gray-700')} fontWeight={n.bold ? 700 : 500}
          transform={n.rotate ? `rotate(${-n.rotate} ${n.x} ${n.y})` : undefined}
          dominantBaseline={n.valign === 'middle' ? 'central' : n.valign === 'bottom' ? 'text-after-edge' : undefined}
          pointerEvents="none" style={{ fontSize: fs(n.size) }} {...part('note', n)}>
          {String(n.text || t('Text', scene.meta?.locale)).split('\n').map((line, j) => <tspan key={j} x={n.x} dy={j ? n.size * 1.25 : 0}>{line}</tspan>)}
        </text>
      ))}
      {/* Leader line of a label moved far from its place. */}
      {S.labels.filter(l => l.moved && !l.inBar && Math.hypot(l.x - l.ox, l.y - l.size * 0.35 - l.oy) > 16).map(l => (
        <line key={`ld-${l.key}`} x1={l.ox} y1={l.oy} x2={l.x} y2={l.y - l.size * 0.35} stroke={tok('gray-400')} strokeWidth={0.75} pointerEvents="none" />
      ))}
      {/* Value labels and totals */}
      <g pointerEvents="none" {...part('labels', S.labels)}>
        {S.labels.map(l => {
          const p = part('label', l)
          return (
            <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={l.weight ?? 600}
              // Background halo: a number on a curve stays legible (except inside a segment).
              stroke={l.color === 'white' ? undefined : tok('surface')} strokeWidth={l.color === 'white' ? undefined : 3} paintOrder="stroke"
              transform={l.rotate ? `rotate(${-l.rotate} ${l.x} ${l.y})` : undefined}
              {...p}
              style={{ fontSize: fs(l.size), fontStyle: l.italic ? 'italic' : undefined, fontFamily: fontFamily(l.font), fill: l.on ? tok(l.color) : undefined,
                textDecoration: l.underline ? 'underline' : l.overwritten ? 'underline dotted' : undefined, ...labelStyle, ...p?.style }}>{l.text}</text>
          )
        })}
      </g>
      {/* A label's frame (border of its cell in the sheet). */}
      {S.labels.filter(l => l.border && !l.rotate).map(l => {
        const w = estimateWidth(l.text, l.size)
        const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2
        return <rect key={`bx-${l.key}`} x={x0 - 3} y={l.y - l.size - 1} width={w + 6} height={l.size + 5} rx={2} fill="none" stroke={tok(l.color === 'white' ? 'white' : 'gray-700')} strokeWidth={0.75} pointerEvents="none" />
      })}
      {L.labels}

      {/* Annotated points (the last actual and its differences) */}
      {S.annotations.filter(a => a.type === 'callout').map((a, i) => (
        <circle key={`co${i}`} cx={a.x} cy={a.y} r={4} fill={tok(a.tone)} stroke={tok('white')} strokeWidth={1.5} pointerEvents="none" />
      ))}
      {/* Difference arrows between two columns */}
      {S.annotations.filter(a => a.type === 'diff').map((a, i) => (
        <g key={`d${i}`} pointerEvents="none">
          {a.style === 'level' ? <>
            {/* Level difference: two dotted lines at both levels, the vertical arrow between them. */}
            <path d={`M${a.ra},${a.ya} H${a.xr + 4} M${a.rb},${a.yb} H${a.xr + 4}`} fill="none" stroke={tok('gray-400')} strokeWidth={0.75} strokeDasharray="2 2" />
            <path d={`M${a.xr},${a.ya} V${a.yb + (a.yb > a.ya ? -5 : 5)}`} fill="none" stroke={tok('gray-500')} strokeWidth={1} />
            <path d={arrowHead(a.xr, a.ya, a.xr, a.yb, 6)} fill={tok('gray-500')} />
          </> : <>
            <path d={`M${a.xa},${a.ya} V${a.yTop} H${a.xb} V${a.yb - 5}`} fill="none" stroke={tok('gray-500')} strokeWidth={1} />
            <path d={`M${a.xb - 3.5},${a.yb - 6} L${a.xb},${a.yb} L${a.xb + 3.5},${a.yb - 6} Z`} fill={tok('gray-500')} />
          </>}
          <rect x={(a.px ?? (a.xa + a.xb) / 2) - a.pillW / 2} y={(a.py ?? a.yTop) - 9} width={a.pillW} height={18} rx={9} fill={tok('surface')} stroke={tok('gray-300')} />
          <text x={a.px ?? (a.xa + a.xb) / 2} y={a.py ?? a.yTop} textAnchor="middle" dominantBaseline="central" fill={tok('black')} fontWeight={600}
            style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }}>{a.text}</text>
        </g>
      ))}
      {/* CAGR arrows */}
      {S.annotations.filter(a => a.type === 'cagr').map((a, i) => (
        <g key={`c${i}`} pointerEvents="none" {...part('cagr', a)}>
          <path d={a.d} fill="none" stroke={tok(a.tone)} strokeWidth={1.25} />
          <path d={arrowHead(a.ctrlX, a.ctrlY, a.xb, a.yb)} fill={tok(a.tone)} />
          <rect x={a.mx - a.pillW / 2} y={a.my - 9} width={a.pillW} height={18} rx={9} fill={tok('surface')} stroke={tok('gray-300')} />
          <text x={a.mx} y={a.my} textAnchor="middle" dominantBaseline="central" fill={tok('black')} fontWeight={600}
            style={{ fontSize: fs(10.5), fontFamily: 'var(--font-mono)' }}>{a.text}</text>
        </g>
      ))}
      {/* Names at the end of curves (instead of the legend) */}
      {S.endLabels.map(e => (
        <text key={`e-${e.seriesId}`} x={e.x} y={e.y} dominantBaseline="central" fill={tok(e.color)} fontWeight={600}
          stroke={tok('surface')} strokeWidth={3} paintOrder="stroke" style={{ fontSize: fs(11) }} {...part('endLabel', e)}>{e.text}</text>
      ))}
      {L.over}

      {/* Table columns (categories moved out of the plot) */}
      {(S.tableCols ?? []).map(t => (
        <g key={`tc-${t.key}`}>
          <line x1={t.x0} x2={t.x0} y1={S.plot.top} y2={S.plot.bottom} stroke={tok('gray-200')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />
          {t.items.map(it => (
            <text key={it.seriesId} x={t.x} y={it.y} textAnchor="middle" dominantBaseline="central" fill={tok(it.color)} fontWeight={600} pointerEvents="none"
              style={{ fontSize: fs(10), fontFamily: 'var(--font-mono)' }}>{it.text}</text>
          ))}
          <text x={t.x} y={X.y + 15 * S.fontScale} textAnchor="middle" fill={tok('gray-700')} style={{ fontSize: fs(11 * S.fontScale) }}
            pointerEvents="none" {...part('tableHead', t)}>{t.header}</text>
        </g>
      ))}

      {/* Axes */}
      <g className="chart-engine-axis" style={{ fontSize: fs(11 * S.fontScale) }}>
        {L.axesUnder}
        {['left', 'right'].map(side => {
          const ax = S.axes[side]
          if (!ax) return null
          const lineP = part('yAxisLine', { side, axis: ax })
          const out = (side === 'left') !== !!ax.labelsInside
          const ty = (S.plot.top + S.plot.bottom) / 2 + (ax.titleOffset ?? 0)
          return (
            <g key={side}>
              {ax.tickMarks && ax.allTicks.map(t => (
                <line key={`tm${t.value}`} x1={side === 'left' ? ax.x - 4 : ax.x} x2={side === 'left' ? ax.x : ax.x + 4} y1={t.y} y2={t.y}
                  stroke={tok('gray-400')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />
              ))}
              {(ax.line || lineP) && <line x1={ax.x} x2={ax.x} y1={S.plot.top} y2={S.plot.bottom}
                stroke={tok('gray-400')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" {...lineP} />}
              {ax.ticks.map(t => (
                <text key={`${side}${t.value}`} x={out ? ax.x - 6 : ax.x + 6} y={ax.labelsInside ? t.y - 7 : t.y} textAnchor={out ? 'end' : 'start'}
                  dominantBaseline="central" pointerEvents="none" {...part('yTick', { side, tick: t })}>{t.label}</text>
              ))}
              {ax.title && (
                <text x={ax.titleX} y={ty} textAnchor="middle" dominantBaseline="central"
                  transform={`rotate(${side === 'left' ? -90 : 90} ${ax.titleX} ${ty})`}
                  pointerEvents="none" style={{ fontSize: fs(10.5 * S.fontScale) }} {...part('yTitle', { side, axis: ax, y: ty })}>{ax.title}</text>
              )}
            </g>
          )
        })}
        {X.tickMarks && S.columns.slice(1).map(c => (
          <line key={`xt${c.key}`} x1={c.x0} x2={c.x0} y1={X.y} y2={X.y + 4} stroke={tok('gray-400')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />
        ))}
        {(X.line || xLine) && <line x1={S.plot.left} x2={S.plot.right} y1={X.y} y2={X.y}
          stroke={tok('gray-400')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" {...xLine} />}
        {/* Data table "styled as a table": banded fill, rules. */}
        {!X.rotate && (X.tableFill ?? []).map(r => (
          <rect key={`ts-${r.key}`} x={8} y={r.y} width={S.plot.right - 8} height={r.h} fill={tok(r.fill)} pointerEvents="none" />
        ))}
        {!X.rotate && (X.tableLines ?? []).map(l => (
          <line key={l.key} x1={8} x2={S.plot.right} y1={l.y} y2={l.y} stroke={tok('gray-300')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />
        ))}
        {X.ticks.filter(t => !t.muted).map(t => (
          <g key={t.key} pointerEvents="none" {...part('xTick', t)}>
            {X.rotate
              ? <text x={t.x} y={X.y + 10} textAnchor="end" dominantBaseline="central"
                  transform={`rotate(${-X.rotate} ${t.x} ${X.y + 10})`}>{t.label}</text>
              : <text x={t.lx ?? t.x} y={X.y + 15 * S.fontScale} textAnchor="middle">{String(t.label).split('\n').map((l, j) => <tspan key={j} x={t.lx ?? t.x} dy={j ? 13 * S.fontScale : 0}>{l}</tspan>)}</text>}
            {/* Second label (margin, growth, yearly totals), data table rows. */}
            {!X.rotate && t.sub?.map((l, i) => (
              <text key={i} x={t.x} y={X.y + (X.sub0 ?? 28) + (String(t.label).split('\n').length - 1) * 13 + i * (X.subLineH ?? 13)} textAnchor="middle" fill={l.tone ? tok(l.tone) : undefined}
                fontWeight={l.strong ? 600 : undefined} style={{ fontSize: fs(X.subFont ?? 10), fontFamily: 'var(--font-mono)' }}>{l.text}</text>
            ))}
          </g>
        ))}
        {(X.gaps ?? []).map(gx => (
          <path key={`xg${gx}`} d={`M${gx - 6},${X.y + 5} L${gx - 2},${X.y - 5} M${gx + 2},${X.y + 5} L${gx + 6},${X.y - 5}`} stroke={tok('gray-500')} strokeWidth={1.25} pointerEvents="none" />
        ))}
        {X.title && (
          <text x={X.title.x} y={X.title.y} textAnchor="middle" fill={tok('gray-700')} pointerEvents="none"
            style={{ fontSize: fs(10.5 * S.fontScale) }} {...part('xTitle', X.title)}>{X.title.text}</text>
        )}
        {/* Data table row headers (a series moved under the axis). */}
        {!X.rotate && (X.tableHeads ?? []).map(h => (
          <text key={`th-${h.kpi ?? h.seriesId}`} x={S.plot.left - 8} y={h.y ?? X.y + 28 + h.line * 13} textAnchor="end" fill={tok('gray-600')}
            pointerEvents="none" style={{ fontSize: fs(X.subFont ?? 10), fontWeight: 600 }} {...part('rowHead', h)}>{h.text}</text>
        ))}
        {L.axesOver}
      </g>
      {children}
    </FigureSvg>
  )
}
