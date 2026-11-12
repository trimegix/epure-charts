// ─── epure-charts · the data sheet of each chart type, and back ─────────────────
// Each chart type has its own sheet layout (rows × columns):
//   toBase(data)            → the sheet's base (useSheet)
//   fromSheet(sheet, data) → the data the chart draws
// Editing the sheet therefore changes the chart: the view draws ONLY what the sheet returns.
// Pure, tested under node --test.
import { sheetRows } from './useSheet.js'
import { buildSheet, toGrid, editsFromGrid, parseCell } from './sheetModel.js'

const num = v => (Number.isFinite(v) ? { y: v } : {})
const txt = v => (v == null || v === '' ? {} : { text: String(v) })

// One domain rule per column → the cells that break it.
const check = (sheet, rule) => {
  const out = {}
  for (const r of sheet.rows) sheet.cols.forEach((c, i) => { const msg = rule(c, r.cells[i].value, r); if (msg && r.cells[i].value != null) out[`${r.id}|${c.key}`] = msg })
  return out
}

// Pie: one row per slice, one "Value" column.
export const pieSheet = {
  layout: { fixedCols: true, rowName: 'slice', title: 'Sheet · slices' },
  validate: sheet => check(sheet, (c, v) => (typeof v === 'number' && v < 0 ? 'A pie cannot show a negative value' : null)),
  toBase: slices => ({
    rows: slices.map(s => ({ id: s.key, name: s.label ?? s.key, points: { value: num(s.value) } })),
    cols: [{ key: 'value', name: 'Value' }],
  }),
  fromSheet: (sheet, slices) => {
    const by = new Map(slices.map(s => [s.key, s]))
    return sheetRows(sheet).map(r => ({ ...(by.get(r.id) ?? {}), key: r.id, label: r.name || r.id, value: r.values.value, ...((r.fill || r.fills.value) ? { color: r.fill || r.fills.value } : {}) }))
      .filter(s => Number.isFinite(s.value))
  },
}

// Scatter / bubble: one row per point; X, Y, Size, Group.
export const scatterSheet = {
  layout: { fixedCols: true, rowName: 'point', title: 'Sheet · points' },
  validate: sheet => check(sheet, (c, v) => (c.key === 'size' && typeof v === 'number' && v < 0 ? 'A bubble size cannot be negative' : null)),
  // Headers carry the axis titles ("Revenue growth (%)") when the chart has them.
  toBase: (points, spec = {}) => ({
    rows: points.map(p => ({ id: p.key, name: p.label ?? p.key, points: { x: num(p.x), y: num(p.y), size: num(p.size), group: txt(p.group), label2: txt(p.label2) } })),
    // X accepts a number or a date (date axis).
    cols: [{ key: 'x', name: spec.x?.title ?? 'X', type: 'numdate' }, { key: 'y', name: spec.y?.title ?? 'Y' }, { key: 'size', name: 'Size' }, { key: 'group', name: 'Group', type: 'text' }, { key: 'label2', name: 'Label 2', type: 'text' }],
  }),
  fromSheet: (sheet, points) => {
    const by = new Map(points.map(p => [p.key, p]))
    return sheetRows(sheet).map(r => ({
      ...(by.get(r.id) ?? {}), key: r.id, label: r.name || r.id,
      x: r.values.x, y: r.values.y, size: r.values.size ?? undefined, group: r.values.group ?? undefined, label2: r.values.label2 ?? undefined,
      ...((r.fill || r.fills.x || r.fills.y) ? { color: r.fill || r.fills.x || r.fills.y } : {}),
    })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  },
}

// Mekko: one row per series (segment), one column per Mekko column; an optional
// "Width" row (the width in units, i.e. the X extent).
export const mekkoSheet = {
  layout: { rowName: 'series', title: 'Sheet · segments by column' },
  validate: sheet => {
    const out = check(sheet, (c, v, r) => (typeof v === 'number' && v < 0 ? (r.id === '__width' ? 'A column width cannot be negative' : 'A Mekko segment cannot be negative') : null))
    // In %, a column must sum to 100%: otherwise its segments are flagged (scaled to 100% on the chart).
    if (sheet.rows.some(r => r.id === '__total')) {
      sheet.cols.forEach((c, i) => {
        const segs = sheet.rows.filter(r => r.id !== '__total' && r.id !== '__width' && !r.hidden && r.cells.some(cl => cl.value != null))
        const sum = segs.reduce((t, r) => t + (Number.isFinite(r.cells[i].value) ? r.cells[i].value : 0), 0)
        if (Math.abs(sum - 100) > 0.5) for (const r of segs) if (!out[`${r.id}|${c.key}`]) out[`${r.id}|${c.key}`] = `!This column adds up to ${Math.round(sum * 10) / 10}%, not 100%: the chart scales it to 100%`
      })
    }
    return out
  },
  // Mekko in %: segments are typed as % of their column, and a "100%=" row
  // carries each column's total (which is also its width). In units: values as is.
  toBase: (columns, series, spec) => {
    const pct = spec != null && (spec.mode ?? 'percent') === 'percent'
    const tot = c => series.reduce((t, s) => t + Math.max(0, c.values?.[s.id] ?? 0), 0)
    const cell = (c, s) => (pct ? (tot(c) ? num(Math.round(((c.values?.[s.id] ?? 0) / tot(c)) * 1000) / 10) : {}) : num(c.values?.[s.id]))
    // Sheet order follows the visual order: the top segment first.
    const rows = [...series].reverse().map(s => ({ id: s.id, name: pct ? `${s.label ?? s.id} (%)` : s.label ?? s.id, points: Object.fromEntries(columns.map(c => [c.key, cell(c, s)])) }))
    if (pct) rows.push({ id: '__total', name: '100%=', points: Object.fromEntries(columns.map(c => [c.key, num(tot(c))])) })
    if (columns.some(c => Number.isFinite(c.extent))) rows.push({ id: '__width', name: 'Width', points: Object.fromEntries(columns.map(c => [c.key, num(c.extent)])) })
    return { rows, cols: columns.map(c => ({ key: c.key, name: c.label ?? c.key })) }
  },
  fromSheet: (sheet, columns, series) => {
    const rows = sheetRows(sheet)
    const width = rows.find(r => r.id === '__width')
    const total = rows.find(r => r.id === '__total')
    const segs = rows.filter(r => r.id !== '__width' && r.id !== '__total').reverse()
    // In %, a segment equals its share × its column's "100%=" row.
    // The total stays the "100%=" row; if the % do not sum to 100 they are scaled to it (and flagged).
    const pctSum = k => segs.reduce((t, r) => t + (Number.isFinite(r.values[k]) ? r.values[k] : 0), 0) || 100
    const valOf = (r, k) => (total ? ((r.values[k] ?? 0) / pctSum(k)) * (total.values[k] ?? 0) : r.values[k] ?? 0)
    const colBy = new Map(columns.map(c => [c.key, c]))
    const outCols = sheet.cols.filter(c => !c.hidden).map(c => ({
      ...(colBy.get(c.key) ?? {}), key: c.key, label: c.name || c.key,
      extent: width ? width.values[c.key] ?? undefined : colBy.get(c.key)?.extent,
      values: Object.fromEntries(segs.map(r => [r.id, valOf(r, c.key)])),
      // A sheet cell's color: that of its segment.
      colors: { ...(colBy.get(c.key)?.colors ?? {}), ...Object.fromEntries(segs.filter(r => r.fills[c.key]).map(r => [r.id, r.fills[c.key]])) },
    }))
    const serBy = new Map(series.map(s => [s.id, s]))
    const outSeries = segs.map(r => ({ ...(serBy.get(r.id) ?? {}), id: r.id, label: (total ? String(r.name).replace(/\s*\(%\)$/, '') : r.name) || r.id, ...(r.fill ? { color: r.fill } : {}) }))
    return { columns: outCols, series: outSeries }
  },
}

// Horizontal bars: one row per category, one column per series.
export const barhSheet = {
  layout: { rowName: 'row', title: 'Sheet · rows' },
  toBase: (rows, series) => ({
    rows: rows.map(r => ({ id: r.key, name: r.label ?? r.key, points: Object.fromEntries(series.map(s => [s.id, num(r.values?.[s.id])])) })),
    cols: series.map(s => ({ key: s.id, name: s.label ?? s.id })),
  }),
  fromSheet: (sheet, rows, series) => {
    const by = new Map(rows.map(r => [r.key, r]))
    const outRows = sheetRows(sheet).map(r => ({
      ...(by.get(r.id) ?? {}), key: r.id, label: r.name || r.id, values: Object.fromEntries(sheet.cols.map(c => [c.key, r.values[c.key]])),
      ...(r.fill ? { color: r.fill } : {}), ...(Object.keys(r.fills).length ? { colors: r.fills } : {}),
    }))
    const serBy = new Map(series.map(s => [s.id, s]))
    const outSeries = sheet.cols.filter(c => !c.hidden).map(c => ({ ...(serBy.get(c.key) ?? {}), id: c.key, label: c.name || c.key }))
    return { rows: outRows, series: outSeries }
  },
}

// Table: one row per row, one column per column (types: number or text).
const CHECK_WORDS = ['yes', 'y', 'true', 'done', 'ok', '✓', '✔', 'check', 'v', 'no', 'n', 'false', 'fail', 'x', '✗', '✘', 'cross', '1', '0', '-1', 'empty', 'none', '-', '']
export const tableSheet = {
  layout: { rowName: 'row', title: 'Sheet · table' },
  // Harvey ball: 0 to 1 (or 0 to its maximum); checkbox: yes / no (1 / 0, yes / no, ✓ / ✗).
  // spec.harveyMax (or 4 by default if a value exceeds 1): the same scale as the drawn table.
  validate: (sheet, columns = [], spec = {}) => {
    const type = new Map(columns.map(c => [c.key, c]))
    const maxOf = c => spec.harveyMax?.[c.key] ?? c.max ?? (sheet.rows.some(r => { const i = sheet.cols.findIndex(k => k.key === c.key); return Number(r.cells[i]?.value) > 1 }) ? 4 : 1)
    return check(sheet, (c, v) => {
      const col = type.get(c.key)
      if (col?.type === 'harvey') {
        const n = typeof v === 'string' ? Number(v.replace('%', '')) / (v.includes('%') ? 100 : 1) : Number(v)
        const max = maxOf(col)
        return !Number.isFinite(n) || n < 0 || n > max ? `A Harvey ball takes 0 to ${max}` : null
      }
      if (col?.type === 'check') return CHECK_WORDS.includes(String(v).trim().toLowerCase()) ? null : 'A checkbox takes yes / no (or 1 / 0)'
      return null
    })
  },
  toBase: (columns, rows) => ({
    rows: rows.filter(r => !r.total).map(r => ({ id: r.key, name: r.label ?? r.key, points: Object.fromEntries(columns.map(c => [c.key, typeof r.cells?.[c.key] === 'number' ? num(r.cells[c.key]) : typeof r.cells?.[c.key] === 'boolean' ? txt(r.cells[c.key] ? 'yes' : 'no') : txt(r.cells?.[c.key])])) })),
    // A source checkbox (true / false) reads as "yes / no" in a text column (otherwise #VALUE and an emptied box).
    cols: columns.map(c => ({ key: c.key, name: c.label ?? c.key, type: rows.some(r => ['string', 'boolean'].includes(typeof r.cells?.[c.key])) ? 'text' : 'number' })),
  }),
  fromSheet: (sheet, columns, rows) => {
    const by = new Map(rows.map(r => [r.key, r]))
    const colBy = new Map(columns.map(c => [c.key, c]))
    const outCols = sheet.cols.filter(c => !c.hidden).map(c => ({ ...(colBy.get(c.key) ?? {}), key: c.key, label: c.name || c.key }))
    // A cell in error in the sheet is marked "invalid": the table draws it struck through in red.
    const invalidOf = id => { const sr = sheet.rows.find(x => x.id === id); return sr ? sheet.cols.filter((c, i) => sr.cells[i]?.error).map(c => c.key) : [] }
    const outRows = sheetRows(sheet).map(r => ({ ...(by.get(r.id) ?? {}), key: r.id, label: r.name || r.id, invalid: invalidOf(r.id), fill: r.fill, fills: r.fills, cells: { ...(by.get(r.id)?.cells ?? {}), ...Object.fromEntries(sheet.cols.map(c => [c.key, r.values[c.key]])) } }))
    return { columns: outCols, rows: [...outRows, ...rows.filter(r => r.total)] }
  },
}

// Waterfall (bridge): one row per step; anchor and movement values are typed, those
// of totals and subtotals are computed ("e").
//
// Conventions (steps are rows here, rather than columns):
//   · several value columns (Value, then any inserted column) = the stacked segments
//     of a step (stacked waterfall); the step equals the algebraic sum of its segments;
//   · "e" in a step = this step is a computed level (total / subtotal); with other
//     typed segments, the "e" segment is the remainder that closes the level. One "e" per step;
//   · "e" on the FIRST step = the start is back-calculated from the last row
//     (the last typed anchor, or the source value of the end);
//   · downward bridge (direction 'down', build-down): the sheet reads in the
//     chart's direction. The first row carries the start level; a typed POSITIVE movement
//     is SUBTRACTED (Revenue 100, Purchases 40, Costs 30, EBITDA e = 30), a negative one
//     is added. "e" totals follow this direction; the color follows the effect on the level.
// An "e" is recognized from the input (whether valid or flagged "one e per step").
const isE = c => /^\s*e\s*$/i.test(c?.raw ?? '')
// Segment columns: all visible number columns (Kind is text).
const segCols = sheet => sheet.cols.map((c, i) => ({ ...c, i })).filter(c => c.type === 'number' && !c.hidden)
const partKeyOf = (c, keys) => (c.key === 'value' ? keys[0] ?? 'value' : c.key.startsWith('p:') ? c.key.slice(2) : c.key)

const PART_TONES = ['cat-6', 'cat-4', 'cat-8', 'cat-7']
// A segment's shade: a gain takes a neighbouring shade, a loss stays in the reds
// (never a color that would read as a gain); the first of each sign keeps the step's tone.
const PART_NEG = ['cat-5', 'amber']
function partTone(segs, j) {
  const v = Number(segs[j].v)
  const same = segs.slice(0, j).filter(p => Math.sign(Number(p.v)) === Math.sign(v)).length
  if (same === 0) return v < 0 ? { color: 'red' } : {}
  return { color: v < 0 ? PART_NEG[(same - 1) % PART_NEG.length] : PART_TONES[(same - 1) % PART_TONES.length] }
}

export const bridgeSheet = {
  /**
   * Does the bridge close? An end anchor (published value) that no longer equals the sum of the
   * typed steps is flagged (a warning: the value is kept, the gap shows it).
   */
  closing: (sheet, bridge, opts = {}) => {
    const steps = bridgeSheet.fromSheet(sheet, bridge, opts).steps ?? []
    const last = steps.at(-1)
    if (!sheet.edited || !last || last.kind !== 'anchor' || steps.length < 3) return {}
    let run = 0
    steps.slice(0, -1).forEach((s, i) => { if (i === 0 || s.kind === 'anchor') run = Number(s.value) || 0; else if (s.kind === 'delta') run += Number(s.value) || 0 })
    if (Math.abs(run - (Number(last.value) || 0)) < 0.5) return {}
    const col = sheet.cols.find(c => c.type === 'number')?.key ?? 'value'
    return { [`${last.key}|${col}`]: `!The bridge does not close: the steps add up to ${Math.round(run * 10) / 10}, this end value is ${Math.round(Number(last.value) * 10) / 10}` }
  },
  // Free columns: "Insert column" adds a segment to the step (stacked waterfall).
  layout: { rowName: 'step', segmentCols: true, title: 'Sheet · bridge steps' },
  // At most one "e" per step (a single computed segment per column).
  validate: sheet => {
    const out = {}
    const cols = segCols(sheet)
    for (const r of sheet.rows) {
      const es = cols.filter(c => isE(r.cells[c.i]))
      for (const c of es.slice(1)) out[`${r.id}|${c.key}`] = 'Only one “e” per step'
    }
    return out
  },
  /** opts.backCalc: the start is computed (the first row shows "e"). */
  toBase: (bridge, opts = {}) => {
    const steps = bridge.steps ?? []
    // Source segments (step.parts): one column per segment key, in order of appearance.
    const keys = [...new Set(steps.flatMap(s => (Array.isArray(s.parts) ? s.parts.map(p => p.key) : [])))]
    const label = k => steps.flatMap(s => s.parts ?? []).find(p => p.key === k)?.label ?? k
    const colKey = (k, i) => (i === 0 ? 'value' : `p:${k}`)
    const cols = keys.length > 1
      ? keys.map((k, i) => ({ key: colKey(k, i), name: label(k), allowE: true }))
      : [{ key: 'value', name: 'Value', allowE: true }]
    return {
      rows: steps.map((s, i) => {
        const e = s.kind === 'total' || (i === 0 && opts.backCalc)
        const points = keys.length > 1 && Array.isArray(s.parts) && s.parts.length && !e
          ? Object.fromEntries(s.parts.map(p => [colKey(p.key, keys.indexOf(p.key)), num(p.value)]))
          : { value: e ? { text: 'e' } : num(s.value) }
        return { id: s.key, name: s.label ?? s.key, points }
      }),
      // No "Kind" column: the "e" alone says a step is computed; the step kind stays internal.
      cols,
    }
  },
  /** opts.direction: 'down' = downward bridge (a positive movement is subtracted). */
  fromSheet: (sheet, bridge, opts = {}) => {
    // Untouched sheet: the input bridge, as is (its totals and axis stay those of the source).
    if (!sheet.edited) return bridge
    const sgn = opts.direction === 'down' ? -1 : 1
    const nets = new Set((opts.netLines ?? []).map(String))
    const by = new Map((bridge.steps ?? []).map(s => [s.key, s]))
    const keys = [...new Set((bridge.steps ?? []).flatMap(s => (Array.isArray(s.parts) ? s.parts.map(p => p.key) : [])))]
    const cols = segCols(sheet)
    const visible = new Set(sheetRows(sheet).map(r => r.id))
    const rows = sheet.rows.filter(r => visible.has(r.id))
    const steps = rows.map(r => {
      const src = by.get(r.id)
      // The step's segments: a number, "e", or nothing. A cell in error counts as zero.
      const segs = cols.map(c => {
        const cell = r.cells[c.i]
        const v = isE(cell) ? 'e' : Number.isFinite(cell.value) ? cell.value : cell.error ? 0 : null
        return { key: partKeyOf(c, keys), label: c.name || c.key, v, fill: cell.fill }
      }).filter(p => p.v != null)
        // A single "e" per step: the following ones are ignored (and flagged by validate).
        .filter((p, i, all) => p.v !== 'e' || all.findIndex(q => q.v === 'e') === i)
      const typed = segs.filter(p => p.v !== 'e')
      const e = segs.some(p => p.v === 'e')
      // A net-line series (opts.netLines) stays in the sheet but does not count in the step.
      const sum = typed.filter(p => !nets.has(String(p.key))).reduce((t, p) => t + p.v, 0)
      // An added step is a movement; "e" (or empty) on a total lets it be computed.
      const kind = e || (src?.kind === 'total' && !typed.length) ? 'total'
        : src?.kind === 'total' ? 'delta'
        : src?.kind ?? 'delta'
      // A movement's color follows its effect on the level (bridge direction included).
      const tone = v => (sgn * v >= 0 ? 'positive' : 'negative')
      const base = src ?? { tone: tone(sum) }
      const retone = kind === 'delta' && ['positive', 'negative'].includes(base.tone) ? { tone: tone(sum) } : {}
      const step = { ...base, ...retone, ...(kind === 'total' ? { tone: 'anchor' } : {}), key: r.id, label: r.name || r.id, kind, value: kind === 'total' ? src?.value : sum }
      delete step.parts
      // Several segments (or an "e" segment next to typed ones): a stacked step.
      // Each segment has its own shade (the first keeps the step's): the stack reads at a glance.
      if (segs.length > 1) step.parts = segs.map((p, j) => ({ key: p.key, label: p.label, value: p.v, ...(p.fill ? { color: p.fill } : partTone(segs, j)) }))
      return step
    })
    // Back-calculated start ("e" on the first row): the end is the fixed level.
    const backCalc = steps.length > 1 && steps[0].kind === 'total'
    if (backCalc) {
      steps[0] = { ...steps[0], kind: 'anchor', tone: 'anchor', computed: true }
      delete steps[0].parts
      const last = steps.at(-1)
      // The last row is the fixed level: typed, its value; left as "e", its source value.
      if (last.kind === 'total') Object.assign(last, { kind: 'anchor', tone: 'anchor', value: by.get(last.key)?.value })
      else if (by.get(last.key)?.kind === 'total') Object.assign(last, { kind: 'anchor', tone: 'anchor' })
      const ti = steps.findIndex((s, i) => i > 0 && s.kind === 'anchor' && Number.isFinite(s.value))
      const between = ti > 0 ? steps.slice(1, ti).filter(s => s.kind === 'delta').reduce((t, s) => t + sgn * (Number(s.value) || 0), 0) : 0
      steps[0].value = ti > 0 ? steps[ti].value - between : 0
    }
    // Totals are recomputed from the typed steps ("e"): anchor + movements.
    let run = 0
    for (const st of steps) {
      if (st.kind === 'delta') run += sgn * (Number(st.value) || 0)
      else if (st.kind === 'total') {
        st.value = run
        // The "e" segment of a stacked total: the remainder that closes the level.
        if (st.parts) {
          const rest = run - st.parts.filter(p => p.value !== 'e' && !nets.has(String(p.key))).reduce((t, p) => t + p.value, 0)
          st.parts = st.parts.map(p => (p.value === 'e' ? { ...p, value: rest, computed: true } : p))
        }
      } else run = Number(st.value) || 0
      // An "e" on a movement makes no sense: it counts as zero.
      if (st.kind !== 'total' && st.parts) st.parts = st.parts.map(p => (p.value === 'e' ? { ...p, value: 0 } : p))
    }
    return { ...bridge, steps, ...(backCalc ? { backCalc: true } : {}) }
  },
}

// ─── Gantt (schedule) ───────────────────────────────────────────────────────────
// The sheet follows the chart row by row:
//   - a group band ("Phase 1") when the chart shows them (spec.groups):
//     a header row without dates, its name can be renamed; the activities below belong to it;
//   - one row per task (bar, milestone, brace); column A carries the activity name;
//     the second task of the same activity is named "↳ activity" (a row added without a
//     name, or whose name starts with "↳", joins the activity above);
//   - an activity without tasks keeps a row with empty dates;
//   - key dates (spec.events) at the bottom, where the chart draws the "Key dates" row:
//     name = label, Start = the date; a row added below a key date is one too.
// Status is typed on the displayed scale: quarters 0–4 (Harvey ball) or yes / no (checkbox).
// Indent = the hierarchy level (0, 1, 2…).
//
// Row id: `rowKey~taskKey` (`rowKey~` without a task, `__ev~key` for a
// key date, `__grp~name` for a group), followed by `@n` when the row was moved (the
// sheet cannot reorder its original rows: a moved row is removed then
// reinserted under a new id, which still points to its source). A row added
// in the grid (`row1`…) creates an activity if it has a name.
//
// An untyped cell keeps the exact source value (`after` links, durations, null
// status…). A mistyped date (#DATE) is NEVER replaced by the old one: the task keeps
// the faulty input and the `sheetError` flag, and `drawable` removes it from the drawing (no
// bar rather than a wrong bar). Same for a row hidden in the sheet (`sheetHidden`).
// After = the dependency (anchors): the name of the task it follows (its label,
// otherwise its key; an activity name stands for its first task), several separated by
// commas, and an optional lag in days ("DD +5"). Typed without a typed Start, it replaces
// the start date: the task starts after its predecessor.
//
// Combined with on-chart editing (drag, insert, duplicate, indent): everything
// goes through the sheet. The operation applies to the plan the sheet returns, then
// `fromPlan` translates that plan back into sheet edits: a single overlay,
// so the grid shows the drag and the chart shows the typing, with no precedence
// to resolve. Only a row's own style (color, shape, bold), absent from the
// sheet, stays a separate view preference.
// opts = { groups?: bool, status?: 'harvey'|'checkbox' }: the chart's (spec).
const GANTT_EV = '__ev'
const GANTT_GRP = '__grp'
const CONT = '↳'
const statusCell = (v, mode) => {
  if (mode === 'checkbox') return txt(v === true || v === 'done' || v >= 1 ? 'yes' : v === false || v === 'fail' ? 'no' : null)
  if (v === true) return num(4)
  if (v === false) return num(0)
  const n = Number(v)
  return v == null || !Number.isFinite(n) ? {} : num(Math.round(Math.max(0, Math.min(1, n > 1 ? n / 4 : n)) * 4))
}
/** Typed status → the chart value: quarters 0–4 → 0..1 (Harvey); yes / no → true / false (checkbox, empty = empty box). */
export function parseGanttStatus(v, mode = 'harvey') {
  if (mode === 'checkbox') {
    const t = String(v ?? '').trim()
    if (/^(yes|y|true|done|x|✓|1)$/i.test(t)) return true
    if (/^(no|n|false|fail|✗|0)$/i.test(t)) return false
    return null
  }
  const n = typeof v === 'number' ? v : parseCell(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) / 4 : undefined
}
const splitId = id => {
  const bare = String(id).split('@')[0]
  const i = bare.indexOf('~')
  return i < 0 ? { rk: null, ik: bare, bare } : { rk: bare.slice(0, i), ik: bare.slice(i + 1), bare }
}
// Indices of a longest increasing subsequence (the original rows still in order).
function inOrder(pos) {
  const len = pos.map(() => 0), prev = pos.map(() => -1)
  let best = -1
  pos.forEach((p, i) => {
    if (p < 0) return
    len[i] = 1
    for (let j = 0; j < i; j++) if (pos[j] >= 0 && pos[j] < p && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j }
    if (best < 0 || len[i] > len[best]) best = i
  })
  const keep = new Set()
  for (let i = best; i >= 0; i = prev[i]) keep.add(i)
  return keep
}
// Activities in chart order: grouped under their band if groups are shown.
const chartOrder = (rows, groups) => {
  if (!groups) return rows.map(r => ({ row: r }))
  const out = []
  for (const g of [...new Set(rows.map(r => r.group ?? ''))]) {
    if (g) out.push({ group: g })
    for (const r of rows.filter(x => (x.group ?? '') === g)) out.push({ row: r })
  }
  return out
}
// After: task key → readable name (its label if unambiguous, otherwise its key).
function afterNamer(rows) {
  const items = rows.flatMap(r => (r.items ?? []).map(it => it))
  const keys = new Set(items.map(it => String(it.key)))
  const first = new Map()
  for (const it of items) { const l = String(it.label ?? '').trim().toLowerCase(); if (l && !first.has(l)) first.set(l, it.key) }
  return key => {
    const k = String(key).split('|').at(-1)
    const l = String(items.find(it => it.key === k)?.label ?? '').trim()
    return l && first.get(l.toLowerCase()) === k && !keys.has(l) && !/[,;]|[+-]\s*\d+\s*d?$/i.test(l) ? l : k
  }
}
const afterText = (it, nameOf) => {
  const preds = [].concat(it.after ?? [])
  if (!preds.length) return null
  // Anchor type (SS: start to start, FF: finish to finish; FS by default, not written).
  const type = it.link === 'ss' || it.link === 'ff' ? ` ${it.link.toUpperCase()}` : ''
  return `${preds.map(nameOf).join(', ')}${type}${it.lag ? ` ${it.lag > 0 ? '+' : '-'}${Math.abs(it.lag)}` : ''}`
}
const LAG = /\s*([+-])\s*(\d+)\s*d?\s*$/i
/** Typed After → { after, lag } (task keys); an unknown name stays as is (no link drawn). */
export function parseGanttAfter(text, rows) {
  let t = String(text ?? '').trim()
  if (!t) return { after: undefined, lag: undefined }
  let lag, link
  const m = LAG.exec(t)
  if (m) { lag = (m[1] === '-' ? -1 : 1) * Number(m[2]); t = t.slice(0, m.index) }
  const ty = /\s+(FS|SS|FF)\s*$/i.exec(t)
  if (ty) { link = ty[1].toLowerCase() === 'fs' ? undefined : ty[1].toLowerCase(); t = t.slice(0, ty.index) }
  const items = rows.flatMap(r => (r.items ?? []).map(it => ({ r, it })))
  const find = n => {
    const lo = n.toLowerCase()
    return items.find(x => x.it.key === n || `${x.r.key}|${x.it.key}` === n)?.it.key
      ?? items.find(x => String(x.it.label ?? '').trim().toLowerCase() === lo)?.it.key
      ?? rows.find(r => String(r.label ?? '').trim().toLowerCase() === lo && r.items?.length)?.items[0].key
  }
  const keys = t.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(n => find(n) ?? n)
  return { after: !keys.length ? undefined : keys.length === 1 ? keys[0] : keys, lag: lag || undefined, link }
}

export const ganttSheet = {
  layout: { fixedCols: true, rowName: 'task', title: 'Sheet · tasks' },
  toBase: (rows, events = [], opts = {}, nameOf = afterNamer(rows)) => ({
    rows: [
      ...chartOrder(rows, opts.groups).flatMap(({ row: r, group }) => {
        if (group != null) return [{ id: `${GANTT_GRP}~${group}`, name: group, points: {} }]
        const items = r.items?.length ? r.items : [null]
        return items.map((it, i) => ({
          id: `${r.key}~${it?.key ?? ''}`,
          name: i === 0 ? (r.label ?? '') : `${CONT} ${r.label ?? ''}`,
          points: {
            ...(it ? { start: txt(it.start), end: txt(it.end), duration: num(it.duration), after: txt(afterText(it, nameOf)), label: txt(it.label) } : {}),
            ...(i === 0 ? { responsible: txt(r.responsible), status: statusCell(r.status, opts.status), remark: txt(r.remark), level: num(r.level ?? 0) } : {}),
          },
        }))
      }),
      ...events.map((ev, i) => ({ id: `${GANTT_EV}~${ev.key ?? `ev${i}`}`, name: ev.label ?? 'Key date', points: { start: txt(ev.date) } })),
    ],
    cols: [
      { key: 'start', name: 'Start', type: 'date' }, { key: 'end', name: 'End', type: 'date' }, { key: 'duration', name: 'Duration (d)' },
      { key: 'after', name: 'After', type: 'text' }, { key: 'responsible', name: 'Responsible', type: 'text' },
      opts.status === 'checkbox' ? { key: 'status', name: 'Status (yes/no)', type: 'text' } : { key: 'status', name: 'Status (0–4)' },
      { key: 'remark', name: 'Remark', type: 'text' }, { key: 'level', name: 'Indent' }, { key: 'label', name: 'Bar label', type: 'text' },
    ],
  }),
  /** Each sheet row, in order: { kind: 'group' | 'event' | 'cont' (task of the activity
   *  above) | 'task', level (indent), rowKey, itemKey (null: activity without tasks) }, for the grid. */
  rowInfo: sheet => {
    const li = sheet.cols.findIndex(c => c.key === 'level')
    let lastEvent = false, act = null
    return sheet.rows.map(r => {
      const { rk, ik } = splitId(r.id)
      if (rk === GANTT_GRP) { lastEvent = false; act = null; return { kind: 'group', level: 0 } }
      if (rk === GANTT_EV || (rk == null && lastEvent)) { lastEvent = true; return { kind: 'event', level: 0 } }
      lastEvent = false
      const name = r.name ?? ''
      if (act && (name.startsWith(CONT) || (!name && (rk == null || rk === act.src)))) return { kind: 'cont', level: act.level, rowKey: act.key, itemKey: ik || null }
      const v = li >= 0 ? r.cells[li]?.value : null
      act = { key: rk ?? ik, src: rk, level: Math.max(0, Math.round(Number.isFinite(v) ? v : 0)) }
      return { kind: 'task', level: act.level, rowKey: act.key, itemKey: rk == null ? ik : ik || null }
    })
  },
  /** What the chart draws: without tasks in error or rows hidden in the sheet. */
  drawable: ({ rows, events }) => ({
    rows: rows.filter(r => !r.sheetHidden).map(r => (r.items ?? []).some(it => it.sheetError || it.sheetHidden) ? { ...r, items: r.items.filter(it => !it.sheetError && !it.sheetHidden) } : r),
    events: events.filter(ev => !ev.sheetHidden && !ev.sheetError),
  }),
  fromSheet: (sheet, rows, events = [], opts = {}) => {
    // Untouched sheet: the source as is (the grouped order is only a view of the chart).
    if (!sheet.edited) return { rows, events }
    const srcRow = new Map(rows.map(r => [r.key, r]))
    const srcPair = new Map(rows.flatMap(r => (r.items ?? []).map(it => [`${r.key}~${it.key}`, it])))
    const srcItem = new Map(rows.flatMap(r => (r.items ?? []).map(it => [it.key, it])))
    const srcEv = new Map(events.map((ev, i) => [ev.key ?? `ev${i}`, ev]))
    const ci = Object.fromEntries(sheet.cols.map((c, i) => [c.key, i]))
    const outRows = [], outEvents = [], used = new Set(), pending = []
    let cur = null, curSrc = null, lastEvent = false, group // group: the current band (undefined = no band in the sheet)
    // A cleared field disappears; a null source value (status "empty box") stays.
    const clean = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o }
    for (const r of sheet.rows) {
      // An added row left empty does not exist.
      if (r.added && !r.name && !r.cells.some(c => c.value != null)) continue
      const cell = k => r.cells[ci[k]]
      // Typed and readable: the input; otherwise the source (an error is ignored).
      const has = k => !!cell(k) && cell(k).edited && !cell(k).error
      const get = (k, src) => (has(k) ? cell(k).value ?? undefined : src)
      // A date typed in error keeps its input (never the old date) and flags the task.
      let bad = false
      const date = (k, src) => { const c = cell(k); if (c?.edited && c.error) { bad = true; return c.raw } return get(k, src) }
      const { rk, ik, bare } = splitId(r.id)
      const name = r.name ?? ''
      if (rk === GANTT_GRP) { group = name.trim() || ik; lastEvent = false; cur = null; continue }
      if (rk === GANTT_EV || (rk == null && lastEvent)) {
        const src = srcEv.get(ik)
        outEvents.push(clean({ ...(src ?? {}), key: ik, label: name || src?.label, date: date('start', src?.date), sheetError: bad || undefined, sheetHidden: r.hidden || undefined }))
        lastEvent = true
        continue
      }
      lastEvent = false
      const continues = cur && (name.startsWith(CONT) || (!name && (rk == null || rk === curSrc)))
      if (!continues) {
        const src = rk != null ? srcRow.get(rk) : undefined
        let key = rk ?? ik
        if (used.has(key)) key = bare.replace(/[~@]/g, '-')
        used.add(key)
        const prevGroup = outRows.at(-1)?.group
        cur = clean({
          ...(src ?? {}), key, label: name, items: [],
          level: has('level') ? Math.max(0, Math.round(cell('level').value ?? 0)) : src?.level,
          responsible: get('responsible', src?.responsible), remark: get('remark', src?.remark),
          status: has('status') ? parseGanttStatus(cell('status').value, opts.status) : src?.status,
          // Under a band: its group (renamed or not); a source activity without a group stays so.
          group: group !== undefined ? (src && !src.group ? src.group : group) : src ? src.group : prevGroup,
          sheetHidden: r.hidden || undefined,
        })
        curSrc = rk
        outRows.push(cur)
      }
      const srcIt = rk != null && ik !== '' ? srcPair.get(`${rk}~${ik}`) ?? srcItem.get(ik) : undefined
      const it = clean({
        ...(srcIt ?? {}), key: ik !== '' ? ik : `${cur.key}-item`,
        start: date('start', srcIt?.start), end: date('end', srcIt?.end), duration: get('duration', srcIt?.duration), label: get('label', srcIt?.label),
        sheetHidden: r.hidden || undefined,
      })
      if (bad) it.sheetError = true
      // A typed duration without a typed end drives the bar; an end typed on a milestone turns it into a bar.
      if (has('duration') && it.duration > 0 && !has('end')) delete it.end
      if (has('end') && it.end && it.kind === 'milestone') delete it.kind
      // After is read once all tasks are known (a predecessor can be further down).
      if (has('after')) pending.push({ it, text: cell('after').value, startTyped: has('start') || !!cell('start')?.error, endTyped: has('end') || !!cell('end')?.error })
      if (srcIt || it.start || it.end || it.duration || it.label || has('after')) cur.items.push(it)
    }
    for (const { it, text, startTyped, endTyped } of pending) {
      const { after, lag, link } = parseGanttAfter(text, outRows)
      if (after === undefined) { delete it.after; delete it.lag; continue }
      it.after = after
      if (lag) it.lag = lag; else delete it.lag
      if (link) it.link = link; else delete it.link
      // The anchor replaces the date it drives (the end for FF, otherwise the start), if not typed.
      if (link === 'ff') { if (!endTyped) delete it.end } else if (!startTyped) delete it.start
    }
    return { rows: outRows, events: outEvents }
  },
  // The plan edited on the chart → the sheet edits (against its base).
  fromPlan: (plan, events, base, opts = {}) => {
    const next = ganttSheet.toBase(plan, events, opts)
    const pos = new Map(base.rows.map((r, i) => [r.id, i]))
    const ids = next.rows.map(r => r.id)
    const keep = inOrder(ids.map(id => (pos.has(id) ? pos.get(id) : -1)))
    const taken = new Set(ids)
    const fresh = id => { let n = 1; while (taken.has(`${id}@${n}`)) n++; taken.add(`${id}@${n}`); return `${id}@${n}` }
    const rowsOut = next.rows.map((r, i) => (pos.has(r.id) && !keep.has(i) ? { ...r, id: fresh(r.id) } : r))
    const g = toGrid(buildSheet({ ...next, rows: rowsOut }))
    return editsFromGrid(base, g.matrix, g.rowIds, g.colKeys).edits
  },
}
