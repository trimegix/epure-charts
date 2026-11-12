// ─── epure-charts · the default header of a chart card ──────────────────────
// Title and subtitle on the left, tools (including the formatting button) on
// the right. An application can supply its own (ChartsProvider → Header).
export default function ChartHeader({ title, sub, menu }) {
  return (
    <div className="chart-head">
      <div className="chart-head__id">
        {title && <div className="chart-head__title">{title}</div>}
        {sub && <div className="chart-head__sub">{sub}</div>}
      </div>
      {menu && <div className="chart-head__tools">{menu}</div>}
    </div>
  )
}
