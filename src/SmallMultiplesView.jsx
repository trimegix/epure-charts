// ─── epure-charts · small multiples, one settings bar ───────────────────────
// A grid of cartesian panels (ChartView) with ONE settings icon for the block:
//   · the block's settings (labels, decimals, colors, CAGR arrows, totals, value lines…)
//     are stored under the block id (epure-chart-read-<id>) and apply to every panel;
//   · a click on a panel formats that panel alone: its own changes are stored under
//     the panel id (epure-chart-read-<id>-<key>), layered over the block's;
//   · same key set by both: the panel wins (the most specific setting).
// The panels share their value axis (spec.scaleGroup = the block id) unless `same={false}`.
// readOnly + applyPrefs draws the published block and panel settings, without controls.
//
//   <SmallMultiplesView id="regions" title="Sales by region" columns={4}
//     panels={[{ key: 'north', spec, resolved }, …]} />
//   · panels: [{ key?, spec, resolved?, title? }] (key: default the index; title: default spec.title);
//   · the block's settings menu lists the first panel's series and categories (panels of a
//     block are expected to share them);
//   · width: the grid's width (server rendering; otherwise each panel measures its cell);
//     height: each panel's height; gap: px between panels (default 16).
import { useMemo } from 'react'
import { useCharts } from './useCharts'
import ChartHeader from './ChartHeader'
import ChartView from './ChartView.jsx'
import { useReadingPrefs } from './useReadingPrefs'
import { ChartWheelButton } from './ChartWheel'
import { makeFormatter } from './numberStyle'
import { withDataDefaults } from './spec'

const ROOT = {}

export default function SmallMultiplesView({
  id, title, sub, panels = [], columns, gap = 16, width, height, same = true, bare = false,
  readOnly = false, applyPrefs = false, responsive = false, dataTable = false, format: formatProp, legend = true,
}) {
  const charts = useCharts()
  const Header = charts.Header ?? ChartHeader
  const format = formatProp ?? charts.formatValue
  const n = panels.length
  const cols = Math.max(1, Math.min(n || 1, Math.round(columns ?? Math.ceil(Math.sqrt(n || 1)))))
  const cellW = Number.isFinite(width) ? Math.max(0, Math.floor((width - gap * (cols - 1)) / cols)) : undefined

  // The block's own settings, layered over the first panel's spec.
  const first = panels[0]
  const blockSpec = useMemo(() => {
    const s = first?.spec ?? { series: [] }
    // The block's scale group: its "Same scale" toggle reads and sets the panels' own.
    return { ...(first?.resolved ? withDataDefaults(s) : s), id, ...(same && s.scaleGroup == null ? { scaleGroup: id } : {}) }
  }, [first, id, same])
  const [, blockApi] = useReadingPrefs(blockSpec, first?.resolved ?? [], { base: ROOT })
  // The block has no data sheet of its own: each panel keeps its own (double-click a panel).
  const api = useMemo(() => ({ ...blockApi, setSheetOpen: null }), [blockApi])
  const dec = blockApi.decimals, mag = blockApi.magnitude, num = blockApi.fmt?.num ?? null
  const formatters = useMemo(() => { const f = makeFormatter(format, dec, mag, num); return { value: f, axis: f } }, [format, dec, mag, num])

  const button = readOnly ? null : <ChartWheelButton api={api} formatters={formatters} />
  return (
    <div className="chart-engine-multiples">
      {!bare ? <Header title={title} sub={sub} menu={button} />
        : button && <div className="chart-engine-multiples-menu" style={{ display: 'flex', justifyContent: 'flex-end' }}>{button}</div>}
      <div className="chart-engine-multiples-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
        {panels.map((p, i) => {
          const key = p.key ?? String(i)
          const spec = {
            ...p.spec, id: `${id}-${key}`, title: p.title ?? p.spec?.title,
            ...(same && p.spec?.scaleGroup == null ? { scaleGroup: id } : {}),
          }
          return (
            <ChartView key={key} spec={spec} resolved={p.resolved} format={formatProp} width={cellW} height={height}
              legend={legend} readOnly={readOnly} applyPrefs={applyPrefs} responsive={responsive} dataTable={dataTable}
              basePrefs={blockApi.own} settingsButton={false} />
          )
        })}
      </div>
    </div>
  )
}
