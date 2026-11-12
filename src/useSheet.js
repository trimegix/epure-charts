// ─── epure-charts · a datasheet for any chart ──────────────────────────────────
// useSheet(key, base) → the API <DataSheet> expects (the same as the column chart's):
// the base is recomputed from the host data; what the user types is a per-browser
// overlay ("Edited"), never the source data.
//   base = { rows: [{ id, name, points: { [colKey]: { y } | { text } } }],
//            cols: [{ key, name, type?: 'number'|'text'|'date', readOnly? }] }
// sheetRows(sheet) → [{ id, name, added, values: { [colKey]: value } }] (empty added
// rows skipped), for the view to convert back into its own data shape.
import { useState } from 'react'
import { useChartPrefs } from './chartPrefs.js'
import { buildSheet, emptyEdits, hasEdits } from './sheetModel.js'

/**
 * Applies `validate(sheet) → { 'row|col': message }`: values outside the chart's domain
 * (a negative pie slice, a Harvey ball at 7) become errors, flagged in the grid and ignored by the chart.
 */
export function applyValidation(sheet, validate) {
  if (!validate) return sheet
  const bad = validate(sheet) ?? {}
  if (!Object.keys(bad).length) return sheet
  // A message starting with "!" is a warning: the value is kept, the cell is flagged.
  return { ...sheet, rows: sheet.rows.map(r => ({ ...r, cells: r.cells.map((c, i) => {
    const m = bad[`${r.id}|${sheet.cols[i].key}`]
    if (!m || c.error) return c
    return m.startsWith('!') ? { ...c, warning: m.slice(1) } : { ...c, error: m, value: null }
  }) })) }
}

/** Datasheet state for a chart: base data plus the user's per-browser edits. */
export function useSheet(key, base, validate) {
  const [prefs, setPref] = useChartPrefs(`epure-chart-sheet-${key}`, { edits: null })
  const [sheetOpen, setSheetOpen] = useState(false)
  const edits = { ...emptyEdits(), ...(prefs.edits ?? {}) }
  const sheet = applyValidation(buildSheet(base, edits), validate)
  return {
    sheetOpen, setSheetOpen, sheet, edits, sheetBase: base,
    sheetEdited: hasEdits(edits),
    applyEdits: fn => setPref('edits', fn(edits)),
    resetSheet: () => setPref('edits', null),
  }
}

/** The sheet's visible rows as plain values, ready for the view to convert. */
export function sheetRows(sheet) {
  return sheet.rows
    .filter(r => !r.hidden && (!r.added || r.name || r.cells.some(c => c.value != null)))
    .map(r => ({
      id: r.id, name: r.name, added: r.added, fill: r.fill ?? null,
      values: Object.fromEntries(sheet.cols.map((c, i) => [c.key, c.hidden ? null : r.cells[i].value])),
      fills: Object.fromEntries(sheet.cols.map((c, i) => [c.key, r.cells[i].fill]).filter(([, f]) => f)),
      errors: r.cells.filter(c => c.error).length,
    }))
}
