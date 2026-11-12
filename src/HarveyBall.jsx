// ─── epure-charts · Harvey ball and checkbox ─────────────────────────────────
// Two small data-driven SVG marks, colored with tokens.
//   <HarveyBall value={0.5} />            0..1, or value={3} max={4} in quarters
//   <CheckMark value="yes" | "no" | "empty" | true | false symbols={{ yes: '★', no: '–' }} />
// color = filled sectors / symbol; fill = empty sectors / box background (tokens, default surface);
// outline = { color?, width?, dash? }: the outline, width 0 = no outline.
// Standalone (own <svg>) or inside a parent SVG with `inline` and cx / cy.
import { checkOf, harveyOf } from './tableScene.js'

// A color: a palette token, or a hex picked by the user (custom style).
import { tok, checkSymbol } from './customStyle.js'

/** The filled sector of a Harvey ball (null when empty or full: full is a disc). */
function harveyPath(cx, cy, r, f) {
  if (!(f > 0)) return null
  if (f >= 0.999) return null
  const a = f * 2 * Math.PI
  return `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${f > 0.5 ? 1 : 0},1 ${cx + r * Math.sin(a)},${cy - r * Math.cos(a)} Z`
}

function HarveyMark({ cx, cy, r, f, color, fill, outline, segments, invalid }) {
  // Invalid value in the sheet: an empty circle struck through in red (never mistaken for a state).
  if (invalid) return <g><circle cx={cx} cy={cy} r={r} fill={tok('surface')} stroke={tok('red')} strokeWidth={1.25} /><line x1={cx - r * 0.7} y1={cy + r * 0.7} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke={tok('red')} strokeWidth={1.25} /></g>
  const d = harveyPath(cx, cy, r, f)
  const ticks = segments > 1 ? Array.from({ length: segments }, (_, i) => (2 * Math.PI * i) / segments) : []
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={tok(fill || 'surface')} stroke={outline ? 'none' : tok(color)} strokeWidth={1} />
      {f >= 0.999 && <circle cx={cx} cy={cy} r={r} fill={tok(color)} />}
      {d && <path d={d} fill={tok(color)} />}
      {f == null && <line x1={cx - r * 0.5} y1={cy} x2={cx + r * 0.5} y2={cy} stroke={tok('gray-400')} strokeWidth={1} />}
      {outline && outline.width !== 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={tok(outline.color || color)} strokeWidth={outline.width ?? 1} strokeDasharray={outline.dash} />}
      {ticks.map(a => <line key={a} x1={cx} y1={cy} x2={cx + r * Math.sin(a)} y2={cy - r * Math.cos(a)} stroke={tok(color)} strokeWidth={0.5} opacity={0.35} />)}
    </g>
  )
}

/** Harvey ball: value 0..max (max = 1 by default, 4 for quarters). */
export function HarveyBall({ value, max = 1, size = 14, color = 'gray-700', fill, outline, segments = 0, inline, cx, cy, title, invalid }) {
  const f = typeof value === 'number' && max === 1 && value >= 0 && value <= 1 ? value : harveyOf(value, max)
  const r = size / 2 - 0.5
  const label = title ?? (invalid ? 'Invalid value in the data sheet' : f == null ? 'No value' : `${Math.round(f * 100)}%`)
  if (inline) return <g role="img" aria-label={label}><HarveyMark cx={cx} cy={cy} r={r} f={f} color={color} fill={fill} outline={outline} segments={segments} invalid={invalid} /><title>{label}</title></g>
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="chart-harvey" style={{ verticalAlign: 'middle' }}>
      <HarveyMark cx={size / 2} cy={size / 2} r={r} f={f} color={color} fill={fill} outline={outline} segments={segments} invalid={invalid} />
      <title>{label}</title>
    </svg>
  )
}

function CheckGlyph({ cx, cy, size, state, color, fill, outline, symbols }) {
  const h = size / 2
  // A custom symbol replaces the drawn check or cross.
  const sym = checkSymbol(state, symbols)
  return (
    <g>
      <rect x={cx - h} y={cy - h} width={size} height={size} rx={2} fill={tok(fill || 'surface')} stroke={outline?.width === 0 ? 'none' : tok(outline?.color || 'gray-700')} strokeWidth={outline?.width ?? 1} strokeDasharray={outline?.dash} />
      {sym && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={tok(color || (state === 'yes' ? 'green' : 'red'))} style={{ fontSize: size * 0.95, fontWeight: 600 }}>{sym}</text>}
      {!sym && state === 'yes' && <path d={`M${cx - h * 0.6},${cy} L${cx - h * 0.1},${cy + h * 0.5} L${cx + h * 0.65},${cy - h * 0.55}`} fill="none" stroke={tok(color || 'green')} strokeWidth={Math.max(1.75, size / 7)} strokeLinecap="round" strokeLinejoin="round" />}
      {!sym && state === 'no' && <path d={`M${cx - h * 0.5},${cy - h * 0.5} L${cx + h * 0.5},${cy + h * 0.5} M${cx + h * 0.5},${cy - h * 0.5} L${cx - h * 0.5},${cy + h * 0.5}`} fill="none" stroke={tok(color || 'red')} strokeWidth={Math.max(1.75, size / 7)} strokeLinecap="round" />}
    </g>
  )
}

/** Checkbox: check (yes), cross (no) or empty; the value is read as in a table. */
export function CheckMark({ value, size = 12, color, fill, outline, inline, cx, cy, title, symbols }) {
  const state = ['yes', 'no', 'empty'].includes(value) ? value : checkOf(value)
  const label = title ?? { yes: 'Checked', no: 'Crossed', empty: 'Unchecked' }[state]
  if (inline) return <g role="img" aria-label={label}><CheckGlyph cx={cx} cy={cy} size={size} state={state} color={color} fill={fill} outline={outline} symbols={symbols} /><title>{label}</title></g>
  const s = size + 2
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={label} className="chart-checkmark" style={{ verticalAlign: 'middle' }}>
      <CheckGlyph cx={s / 2} cy={s / 2} size={size} state={state} color={color} fill={fill} outline={outline} symbols={symbols} />
      <title>{label}</title>
    </svg>
  )
}

export default HarveyBall
