// ─── epure-charts · selection funnel, drawing only ──────────────────────────
// <FunnelFigure scene={buildFunnelScene(spec, stages, { width, height })} />
// No hooks, no state, no preferences: renders the same on the server and in the browser.
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke):
//     kinds 'stage' (a bar, item = scene.stages[i]), 'label' (a stage name or value,
//     item = scene.labels[i]), 'filter' (item = scene.filters[i]), 'rate' (item = scene.rates[i]);
//   · children: drawn over the figure;
//   · labelStyle: CSS spread on the stage names and values.
import FigureSvg from './FigureSvg.jsx'
import { tok, fs, fsNote } from './customStyle.js'

const none = () => null

/** The figure's numbers, for the hidden data table. */
function funnelTable(scene) {
  const rates = scene.stages.some(s => s.rate)
  const filters = scene.stages.some(s => s.filter)
  return {
    head: ['', 'Value', ...(filters ? ['Filter'] : []), ...(rates ? ['Pass rate'] : [])],
    rows: scene.stages.map(s => [s.label, s.value, ...(filters ? [s.filter ?? ''] : []), ...(rates ? [s.rate ?? ''] : [])]),
  }
}

export default function FunnelFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, className = 'chart-funnel', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? funnelTable(scene) : null} className={className} {...rest}>
      {scene.necks.map(n => <path key={`n-${n.key}`} d={n.d} fill={tok('gray-100')} stroke="none" pointerEvents="none" />)}
      {scene.stages.map(s => (
        <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h} rx={2} fill={tok(s.color)} {...part('stage', s)}>
          <title>{`${s.label}: ${s.value}`}</title>
        </rect>
      ))}
      {scene.labels.map(l => (
        <text key={`t-${l.key}`} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(l.color)} fontWeight={l.kind === 'value' ? 600 : 500}
          style={{ fontSize: fs(11), ...(l.kind === 'value' ? { fontFamily: 'var(--font-mono)' } : {}), ...labelStyle }}
          {...part('label', l)}>{l.text}</text>
      ))}
      {scene.filters.map(f => (
        <text key={`f-${f.key}`} x={f.x} y={f.y} textAnchor={f.anchor} fill={tok('gray-600')} fontStyle="italic"
          style={{ fontSize: fsNote(10) }} {...part('filter', f)}>{f.text}</text>
      ))}
      {scene.rates.map(r => (
        <text key={`r-${r.key}`} x={r.x} y={r.y} textAnchor={r.anchor} fill={tok('gray-500')} fontWeight={600}
          style={{ fontSize: fsNote(10), fontFamily: 'var(--font-mono)' }} {...part('rate', r)}>{r.text}</text>
      ))}
      {children}
    </FigureSvg>
  )
}
