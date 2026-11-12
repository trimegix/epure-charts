// ─── epure-charts · a chart's data sheet ─────────────────────────────────────
// A spreadsheet-like sheet behind the chart:
//   row 1 = categories, column A = series, numbers from B2…;
//   edit a cell, rename a series or a category, insert or delete a row or a
//   column, type formulas (=C2/B2-1), paste a block from Excel, and the
//   chart follows.
//
// Data integrity: the collected data is NEVER rewritten. The original sheet is
// recomputed every time from the host series; what the user types is a set of
// edits (`edits`), a per-browser view preference, which the chart flags
// ("numbers edited") and a button clears.
//
// edits = { cells: { 'row|col': input }, rowNames, colNames,
//           addedRows: [{ id, after }], addedCols: [{ key, after }],
//           removedRows: [id], removedCols: [key] }
// Pure, tested under node --test.
import { evaluateCell, isFormula, shiftFormula } from './formula.js'

// fills: background color (token) of a "row|col" cell or of a whole "row|*" row ("Use Datasheet Fill").
// hiddenRows / hiddenCols: hidden in the sheet → absent from the chart, but kept.
// rowOrder: row order after a sort in the sheet (the chart follows the sheet order).
// fonts: text formatting of a cell (or a "row|*" row): { bold, italic, color, align, valign, border }
// ("Use Datasheet Bold/Italic, Font Color, Alignment, Border").
/** An empty edit set. */
export const emptyEdits = () => ({ cells: {}, rowNames: {}, colNames: {}, addedRows: [], addedCols: [], removedRows: [], removedCols: [], fills: {}, fonts: {}, hiddenRows: [], hiddenCols: [], rowOrder: null })

/** True when the edit set changes anything. */
export function hasEdits(e) {
  if (!e) return false
  return Object.keys(e.cells ?? {}).length > 0 || Object.keys(e.fills ?? {}).length > 0 || Object.keys(e.fonts ?? {}).length > 0 || (e.rowOrder ?? []).length > 0 || (e.hiddenRows ?? []).length > 0 || (e.hiddenCols ?? []).length > 0 || Object.keys(e.rowNames ?? {}).length > 0 || Object.keys(e.colNames ?? {}).length > 0
    || (e.addedRows ?? []).length > 0 || (e.addedCols ?? []).length > 0 || (e.removedRows ?? []).length > 0 || (e.removedCols ?? []).length > 0
}

/** Order: the base, without removed items, with additions inserted after their neighbor ('^' = first, null = last). */
function ordered(base, added, removed, idOf) {
  const out = base.filter(x => !removed.includes(idOf(x)))
  let head = 0
  for (const a of added) {
    if (a.after === '^') { out.splice(head++, 0, a); continue }
    const i = a.after == null ? -1 : out.findIndex(x => idOf(x) === a.after)
    if (i < 0) out.push(a); else out.splice(i + 1, 0, a)
  }
  return out
}

/** A cell input → number (null when empty). "1,234.5" and "12%" are accepted. */
export function parseCell(raw) {
  let t = String(raw ?? '').trim().replace(/[\s,€$£]/g, '').replace(/[−–]/g, '-')
  if (t === '') return null
  // Accounting negative: "(12)" = −12.
  if (/^\(.*\)$/.test(t)) t = `-${t.slice(1, -1)}`
  const pct = t.endsWith('%')
  const n = Number(pct ? t.slice(0, -1) : t)
  return Number.isFinite(n) ? (pct ? n / 100 : n) : NaN
}

const key = (rowId, colKey) => `${rowId}|${colKey}`

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = n => String(n).padStart(2, '0')
/**
 * A typed date → { iso, pattern } or null. Formats: 2025-03-01, 01/03/2025 (day/month by
 * default; order 'mdy' for month/day), 1 Mar 2025, Mar 1 2025; an optional "14:00" after it.
 * Strict: an impossible date (2025-02-29, 2025-13-40) is rejected.
 */
export function parseDateInput(raw, order = 'dmy') {
  const t = String(raw ?? '').trim()
  let y, mo, d, pattern, rest
  let m
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(t))) { [y, mo, d, rest] = [+m[1], +m[2], +m[3], m[4]]; pattern = 'iso' }
  else if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(.*)$/.exec(t))) {
    const [a, b] = [+m[1], +m[2]]
    ;[d, mo] = order === 'mdy' ? [b, a] : [a, b]; y = +m[3]; rest = m[4]; pattern = order === 'mdy' ? 'mdy' : 'dmy'
  } else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})(.*)$/.exec(t))) { d = +m[1]; mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; y = +m[3]; rest = m[4]; pattern = 'd mmm yyyy' }
  else if ((m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/.exec(t))) { mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; d = +m[2]; y = +m[3]; rest = m[4]; pattern = 'mmm d yyyy' }
  else return null
  if (!(mo >= 1 && mo <= 12)) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  const tm = /^\s*(?:T|\s)?\s*(\d{1,2}):(\d{2})\s*$/.exec(rest ?? '')
  if ((rest ?? '').trim() && !tm) return null
  if (tm && (+tm[1] > 23 || +tm[2] > 59)) return null
  const iso = `${y}-${pad(mo)}-${pad(d)}${tm ? `T${pad(tm[1])}:${tm[2]}` : ''}`
  return { iso, pattern }
}

/**
 * The next header of a sequence (same prefix, number, suffix): the step between the last two
 * headers, or + 1 for a lone year ("2025", "2025E"). null when it is not a sequence.
 */
export function nextInSeries(names) {
  const parse = t => { const m = /^(.*?)(\d+)([A-Za-z]?)$/.exec(String(t ?? '').trim()); return m ? { pre: m[1], n: Number(m[2]), w: m[2].length, suf: m[3] } : null }
  const a = parse(names.at(-1))
  if (!a) return null
  const b = names.length > 1 ? parse(names.at(-2)) : null
  const step = b && b.pre === a.pre && b.suf === a.suf && a.n > b.n ? a.n - b.n : (!a.pre && a.w === 4 ? 1 : null)
  if (!step) return null
  return `${a.pre}${String(a.n + step).padStart(a.w, '0')}${a.suf}`
}

/**
 * The grid identifiers, extended (null = added) up to the last row and the last column
 * holding an input: typing in the first empty column creates a category.
 * matrix: the whole grid (row 0 = headers, column 0 = names).
 */
export function growIds(matrix, rowIds, colKeys) {
  const filled = v => String(v ?? '').trim() !== ''
  let lastRow = rowIds.length, lastCol = colKeys.length
  matrix.forEach((line, i) => (line ?? []).forEach((v, j) => {
    if (!filled(v)) return
    if (i > lastRow) lastRow = i
    if (j > lastCol) lastCol = j
  }))
  return {
    rowIds: [...rowIds, ...Array(lastRow - rowIds.length).fill(null)],
    colKeys: [...colKeys, ...Array(lastCol - colKeys.length).fill(null)],
  }
}

/**
 * The computed sheet.
 *   base = { rows: [{ id, name, points: { key: { y, type, period } } }], cols: [{ key, name }] }
 * → { rows: [{ id, name, added, renamed, cells: [{ raw, value, error, edited }] }],
 *     cols: [{ key, name, added, renamed }] }
 * A1 coordinates: column A = names, B… = categories; row 1 = categories,
 * 2… = series.
 */
export function buildSheet(base, edits = emptyEdits()) {
  const e = { ...emptyEdits(), ...edits }
  // An inserted column inherits the allowed "e" if the sheet accepts it (stacked bridge segments).
  const eAllowed = base.cols.some(c => c.allowE)
  const cols = ordered(base.cols, e.addedCols.map(c => ({ key: c.key, name: '', added: true, after: c.after, allowE: eAllowed })), e.removedCols, c => c.key)
    // A column's type: 'number' (default), 'text' (names, groups) or 'date' (YYYY-MM-DD).
    .map(c => ({ key: c.key, name: e.colNames[c.key] ?? c.name, added: !!c.added, renamed: c.key in e.colNames, type: c.type ?? 'number', readOnly: !!c.readOnly, allowE: !!c.allowE, dateOrder: c.dateOrder, hidden: (e.hiddenCols ?? []).includes(c.key) }))
  // Segment column added to a bridge: a default name ("Segment 2"), never an empty header.
  let seg = 0
  cols.forEach(c => { if (c.added && c.allowE) seg++; if (c.added && !c.renamed && !c.name && c.allowE) c.name = `Segment ${seg}` })
  // Auto-continue: a column added at the end of the sheet continues the header sequence
  // ("2024" → "2025", "2024E" → "2025E", "FY23", "FY24" → "FY25").
  // Only at the end of the sheet: inserted between 2021 and 2022, a column is not named "2022".
  let tail = cols.length
  while (tail > 0 && cols[tail - 1].added) tail--
  for (let i = Math.max(1, tail); i < cols.length; i++) {
    const c = cols[i]
    if (c.renamed || c.name) continue
    const next = nextInSeries(cols.slice(0, i).map(k => k.name))
    if (next) c.name = next
  }
  const rows = ordered(base.rows, e.addedRows.map(r => ({ id: r.id, name: '', points: {}, added: true, after: r.after })), e.removedRows, r => r.id)
    .map(r => ({ id: r.id, name: e.rowNames[r.id] ?? r.name, added: !!r.added, renamed: r.id in e.rowNames, points: r.points }))
  // A sort set in the sheet: rows follow that order (new rows keep their relative place).
  if (Array.isArray(e.rowOrder) && e.rowOrder.length) {
    const at = id => { const i = e.rowOrder.indexOf(id); return i < 0 ? Infinity : i }
    rows.sort((a, b) => at(a.id) - at(b.id))
  }

  const rawAt = (r, c) => {
    const k = key(rows[r].id, cols[c].key)
    if (k in e.cells) return { raw: e.cells[k], edited: true }
    const p = rows[r].points?.[cols[c].key]
    if (cols[c].type !== 'number' && cols[c].type !== 'numdate') return { raw: p?.text != null ? String(p.text) : '', edited: false }
    return { raw: p && Number.isFinite(p.y) ? String(p.y) : p?.text != null ? String(p.text) : '', edited: false }
  }
  // Cell value, memoized, with circular reference detection.
  const memo = new Map()
  const visiting = new Set()
  const valueAt = (r, c) => {
    const id = `${r}:${c}`
    if (memo.has(id)) return memo.get(id)
    if (visiting.has(id)) return { error: '#CYCLE' }
    visiting.add(id)
    const { raw } = rawAt(r, c)
    let out
    // A text or date cell keeps its input (a mistyped date is flagged).
    if (cols[c].type === 'date') {
      // Accepted formats (normalized to YYYY-MM-DD, optional time); the typed format is kept.
      if (raw.trim() !== '') {
        const d = parseDateInput(raw, cols[c].dateOrder)
        out = d ? { value: d.iso, datePattern: d.pattern } : { error: '#DATE' }
        visiting.delete(id); memo.set(id, out); return out
      }
      // Strict: "2025-13-40" is rejected (no rollover to the next month).
      const t = raw.trim()
      const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00Z`) : null
      const ok = !!d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t
      out = raw === '' ? { value: null } : ok ? { value: t } : { error: '#DATE' }
      visiting.delete(id); memo.set(id, out); return out
    }
    if (cols[c].type === 'text' && !isFormula(raw)) { out = { value: raw === '' ? null : raw }; visiting.delete(id); memo.set(id, out); return out }
    // Number or date (value axis of a scatter): a YYYY-MM-DD date is worth its day count since 1970.
    if (cols[c].type === 'numdate' && /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(raw)) {
      const t = raw.trim(), d = new Date(`${t}T00:00:00Z`)
      out = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? { value: Math.round(d.getTime() / 864e5) } : { error: '#DATE' }
      visiting.delete(id); memo.set(id, out); return out
    }
    // "e": a value computed by the chart (the total or subtotal of a bridge).
    if (cols[c].allowE && /^\s*e\s*$/i.test(raw)) { out = { value: 'e' }; visiting.delete(id); memo.set(id, out); return out }
    if (isFormula(raw)) {
      const res = evaluateCell(raw, ({ col, row }) => {
        const rr = row - 2
        const cc = col - 1
        // Column A (row names) and row 1 (headers) are read as text: VLOOKUP("EBITDA", A2:F9, 3, FALSE).
        if (cc === -1 && rr >= 0 && rr < rows.length) return rows[rr].name || null
        if (rr === -1 && cc >= 0 && cc < cols.length) return cols[cc].name || null
        if (rr < 0 || cc < 0 || rr >= rows.length || cc >= cols.length) return rr >= 0 && cc >= 0 ? { error: '#REF' } : null
        const v = valueAt(rr, cc)
        return v.error ? { error: v.error } : v.value
      })
      // A formula returning text in a number column: #VALUE (as Excel would show it poorly).
      out = res.error ? { error: res.error } : typeof res.value === 'string' && cols[c].type !== 'text' ? { error: '#VALUE' } : { value: res.value }
    } else {
      const n = parseCell(raw)
      out = Number.isNaN(n) ? { error: '#VALUE' } : { value: n }
    }
    visiting.delete(id)
    memo.set(id, out)
    return out
  }

  return {
    cols,
    rows: rows.map((r, ri) => ({
      ...r,
      fill: e.fills?.[key(r.id, '*')] ?? null,
      hidden: (e.hiddenRows ?? []).includes(r.id),
      cells: cols.map((c, ci) => {
        const { raw, edited } = rawAt(ri, ci)
        const v = valueAt(ri, ci)
        return { raw, edited, value: v.value ?? null, error: v.error ?? null, datePattern: v.datePattern ?? null, type: r.points?.[c.key]?.type ?? null, fill: e.fills?.[key(r.id, c.key)] ?? e.fills?.[key(r.id, '*')] ?? null,
          font: e.fonts?.[key(r.id, c.key)] ?? e.fonts?.[key(r.id, '*')] ?? null }
      }),
    })),
    edited: hasEdits(e),
  }
}

// ── Edits (pure: a new object every time) ────────────────────────────────────
const clone = e => ({ ...emptyEdits(), ...e, rowOrder: e?.rowOrder ? [...e.rowOrder] : null, cells: { ...(e?.cells ?? {}) }, fills: { ...(e?.fills ?? {}) }, fonts: { ...(e?.fonts ?? {}) }, hiddenRows: [...(e?.hiddenRows ?? [])], hiddenCols: [...(e?.hiddenCols ?? [])], rowNames: { ...(e?.rowNames ?? {}) }, colNames: { ...(e?.colNames ?? {}) },
  addedRows: [...(e?.addedRows ?? [])], addedCols: [...(e?.addedCols ?? [])], removedRows: [...(e?.removedRows ?? [])], removedCols: [...(e?.removedCols ?? [])] })
const nextId = (prefix, list) => `${prefix}${list.reduce((m, x) => Math.max(m, Number(String(x).replace(/\D/g, '')) || 0), 0) + 1}`

/** Background color of cells (colKey '*' = whole row); null clears it. */
export function setFill(e, targets, token) {
  const n = clone(e)
  for (const [rowId, colKey] of targets) { if (token) n.fills[key(rowId, colKey)] = token; else delete n.fills[key(rowId, colKey)] }
  return n
}
/** Text formatting of cells (colKey '*' = whole row): patch merged; a null key is cleared. */
export function setFont(e, targets, patch) {
  const n = clone(e)
  for (const [rowId, colKey] of targets) {
    const k = key(rowId, colKey)
    const next = { ...(n.fonts[k] ?? {}), ...patch }
    for (const f of Object.keys(next)) if (next[f] == null || next[f] === false) delete next[f]
    if (Object.keys(next).length) n.fonts[k] = next
    else delete n.fonts[k]
  }
  return n
}
/** Hide / show rows and columns (they stay in the sheet, out of the chart). */
export function toggleHidden(e, rowIds = [], colKeys = []) {
  const n = clone(e)
  const flip = (list, xs) => { const all = xs.every(x => list.includes(x)); return all ? list.filter(x => !xs.includes(x)) : [...new Set([...list, ...xs])] }
  if (rowIds.length) n.hiddenRows = flip(n.hiddenRows, rowIds)
  if (colKeys.length) n.hiddenCols = flip(n.hiddenCols, colKeys)
  return n
}
/** Sorts rows on a column (values of the computed sheet); dir 'asc' | 'desc' | null (original order). */
export function sortRows(e, sheet, colKey, dir) {
  const n = clone(e)
  if (!dir) { n.rowOrder = null; return n }
  const ci = sheet.cols.findIndex(c => c.key === colKey)
  const val = r => (ci < 0 ? r.name : r.cells[ci]?.value)
  const rows = [...sheet.rows].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return dir === 'desc' ? -c : c
  })
  n.rowOrder = rows.map(r => r.id)
  return n
}
export function setCell(e, rowId, colKey, raw) { const n = clone(e); n.cells[key(rowId, colKey)] = String(raw ?? ''); return n }
export function revertCell(e, rowId, colKey) { const n = clone(e); delete n.cells[key(rowId, colKey)]; return n }
export function renameRow(e, id, name) { const n = clone(e); n.rowNames[id] = name; return n }
export function renameCol(e, k, name) { const n = clone(e); n.colNames[k] = name; return n }

export function insertRow(e, afterId) {
  const n = clone(e)
  const id = nextId('row', n.addedRows.map(r => r.id))
  n.addedRows.push({ id, after: afterId ?? null })
  return { edits: n, id }
}
export function insertCol(e, afterKey) {
  const n = clone(e)
  const k = nextId('col', n.addedCols.map(c => c.key))
  n.addedCols.push({ key: k, after: afterKey ?? null })
  return { edits: n, key: k }
}
const dropCells = (n, test) => { for (const k of Object.keys(n.cells)) if (test(k)) delete n.cells[k] }
export function removeRow(e, id) {
  const n = clone(e)
  if (n.addedRows.some(r => r.id === id)) n.addedRows = n.addedRows.filter(r => r.id !== id)
  else if (!n.removedRows.includes(id)) n.removedRows.push(id)
  dropCells(n, k => k.startsWith(`${id}|`))
  return n
}
export function removeCol(e, k) {
  const n = clone(e)
  if (n.addedCols.some(c => c.key === k)) n.addedCols = n.addedCols.filter(c => c.key !== k)
  else if (!n.removedCols.includes(k)) n.removedCols.push(k)
  dropCells(n, x => x.endsWith(`|${k}`))
  return n
}

/**
 * Pastes a block (rows × columns of text, as Excel puts it on the
 * clipboard) from cell (r, c); r 0 = category row,
 * c 0 = name column. The sheet grows if the block overflows.
 */
export function paste(e, sheet, r, c, matrix) {
  let n = clone(e)
  let rows = sheet.rows.map(x => x.id)
  let cols = sheet.cols.map(x => x.key)
  const needRows = r - 1 + matrix.length - rows.length
  for (let i = 0; i < needRows; i++) { const res = insertRow(n, rows.at(-1)); n = res.edits; rows = [...rows, res.id] }
  const width = Math.max(...matrix.map(line => line.length))
  const needCols = c - 1 + width - cols.length
  for (let i = 0; i < needCols; i++) { const res = insertCol(n, cols.at(-1)); n = res.edits; cols = [...cols, res.key] }
  matrix.forEach((line, i) => line.forEach((text, j) => {
    const rr = r + i
    const cc = c + j
    if (rr === 0 && cc === 0) return
    if (rr === 0) n = renameCol(n, cols[cc - 1], text)
    else if (cc === 0) n = renameRow(n, rows[rr - 1], text)
    else n = setCell(n, rows[rr - 1], cols[cc - 1], text)
  }))
  return n
}

/** Copies cell (r, c) to the right up to the end of the row, shifting references. */
export function fillRight(e, sheet, r, c) {
  if (r < 1 || c < 1) return e
  const row = sheet.rows[r - 1]
  const raw = row.cells[c - 1].raw
  let n = clone(e)
  for (let j = c + 1; j <= sheet.cols.length; j++) n = setCell(n, row.id, sheet.cols[j - 1].key, shiftFormula(raw, j - c, 0))
  return n
}

/** The sheet as TSV text (copy to Excel). */
export function toTSV(sheet) {
  return [['', ...sheet.cols.map(c => c.name)].join('\t'), ...sheet.rows.map(r => [r.name, ...r.cells.map(x => x.value ?? '')].join('\t'))].join('\n')
}

/** Pasted text (TSV) → matrix of strings. */
export function parseTSV(text) {
  return String(text ?? '').replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
}

// ── Working grid (the on-screen spreadsheet) ──────────────────────────────────
// Sheet → grid: the matrix to display (row 1 = categories, column
// A = names), and the identifiers of its rows and columns. Grid →
// edits: the grid is compared with the base, identifier by identifier;
// undo / redo and spreadsheet paste thus need no special handling.

const round2 = v => Math.round(v * 100) / 100

/** The matrix to display (raw inputs: a formula stays "=…"), and the identifiers. */
export function toGrid(sheet) {
  return {
    matrix: [
      ['', ...sheet.cols.map(c => c.name)],
      ...sheet.rows.map(r => [r.name, ...r.cells.map((c, ci) => (c.edited || sheet.cols[ci]?.type === 'text' || sheet.cols[ci]?.type === 'date' ? c.raw : c.raw === '' ? '' : Number.isFinite(Number(c.raw)) ? String(round2(Number(c.raw))) : c.raw))]),
    ],
    rowIds: sheet.rows.map(r => r.id),
    colKeys: sheet.cols.map(c => c.key),
  }
}

const same = (a, b) => {
  if (String(a).trim() === String(b).trim()) return true
  if (isFormula(a) || isFormula(b)) return String(a).trim() === String(b).trim()
  const x = parseCell(a)
  const y = parseCell(b)
  if (x == null || y == null) return x == null && y == null
  // A source value is shown rounded to the hundredth: that is not an edit.
  return Math.abs(x - y) < 0.005
}

/**
 * The edits that lead from the base to the grid. `rowIds` / `colKeys`:
 * the identifier of each grid row / column (null = added).
 */
export function editsFromGrid(base, matrix, rowIds, colKeys) {
  const e = emptyEdits()
  const baseRows = new Map(base.rows.map(r => [r.id, r]))
  const baseCols = new Map(base.cols.map(c => [c.key, c]))
  // An added row / column receives the next identifier after those already given.
  const top = (list, prefix) => list.reduce((m, x) => (String(x ?? '').startsWith(prefix) ? Math.max(m, Number(String(x).slice(prefix.length)) || 0) : m), 0)
  let nr = top(rowIds, 'row')
  let nc = top(colKeys, 'col')
  const rows = rowIds.map(id => id ?? `row${++nr}`)
  const cols = colKeys.map(k => k ?? `col${++nc}`)
  cols.forEach((k, j) => {
    if (!baseCols.has(k)) e.addedCols.push({ key: k, after: j === 0 ? '^' : cols[j - 1] })
    const name = String(matrix[0]?.[j + 1] ?? '')
    if (!baseCols.has(k) ? name !== '' : name !== baseCols.get(k).name) e.colNames[k] = name
  })
  for (const k of baseCols.keys()) if (!cols.includes(k)) e.removedCols.push(k)
  rows.forEach((id, i) => {
    const line = matrix[i + 1] ?? []
    const b = baseRows.get(id)
    if (!b) e.addedRows.push({ id, after: i === 0 ? '^' : rows[i - 1] })
    const name = String(line[0] ?? '')
    if (!b ? name !== '' : name !== b.name) e.rowNames[id] = name
    cols.forEach((k, j) => {
      const raw = String(line[j + 1] ?? '')
      const p = b?.points?.[k]
      // Text or date column: compared as is; number column: within rounding.
      if (!['number', 'numdate'].includes(baseCols.get(k)?.type ?? 'number')) {
        const srcT = p?.text != null ? String(p.text) : ''
        if (raw.trim() !== srcT.trim()) e.cells[`${id}|${k}`] = raw
        return
      }
      const src = p && Number.isFinite(p.y) ? String(p.y) : p?.text != null ? String(p.text) : ''
      if (!same(raw, src)) e.cells[`${id}|${k}`] = raw
    })
  })
  for (const id of baseRows.keys()) if (!rows.includes(id)) e.removedRows.push(id)
  return { edits: e, rowIds: rows, colKeys: cols }
}

/**
 * The sheet width inside the card (right-edge handle): at least 280 px,
 * never wider than the card; full width (null) when it reaches it.
 */
export function clampSheetWidth(w, max) {
  const top = Number.isFinite(max) && max > 0 ? max : Infinity
  const v = Math.round(Math.max(280, Math.min(w, top)))
  return v >= top ? null : v
}
