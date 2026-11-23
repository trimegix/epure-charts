// ─── epure-charts · table, drawing only ─────────────────────────────────────
// <TableFigure scene={buildTableScene(spec, columns, rows, { width })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. TableView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, focus):
//     kind 'cell': the <g> of a cell (item: the scene cell);
//   · children: drawn over the table, in the table's coordinates (selection
//     outline, resize handles);
//   · labelStyle: CSS spread on the cell texts.
// The SVG keeps role="table" (each cell a role="cell" group). Status icons are drawn
// as plain SVG shapes (arrows, dash, dot): no icon library.
import FigureSvg from './FigureSvg.jsx'
import { HarveyBall, CheckMark } from './HarveyBall.jsx'
import { tok, isHex, fontFamily, fs } from './customStyle.js'
import { localizeNumber, t } from './locale.js'

const none = () => null

// A saturated token is applied as a 22% fill (like the sheet); a gray, a "-bg" token or a hex as is.
const isPale = t => /^gray-|-bg$|^surface$|^white$/.test(t)
const fillCss = t => (isPale(t) || isHex(t) ? tok(t) : `color-mix(in srgb, ${tok(t)} 22%, transparent)`)

// What a cell says (accessible name, hidden data table).
const cellName = (c, L) => c.text ?? (c.type === 'harvey' ? (c.harvey == null ? t('no value', L) : localizeNumber(`${Math.round(c.harvey * 100)}%`, L)) : c.type === 'check' ? c.check : c.icon ? String(c.value) : '')

/** The table's content, for the hidden data table. */
function tableData(scene) {
  const byRow = new Map()
  for (const c of scene.cells) {
    if (!byRow.has(c.row)) byRow.set(c.row, [])
    byRow.get(c.row).push(cellName(c, scene.meta?.locale))
  }
  return {
    head: scene.cols.map(c => c.label ?? ''),
    rows: scene.rows.filter(r => r.kind !== 'header').map(r => byRow.get(r.key) ?? []),
  }
}

// A cell's status icon: up / down arrow, dash, dot. k: the cell's text scale.
function StatusIcon({ cx, cy, icon, k = 1 }) {
  const c = tok(icon.color)
  const a = 5 * k, b = 3 * k, d = 4 * k
  if (icon.shape === 'up') return <path d={`M${cx - a},${cy + b} L${cx},${cy - d} L${cx + a},${cy + b} Z`} fill={c} />
  if (icon.shape === 'down') return <path d={`M${cx - a},${cy - b} L${cx},${cy + d} L${cx + a},${cy - b} Z`} fill={c} />
  if (icon.shape === 'flat') return <rect x={cx - a} y={cy - k} width={2 * a} height={2 * k} rx={k} fill={c} />
  return <circle cx={cx} cy={cy} r={4.5 * k} fill={c} />
}

// A mark's center: left, right or centered in its cell.
const markX = (c, half) => (c.anchor === 'start' ? c.x + 10 + half : c.anchor === 'end' ? c.x + c.w - 10 - half : c.cx)

export default function TableFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, className = 'chart-table', children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const L = scene.meta?.locale
  return (
    <FigureSvg width={scene.width + 2} height={scene.height + 2} meta={scene.meta} label={label} responsive={responsive} role="table"
      dataTable={dataTable} table={dataTable ? tableData(scene) : null} className={className} {...rest}>
      <g transform="translate(1,1)">
        {/* Fills and strokes as attributes: the stylesheet (charts.css) wins when present. */}
        {scene.rows.filter(r => r.kind === 'header').map(r => <rect key="hb" x={0} y={r.y} width={scene.width} height={r.h} className="chart-table__head" fill={tok('gray-50')} />)}
        {scene.stripes.map(s => <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h} className="chart-table__stripe" fill={tok('gray-50')} pointerEvents="none" style={s.fill ? { fill: fillCss(s.fill) } : undefined} />)}
        {scene.rows.filter(r => r.kind === 'total').map(r => <rect key="tb" x={0} y={r.y} width={scene.width} height={r.h} className="chart-table__total" fill={tok('gray-100')} pointerEvents="none" />)}
        {scene.lines.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`chart-table__line${l.strong ? ' is-strong' : ''}`} stroke={tok(l.strong ? 'gray-400' : 'gray-200')} strokeWidth={1} pointerEvents="none" />)}
        {scene.cells.map(c => (
          <g key={c.key} role="cell" className="chart-table__cell" aria-label={cellName(c, L) || t('Empty cell', L)} {...part('cell', c)}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={c.fill ? fillCss(c.fill) : 'transparent'} />
            {c.shape && (c.shape.points
              ? <polygon points={c.shape.points} fill={fillCss(c.markFill ?? 'gray-100')} stroke={c.outline && c.outline.width !== 0 ? tok(c.outline.color || 'gray-500') : 'none'} strokeWidth={c.outline?.width ?? 0} strokeDasharray={c.outline?.dash} />
              : <rect x={c.shape.x} y={c.shape.y} width={c.shape.w} height={c.shape.h} rx={c.shape.rx} fill={fillCss(c.markFill ?? 'gray-100')} stroke={c.outline && c.outline.width !== 0 ? tok(c.outline.color || 'gray-500') : 'none'} strokeWidth={c.outline?.width ?? 0} strokeDasharray={c.outline?.dash} />)}
            {['text', 'number', 'pentagon', 'pill'].includes(c.type) && c.text !== '' && (
              <text x={c.tx} y={c.cy} textAnchor={c.anchor} dominantBaseline="central" fill={tok(c.color ?? (c.header && c.row === '__head__' ? 'gray-600' : 'gray-800'))} fontWeight={c.bold ? 600 : 400}
                transform={c.rotate === 90 ? `rotate(-90 ${c.tx} ${c.cy})` : undefined}
                style={{ fontSize: fs(c.fs), fontFamily: c.font ? fontFamily(c.font) : c.type === 'number' ? 'var(--font-mono)' : 'var(--font)', textDecoration: c.overwritten ? 'underline dotted' : undefined, ...labelStyle }}>
                {/* Wrapped header, ellipsized text: full text on hover. */}
                {c.lines ? c.lines.map((l, i) => <tspan key={i} x={c.tx} dy={i === 0 ? `${(-(c.lines.length - 1) / 2) * 1.2}em` : '1.2em'}>{l}</tspan>) : (c.shown ?? c.text)}
                {c.clipped && <title>{c.text}</title>}
              </text>
            )}
            {/* Cell unlinked from the sheet: corner marked as in the sheet ("overwritten"). */}
            {c.overwritten && <path d={`M${c.x},${c.y} h6 L${c.x},${c.y + 6} Z`} fill={tok('cat-2')}><title>{t('Overwritten: no longer linked to the data sheet', L)}</title></path>}
            {c.type === 'harvey' && <HarveyBall inline locale={L} cx={markX(c, c.r)} cy={c.cy} size={c.r * 2 + 1} value={c.harvey} color={c.color} fill={c.markFill} outline={c.outline} invalid={c.invalid} />}
            {c.type === 'check' && <CheckMark inline locale={L} cx={markX(c, c.size / 2)} cy={c.cy} size={c.size} value={c.check} color={c.color} fill={c.markFill} outline={c.outline} symbols={c.symbols} />}
            {c.type === 'icon' && c.icon && <StatusIcon cx={markX(c, 5 * (c.k ?? 1))} cy={c.cy} icon={c.icon} k={c.k ?? 1} />}
          </g>
        ))}
        {children}
      </g>
    </FigureSvg>
  )
}
