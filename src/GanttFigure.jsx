// ─── epure-charts · Gantt / timeline, drawing only ──────────────────────────
// <GanttFigure scene={buildGanttScene(spec, rows, { width })} />
// No hooks, no state, no preferences: renders the same on the server and in the
// browser. GanttView draws through it and adds its editing layer:
//   · part(kind, item) → extra props for a drawn element (handlers, class, stroke), spread
//     after the defaults. Kinds:
//       'scale' (header group, item: scene), 'header' (a scale label), 'columns' (label
//       columns group, item: scene), 'cell' (a responsible / remark text), 'rowLabel' (an
//       activity label), 'shade' (a shade's group), 'shadeFill' (its rect), 'bar' (a bar's
//       group), 'barShape' (its rect or path), 'bracket' (a bracket's group), 'bracketPath' (its
//       line), 'milestone'
//       (a marker), 'label' (a bar or milestone label);
//     an element with a default content (its text, or a <title> tooltip) takes a `children`
//     prop to replace it: header, rowLabel, cell, shadeFill, barShape, milestone;
//     drawn only when part returns props (editing hit areas): 'rowHit' (the row's label
//     cell), 'rowArea' (the row's date area), 'barHandle' (item { bar, side: 'start'|'end' }),
//     'todayHandle' (item: scene.today);
//   · children: drawn over the figure (crosshair, drop line, edit field, scale handles);
//   · labelStyle: CSS spread on the bar labels (the user's label font, size, color);
//   · uid: the id of the arrow marker (unique per chart on a page).
import FigureSvg from './FigureSvg.jsx'
import { tok, fs, fsNote, inkOn } from './customStyle.js'
import { formatDate } from './ganttScene.js'
import { localizeNumber, t } from './locale.js'

const none = () => null
const pct = (f, lang) => localizeNumber(`${Math.round(f * 100)}%`, lang)

/** The figure's dates, for the hidden data table: one line per bar and milestone. */
function ganttTable(scene) {
  const L = scene.lang
  const rowLabel = new Map(scene.rows.map(r => [r.key, r.label]))
  const name = o => [rowLabel.get(o.rowKey), o.label].filter(Boolean).join(' · ')
  const rows = [
    ...scene.bars.map(b => [name(b), b.start, b.end, b.done != null ? pct(b.done, L) : '']),
    ...scene.milestones.map(m => [name(m), m.date, m.date, '']),
  ]
  return { head: ['', t('Start', L), t('End', L), t('Progress', L)], rows }
}

// A Harvey ball: circle plus filled sector (0..1).
function Harvey({ cx, cy, r, f, lang }) {
  const a = f * 2 * Math.PI
  const wedge = f >= 0.999 ? <circle cx={cx} cy={cy} r={r} fill={tok('gray-700')} />
    : f > 0 ? <path d={`M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${f > 0.5 ? 1 : 0},1 ${cx + r * Math.sin(a)},${cy - r * Math.cos(a)} Z`} fill={tok('gray-700')} /> : null
  return <g><circle cx={cx} cy={cy} r={r} fill={tok('surface')} stroke={tok('gray-700')} strokeWidth={1} />{wedge}<title>{pct(f, lang)}</title></g>
}
// A checkbox: check, cross or empty.
function CheckBox({ cx, cy, size, check }) {
  const h = size / 2
  return (
    <g>
      <rect x={cx - h} y={cy - h} width={size} height={size} rx={2} fill={tok('surface')} stroke={tok('gray-700')} strokeWidth={1} />
      {check === 'yes' && <path d={`M${cx - h * 0.6},${cy} L${cx - h * 0.1},${cy + h * 0.5} L${cx + h * 0.65},${cy - h * 0.55}`} fill="none" stroke={tok('green')} strokeWidth={1.75} />}
      {check === 'no' && <path d={`M${cx - h * 0.5},${cy - h * 0.5} L${cx + h * 0.5},${cy + h * 0.5} M${cx + h * 0.5},${cy - h * 0.5} L${cx - h * 0.5},${cy + h * 0.5}`} fill="none" stroke={tok('red')} strokeWidth={1.75} />}
    </g>
  )
}

export default function GanttFigure({ scene, label, responsive = false, dataTable = false, labelStyle = null, part = none, uid = 'gantt-arrow', className, children = null, ...rest }) {
  if (!scene || scene.empty) return null
  const L = scene.lang
  const tip = iso => formatDate(iso, 'd mmm yyyy', false, L)
  const cls = [className, scene.rtl ? 'chart-gantt--rtl' : null].filter(Boolean).join(' ') || undefined
  const barOf = new Map(scene.bars.map(b => [b.key, b]))
  return (
    <FigureSvg width={scene.width} height={scene.height} meta={scene.meta} label={label} responsive={responsive}
      dataTable={dataTable} table={dataTable ? ganttTable(scene) : null} className={cls} {...rest}>
      <defs>
        <marker id={uid} viewBox="0 0 6 6" refX={5.5} refY={3} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={tok('gray-500')} />
        </marker>
      </defs>
      {scene.background && <rect x={0} y={0} width={scene.width} height={scene.height} fill={tok(scene.background)} pointerEvents="none" />}
      <g className="chart-engine-axis" {...part('scale', scene)}>
        <rect x={scene.plot.left} y={0} width={scene.plot.width} height={scene.plot.top} fill="transparent" />
        {scene.header.map(h => (
          <text key={h.key} x={(h.x0 + h.x1) / 2} y={h.y} textAnchor="middle" fontWeight={h.level === 0 ? 600 : 400} fontStyle={h.custom ? 'italic' : undefined}
            style={{ fontSize: fs(h.level === 0 ? 11 : 10) }} {...{ children: h.text, ...part('header', h) }} />
        ))}
        {scene.tierLabels.map(tl => <text key={`tl-${tl.key}`} x={tl.x} y={tl.y} textAnchor="end" fill={tok('gray-500')} fontWeight={600} style={{ fontSize: fs(10) }}>{tl.text}</text>)}
      </g>
      {scene.rows.map(r => {
        const hit = !r.group && !r.events && part('rowHit', r)
        const area = !r.group && !r.events && part('rowArea', r)
        const strong = r.group || r.parent || r.bold
        return (
          <g key={r.key}>
            {r.group && <rect x={0} y={r.y0} width={scene.width} height={r.y1 - r.y0} fill={tok('gray-100')} />}
            {r.band && <rect x={0} y={r.y0} width={scene.width} height={r.y1 - r.y0} fill={tok('gray-50')} />}
            {(r.separator || r.events) && <line x1={0} x2={scene.width} y1={r.y0} y2={r.y0} stroke={tok(r.events ? 'gray-300' : 'gray-200')} strokeWidth={1} shapeRendering="crispEdges" />}
            <text x={(r.group ? 4 : 10) + r.indent} y={r.cy + 4} fontWeight={strong ? 600 : 400} fontStyle={r.events ? 'italic' : undefined}
              fill={tok(strong ? 'black' : 'gray-700')} style={{ fontSize: fs(11) }} pointerEvents="none" {...{ children: r.label, ...part('rowLabel', r) }} />
            {hit && <rect x={0} y={r.y0} width={scene.columns?.activity?.x1 ?? scene.plot.left} height={r.y1 - r.y0} fill="transparent" {...hit} />}
            {area && <rect x={scene.plot.left} y={r.y0} width={scene.plot.width} height={r.y1 - r.y0} fill="transparent" {...area} />}
          </g>
        )
      })}
      {scene.weekends.map(w => <rect key={w.key} x={w.x0} y={scene.plot.top} width={Math.max(0, w.x1 - w.x0)} height={scene.plot.height} fill={tok('gray-100')} opacity={0.8} pointerEvents="none" />)}
      {scene.shades.map(s => (
        <g key={s.key} {...part('shade', s)}>
          <rect x={s.x0} y={scene.plot.top} width={Math.max(0, s.x1 - s.x0)} height={scene.plot.height} fill={tok(s.color)} opacity={0.55}
            {...{ children: <title>{`${s.label ? `${s.label} · ` : ''}${tip(s.from)} → ${tip(s.to)}`}</title>, ...part('shadeFill', s) }} />
          {s.bracket && <path d={s.bracket.path} fill="none" stroke={tok('gray-700')} strokeWidth={1.25} />}
          {s.label && <text x={(s.x0 + s.x1) / 2} y={s.bracket ? s.bracket.labelY : scene.plot.top + 10} textAnchor="middle" fill={tok(s.bracket ? 'gray-700' : 'gray-500')} style={{ fontSize: s.bracket ? fsNote(10.5) : fsNote(9.5) }} pointerEvents="none">{s.label}</text>}
        </g>
      ))}
      <g {...part('columns', scene)}>
        {scene.colHeads.map(h => <text key={h.key} x={h.x} y={scene.colHeadY} textAnchor={h.anchor} fontWeight={600} fill={tok('gray-500')} style={{ fontSize: fs(10) }}>{h.text}</text>)}
        {scene.columns?.remark && <line x1={scene.columns.remark.x0} x2={scene.columns.remark.x0} y1={scene.plot.top} y2={scene.plot.bottom} stroke={tok('gray-200')} shapeRendering="crispEdges" />}
        {scene.labelBrackets.map(b => <path key={`lb-${b.key}`} d={b.path} fill="none" stroke={tok('gray-500')} strokeWidth={1} />)}
        {scene.cells.map(c => (c.text != null
          ? <text key={c.key} x={c.x} y={c.y} fill={tok('gray-700')} style={{ fontSize: fs(11) }} {...{ children: c.text, ...part('cell', c) }} />
          : c.check ? <CheckBox key={c.key} cx={c.cx} cy={c.cy} size={c.size} check={c.check} /> : <Harvey key={c.key} cx={c.cx} cy={c.cy} r={c.r} f={c.harvey} lang={L} />))}
      </g>
      {scene.gridlines.map((g, i) => <line key={i} x1={g.x} x2={g.x} y1={g.y1} y2={scene.plot.bottom} stroke={tok(g.strong ? 'gray-300' : 'gray-200')} strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none" />)}
      {scene.summaries.map(s => <path key={s.key} d={s.path} fill={tok('gray-700')} pointerEvents="none"><title>{`${tip(s.start)} → ${tip(s.end)}`}</title></path>)}
      {scene.bars.map(b => {
        const shape = {
          fill: tok(b.color), stroke: b.outline ? tok(b.outline) : undefined, strokeWidth: b.outline ? 1.25 : undefined,
          children: <title>{`${b.label ? `${b.label} · ` : ''}${tip(b.start)} → ${tip(b.end)}${b.done != null ? ` · ${pct(b.done, L)}` : ''}`}</title>,
          ...part('barShape', b),
        }
        return (
          <g key={b.key} {...part('bar', b)}>
            {b.path ? <path d={b.path} {...shape} /> : <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={3} {...shape} />}
            {scene.progress && b.done != null && <rect x={b.x} y={b.y + b.height - 3} width={b.width * b.done} height={3} fill={tok('black')} opacity={0.45} pointerEvents="none" />}
            {b.width >= 14 && ['start', 'end'].map(side => {
              const h = part('barHandle', { bar: b, side })
              return h ? <rect key={side} x={side === 'start' ? b.x - 2 : b.x + b.width - 4} y={b.y} width={6} height={b.height} fill="transparent" {...h} /> : null
            })}
          </g>
        )
      })}
      {scene.brackets.map(b => (
        <g key={b.key} {...part('bracket', b)}>
          <path d={b.path} fill="none" stroke={tok(b.color)} strokeWidth={1.25} {...part('bracketPath', b)} />
          <path d={b.path} fill="none" stroke="transparent" strokeWidth={10} />
          <title>{`${b.label ? `${b.label} · ` : ''}${tip(b.start)} → ${tip(b.end)}`}</title>
        </g>
      ))}
      {scene.links.map(l => <path key={l.key} d={l.path} fill="none" stroke={tok('gray-500')} strokeWidth={1} markerEnd={`url(#${uid})`} pointerEvents="none" />)}
      {scene.events.map(ev => (
        <g key={ev.key} pointerEvents="none">
          <line x1={ev.x} x2={ev.x} y1={ev.y1} y2={ev.y2} stroke={tok(ev.color)} strokeWidth={1} strokeDasharray="3 3" />
          <path d={ev.path} fill={tok(ev.color)}><title>{`${ev.label ?? t('Event', L)} · ${ev.date}`}</title></path>
        </g>
      ))}
      {scene.milestones.map(m => (
        <g key={m.key}>
          {m.line && <line x1={m.x} x2={m.x} y1={m.line.y1} y2={m.line.y2} stroke={tok(m.color)} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />}
          <path d={m.path} fill={tok(m.color)} stroke={tok('surface')} strokeWidth={1}
            {...{ children: <title>{`${m.label ?? t('Milestone', L)} · ${m.date}`}</title>, ...part('milestone', m) }} />
        </g>
      ))}
      {scene.labels.map(l => {
        // Inside a bar (white): black if the bar is a light hex (automatic contrast, custom style).
        const inside = l.color === 'white' || l.inside
        const fill = l.color === 'white' ? inkOn(barOf.get(String(l.key).replace(/\|date$/, ''))?.color) : l.color
        return (
          <text key={`l-${l.key}`} x={l.x} y={l.y} textAnchor={l.anchor} fill={tok(fill)} pointerEvents={inside ? 'none' : undefined}
            style={{ fontSize: fs(l.size ?? 11), ...labelStyle }} {...part('label', l)}>
            {l.lines ? l.lines.map((tx, k) => <tspan key={k} x={l.x} dy={k === 0 ? -(l.lh ?? 12) / 2 : l.lh ?? 12}>{tx}</tspan>) : l.text}
          </text>
        )
      })}
      {scene.today && (() => {
        const h = part('todayHandle', scene.today)
        return (
          <g>
            <line x1={scene.today.x} x2={scene.today.x} y1={scene.today.y1} y2={scene.today.y2} stroke={tok('red')} strokeWidth={1.5} pointerEvents="none" />
            {h && <line x1={scene.today.x} x2={scene.today.x} y1={scene.today.y1} y2={scene.today.y2} stroke="transparent" strokeWidth={10} {...h} />}
          </g>
        )
      })()}
      {children}
    </FigureSvg>
  )
}
