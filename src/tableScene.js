// ─── epure-charts · the table (Harvey balls, checkboxes) ─────────────────────
// buildTableScene(spec, columns, rows, { width, format }) returns the pure geometry
// of a data-driven table: a cell's value picks its content (number, text,
// Harvey ball, checkbox, icon). No React, tested under node --test.
//
// columns : [{ key, label, type?, unit?, align?, width?, decimals? }]
// rows    : [{ key, label, cells: { [colKey]: value }, emphasis?, total? }]
// spec    : {
//   headerRow?: bool (true)   headerCol?: bool (true, the label column)
//   stripes?: null|'rows'|'cols'   rowLines?: 'header'|'all'|'none'   colLines?: bool
//   totals?: bool (a computed Total row)   density?: 'compact'|'normal'|'roomy'
//   colTypes?: { [col]: type }   cellTypes?: { 'row|col': type }   align?: { [col]: 'left'|'center'|'right' }
//   widths?: { [col]: px }   decimals?: { [col]: n }   magnitude?: { [col]: 'k'|'M'|'B' }
//   harveyMax?: { [col]: 1|4 }  (Harvey ball scale: 0..1 or 0..4 quarters; auto otherwise)
//   emphasis?: [rowKey]   insRows?: [{ key, after }]   insCols?: [{ key, after, label }]
//   hideRows?: [rowKey]   hideCols?: [colKey]   text?: { 'row|col': text } (inserted cells)
//   labelHeader?: header text of the label column
//   fills?: { 'row|col' | 'row|*' | '*|col': token }   fill (cell > row > column > sheet)
//   colors?: { same key: token }   text or symbol color (checkbox, full Harvey ball)
//   markFills?: { same key: token }   checkbox background, empty Harvey ball sectors
//   stripeColors?: [token|null, token|null]   stripe colors 1 and 2 (only 2 by default)
//   valign?: { [col]: 'top'|'middle'|'bottom' }
//   rotate?: { [col]: 90|0 }   vertical header (the header row grows) or forced horizontal;
//            absent: auto, 90° when the header does not fit on two lines
//   outlineColors?, outlineStyles?: { same key as fills: token | 'solid'|'bold'|'dashed'|'none' }  mark outline
//   overrides?: { 'row|col': text }   cell unlinked from the sheet ("Convert to text"); null relinks it
//   align / valign also accept a "row|col" cell key (it wins over the column)
//   rowHeight?: px (table resized with its handle; wins over density)
//   fontSize?: 'xsmall'|'small'|'large'|'xlarge'   fontSizes?: { [col]: step }   text size (engine steps)
//   markSizes?: { [col] | 'row|col': step }   size of Harvey balls and checkboxes
//   labelPt?, labelFont?: point size and font of the whole table ("Style" control)
//   pts?, fonts?: { [col] | 'row|col': pt | font }   the same for a column or a cell
//                 (cell > column > table); row height follows the largest text
// }
import { makeFormatter } from './numberStyle.js'
import { inkOnDark, labelMetrics, isPt, isFont } from './customStyle.js'

export const CELL_TYPES = ['auto', 'number', 'text', 'harvey', 'check', 'icon', 'pentagon', 'pill']
// Mark outline: weight and dashes ("Outline": color, style, weight).
export const OUTLINES = { solid: { width: 1 }, bold: { width: 2 }, dashed: { width: 1, dash: '2 2' }, none: { width: 0 } }
export const LABEL_COL = '__label__'
export const TOTAL_ROW = '__total__'
const DENSITY = { compact: 22, normal: 28, roomy: 36 }
// Size steps (the same as chart text: XS, S, M, L, XL).
export const TABLE_SIZES = { xsmall: 0.8, small: 0.9, large: 1.2, xlarge: 1.4 }
const sizeOf = k => TABLE_SIZES[k] ?? 1
const CHAR = 6.6
const PAD = 10

/** A value's checkbox state: 'yes' (check), 'no' (cross) or 'empty'. */
export function checkOf(v) {
  if (v === true || v === 1) return 'yes'
  if (v === false || v === -1) return 'no'
  const s = typeof v === 'string' ? v.trim().toLowerCase() : null
  if (s == null) return 'empty'
  if (['yes', 'y', 'true', 'done', 'ok', '✓', '✔', 'check', 'v'].includes(s)) return 'yes'
  if (['no', 'n', 'false', 'fail', 'x', '✗', '✘', 'cross'].includes(s)) return 'no'
  return 'empty'
}

/** A Harvey ball's fill (0..1); max = 1 (fraction) or 4 (quarters). */
export function harveyOf(v, max = 1) {
  const n = typeof v === 'string' ? Number(v.replace('%', '')) / (v.includes('%') ? 100 : 1) : Number(v)
  if (v == null || v === '' || !Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n / (max || 1)))
}

// Status icons (the set used by "icon" cells): shape and color token.
const ICONS = {
  up: { shape: 'up', color: 'green' }, down: { shape: 'down', color: 'red' }, flat: { shape: 'flat', color: 'gray-500' },
  green: { shape: 'dot', color: 'green' }, amber: { shape: 'dot', color: 'amber' }, red: { shape: 'dot', color: 'red' }, grey: { shape: 'dot', color: 'gray-400' },
}
/** A value's icon: a word ("up", "red"...) or a sign (+ means up, - means down). */
export function iconOf(v) {
  if (typeof v === 'number') return v > 0 ? ICONS.up : v < 0 ? ICONS.down : ICONS.flat
  const s = String(v ?? '').trim().toLowerCase()
  return ICONS[s] ?? (s === 'gray' ? ICONS.grey : null)
}

/** The type of a cell left on "auto", inferred from its value. */
export function inferType(v) {
  if (typeof v === 'boolean') return 'check'
  if (typeof v === 'number') return 'number'
  return 'text'
}

// Effective order: the data, insertions placed after their neighbor, hidden ones removed.
function arrange(base, ins = [], hide = []) {
  const out = base.filter(x => !hide.includes(x.key))
  for (const it of ins) {
    if (hide.includes(it.key)) continue
    const at = it.after == null ? 0 : out.findIndex(x => x.key === it.after) + 1
    out.splice(at <= 0 && it.after != null ? out.length : at, 0, { ...it, inserted: true })
  }
  return out
}

const plainFormat = v => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function buildTableScene(spec = {}, columns = [], rows = [], { width = 640, format } = {}) {
  const headerRow = spec.headerRow !== false
  const headerCol = spec.headerCol !== false
  // A free point size ("Style" control, spec.labelPt) wins over the steps:
  // all table text at that size, measured in its font (labelMetrics).
  const LM = labelMetrics(spec, 12)
  const ptK = LM.base ? null : LM.size / 12
  const fs0 = ptK ?? sizeOf(spec.fontSize)
  const colScale = key => ptK ?? sizeOf(spec.fontSizes?.[key] ?? spec.fontSize)
  // Row height follows the largest text size (text is never taller than its row).
  // Column or cell style (pts / fonts): cell > column > table.
  const ptAt = key => (isPt(spec.pts?.[key]) ? spec.pts[key] : null)
  const fontAt = key => (spec.fonts?.[key] && isFont(spec.fonts[key]) ? spec.fonts[key] : null)
  const ownStyle = (rk, ck) => ({ pt: ptAt(`${rk}|${ck}`) ?? ptAt(ck), font: fontAt(`${rk}|${ck}`) ?? fontAt(ck) })
  // A text's metrics (size, measure): null = nothing specific, the table steps apply.
  const metricsAt = (rk, ck) => {
    const o = ownStyle(rk, ck)
    if (o.pt == null && o.font == null) return null
    return labelMetrics({ labelPt: o.pt ?? spec.labelPt, labelFont: o.font ?? spec.labelFont }, Math.round(12 * colScale(ck) * 10) / 10)
  }
  const ownPts = Object.values(spec.pts ?? {}).filter(isPt).map(v => Math.round((v * 4) / 3))
  const maxScale = Math.max(ptK ?? Math.max(fs0, ...Object.values(spec.fontSizes ?? {}).map(sizeOf)), ...ownPts.map(px => px / 12))
  const ptFloor = ptK || ownPts.length ? Math.max(ptK ? LM.size : 0, ...ownPts) + 6 : 0
  const rowH = Number.isFinite(spec.rowHeight) ? Math.max(16, ptFloor, Math.round(spec.rowHeight)) : Math.round((DENSITY[spec.density] ?? DENSITY.normal) * Math.max(1, maxScale))
  const cols = arrange(columns, spec.insCols, spec.hideCols)
  const emphasis = new Set(spec.emphasis ?? [])
  let body = arrange(rows, spec.insRows, spec.hideRows)
  if (!cols.length || (!body.length && !spec.totals)) return { empty: true, width, height: 0, cols: [], rows: [], cells: [], lines: [], stripes: [] }

  // ── Each column's type and scale ──
  const colType = c => spec.colTypes?.[c.key] ?? c.type ?? 'auto'
  const harveyMax = c => {
    if (spec.harveyMax?.[c.key]) return spec.harveyMax[c.key]
    const vals = rows.map(r => Number(r.cells?.[c.key])).filter(Number.isFinite)
    return vals.some(v => v > 1) ? 4 : 1
  }
  const fmtOf = c => {
    const dec = spec.decimals?.[c.key] ?? c.decimals ?? null
    const mag = spec.magnitude?.[c.key] ?? null
    const base = format ?? ((v, unit, d) => (d != null ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : plainFormat(v)) + (unit === 'pct' || unit === '%' ? '%' : unit === 'x' ? 'x' : ''))
    return makeFormatter(base, dec, mag, null)
  }

  // ── Totals row: sum of numbers, mean of Harvey balls, count of checkboxes ──
  if (spec.totals) {
    const cells = {}
    const data = body.filter(r => !r.inserted && !r.total)
    for (const c of cols) {
      if (c.inserted) continue
      const t = colType(c)
      const vals = data.map(r => r.cells?.[c.key])
      const kind = t === 'auto' ? inferType(vals.find(v => v != null)) : t
      if (kind === 'number') cells[c.key] = vals.reduce((s, v) => s + (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : 0), 0)
      else if (kind === 'harvey') {
        const fs = vals.map(v => harveyOf(v, harveyMax(c))).filter(f => f != null)
        cells[c.key] = fs.length ? (fs.reduce((s, f) => s + f, 0) / fs.length) * harveyMax(c) : null
      } else if (kind === 'check') cells[c.key] = `${vals.filter(v => checkOf(v) === 'yes').length}/${vals.length}`
    }
    body = [...body, { key: TOTAL_ROW, label: 'Total', cells, total: true, computed: true }]
  }

  // ── Each cell's content (type driven by the value) ──
  const content = (r, c) => {
    const id = `${r.key}|${c.key}`
    const over = !r.computed && !r.inserted && !c.inserted && spec.overrides?.[id] != null
    const raw = r.inserted || c.inserted ? (spec.text?.[id] ?? '') : over ? spec.overrides[id] : r.cells?.[c.key]
    const out = content0(r, c, id, raw)
    return over ? { ...out, overwritten: true, invalid: false } : out
  }
  const content0 = (r, c, id, raw) => {
    let type = spec.cellTypes?.[id] ?? colType(c)
    if (r.computed && c.key in r.cells && typeof raw === 'string') type = 'text'
    if (type === 'auto') type = inferType(raw)
    if (type === 'number') {
      const n = typeof raw === 'number' ? raw : raw == null || raw === '' ? NaN : Number(raw)
      return Number.isFinite(n) ? { type, text: fmtOf(c)(n, c.unit, spec.decimals?.[c.key] ?? c.decimals), value: n } : { type: 'text', text: raw == null ? '' : String(raw) }
    }
    if (type === 'harvey') return { type, harvey: harveyOf(raw, harveyMax(c)), max: harveyMax(c), value: raw, invalid: (r.invalid ?? []).includes(c.key) }
    if (type === 'check') return { type, check: checkOf(raw), value: raw }
    // Pentagon (chevron) and rounded rectangle: a filled shape with the text (or formatted number) inside.
    if (type === 'pentagon' || type === 'pill') {
      const n = typeof raw === 'number' ? raw : NaN
      return { type, text: Number.isFinite(n) ? fmtOf(c)(n, c.unit, spec.decimals?.[c.key] ?? c.decimals) : raw == null ? '' : String(raw), value: raw }
    }
    if (type === 'icon') { const ic = iconOf(raw); return ic ? { type, icon: ic, value: raw } : { type: 'text', text: raw == null ? '' : String(raw) } }
    return { type: 'text', text: raw == null ? '' : String(raw) }
  }
  const grid = body.map(r => cols.map(c => content(r, c)))

  // ── Widths: auto from content, manual in px; the rest goes to the labels ──
  const textW = (s, k = fs0, m = null) => (m ? m.measure(s) : ptK ? LM.measure(s) : String(s ?? '').length * CHAR * k) + 2 * PAD
  const rotated = c => headerRow && Number(spec.rotate?.[c.key]) === 90
  // Vertical headers: the header row takes the height of the longest one.
  let headH = Math.max(rowH, ...cols.filter(rotated).map(c => textW(c.label, colScale(c.key), metricsAt('__head__', c.key))))
  // A column's widths: "auto" (everything on one line), "need" (the header wraps at its
  // longest word, cells fit whole), "min" (content only, free text ellipsized),
  // "floor" (last resort). The table always fits its width.
  const words = s => String(s ?? '').split(/\s+/).filter(Boolean)
  // The header is bold: its measure takes 6 % more (same as measureIn below).
  const headW = (s, k, m) => (textW(s, k, m) - 2 * PAD) * 1.06 + 2 * PAD
  const headMin = (label, k, m) => Math.max(0, ...words(label).map(w => headW(w, k, m)))
  const SHORT = 'Abcdef…'
  const HEAD_SHORT = 'Abc…'
  const freeText = t => ['text', 'pentagon', 'pill'].includes(t)
  const widths3 = cols.map((c, j) => {
    const k = colScale(c.key)
    const hm = metricsAt('__head__', c.key)
    const head = headerRow ? (rotated(c) ? rowH : headW(c.label, k, hm)) : 0
    const hMin = headerRow ? (rotated(c) ? rowH : headMin(c.label, k, hm)) : 0
    // A mark (Harvey ball, checkbox, icon): its size follows the text, plus margins.
    const markW = Math.max(40, Math.min(rowH - 6, 16 * Math.max(1, ptK ?? k)) + 2 * PAD)
    const cellsW = grid.map((g, i) => (['text', 'number'].includes(g[j].type) ? textW(g[j].text, k, metricsAt(body[i].key, c.key)) : ['pentagon', 'pill'].includes(g[j].type) ? textW(g[j].text, k, metricsAt(body[i].key, c.key)) + 16 : markW))
    const cellsHard = grid.map((g, i) => (freeText(g[j].type) && g[j].text ? Math.min(cellsW[i], textW(SHORT, k, metricsAt(body[i].key, c.key)) + (g[j].type === 'text' ? 0 : 16)) : cellsW[i]))
    const need = Math.max(40, hMin, ...cellsW)
    // A column's minimum: its content only (symbol + margin, whole number, free text
    // ellipsized); the header wraps or ellipsizes inside. "mid": the header keeps a few letters.
    const text = grid.some(g => freeText(g[j].type) && g[j].text)
    const min = Math.max(40, Math.min(need, ...[Math.max(...cellsHard)].filter(Number.isFinite)))
    const mid = Math.max(min, Math.min(need, headerRow && !rotated(c) ? headW(HEAD_SHORT, k, hm) : 0))
    const floor = Math.min(min, Math.max(40, Math.min(need, ...cellsHard.map(v => Math.max(v, 0)))))
    return { auto: Math.max(need, head), need, min, mid, floor, text }
  })
  let labelW3 = { auto: 0, need: 0, min: 0, mid: 0, floor: 0, text: true }
  if (headerCol) {
    const hm = metricsAt('__head__', LABEL_COL)
    const ls = body.map(r => textW(r.label, fs0, metricsAt(r.key, LABEL_COL)) + ((r.level ?? 0) * 12))
    const lh = body.map(r => Math.min(textW(r.label, fs0, metricsAt(r.key, LABEL_COL)), textW(SHORT, fs0, metricsAt(r.key, LABEL_COL))) + ((r.level ?? 0) * 12))
    const need = Math.max(80, headerRow ? headMin(spec.labelHeader ?? '', fs0, hm) : 0, ...ls)
    const min = Math.max(40, Math.min(need, Math.max(...lh)))
    labelW3 = { auto: Math.max(need, headerRow ? headW(spec.labelHeader ?? '', fs0, hm) : 0), need, min, mid: min, floor: Math.min(min, Math.max(40, Math.min(need, ...lh))), text: true }
  }
  const all = [
    ...(headerCol ? [{ key: LABEL_COL, label: spec.labelHeader ?? '', w: spec.widths?.[LABEL_COL] ?? null, ...labelW3, label0: true }] : []),
    ...cols.map((c, j) => ({ key: c.key, label: c.label ?? '', w: spec.widths?.[c.key] ?? c.width ?? null, ...widths3[j], inserted: !!c.inserted })),
  ]
  const fixed = all.reduce((s, c) => s + (c.w ?? 0), 0)
  const autos = all.filter(c => c.w == null)
  const sum = k => autos.reduce((s, c) => s + c[k], 0)
  const room = Math.max(0, width - fixed)
  // Between two levels: each one's floor, the rest pro rata to what it lacks to reach the top.
  const between = (lo, hi) => {
    const gap = sum(hi) - sum(lo)
    for (const c of autos) c.width = c[lo] + (gap > 0 ? ((c[hi] - c[lo]) / gap) * (room - sum(lo)) : 0)
  }
  for (const c of all) if (c.w != null) c.width = c.w
  if (sum('auto') <= room) for (const c of autos) c.width = c.auto + (c.label0 || (!headerCol && c === autos[0]) ? room - sum('auto') : 0)
  else if (sum('need') <= room) between('need', 'auto')
  // Too narrow: each column first gets its minimum (content only), then the rest goes,
  // in order, to text columns (up to their need), to the other headers (a few
  // letters), then to their need; at each step pro rata to what is missing.
  else if (sum('min') <= room) {
    for (const c of autos) c.width = c.min
    let left = room - sum('min')
    for (const [pick, lvl] of [[c => c.text, 'need'], [c => !c.text, 'mid'], [c => !c.text, 'need']]) {
      const grp = autos.filter(pick)
      const gap = grp.reduce((s, c) => s + Math.max(0, c[lvl] - c.width), 0)
      if (gap <= 0 || left <= 0) continue
      const give = Math.min(left, gap)
      for (const c of grp) c.width += (Math.max(0, c[lvl] - c.width) / gap) * give
      left -= give
    }
  }
  // Last resort before squashing: text cells ellipsize further.
  else if (sum('floor') <= room) between('floor', 'min')
  else for (const c of autos) c.width = Math.max(24, (c.floor / sum('floor')) * room)
  let x = 0
  const colOut = all.map((c, i) => {
    const src = c.label0 ? null : cols.find(k => k.key === c.key)
    // The dominant type of an "auto" column: that of its first non-empty cell.
    const sample = src ? (grid.map(g => g[cols.indexOf(src)]).find(g => g.type !== 'text' || g.text)?.type ?? 'text') : 'text'
    const kind = src ? (spec.colTypes?.[src.key] ?? src.type ?? 'auto') : 'label'
    const align = spec.align?.[c.key] ?? src?.align
      ?? (c.label0 ? 'left' : ['harvey', 'check', 'icon'].includes(kind === 'auto' ? sample : kind) ? 'center' : (kind === 'auto' ? sample : kind) === 'number' ? 'right' : 'left')
    const o = { key: c.key, label: c.label, x, w: c.width, align, type: kind, index: i, header: !!c.label0, inserted: c.inserted, manual: c.w != null }
    x += c.width
    return o
  })
  const tableW = x

  // ── Text fits its cell: the header wraps, the rest ellipsizes (title = full text) ──
  // The header is bold: slightly wider than the base measure.
  const measureIn = (s, rk, ck) => (textW(s, ck === LABEL_COL ? fs0 : colScale(ck), metricsAt(rk, ck)) - 2 * PAD) * (rk === '__head__' ? 1.06 : 1)
  const fit = (s, avail, rk, ck) => {
    const str = String(s ?? '')
    if (measureIn(str, rk, ck) <= avail + 0.5) return str
    let t = str
    while (t.length > 1 && measureIn(`${t.trimEnd()}…`, rk, ck) > avail) t = t.slice(0, -1)
    return `${t.trimEnd()}…`
  }
  const wrap = (s, avail, rk, ck) => {
    const out = []
    for (const w of words(s)) {
      const cur = out.length ? `${out[out.length - 1]} ${w}` : null
      if (cur != null && measureIn(cur, rk, ck) <= avail + 0.5) out[out.length - 1] = cur
      else out.push(fit(w, avail, rk, ck))
    }
    return out
  }
  const headFs = ck => { const o = ownStyle('__head__', ck); return o.pt != null ? Math.round((o.pt * 4) / 3) : ptK ? LM.size : Math.round(11 * (ck === LABEL_COL ? fs0 : colScale(ck)) * 10) / 10 }
  const headLines = new Map()
  // A header that does not fit even on two lines turns 90° on its own,
  // unless the orientation was set by hand (rotate: 0 or 90). The header row grows,
  // capped at ~40 % of the table height; beyond that the vertical text ellipsizes (hover).
  const autoRot = new Map()
  if (headerRow) {
    // headH <= 40 % of (headH + body) <=> headH <= 2/3 of the body.
    const cap = Math.max(headH, Math.floor((body.length * rowH * 2) / 3))
    const seen = ls => ls.join('').replace(/…/g, '').length
    for (const c of colOut) {
      if (!c.header && rotated(c)) continue
      const lines = wrap(c.label, c.w - 2 * PAD, '__head__', c.key)
      const tooLong = lines.length > 2 || lines.some(l => l.endsWith('…'))
      // Rotate only if vertical shows more of the label than horizontal (very short table).
      if (!c.header && tooLong && spec.rotate?.[c.key] == null && c.w >= headFs(c.key)
        && seen([fit(c.label, cap - 2 * PAD, '__head__', c.key)]) > seen(lines.slice(0, 2))) { autoRot.set(c.key, measureIn(c.label, '__head__', c.key) + 2 * PAD); continue }
      if (lines.length > 1 || (lines[0] ?? '') !== String(c.label ?? '')) headLines.set(c.key, lines)
      if (lines.length > 1) headH = Math.max(headH, Math.ceil(lines.length * headFs(c.key) * 1.2 + 10))
    }
    if (autoRot.size) {
      headH = Math.max(headH, Math.min(cap, ...[Math.max(...autoRot.values())]))
    }
  }

  // ── Rows, cells, stripes, rules ──
  let y = 0
  const rowOut = []
  const cells = []
  if (headerRow) {
    rowOut.push({ key: '__head__', y, h: headH, kind: 'header', bold: true })
    for (const c of colOut) cells.push({ key: `__head__|${c.key}`, row: '__head__', col: c.key, x: c.x, y, w: c.w, h: headH, type: 'text', text: c.label, align: c.header ? 'left' : c.align, bold: true, header: true, ...(!c.header && (rotated(c) || autoRot.has(c.key)) ? { rotate: 90, ...(autoRot.has(c.key) ? { autoRotate: true } : {}) } : {}), ...(headLines.has(c.key) ? { lines: headLines.get(c.key), clipped: headLines.get(c.key).join(' ') !== String(c.label ?? '') } : {}) })
    y += headH
  }
  body.forEach((r, i) => {
    const kind = r.total ? 'total' : 'data'
    const bold = !!(r.emphasis || emphasis.has(r.key) || r.total)
    rowOut.push({ key: r.key, y, h: rowH, kind, bold, index: i, inserted: !!r.inserted, label: r.label ?? '' })
    for (const c of colOut) {
      const base = { key: `${r.key}|${c.key}`, row: r.key, col: c.key, x: c.x, y, w: c.w, h: rowH, align: spec.align?.[`${r.key}|${c.key}`] ?? c.align, bold }
      if (c.header) {
        const text = r.inserted ? (spec.text?.[`${r.key}|${LABEL_COL}`] ?? '') : (r.label ?? '')
        cells.push({ ...base, type: 'text', text, indent: (r.level ?? 0) * 12, header: true })
      } else cells.push({ ...base, ...grid[i][cols.findIndex(k => k.key === c.key)] })
    }
    y += rowH
  })
  const height = y

  // A cell's style ("Fill", "Font color", "Symbol color", "Checkbox fill"):
  // cell wins over row, row over column; the sheet fill comes last.
  const rowBy = new Map(body.map(r => [r.key, r]))
  const pickStyle = (m, c) => m?.[`${c.row}|${c.col}`] ?? m?.[`${c.row}|*`] ?? m?.[`*|${c.col}`] ?? null
  for (const c of cells) {
    if (c.row === '__head__') continue
    const r = rowBy.get(c.row)
    const fill = pickStyle(spec.fills, c) ?? (c.col === LABEL_COL ? r?.fill : (r?.fills?.[c.col] ?? r?.fill)) ?? null
    if (fill) c.fill = fill
    const color = pickStyle(spec.colors, c)
    if (color) c.color = color
    // Automatic contrast: on a dark hex fill (custom style), the text turns white.
    else if (inkOnDark(fill)) c.color = inkOnDark(fill)
    const markFill = pickStyle(spec.markFills, c)
    if (markFill) c.markFill = markFill
    const oc = pickStyle(spec.outlineColors, c), os = pickStyle(spec.outlineStyles, c)
    if (oc || os) c.outline = { color: oc, ...(OUTLINES[os] ?? {}) }
    // Custom checkbox symbols: { yes, no }.
    const sym = pickStyle(spec.checkSymbols, c)
    if (sym) c.symbols = sym
  }

  // Position of text and marks in each cell (vertical alignment per column).
  for (const c of cells) {
    c.cx = c.x + c.w / 2
    const va = c.row === '__head__' ? 'middle' : (spec.valign?.[`${c.row}|${c.col}`] ?? spec.valign?.[c.col] ?? 'middle')
    c.valign = va
    // Text (px) and mark size: table, column, then cell steps.
    const own = ownStyle(c.row, c.col)
    c.fs = own.pt != null ? Math.round((own.pt * 4) / 3) : ptK ? LM.size : Math.round((c.row === '__head__' ? 11 : 12) * colScale(c.col) * 10) / 10
    // Font: cell > column > table; null = the type's default font (numbers in mono).
    c.font = own.font ?? (spec.labelFont && isFont(spec.labelFont) ? spec.labelFont : null)
    // Symbols follow the text size (Harvey ball, checkbox, icon), never taller than the row.
    const mk = sizeOf(spec.markSizes?.[`${c.row}|${c.col}`] ?? spec.markSizes?.[c.col])
    const kt = Math.max(1, c.fs / 12)
    c.k = kt
    c.r = Math.max(3, Math.min(c.h / 2 - 3, 7 * mk * kt, c.h * 0.28 * mk * kt))
    c.size = Math.max(6, Math.min(c.h - 6, 12 * mk * kt, c.h * 0.46 * mk * kt))
    const half = Math.min(c.h / 2, Math.max(c.r, c.size / 2, c.fs / 2) + 4)
    c.cy = va === 'top' ? c.y + half : va === 'bottom' ? c.y + c.h - half : c.y + c.h / 2
    c.tx = c.align === 'right' ? c.x + c.w - PAD : c.align === 'center' ? c.cx : c.x + PAD + (c.indent ?? 0)
    c.anchor = c.align === 'right' ? 'end' : c.align === 'center' ? 'middle' : 'start'
    // Text wider than its cell: ellipsis (full text stays in c.text, shown on hover).
    if (['text', 'number'].includes(c.type) && !c.lines && !c.rotate && c.text) {
      const shown = fit(c.text, c.w - 2 * PAD - (c.indent ?? 0), c.row, c.col)
      if (shown !== String(c.text)) { c.shown = shown; c.clipped = true }
    }
    // Vertical header: text rises from the bottom of the cell, centered on the column.
    if (c.rotate === 90) {
      c.tx = c.cx; c.cy = c.y + c.h - PAD; c.anchor = 'start'
      // Auto-rotated and longer than the capped header row: ellipsis, full text on hover.
      if (c.autoRotate) { const shown = fit(c.text, c.h - 2 * PAD, c.row, c.col); if (shown !== String(c.text)) { c.shown = shown; c.clipped = true } }
    }
    // Pentagon / rounded cell shape: the inner frame, point on the right.
    if (c.type === 'pentagon' || c.type === 'pill') {
      const i = 3, x0 = c.x + i, x1 = c.x + c.w - i, y0 = c.y + i, y1 = c.y + c.h - i, k = (y1 - y0) / 2
      c.shape = c.type === 'pill'
        ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rx: k }
        : { points: `${x0},${y0} ${x1 - k},${y0} ${x1},${(y0 + y1) / 2} ${x1 - k},${y1} ${x0},${y1}` }
      c.tx = c.align === 'right' ? x1 - (c.type === 'pentagon' ? k : 0) - 8 : c.align === 'center' ? (x0 + x1 - (c.type === 'pentagon' ? k : 0)) / 2 : x0 + 8
      const shown = c.text ? fit(c.text, x1 - x0 - 16 - (c.type === 'pentagon' ? k : 0), c.row, c.col) : c.text
      if (shown !== c.text) { c.shown = shown; c.clipped = true }
    }
  }

  // Stripes alternate color 1 (none by default) and color 2 (the theme gray by default).
  const stripes = []
  const [sc1, sc2] = spec.stripeColors ?? [null, null]
  const stripe = (k, o) => { const fill = k % 2 === 1 ? sc2 : sc1; if (k % 2 === 1 || fill) stripes.push({ ...o, ...(fill ? { fill } : {}) }) }
  if (spec.stripes === 'rows') rowOut.filter(r => r.kind === 'data').forEach(r => stripe(r.index, { key: `s-${r.key}`, x: 0, y: r.y, w: tableW, h: r.h }))
  if (spec.stripes === 'cols') colOut.filter(c => !c.header).forEach((c, k) => stripe(k, { key: `s-${c.key}`, x: c.x, y: headerRow ? headH : 0, w: c.w, h: height - (headerRow ? headH : 0) }))

  const lines = []
  const rowLines = spec.rowLines ?? 'header'
  if (headerRow && rowLines !== 'none') lines.push({ key: 'h', x1: 0, y1: headH, x2: tableW, y2: headH, strong: true })
  for (const r of rowOut) {
    if (r.kind === 'total') lines.push({ key: `t-${r.key}`, x1: 0, y1: r.y, x2: tableW, y2: r.y, strong: true })
    else if (rowLines === 'all' && r.kind === 'data') lines.push({ key: `r-${r.key}`, x1: 0, y1: r.y + r.h, x2: tableW, y2: r.y + r.h })
  }
  if (spec.colLines) for (const c of colOut.slice(1)) lines.push({ key: `c-${c.key}`, x1: c.x, y1: 0, x2: c.x, y2: height, vertical: true })

  return { empty: false, width: tableW, height, rowH, headH: headerRow ? headH : 0, cols: colOut, rows: rowOut, cells, lines, stripes }
}

/**
 * Resizes the table with its handle ("Resize table"): columns keep their
 * proportions and the total width becomes w. Returns { widths } to apply (at least 24 px each).
 */
export function resizeTableWidths(scene, w) {
  const total = scene?.width ?? 0
  if (!total || !(w > 0)) return {}
  const k = w / total
  return Object.fromEntries(scene.cols.map(c => [c.key, Math.max(24, Math.round(c.w * k))]))
}

/** Row height for a table height h (the header row follows, like the others). */
export function resizeTableRowHeight(scene, h) {
  const n = scene?.rows?.length ?? 0
  if (!n || !(h > 0)) return null
  const rotatedExtra = Math.max(0, (scene.headH || 0) - scene.rowH)
  return Math.max(16, Math.min(80, Math.round((h - rotatedExtra) / n)))
}

/** The next free insertion key ("ins-1", "ins-2"...). */
export function nextInsertKey(taken, prefix = 'ins') {
  let i = 1
  while (taken.includes(`${prefix}-${i}`)) i++
  return `${prefix}-${i}`
}

// ── Keyboard on Harvey balls and checkboxes (+ / -, 0-8, double-click; v / 1, x / 2, space / 0) ──

/** Number of sectors of a Harvey ball: 4 on the 0-1 scale, otherwise its maximum. */
export const harveySectors = max => (!max || max === 1 ? 4 : max)

/** Next value of a Harvey ball (scale 0..max) for a key, or null if the key does not affect it. */
export function harveyKey(value, key, max = 1) {
  const sectors = harveySectors(max)
  const step = max / sectors
  const f = harveyOf(value, max) ?? 0
  const cur = Math.round(f * sectors) // in sectors
  const out = n => Math.round(Math.min(sectors, Math.max(0, n)) * step * 1e6) / 1e6
  if (key === '+' || key === '=') return out(cur + 1)
  if (key === '-' || key === '−') return out(cur - 1)
  if (/^[0-8]$/.test(key)) {
    const d = Number(key)
    // More than eight sectors: digits count in eighths.
    return sectors > 8 ? Math.round((d / 8) * max * 1e6) / 1e6 : out(d)
  }
  return null
}

/** Double-click on a Harvey ball: one more sector, back to empty after full. */
export function harveyCycle(value, max = 1) {
  const sectors = harveySectors(max)
  const cur = Math.round((harveyOf(value, max) ?? 0) * sectors)
  return cur >= sectors ? 0 : harveyKey(value, '+', max)
}

/** A checkbox state for a key: v / 1 check, x / 2 cross, space / 0 empty; null otherwise. */
export function checkKey(key) {
  const k = String(key).toLowerCase()
  if (k === 'v' || k === '1') return 'yes'
  if (k === 'x' || k === '2') return 'no'
  if (k === ' ' || k === '0') return 'empty'
  return null
}

/** Double-click on a checkbox: check, then cross, then empty, then check. */
export const checkCycle = state => ({ yes: 'no', no: 'empty' }[state] ?? 'yes')

/** What is written to the sheet for a checkbox state: a number (1 / -1) or a word, depending on the column. */
export const checkRaw = (state, numeric) => (state === 'yes' ? (numeric ? '1' : 'yes') : state === 'no' ? (numeric ? '-1' : 'no') : '')

/**
 * Keyboard input on a scene cell returns the new value to write, or null.
 * cell: a cell from buildTableScene; dbl: true for a double-click.
 */
export function markEdit(cell, key, { dbl = false, numeric = true } = {}) {
  if (!cell || cell.row === TOTAL_ROW || cell.row === '__head__') return null
  if (cell.type === 'harvey') {
    const v = dbl ? harveyCycle(cell.value, cell.max) : harveyKey(cell.value, key, cell.max)
    return v == null ? null : String(v)
  }
  if (cell.type === 'check') {
    const st = dbl ? checkCycle(cell.check) : checkKey(key)
    return st == null ? null : checkRaw(st, numeric)
  }
  return null
}
