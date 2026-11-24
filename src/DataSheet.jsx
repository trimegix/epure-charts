// ─── epure-charts · the chart datasheet (loaded on first use) ─────────────────
// The grid (Jspreadsheet CE, DataSheetGrid.jsx) is the heaviest part of the package; a
// reader never opens it. It loads on the first double-click, in its own chunk; the
// chart stays drawn meanwhile. Its stylesheet ships in epure-charts/styles.css.
import { lazy, Suspense } from 'react'
import { useT } from './uiLocale.js'

const Grid = lazy(() => import('./DataSheetGrid.jsx'))

/** The data sheet under a chart: same props as the grid (api, onClose, layout, colors, format…). */
export default function DataSheet(props) {
  const tr = useT()
  return (
    <Suspense fallback={<div className="chart-datasheet chart-datasheet--loading" role="status">{tr('Loading the data sheet…')}</div>}>
      <Grid {...props} />
    </Suspense>
  )
}

/** The "Edited" note on a chart whose sheet was modified (discreet, not a callout). */
export function EditedNote({ api }) {
  const tr = useT()
  // Sheet open: its header already says "Edited"; the note would only push the chart.
  if (!api?.sheetEdited || api.sheetOpen) return null
  // An error cell (#VALUE, #DIV/0, invalid date...) is ignored by the chart: say so.
  const errors = (api.sheet?.rows ?? []).reduce((t, r) => t + r.cells.filter(c => c.error).length, 0)
  const warning = (api.sheet?.rows ?? []).flatMap(r => r.cells.filter(c => c.warning).map(c => c.warning))[0]
  return (
    <div className="chart-engine-edited-note" role="status">
      <span className="chart-engine-edited-dot" aria-hidden="true" />{tr('Edited figures, not the reported data')}
      {errors > 0 && <span className="chart-engine-edited-err">· {errors > 1 ? tr('{n} cells with errors, ignored', { n: errors }) : tr('{n} cell with errors, ignored', { n: errors })}</span>}
      {warning && <span className="chart-engine-edited-warn" title={warning}>· {warning.split(':')[0]}</span>}
      {' '}·{' '}<button type="button" className="chart-pop__link" onClick={() => api.setSheetOpen(true)}>{tr('Open sheet')}</button>
    </div>
  )
}
