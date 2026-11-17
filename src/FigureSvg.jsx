// ─── epure-charts · the SVG shell of every figure ───────────────────────────
// No hooks, no state: renders the same on the server and in the browser.
//   · viewBox="0 0 W H" always; `responsive`: width="100%", the ratio kept;
//   · <title> and <desc> from scene.meta (the spec's title, description, provenance);
//   · `dataTable`: the figure's numbers as a visually hidden HTML table, next to the SVG.

// Typography without the stylesheet (static pages, exports); charts.css says the same.
const BASE = { fontFamily: 'var(--font, system-ui, sans-serif)', fontSize: 'var(--chart-fs, 11px)', fontVariantNumeric: 'tabular-nums' }
const SR_ONLY = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

/**
 * @param {object} p
 * @param {number} p.width  drawing width (scene px)
 * @param {number} p.height drawing height (scene px)
 * @param {object} [p.meta] scene.meta: { title, desc }
 * @param {string} [p.label] aria-label (defaults to the title)
 * @param {boolean} [p.responsive] scale to the container's width
 * @param {{ caption?: string, head: string[], rows: Array<Array<string|number>> }} [p.table] data for the hidden table
 * @param {boolean} [p.dataTable] render that table
 */
export default function FigureSvg({ width, height, meta, label, responsive = false, table = null, dataTable = false, role = 'img', className, style, children, ...rest }) {
  const w = Math.max(0, Math.round(width * 100) / 100)
  const h = Math.max(0, Math.round(height * 100) / 100)
  const title = meta?.title ?? null
  const desc = meta?.desc ?? null
  const svg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`}
      width={responsive ? '100%' : w} height={responsive ? undefined : h}
      preserveAspectRatio="xMidYMid meet" role={role} aria-label={label ?? title ?? undefined}
      className={className} style={responsive ? { ...BASE, height: 'auto', display: 'block', ...style } : { ...BASE, ...style }} {...rest}>
      {title && <title>{title}</title>}
      {desc && <desc>{desc}</desc>}
      {children}
    </svg>
  )
  if (!dataTable || !table?.rows?.length) return svg
  return (
    <>
      {svg}
      <table style={SR_ONLY}>
        {(table.caption ?? title) && <caption>{table.caption ?? title}</caption>}
        {table.head?.length > 0 && <thead><tr>{table.head.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>}
        <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </>
  )
}
