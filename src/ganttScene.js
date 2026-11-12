// ─── epure-charts · Gantt / timeline scene ───────────────────────────────────
// buildGanttScene(spec, rows, { width }) → pure geometry:
//   { width, height, plot, header, gridlines, rows, bars, milestones, brackets, summaries,
//     links, shades, weekends, events, cells, colHeads, labels, today, scale, empty }
//
// rows: [{ key, label, group?, level?: 0..n (hierarchy, indent), responsible?, remark?,
//           color?, shape?, bold? (the row's own style),
//           status?: 0..1 (Harvey ball) | true/false/null (checkbox),
//           items: [{ key, start?, end?, label?, color?, kind?: 'bar'|'milestone'|'bracket',
//                     shape?: 'bar'|'pentagon'|'chevron', marker?, line?: true, done?: 0..1,
//                     after?: itemKey | [itemKey], lag?: days, duration?: days }] }]
//   dates 'YYYY-MM-DD'; a milestone (kind 'milestone' or no end) is a marker.
//   `after` anchors the dates: without start, the task starts the
//   day after its predecessor ends (+ lag); a dependency arrow is drawn.
//   A parent row (followed by deeper rows) without tasks carries a summary bar.
// spec : {
//   scale?: 'day'|'week'|'month'|'quarter'|'year'  header ticks (default: from the duration)
//   tiers?: [unit, …]                          chosen scale tiers (e.g. ['year','quarter'], 3 at most)
//   scaleLabels?: true | { [unit]: text }      label left of each tier ("FY", "Week"…)
//   from?, to?: 'YYYY-MM-DD'                   displayed window (default: the task dates)
//   fiscalStart?: 1..12                        fiscal year start month ("FY" years, shifted quarters)
//   weekStart?: 0..6 (0 = Monday)              first day of the week
//   weekendDays?: [0..6] (default [5, 6])      weekend days
//   weekends?: 'normal'|'shaded'|'hidden'      weekends shaded or removed from the scale
//   monthLabel?: 'short'|'letter'|'number'     month label in the header
//   weekLabel?: 'date'|'number'                week: date of the first day or ISO number
//   dayLabel?: 'date'|'weekday'                day: day of month or weekday initial
//   gridlines?: 'all'|'major'|'none'           vertical separators
//   rowStyle?: 'banded'|'lines'|'plain'        alternating fill, row separators or nothing
//   today?: 'YYYY-MM-DD' | false               the "today" line
//   labels?: 'inside'|'right'|'none'           bar labels
//   dateLabels?: 'none'|'range'|'start'|'end'|'duration'  date label of the items
//   dateFormat?: 'd mmm'|'dd/mm'|'mm/dd'|'iso'|'mmm yy'
//   shape?: 'bar'|'pentagon'|'chevron'         default bar shape (process arrows)
//   marker?: 'diamond'|'triangle'|'circle'|'square'  default milestone marker
//   columns?: ['responsible'|'status'|'remark'] label columns; status?: 'harvey'|'checkbox'
//   links?: false                              hide dependency arrows
//   shades?: [{ from, to, label?, color? }]    shaded periods across the whole timeline
//   events?: [{ key?, date, label?, color? }]  key dates: vertical line + "Key dates" row
//   rowHeight?: px, groups?: true              rows grouped under their group (banner)
//   progress?: true                            progress (done) drawn inside the bar
//   lang?: 'en'|'fr'|'de'…                     month / day names (Intl) and default titles
//   colTitles?: { activity, responsible, status, remark, keyDates }  replaced titles
//   scaleTexts?: { [header unit key]: text }   free text in place of a scale date
//   labelSpans?: { 'responsible|key': { rows, bracket? } }  label spanning several rows
//   outline?: token                            default bar outline
// }
// Items: outline?, prevDay? (milestone: label on the previous day), link?: 'fs'|'ss'|'ff'
// (anchor type with `after`). shades[i].bracket: the shade carries a bracket below the plot.
// spec.labelPt / spec.labelFont (or opts.labelStyle; "Style" control): labels are measured at
// their real size, the row grows to hold them, a label without room is dropped.
// Pure, tested under node --test.
import { estimateWidth } from './scene.js'
import { labelMetrics } from './customStyle.js'

const DAY = 86400000
/**
 * Parses 'YYYY-MM-DD' with an optional time ('YYYY-MM-DD 14:00' or 'YYYY-MM-DDT14:00') to a UTC
 * timestamp: without a time, 0:00; with one, the bar is placed to the hour. null when invalid.
 */
export const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(String(s ?? '').trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : NaN }
/** Does the date carry a time? */
export const hasTime = s => /[T ]\d{1,2}:\d{2}$/.test(String(s ?? '').trim())
const HOUR = 3600000
// A text wrapped at word boundaries on two lines that each fit in `room` (null if impossible).
function wrapTwo(t, room, size) {
  const words = String(t).split(/\s+/)
  for (let k = words.length - 1; k > 0; k--) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ')
    if (estimateWidth(a, size) <= room && estimateWidth(b, size) <= room) return [a, b]
  }
  return null
}
const ymd = t => new Date(t).toISOString().slice(0, 10)
const hm = t => new Date(t).toISOString().slice(11, 16)
const stamp = (t, timed) => (timed ? `${ymd(t)} ${hm(t)}` : ymd(t))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const FONT = 11
const dowOf = t => (new Date(t).getUTCDay() + 6) % 7 // 0 = Monday

// Language: month and day names through Intl (offline), translated default titles;
// English is the reference.
const NAMES = new Map()
/** Month and day names for a language, through Intl (cached). */
export function ganttNames(lang = 'en') {
  const l = lang || 'en'
  if (l === 'en') return { short: MONTHS, long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], dow: DOW, dowLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
  if (!NAMES.has(l)) {
    try {
      const f = o => new Intl.DateTimeFormat(l, { ...o, timeZone: 'UTC' })
      const m = [...Array(12).keys()], w = [...Array(7).keys()]
      NAMES.set(l, {
        short: m.map(i => f({ month: 'short' }).format(Date.UTC(2025, i, 1)).replace(/\.$/, '')),
        long: m.map(i => f({ month: 'long' }).format(Date.UTC(2025, i, 1))),
        dow: w.map(i => f({ weekday: 'narrow' }).format(Date.UTC(2025, 0, 6 + i))),
        dowLong: w.map(i => f({ weekday: 'long' }).format(Date.UTC(2025, 0, 6 + i))),
      })
    } catch { return ganttNames('en') }
  }
  return NAMES.get(l)
}
/** Default column and scale titles, per language. */
export const GANTT_TITLES = {
  en: { activity: 'Activity', responsible: 'Responsible', status: 'Status', remark: 'Remark', keyDates: 'Key dates', year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week', day: 'Day', q: 'Q', w: 'W' },
  fr: { activity: 'Activité', responsible: 'Responsable', status: 'Statut', remark: 'Remarque', keyDates: 'Dates clés', year: 'Année', quarter: 'Trimestre', month: 'Mois', week: 'Semaine', day: 'Jour', q: 'T', w: 'S' },
  de: { activity: 'Aktivität', responsible: 'Verantwortlich', status: 'Status', remark: 'Bemerkung', keyDates: 'Stichtage', year: 'Jahr', quarter: 'Quartal', month: 'Monat', week: 'Woche', day: 'Tag', q: 'Q', w: 'KW' },
}
const titlesOf = lang => GANTT_TITLES[lang] ?? GANTT_TITLES.en
const PRESETS = new Set(['d mmm', 'dd/mm', 'mm/dd', 'iso', 'mmm yy', 'dd/mm/yyyy', 'mm/dd/yyyy', 'd mmm yyyy', 'mmm d yyyy'])
// Format codes (Excel style): d dd ddd dddd, m mm mmm
// mmmm, yy yyyy, q (quarter), w ww (ISO week); "text" or \x stays as is.
const CODE = /"[^"]*"|\\.|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|ww|w|q/gi
function formatCode(t, code, lang) {
  const d = new Date(t), dd = d.getUTCDate(), mm = d.getUTCMonth(), yy = d.getUTCFullYear()
  const n = ganttNames(lang), p = x => String(x).padStart(2, '0')
  return code.replace(CODE, tk => {
    if (tk[0] === '"') return tk.slice(1, -1)
    if (tk[0] === '\\') return tk[1]
    switch (tk.toLowerCase()) {
      case 'yyyy': return String(yy)
      case 'yy': return String(yy).slice(2)
      case 'mmmm': return n.long[mm]
      case 'mmm': return n.short[mm]
      case 'mm': return p(mm + 1)
      case 'm': return String(mm + 1)
      case 'dddd': return n.dowLong[dowOf(t)]
      case 'ddd': return n.dowLong[dowOf(t)].slice(0, 3)
      case 'dd': return p(dd)
      case 'd': return String(dd)
      case 'ww': return p(isoWeek(t))
      case 'w': return String(isoWeek(t))
      default: return String(Math.floor(mm / 3) + 1)
    }
  })
}

/** A date formatted for a label; `timed`: with the time.
 *  Formats: 'd mmm', 'dd/mm', 'mm/dd', 'iso', 'mmm yy', and those typed in the sheet:
 *  'dd/mm/yyyy', 'mm/dd/yyyy', 'd mmm yyyy', 'mmm d yyyy'; any other text is a format code
 *  ("dddd d mmmm", "\"W\"ww yyyy"). `lang`: language of month and day names. */
export function formatDate(t, fmt = 'd mmm', timed = false, lang = 'en') {
  if (typeof t === 'string') { timed = timed || hasTime(t); t = parseDate(t) }
  if (!Number.isFinite(t)) return ''
  const d = new Date(t), dd = d.getUTCDate(), mm = d.getUTCMonth(), yy = d.getUTCFullYear()
  const p = n => String(n).padStart(2, '0')
  const M = ganttNames(lang).short
  const day = (() => {
    if (fmt && !PRESETS.has(fmt)) return formatCode(t, String(fmt), lang)
    switch (fmt) {
      case 'dd/mm': return `${p(dd)}/${p(mm + 1)}`
      case 'mm/dd': return `${p(mm + 1)}/${p(dd)}`
      case 'iso': return ymd(t)
      case 'mmm yy': return `${M[mm]} ${String(yy).slice(2)}`
      case 'dd/mm/yyyy': return `${p(dd)}/${p(mm + 1)}/${yy}`
      case 'mm/dd/yyyy': return `${p(mm + 1)}/${p(dd)}/${yy}`
      case 'd mmm yyyy': return `${dd} ${M[mm]} ${yy}`
      case 'mmm d yyyy': return `${M[mm]} ${dd} ${yy}`
      default: return `${dd} ${M[mm]}`
    }
  })()
  return timed ? `${day} ${hm(t)}` : day
}
/** ISO 8601 week number. */
export function isoWeek(t) {
  const d = new Date(t), dow = (d.getUTCDay() + 6) % 7
  const th = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow + 3)
  const y = new Date(th).getUTCFullYear()
  return 1 + Math.floor((th - Date.UTC(y, 0, 1)) / (7 * DAY))
}

// Anchored dates (`after`): resolved in dependency order, cycles ignored.
// Link type (edge to edge): `link` 'fs' (default): starts
// the day after the end; 'ss': starts with the start; 'ff': ends with the end (+ lag days).
function resolveDates(rowsIn) {
  const byKey = new Map()
  for (const r of rowsIn) for (const it of r.items ?? []) { byKey.set(it.key, { r, it }); byKey.set(`${r.key}|${it.key}`, { r, it }) }
  const done = new Map(), busy = new Set()
  const solve = (r, it) => {
    const k = `${r.key}|${it.key}`
    if (done.has(k)) return done.get(k)
    busy.add(k)
    let s = parseDate(it.start), e = parseDate(it.end)
    const link = it.link === 'ss' || it.link === 'ff' ? it.link : 'fs'
    const lag = (it.lag ?? 0) * DAY
    const preds = [].concat(it.after ?? []).map(p => byKey.get(p)).filter(Boolean)
    // Predecessors are resolved only when the anchored date is missing (a cycle stops there).
    const need = link === 'ff' ? !Number.isFinite(e) : !Number.isFinite(s)
    const pe = need ? preds.filter(p => !busy.has(`${p.r.key}|${p.it.key}`)).map(p => solve(p.r, p.it)).filter(x => Number.isFinite(x.e)) : []
    if (pe.length && link === 'fs') s = Math.max(...pe.map(x => x.e)) + (it.kind === 'milestone' ? 0 : DAY) + lag
    if (pe.length && link === 'ss') s = Math.max(...pe.map(x => x.s)) + lag
    if (pe.length && link === 'ff') {
      e = Math.max(...pe.map(x => x.e)) + lag
      if (!Number.isFinite(s)) s = it.duration > 0 ? e - (it.duration - 1) * DAY : e
      if (s > e) s = e // a fixed start after the anchored end: the bar shrinks to one day
      if (it.kind === 'milestone') e = NaN
    }
    if (!Number.isFinite(e) && Number.isFinite(s) && it.duration > 0) e = s + (it.duration - 1) * DAY
    const milestone = it.kind === 'milestone' || (it.kind !== 'bracket' && !Number.isFinite(e))
    if (!Number.isFinite(e)) e = s
    // A typed time keeps its precision: the bar ends at that time (otherwise at end of day).
    const out = { s, e, milestone, link, preds: preds.map(p => `${p.r.key}|${p.it.key}`), sTime: Number.isFinite(parseDate(it.start)) && hasTime(it.start), eTime: Number.isFinite(parseDate(it.end)) && hasTime(it.end) }
    busy.delete(k); done.set(k, out)
    return out
  }
  return rowsIn.map(r => ({ ...r, items: (r.items ?? []).map(it => ({ ...it, ...solve(r, it) })) }))
}

// Position on the scale: calendar days, or working days when weekends are removed.
function makeClock(t0, weekend, hide) {
  if (!hide) return t => (t - t0) / DAY
  const work = 7 - weekend.size
  const startDow = dowOf(t0)
  const isWork = i => !weekend.has((startDow + i) % 7)
  return t => {
    const n = (t - t0) / DAY
    const sign = n < 0 ? -1 : 1
    const a = Math.abs(n), full = Math.floor(a), frac = a - full
    let c = Math.floor(full / 7) * work
    for (let i = full - (full % 7); i < full; i++) if (isWork(i)) c++
    if (frac && isWork(full)) c += frac
    return sign * c
  }
}

/** A milestone marker (SVG path centered on x, y, radius r). */
export function markerPath(shape, x, y, r) {
  switch (shape) {
    case 'triangle': return `M${x},${y - r} L${x + r},${y + r * 0.8} L${x - r},${y + r * 0.8} Z`
    case 'circle': return `M${x - r},${y} A${r},${r} 0 1,0 ${x + r},${y} A${r},${r} 0 1,0 ${x - r},${y} Z`
    case 'square': { const q = r * 0.8; return `M${x - q},${y - q} H${x + q} V${y + q} H${x - q} Z` }
    default: return `M${x},${y - r} L${x + r},${y} L${x},${y + r} L${x - r},${y} Z`
  }
}
/** A bar shape: rectangle, pentagon (arrow) or chevron (process arrows). */
export function barPath(shape, x, y, w, h) {
  if (shape !== 'pentagon' && shape !== 'chevron') return null
  const tip = Math.min(h / 2, w / 2), m = y + h / 2
  const left = shape === 'chevron' ? ` L${x + tip},${m}` : ''
  return `M${x},${y} H${x + w - tip} L${x + w},${m} L${x + w - tip},${y + h} H${x}${left} Z`
}

/** Scale units, from coarsest to finest. */
export const GANTT_UNITS = ['year', 'quarter', 'month', 'week', 'day']
const TIER_NAME = { year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week', day: 'Day' }
const DEFAULT_TIERS = { day: ['month', 'day'], week: ['month', 'week'], month: ['year', 'month'], quarter: ['year', 'quarter'], year: ['year'] }

/** Scale tiers, from coarsest to finest (3 at most): spec.tiers, otherwise from spec.scale. */
export function ganttTiers(spec = {}, auto = 'month') {
  const asked = Array.isArray(spec.tiers) ? GANTT_UNITS.filter(u => spec.tiers.includes(u)).slice(0, 3) : []
  return asked.length ? asked : DEFAULT_TIERS[GANTT_UNITS.includes(spec.scale) ? spec.scale : auto]
}

// Units of a tier over the window [t0, t1[: bounded { a, b }, start = actual start.
function unitCells(unit, { t0, t1, fs, weekStart }) {
  const out = []
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? DAY : 7 * DAY
    let t = unit === 'day' ? t0 : t0 - ((dowOf(t0) - weekStart + 7) % 7) * DAY
    for (; t < t1; t += step) out.push({ start: t, a: Math.max(t0, t), b: Math.min(t1, t + step) })
    return out
  }
  const step = { month: 1, quarter: 3, year: 12 }[unit]
  const d = new Date(t0), y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  m -= ((m - fs) % step + step) % step // aligned on the fiscal year
  for (; Date.UTC(y, m, 1) < t1; m += step) {
    const st = Date.UTC(y, m, 1)
    out.push({ start: st, a: Math.max(t0, st), b: Math.min(t1, Date.UTC(y, m + step, 1)) })
  }
  return out
}

// Candidate labels of a unit, longest to shortest (the first that fits wins).
function tierTexts(unit, t, spec, fs, top) {
  const d = new Date(t), mm = d.getUTCMonth(), yy = d.getUTCFullYear()
  const N = ganttNames(spec.lang), T = titlesOf(spec.lang), MONTHS = N.short
  const fy = y => (fs === 0 ? String(y) : `FY${String(y + 1).slice(2)}`)
  switch (unit) {
    case 'year': return [fy(yy)]
    case 'quarter': {
      const q = `${T.q}${Math.floor(((mm - fs + 12) % 12) / 3) + 1}`
      const fyOf = fs === 0 ? yy : (mm >= fs ? yy : yy - 1)
      return top ? [`${q} ${fy(fyOf)}`, q] : [q]
    }
    case 'month': {
      const ml = spec.monthLabel === 'letter' ? MONTHS[mm][0] : spec.monthLabel === 'number' ? String(mm + 1).padStart(2, '0') : MONTHS[mm]
      return top ? [`${MONTHS[mm]} ${yy}`, MONTHS[mm]] : [ml]
    }
    case 'week': return [spec.weekLabel === 'number' ? `${T.w}${isoWeek(t)}` : String(d.getUTCDate())]
    default: return [spec.dayLabel === 'weekday' ? N.dow[dowOf(t)] : String(d.getUTCDate())]
  }
}

/** Builds the pure geometry of a Gantt chart (see the header of this file for spec and rows). */
export function buildGanttScene(spec = {}, rowsIn0 = [], opts = {}) {
  const width = Math.max(320, Math.round(opts.width ?? 720))
  const LM = labelMetrics(opts.labelStyle ?? spec, FONT)
  // Set size: the row follows the label (the bar, lower than the row, holds the text).
  const RH = Math.max(spec.rowHeight ?? 26, LM.base ? 0 : Math.ceil(LM.size + 14))
  // A band above the bars (opts._band px, on rows opts._bandRows) when a label fits neither
  // in its bar nor after it: it is placed there in full. RH = the row without the band.
  const bandRows = new Set(opts._bandRows ?? [])
  const BAND = bandRows.size ? Math.max(0, Math.round(opts._band ?? 0)) : 0
  const bandOf = r => (bandRows.has(r.key) ? BAND : 0)
  // Bar height: 56% of the row, and at least the label + 6 px at a set size.
  const BAR_H = LM.base ? RH * 0.56 : Math.min(RH - 4, Math.max(RH * 0.56, LM.size + 6))
  // Baseline of a label centered on its row, and its width (set size: the real one).
  const BL = LM.base ? 4 : Math.round(LM.size * 0.35)
  const MW = LM.base ? (t, sz = FONT) => estimateWidth(t, sz) : t => LM.measure(t)
  const rowsIn = resolveDates(rowsIn0)
  const items = rowsIn.flatMap(r => r.items)
  const valid = items.filter(i => Number.isFinite(i.s))
  const base = { width, height: 80, plot: null, header: [], gridlines: [], rows: [], bars: [], milestones: [], brackets: [], summaries: [], links: [], shades: [], weekends: [], events: [], cells: [], colHeads: [], labels: [], labelBrackets: [], hidden: [], today: null, empty: !valid.length }
  if (base.empty) return base

  const events = (spec.events ?? []).map((ev, i) => ({ ...ev, key: ev.key ?? `ev${i}`, t: parseDate(ev.date) })).filter(ev => Number.isFinite(ev.t))
  const weekStart = ((spec.weekStart ?? 0) % 7 + 7) % 7
  const weekend = new Set(spec.weekendDays ?? [5, 6])
  const fs = Math.min(12, Math.max(1, Math.round(spec.fiscalStart ?? 1))) - 1 // month 0..11

  // opts.frame { from, to, auto }: the frozen scale (during a drag, it is not recomputed).
  const fr = opts.frame
  const from0 = fr?.from ?? spec.from
  const to0 = fr?.to ?? spec.to
  let t0 = Number.isFinite(parseDate(from0)) ? parseDate(from0) : Math.min(...valid.map(i => i.s), ...events.map(e => e.t))
  let t1 = Number.isFinite(parseDate(to0)) ? parseDate(to0) : Math.max(...valid.map(i => i.e), ...events.map(e => e.t))
  // Bounds to the day (a typed time does not shift the scale).
  t0 = Math.floor(t0 / DAY) * DAY; t1 = Math.floor(t1 / DAY) * DAY
  if (t1 <= t0) t1 = t0 + 30 * DAY
  const rawDays = (t1 - t0) / DAY
  const auto = fr?.auto ?? (rawDays > 3 * 366 ? 'year' : rawDays > 15 * 31 ? 'quarter' : rawDays > 60 ? 'month' : rawDays > 21 ? 'week' : 'day')
  // Scale tiers: chosen, otherwise derived from the unit.
  const tiers = ganttTiers(spec, auto)
  const scale = tiers.at(-1)
  const fine = scale === 'day' || scale === 'week'
  // Bounds: full week at fine scales, otherwise full month (the header falls right).
  if (fine) {
    t0 -= ((dowOf(t0) - weekStart + 7) % 7) * DAY
    t1 += DAY; t1 += ((weekStart - dowOf(t1) + 7) % 7) * DAY
  } else {
    const d0 = new Date(t0); t0 = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)
    const d1 = new Date(t1); t1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth() + 1, 1)
  }
  const hide = spec.weekends === 'hidden' && weekend.size < 7
  const clock = makeClock(t0, weekend, hide)

  // Rows: grouped under a group banner if requested; hierarchy by `level`.
  const rows = []
  if (spec.groups) {
    const groups = [...new Set(rowsIn.map(r => r.group ?? ''))]
    for (const g of groups) {
      if (g) rows.push({ key: `group|${g}`, label: g, group: true, items: [] })
      for (const r of rowsIn.filter(x => (x.group ?? '') === g)) rows.push({ ...r, group: false })
    }
  } else rows.push(...rowsIn.map(r => ({ ...r, group: false })))
  rows.forEach((r, i) => {
    r.level = Math.max(0, Math.round(r.level ?? 0))
    r.parent = !r.group && i + 1 < rows.length && !rows[i + 1].group && (rows[i + 1].level ?? 0) > r.level
  })
  const TT = { ...titlesOf(spec.lang), ...(spec.colTitles ?? {}) }
  if (events.length) rows.push({ key: '__events__', label: TT.keyDates, group: false, level: 0, events: true, items: [] })

  // Label columns: activity, responsible and status on the left;
  // remark on the right.
  const colsOn = (spec.columns ?? []).filter(c => ['responsible', 'status', 'remark'].includes(c))
  const INDENT = 12
  const brRoom = col => (Object.entries(spec.labelSpans ?? {}).some(([k, v]) => k.startsWith(`${col}|`) && v?.bracket) ? 10 : 0)
  const actW = Math.min(width * 0.32, Math.max(...rows.map(r => estimateWidth(r.label, FONT) + (r.level ?? 0) * INDENT)) + 16)
  const colX = { activity: { x0: 0, x1: actW } }
  let x = actW
  if (colsOn.includes('responsible')) {
    const w = Math.min(130, Math.max(estimateWidth(TT.responsible, 10), ...rows.map(r => estimateWidth(r.responsible ?? '', FONT))) + 14 + brRoom('responsible'))
    colX.responsible = { x0: x, x1: x + w }; x += w
  }
  if (colsOn.includes('status')) { colX.status = { x0: x, x1: x + 44 }; x += 44 }
  const labelW = x
  let right = width - 8
  if (colsOn.includes('remark')) {
    const w = Math.min(width * 0.22, Math.max(estimateWidth(TT.remark, 10), ...rows.map(r => estimateWidth(r.remark ?? '', FONT))) + 14 + brRoom('remark'))
    colX.remark = { x0: width - w, x1: width }; right = width - w - 6
  }
  const TIER = 16
  const headerH = tiers.length * TIER + 4
  // Top of each row (a row with a band is taller than the others).
  const tops = []
  let acc = headerH
  for (const r of rows) { tops.push(acc); acc += RH + bandOf(r) }
  const plot = { left: labelW, right, top: headerH, bottom: acc }
  plot.width = plot.right - plot.left
  plot.height = plot.bottom - plot.top
  base.plot = plot
  base.height = plot.bottom + 8
  const total = clock(t1)
  const X = t => plot.left + (clock(t) / total) * plot.width
  if (colsOn.length) {
    // Column titles (replaceable): spec.colTitles, otherwise the language's.
    base.colHeads.push({ key: 'activity', x: 10, text: TT.activity, anchor: 'start' })
    if (colX.responsible) base.colHeads.push({ key: 'responsible', x: colX.responsible.x0 + 6, text: TT.responsible, anchor: 'start' })
    if (colX.status) base.colHeads.push({ key: 'status', x: (colX.status.x0 + colX.status.x1) / 2, text: TT.status, anchor: 'middle' })
    if (colX.remark) base.colHeads.push({ key: 'remark', x: colX.remark.x0 + 6, text: TT.remark, anchor: 'start' })
  }
  base.columns = colX

  // Tiered header (year / quarter / month / week / day): each tier splits
  // the window into units; the finest carries the vertical separators.
  const gridOn = spec.gridlines ?? 'all'
  const ctx = { t0, t1, fs, weekStart }
  tiers.forEach((unit, level) => {
    const top = level === 0 && tiers.length > 1
    for (const c of unitCells(unit, ctx)) {
      if (unit === 'day' && hide && weekend.has(dowOf(c.start))) continue
      const w = X(c.b) - X(c.a)
      const key = `${unit === 'year' ? 'y' : unit[0]}${c.start}`
      // Free text typed on a unit replaces the date.
      const own = spec.scaleTexts?.[key]
      const text = own != null ? own : tierTexts(unit, c.start, spec, fs, top).find(t => w > estimateWidth(t, level === 0 ? 11 : 10) + 4) ?? ''
      base.header.push({ level, unit, key, x0: X(c.a), x1: X(c.b), y: 12 + level * TIER, text, custom: own != null })
    }
  })
  // Separators: one line per unit of the finest tier; strong when a unit of
  // the tier above starts (for days: each week start).
  if (gridOn !== 'none') {
    const coarse = unitCells(tiers.length > 1 ? tiers.at(-2) : 'year', ctx).map(c => c.start)
    let j = 0
    for (const c of unitCells(scale, ctx)) {
      let strong = false
      while (j < coarse.length && coarse[j] <= c.start) { strong = true; j++ }
      if (scale === 'day') { if (hide && weekend.has(dowOf(c.start))) continue; strong = dowOf(c.start) === weekStart }
      if (gridOn === 'all' || strong) base.gridlines.push({ x: X(c.a), strong, y1: strong ? 2 : plot.top - TIER })
    }
  }
  // Scale labels: left of each tier.
  base.tierLabels = []
  if (spec.scaleLabels) {
    tiers.forEach((unit, level) => {
      if (colsOn.length && level === tiers.length - 1) return // the column titles row
      const custom = typeof spec.scaleLabels === 'object' ? spec.scaleLabels[unit] : null
      base.tierLabels.push({ key: unit, unit, x: plot.left - 6, y: 12 + level * TIER, text: custom ?? (unit === 'year' && fs ? 'FY' : titlesOf(spec.lang)[unit] ?? TIER_NAME[unit]) })
    })
  }
  base.tiers = tiers
  base.colHeadY = headerH - 8

  // Shaded weekends (at fine scales, or over less than six months).
  if (spec.weekends === 'shaded' && (t1 - t0) / DAY <= 186) {
    let runStart = null
    for (let t = t0; t <= t1; t += DAY) {
      const we = t < t1 && weekend.has(dowOf(t))
      if (we && runStart == null) runStart = t
      if (!we && runStart != null) { base.weekends.push({ key: `we${runStart}`, x0: X(runStart), x1: X(t) }); runStart = null }
    }
  }
  // Shaded periods.
  for (const [i, sh] of (spec.shades ?? []).entries()) {
    const a = parseDate(sh.from), b = parseDate(sh.to ?? sh.from)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b + DAY <= t0 || a >= t1) continue
    const x0 = X(Math.max(a, t0)), x1 = X(Math.min(b + DAY, t1))
    const shade = { key: sh.key ?? `sh${i}`, index: i, x0, x1, from: ymd(a), to: ymd(b), label: sh.label ?? null, color: sh.color ?? 'gray-200', bracket: null }
    // The bracket anchored to the shade, below the plot.
    if (sh.bracket) {
      const yb = plot.bottom + 6, xm = (x0 + x1) / 2
      shade.bracket = { path: `M${x0},${yb - 4} V${yb} H${xm - 4} L${xm},${yb + 4} L${xm + 4},${yb} H${x1} V${yb - 4}`, labelY: yb + 15 }
    }
    base.shades.push(shade)
  }
  if (base.shades.some(sh => sh.bracket)) base.height += 22

  const labelsMode = spec.labels ?? 'inside'
  const dateLabels = spec.dateLabels ?? 'none'
  const dfmt = spec.dateFormat ?? 'd mmm'
  const L = spec.lang
  const dateText = (s, e, ms, it = {}) => {
    if (dateLabels === 'none') return null
    // A milestone set on an end can show the previous day ("Previous Day").
    if (ms) return formatDate(it.prevDay ? s - DAY : s, dfmt, it.sTime, L)
    if (dateLabels === 'start') return formatDate(s, dfmt, it.sTime, L)
    if (dateLabels === 'end') return formatDate(e, dfmt, it.eTime, L)
    if (dateLabels === 'duration') {
      if (it.sTime || it.eTime) return `${Math.round((e - s) / HOUR)} h`
      const n = Math.round(clock(e + DAY) - clock(s)); return `${n} ${hide ? 'wd' : 'd'}`
    }
    return `${formatDate(s, dfmt, it.sTime, L)} – ${formatDate(e, dfmt, it.eTime, L)}`
  }
  // A Responsible / Remark label can span several rows:
  // spec.labelSpans { 'column|rowKey': { rows: n, bracket? } }; the covered rows
  // lose their own label (a group row or the key dates stop the span).
  const spans = spec.labelSpans ?? {}
  const covered = new Set()
  const spanOf = (col, i) => {
    const want = Math.max(1, Math.round(spans[`${col}|${rows[i].key}`]?.rows ?? 1))
    let n = 1
    while (n < want && i + n < rows.length && !rows[i + n].group && !rows[i + n].events) n++
    return n
  }
  rows.forEach((r, i) => { for (const col of ['responsible', 'remark']) { if (covered.has(`${r.key}|${col}`)) continue; const n = spanOf(col, i); for (let j = 1; j < n; j++) covered.add(`${rows[i + j].key}|${col}`) } })
  base.labelBrackets = []
  // Process arrows grow with their text: if the label of a pentagon
  // or chevron only fits on two lines, all arrows take the tall height
  // (equalized heights) and those labels wrap inside.
  const ARROW_FONT = 10
  const arrowRoom = (it, r) => {
    const shape = it.shape ?? r.shape ?? spec.shape ?? 'bar'
    if (shape === 'bar' || it.milestone || it.kind === 'bracket' || !it.label || !Number.isFinite(it.s)) return null
    const bw = X(Math.min(it.eTime ? it.e : it.e + DAY, t1)) - X(Math.max(it.s, t0))
    const bh = RH * 0.86 // the tall height: the real room once the arrow is enlarged
    return { shape, room: bw - (shape === 'chevron' ? bh / 2 + 2 : 4) - 4 - bh / 2 }
  }
  const arrowTall = LM.base && labelsMode === 'inside' && rows.some(r => !r.group && (r.items ?? []).some(it => {
    const a = arrowRoom(it, r)
    return a && estimateWidth(it.label, FONT) > a.room && wrapTwo(it.label, a.room, ARROW_FONT)
  }))
  base.arrowTall = !!arrowTall
  const ends = new Map() // `${row}|${item}` → arrow attachment points
  const rowOf = new Map()
  const rowStyle = spec.rowStyle ?? 'banded'
  rows.forEach((r, i) => {
    // Band reserved above the bars (labels placed above): the row content moves down.
    const yTop = tops[i], y0 = yTop + bandOf(r)
    const level = r.level ?? 0
    base.rows.push({ key: r.key, label: r.label, y0: yTop, y1: y0 + RH, cy: y0 + RH / 2, group: r.group, level, indent: level * INDENT, parent: !!r.parent, bold: r.bold ?? null, color: r.color ?? null, shape: r.shape ?? null, events: !!r.events, band: rowStyle === 'banded' && !r.group && i % 2 === 1, separator: rowStyle === 'lines' })
    rowOf.set(r.key, i)
    if (r.group) return
    if (r.events) {
      for (const ev of events) {
        if (ev.t < t0 || ev.t > t1) continue
        const ex = X(ev.t)
        base.events.push({ key: ev.key, x: ex, y: y0 + RH / 2, r: RH * 0.26, path: markerPath('triangle', ex, y0 + RH / 2, RH * 0.26), color: ev.color ?? 'gray-700', label: ev.label ?? null, date: ymd(ev.t), y1: plot.top, y2: y0 })
        if (ev.label && labelsMode !== 'none') base.labels.push({ key: `ev|${ev.key}`, x: ex + RH * 0.34, y: y0 + RH / 2 + BL, text: ev.label, anchor: 'start', color: 'gray-700' })
      }
      return
    }
    // Label column cells.
    for (const col of ['responsible', 'remark']) {
      const k = `${r.key}|${col}`
      if (!colX[col] || !r[col] || covered.has(k)) continue
      const n = spanOf(col, i), y1 = tops[i + n] ?? plot.bottom, ym = (y0 + y1) / 2
      const br = n > 1 && spans[`${col}|${r.key}`]?.bracket
      const bx = colX[col].x0 + 6
      base.cells.push({ key: k, col, x: bx + (br ? 10 : 0), y: ym + 4, text: r[col], span: n })
      // Label bracket: it spans the covered rows.
      if (br) base.labelBrackets.push({ key: k, col, path: `M${bx + 5},${y0 + 3} Q${bx + 2},${y0 + 3} ${bx + 2},${y0 + 7} V${ym - 3} L${bx - 1},${ym} L${bx + 2},${ym + 3} V${y1 - 7} Q${bx + 2},${y1 - 3} ${bx + 5},${y1 - 3}` })
    }
    if (colX.status && r.status !== undefined) {
      const cx = (colX.status.x0 + colX.status.x1) / 2, cy = y0 + RH / 2
      if ((spec.status ?? 'harvey') === 'checkbox') {
        const check = r.status === true || r.status === 'done' || r.status >= 1 ? 'yes' : r.status === false || r.status === 'fail' ? 'no' : 'empty'
        base.cells.push({ key: `${r.key}|status`, col: 'status', cx, cy, size: Math.min(12, RH * 0.5), check })
      } else {
        const v = Number(r.status)
        const f = Number.isFinite(v) ? Math.max(0, Math.min(1, v > 1 ? v / 4 : v)) : 0
        base.cells.push({ key: `${r.key}|status`, col: 'status', cx, cy, r: Math.min(7, RH * 0.28), harvey: f })
      }
    }
    for (const it of r.items ?? []) {
      const { s, e } = it
      if (!Number.isFinite(s)) continue
      // Outside the window: nothing is drawn, not even the text (the label of an invisible
      // item is removed, so that no hidden information remains in the chart).
      const endX = it.milestone ? s : it.eTime ? e : e + DAY
      if (it.milestone ? s < t0 || s > t1 : endX <= t0 || s >= t1) { base.hidden.push(`${r.key}|${it.key}`); continue }
      const id = `${r.key}|${it.key}`
      if (it.kind === 'bracket') {
        const x0 = X(Math.max(s, t0)), x1 = X(Math.min(it.eTime ? e : e + DAY, t1)), yb = y0 + RH * 0.62
        const tick = RH * 0.2, xm = (x0 + x1) / 2
        base.brackets.push({ key: id, rowKey: r.key, itemKey: it.key, label: it.label ?? null, x0, x1, y: yb, color: it.color ?? 'gray-700', start: stamp(s, it.sTime), end: stamp(e, it.eTime),
          path: `M${x0},${yb + tick} V${yb} H${xm - 4} L${xm},${yb - tick} L${xm + 4},${yb} H${x1} V${yb + tick}` })
        const txt = [it.label, dateText(s, e, false, it)].filter(Boolean).join(' · ')
        // The label sits on the left half of the bracket if it fits, otherwise on the right.
        if (txt && labelsMode !== 'none') {
          const fits = LM.base && estimateWidth(txt, 10) + 8 <= xm - x0 - 4 && RH >= 20
          base.labels.push(fits ? { key: id, x: (x0 + xm) / 2, y: yb - 3, text: txt, anchor: 'middle', color: 'gray-700', size: 10 } : { key: id, x: x1 + 4, y: y0 + RH / 2 + BL, text: txt, anchor: 'start', color: 'gray-700' })
        }
        continue
      }
      if (it.milestone) {
        const mx = X(s), my = y0 + RH / 2, mr = RH * 0.28
        const marker = it.marker ?? spec.marker ?? 'diamond'
        base.milestones.push({ key: id, rowKey: r.key, itemKey: it.key, prevDay: !!it.prevDay, link: it.preds.length ? it.link : null, x: mx, y: my, r: mr, marker, path: markerPath(marker, mx, my, mr), color: it.color ?? r.color ?? 'gold', label: it.label ?? null, date: stamp(s, it.sTime), line: it.line ? { y1: plot.top, y2: plot.bottom } : null })
        ends.set(id, { xs: mx - mr, xe: mx + mr, y: my, h: mr, cx: mx })
        const txt = [labelsMode !== 'none' && it.label, dateText(s, s, true, it)].filter(Boolean).join(' · ')
        if (txt) base.labels.push({ key: id, x: mx + RH * 0.36, y: my + BL, text: txt, anchor: 'start', color: 'gray-700' })
        continue
      }
      const x0 = X(Math.max(s, t0)), x1 = X(Math.min(it.eTime ? e : e + DAY, t1))
      const shape = it.shape ?? r.shape ?? spec.shape ?? 'bar'
      const tallArrow = arrowTall && shape !== 'bar'
      const bw = Math.max(2, x1 - x0), by = y0 + (tallArrow ? RH * 0.07 : (RH - BAR_H) / 2), bh = tallArrow ? RH * 0.86 : BAR_H
      const bar = { key: id, rowKey: r.key, itemKey: it.key, label: it.label ?? null, x: x0, y: by, width: bw, height: bh, shape, path: barPath(shape, x0, by, bw, bh), color: it.color ?? r.color ?? 'cat-2', outline: it.outline ?? r.outline ?? spec.outline ?? null, link: it.preds.length ? it.link : null, done: Number.isFinite(it.done) ? Math.max(0, Math.min(1, it.done)) : null, start: stamp(s, it.sTime), end: stamp(e, it.eTime), linked: it.preds.length > 0 }
      base.bars.push(bar)
      ends.set(id, { xs: x0, xe: x0 + bw, y: y0 + RH / 2, h: bh / 2 })
      const dt = dateText(s, e, false, it)
      const pad = shape === 'chevron' ? bh / 2 + 2 : 4
      // The start date sits before the bar (on the left, aligned on its start);
      // with no room before the plot, it goes into the bar (a bar without label, long
      // enough) or after it. The scale never widens to fit a label.
      const before = dt && dateLabels === 'start' && x0 - 4 - MW(dt) >= plot.left
      const dtIn = dt && !before && !(it.label && labelsMode !== 'none') && MW(dt) + pad + 4 <= bw
      const dateLab = { key: `${id}|date`, ...(before ? { x: bar.x - 4, anchor: 'end' } : dtIn ? { x: bar.x + pad, anchor: 'start' } : { x: bar.x + bw + 4, anchor: 'start' }), y: y0 + RH / 2 + BL, text: dt, color: dtIn ? 'white' : 'gray-500' }
      // A start date is never written after the bar (it would read as an end): with no
      // room before, it goes into the bar (before its label, or in its place if it does not fit),
      // otherwise above, aligned on the start.
      if (dt && dateLabels === 'start' && !before) {
        const lab = it.label && labelsMode !== 'none' ? it.label : null
        const tail = shape !== 'bar' ? bh / 2 : 0
        const yl = y0 + RH / 2 + BL
        if (MW(dt) + pad + 4 + tail <= bw) {
          base.labels.push({ key: `${id}|date`, x: bar.x + pad, y: yl, text: dt, anchor: 'start', color: 'white' })
          const lx = bar.x + pad + MW(dt) + 6
          if (lab && labelsMode === 'inside' && lx + MW(lab) + 4 + tail <= bar.x + bw) base.labels.push({ key: id, x: lx, y: yl, text: lab, anchor: 'start', color: 'white' })
          else if (lab) base.labels.push({ key: id, x: bar.x + bw + 4, y: yl, text: lab, anchor: 'start', color: 'gray-700' })
        } else {
          base.labels.push({ key: `${id}|date`, x: bar.x, y: by - 3, text: dt, anchor: 'start', color: 'gray-500', above: true })
          if (lab) {
            const inside = labelsMode === 'inside' && MW(lab) + pad + 4 + tail <= bw
            base.labels.push(inside ? { key: id, x: bar.x + pad, y: yl, text: lab, anchor: 'start', color: 'white' } : { key: id, x: bar.x + bw + 4, y: yl, text: lab, anchor: 'start', color: 'gray-700' })
          }
        }
        continue
      }
      const two = tallArrow && it.label && labelsMode === 'inside' && MW(it.label) > (arrowRoom(it, r)?.room ?? 0) ? wrapTwo(it.label, arrowRoom(it, r).room, ARROW_FONT) : null
      if (two) {
        base.labels.push({ key: id, x: bar.x + pad, y: y0 + RH / 2 + BL, text: it.label, lines: two, lh: ARROW_FONT + 1, size: ARROW_FONT, anchor: 'start', color: 'white' })
        if (dt) base.labels.push(dateLab)
      } else if (it.label && labelsMode !== 'none') {
        const w = MW(it.label)
        const inside = labelsMode === 'inside' && w + pad + 4 + (shape !== 'bar' ? bh / 2 : 0) <= bw
        if (inside) {
          base.labels.push({ key: id, x: bar.x + pad, y: y0 + RH / 2 + BL, text: it.label, anchor: 'start', color: 'white' })
          if (dt) base.labels.push(dateLab)
        } else {
          base.labels.push({ key: id, x: bar.x + bw + 4, y: y0 + RH / 2 + BL, text: [it.label, before ? null : dt].filter(Boolean).join(' · '), anchor: 'start', color: 'gray-700' })
          if (before) base.labels.push(dateLab)
        }
      } else if (dt) base.labels.push(dateLab)
    }
  })

  // A label placed right of a bar never overflows onto the next bar of its row:
  // it is truncated ("…"); without room, it goes back truncated into its own bar.
  const cut = (t, room) => {
    if (MW(t) <= room) return t
    let c = t
    while (c.length > 1 && MW(`${c}…`) > room) c = c.slice(0, -1)
    return c.length > 1 ? `${c.trimEnd()}…` : ''
  }
  // Two-line labels: a typed line break (\n), or a text
  // too long that wraps at word boundaries, when the row is tall enough (30 px and more).
  const tall = LM.base && RH >= 30
  const wrap2 = (t, room) => wrapTwo(t, room, FONT)
  for (const l of base.labels) {
    if (!String(l.text).includes('\n')) continue
    if (tall) l.lines = String(l.text).split('\n').slice(0, 2)
    l.text = String(l.text).replace(/\n/g, ' ')
  }
  const needAbove = new Set()
  for (const l of base.labels) {
    if (l.color === 'white' || l.anchor !== 'start' || l.lines || l.above) continue
    const id = String(l.key).replace(/\|date$/, '')
    // Set size: a bracket label avoids the bar that follows it (before the bracket if there is room).
    const brk = !LM.base && base.brackets.find(b => b.key === id)
    if (brk) {
      const nextB = base.bars.filter(b => b.rowKey === brk.rowKey && b.x >= brk.x1 - 1).sort((a, b) => a.x - b.x)[0]
      const prevB = base.bars.filter(b => b.rowKey === brk.rowKey && b.x + b.width <= brk.x0 + 1).sort((a, b) => b.x - a.x)[0]
      const after = (nextB ? nextB.x : width) - l.x - 4
      const before = brk.x0 - 4 - (prevB ? prevB.x + prevB.width + 4 : plot.left)
      if (MW(l.text) <= after) continue
      if (MW(l.text) <= before) { Object.assign(l, { x: brk.x0 - 4, anchor: 'end' }); continue }
      const t = cut(l.text, Math.max(after, before))
      if (before > after) Object.assign(l, { x: brk.x0 - 4, anchor: 'end' })
      l.text = t
      continue
    }
    const own = base.bars.find(b => b.key === id)
    if (!own) continue
    // A task label that would be truncated (neither inside nor after its bar): above the
    // bar, in full, in the reserved band (second pass, opts._band).
    if (!String(l.key).endsWith('|date')) {
      const orig = l.text
      fitBeside(l, own, id)
      // Truncated ("…") or removed; a date merely dropped from an inside label does not count.
      if (l.text !== orig && (!l.text || l.text.endsWith('…'))) {
        if (!bandRows.has(own.rowKey)) needAbove.add(own.rowKey)
        else {
          // Aligned on the bar start; at the card's right edge, it moves back (above its bar),
          // without overlapping another label of the band nor going before the plot.
          const band = base.labels.filter(q => q !== l && q.above && q.rowKey === own.rowKey)
          const stop = Math.min(width - 2, ...band.filter(q => q.x > own.x).map(q => q.x - 6))
          const minX = Math.max(plot.left, ...band.filter(q => q.x <= own.x).map(q => q.x + MW(q.text) + 6))
          const x = Math.max(minX, Math.min(own.x, stop - MW(orig)))
          Object.assign(l, { x, y: own.y - 4, anchor: 'start', color: 'gray-700', above: true, rowKey: own.rowKey, text: cut(orig, stop - x + 0.5) })
          delete l.lines
        }
      }
      continue
    }
    fitBeside(l, own, id)
  }
  function fitBeside(l, own, id) {
    const next = base.bars.filter(b => b.rowKey === own.rowKey && b.x >= own.x + own.width - 1 && b.key !== id).sort((a, b) => a.x - b.x)[0]
    // A wide enough bar keeps its label inside, truncated ("Target scr…") rather than outside,
    // where it would hit an arrow or a neighboring bar.
    const innerRoom = own.width - 8 - (own.shape === 'bar' ? 0 : own.height / 2)
    // (Unless the start date already occupies the bar.)
    const dateIn = base.labels.some(q => q.key === `${id}|date` && q.color === 'white')
    // (Set size: only if the label does not fit outside and the bar leaves it more room.)
    const outRoom = (next ? next.x : width) - l.x - 4
    const goIn = LM.base ? !next || next.x - l.x - 4 < MW(l.text) : outRoom < MW(l.text) && innerRoom > outRoom
    if (!String(l.key).endsWith('|date') && !dateIn && innerRoom >= 56 && goIn) {
      Object.assign(l, { x: own.x + 4, text: cut(l.text.split(' · ')[0], innerRoom), color: 'white' })
      return
    }
    const room = (next ? next.x : plot.right + (width - plot.right)) - l.x - 4
    if (tall && MW(l.text) > room) { const w2 = wrap2(l.text, room); if (w2) { l.lines = w2; return } }
    if (!next) { if (!LM.base) l.text = cut(l.text, room); return }
    if (room >= 24) { l.text = cut(l.text, room); return }
    const inner = cut(l.text, own.width - 8 - (own.shape === 'bar' ? 0 : own.height / 2))
    Object.assign(l, inner ? { x: own.x + 4, text: inner, color: 'white' } : { text: '' })
  }
  const wanted = base.labels.length
  base.labels = base.labels.filter(l => l.text)
  // Set size: a label that would overlap another or leave the frame is dropped (counted: noRoom).
  if (!LM.base) {
    const box = l => { const w = LM.measure(l.text), x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'start' ? l.x : l.x - w / 2; return { x0, x1: x0 + w, y0: l.y - LM.size * 0.75, y1: l.y + LM.size * 0.2 } }
    const kept = []
    for (const l of base.labels) {
      const b = box(l)
      if (b.x0 < 0 || b.x1 > width || b.y0 < 0) continue
      if (kept.some(k => { const q = box(k); return b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1 })) continue
      kept.push(l)
    }
    base.labels = kept
  }
  base.noRoom = wanted - base.labels.length

  // Summary bars: a parent row without tasks spans its descendants.
  rows.forEach((r, i) => {
    if (!r.parent || (r.items ?? []).length) return
    let j = i + 1
    const kids = []
    while (j < rows.length && !rows[j].group && !rows[j].events && rows[j].level > r.level) kids.push(rows[j++])
    const spans = kids.flatMap(k => (k.items ?? []).filter(it => Number.isFinite(it.s)).map(it => [it.s, it.e]))
    if (!spans.length) return
    const a = Math.max(t0, Math.min(...spans.map(z => z[0]))), b = Math.min(t1, Math.max(...spans.map(z => z[1])) + DAY)
    const y0 = tops[i] + bandOf(r), ys = y0 + RH * 0.36, hs = RH * 0.22
    base.summaries.push({ key: `sum|${r.key}`, rowKey: r.key, x0: X(a), x1: X(b), y: ys, height: hs, start: ymd(a), end: ymd(b - DAY),
      path: `M${X(a)},${ys} H${X(b)} V${ys + hs + 4} L${X(b) - 5},${ys + hs} H${X(a) + 5} L${X(a)},${ys + hs + 4} Z` })
  })

  // Dependency arrows (predecessor end → successor start).
  if (spec.links !== false) {
    for (const r of rowsIn) for (const it of r.items) for (const p of it.preds) {
      const A = ends.get(p), B = ends.get(`${r.key}|${it.key}`)
      if (!A || !B) continue
      // Start-to-start (ss): from start to start, on the left; finish-to-finish (ff): on the right.
      if (it.link === 'ss' || it.link === 'ff') {
        const ss = it.link === 'ss', xa = ss ? A.xs : A.xe, xb = ss ? B.xs : B.xe
        const xo = ss ? Math.min(xa, xb) - 6 : Math.max(xa, xb) + 6
        const pts = [[xa, A.y], [xo, A.y], [xo, B.y], [xb, B.y]]
        base.links.push({ key: `${p}>${r.key}|${it.key}`, from: p, to: `${r.key}|${it.key}`, link: it.link, points: pts, path: `M${pts.map(q => q.join(',')).join(' L')}` })
        continue
      }
      const xa = A.xe, xb = B.xs
      if (A.y === B.y && Math.abs(xb - xa) < 10) continue // end to end on the same row: nothing to draw
      const d = B.y >= A.y ? 1 : -1
      // End to end (or overlapping) on two rows: a vertical arrow from the
      // predecessor to the successor (at the center of a milestone).
      const xv = B.cx ?? Math.min(Math.max(xa - 3, xb + 3), B.xe - 3)
      const pts = xb >= A.xs && xb < xa + 10 && A.y !== B.y
        ? [[xv, A.y + d * A.h], [xv, B.y - d * B.h]]
        : xb >= xa + 10
        ? [[xa, A.y], [xa + 5, A.y], [xa + 5, B.y], [xb, B.y]]
        : [[xa, A.y], [xa + 5, A.y], [xa + 5, B.y - d * RH / 2], [xb - 6, B.y - d * RH / 2], [xb - 6, B.y], [xb, B.y]]
      base.links.push({ key: `${p}>${r.key}|${it.key}`, from: p, to: `${r.key}|${it.key}`, points: pts, path: `M${pts.map(q => q.join(',')).join(' L')}` })
    }
  }

  const today = spec.today === false ? null : parseDate(spec.today)
  if (Number.isFinite(today) && today >= t0 && today <= t1) base.today = { x: X(today), y1: plot.top - 2, y2: plot.bottom, date: ymd(today) }
  base.scale = scale
  base.pxPerDay = plot.width / Math.max(1, total)
  base.range = { from: ymd(t0), to: ymd(t1 - DAY) }
  base.invert = px => {
    // Inverse of X (bisection: the scale can skip weekends).
    const target = ((px - plot.left) / plot.width) * total
    let lo = t0, hi = t1
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (clock(mid) < target) lo = mid; else hi = mid }
    return ymd(Math.floor(lo / DAY) * DAY)
  }
  // The date under a pixel, extended outside the window (scale handles: widen the range).
  base.dateAt = px => ymd(Math.floor((t0 + ((px - plot.left) / plot.width) * (t1 - t0)) / DAY) * DAY)
  // What is needed to freeze the scale as is (GanttView, during a drag).
  base.frame = { from: base.range.from, to: base.range.to, auto }
  // Labels truncated for lack of room: second pass with a band above the bars.
  if (needAbove.size && !bandRows.size && labelsMode !== 'none') return buildGanttScene(spec, rowsIn0, { ...opts, _bandRows: [...needAbove], _band: Math.ceil((LM.base ? FONT : LM.size) * 0.8) + 6 })
  return base
}

// ─── Plan editing (rows, hierarchy, dragged dates) ───────────────────────────
// Pure functions on the rows array: they return a new array.
const lvl = r => Math.max(0, Math.round(r?.level ?? 0))
const at = (rows, key) => rows.findIndex(r => r.key === key)
// End (exclusive) of row i's subtree: its deeper descendants.
const subtreeEnd = (rows, i) => { let j = i + 1; while (j < rows.length && lvl(rows[j]) > lvl(rows[i])) j++; return j }

/** A free row key ("row-1", "row-2"…). */
export function ganttNewKey(rows, prefix = 'row') {
  const used = new Set(rows.map(r => r.key))
  let n = 1
  while (used.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}
/** Inserts a row above `key`, or below it (after its children), at the same level.
 *  If the neighbor carries anchored items (`after`), the new row copies its structure:
 *  same items, same anchors, no labels; an anchor internal to the neighbor points to
 *  the matching copy. */
export function insertRow(rows, key, where = 'below', row = {}) {
  const i = at(rows, key)
  const nr = { key: ganttNewKey(rows), label: 'New activity', items: [], ...row }
  if (i < 0) return [...rows, nr]
  const src = rows[i].items ?? []
  if (!row.items && src.some(it => it.after)) {
    const used = new Set(rows.flatMap(r => (r.items ?? []).map(it => it.key)))
    const map = new Map()
    let n = 1
    for (const it of src) { while (used.has(`item-${n}`)) n++; used.add(`item-${n}`); map.set(it.key, `item-${n}`) }
    const remap = a => { const k = String(a).split('|').at(-1); return src.some(it => it.key === k) ? map.get(k) : a }
    nr.items = src.map(it => {
      const c = Object.fromEntries(Object.entries(it).filter(([k]) => ['kind', 'shape', 'marker', 'start', 'end', 'duration', 'after', 'link', 'lag', 'color'].includes(k)))
      if (c.after != null) c.after = Array.isArray(c.after) ? c.after.map(remap) : remap(c.after)
      return { key: map.get(it.key), ...c }
    })
  }
  nr.level = row.level ?? lvl(rows[i])
  if (rows[i].group != null && row.group === undefined) nr.group = rows[i].group
  const pos = where === 'above' ? i : subtreeEnd(rows, i)
  return [...rows.slice(0, pos), nr, ...rows.slice(pos)]
}
/** Duplicates a row (with its tasks) right after its subtree, or above it
 *  (Ctrl+Alt+↑ / ↓). */
export function duplicateRow(rows, key, where = 'below') {
  const i = at(rows, key)
  if (i < 0) return rows
  const copy = { ...structuredClone(rows[i]), key: ganttNewKey(rows, rows[i].key), label: `${rows[i].label} (copy)` }
  const pos = where === 'above' ? i : subtreeEnd(rows, i)
  return [...rows.slice(0, pos), copy, ...rows.slice(pos)]
}
/** Deletes a row; its children move up one level. */
export function deleteRow(rows, key) {
  const i = at(rows, key)
  if (i < 0) return rows
  const end = subtreeEnd(rows, i)
  return [...rows.slice(0, i), ...rows.slice(i + 1, end).map(r => ({ ...r, level: lvl(r) - 1 })), ...rows.slice(end)]
}
/** Moves a row with its children up (-1) or down (+1), past its sibling of the same level. */
export function moveRow(rows, key, dir) {
  const i = at(rows, key)
  if (i < 0) return rows
  const L = lvl(rows[i]), end = subtreeEnd(rows, i)
  const block = rows.slice(i, end)
  if (dir < 0) {
    let j = i - 1
    while (j >= 0 && lvl(rows[j]) > L) j--
    if (j < 0 || lvl(rows[j]) < L) return rows
    return [...rows.slice(0, j), ...block, ...rows.slice(j, i), ...rows.slice(end)]
  }
  if (end >= rows.length || lvl(rows[end]) < L) return rows
  const end2 = subtreeEnd(rows, end)
  return [...rows.slice(0, i), ...rows.slice(end, end2), ...block, ...rows.slice(end2)]
}
/** Indents (+1) or outdents (-1) a row and its children (a row never goes
 *  more than one level below the previous one). */
export function indentRow(rows, key, delta) {
  const i = at(rows, key)
  if (i < 0) return rows
  const L = lvl(rows[i])
  const next = L + delta
  if (next < 0 || (delta > 0 && (i === 0 || next > lvl(rows[i - 1]) + 1))) return rows
  const end = subtreeEnd(rows, i)
  return rows.map((r, k) => (k >= i && k < end ? { ...r, level: lvl(r) + delta } : r))
}
/** Updates a row's fields (null clears the field). */
export function patchRow(rows, key, patch) {
  return rows.map(r => {
    if (r.key !== key) return r
    const n = { ...r, ...patch }
    for (const [k, v] of Object.entries(patch)) if (v == null) delete n[k]
    return n
  })
}
/** Updates a task's fields (null clears the field). */
export function patchItem(rows, rowKey, itemKey, patch) {
  return rows.map(r => (r.key !== rowKey ? r : {
    ...r,
    items: (r.items ?? []).map(it => {
      if (it.key !== itemKey) return it
      const n = { ...it, ...patch }
      for (const [k, v] of Object.entries(patch)) if (v == null) delete n[k]
      return n
    }),
  }))
}
/** Adds a task to a row (key unique within the plan). */
export function addItem(rows, rowKey, item) {
  const used = new Set(rows.flatMap(r => (r.items ?? []).map(it => it.key)))
  let n = 1
  while (used.has(`item-${n}`)) n++
  return rows.map(r => (r.key !== rowKey ? r : { ...r, items: [...(r.items ?? []), { key: `item-${n}`, ...item }] }))
}
/** Removes a task from a row. */
export function removeItem(rows, rowKey, itemKey) {
  return rows.map(r => (r.key !== rowKey ? r : { ...r, items: (r.items ?? []).filter(it => it.key !== itemKey) }))
}

/** Shifts a date by n units (day, week, month, quarter, year). `end`: end
 *  of unit (31 March + 1 month = 30 April). */
export function addUnits(iso, n, unit, end = false) {
  let t = parseDate(iso)
  if (!Number.isFinite(t)) return iso
  if (unit === 'day' || unit === 'week') return ymd(t + n * (unit === 'week' ? 7 : 1) * DAY)
  const months = n * { month: 1, quarter: 3, year: 12 }[unit]
  if (end) t += DAY
  const d = new Date(t)
  const day = d.getUTCDate() // a 31st shifted by a month stays within its month (clamped below)
  let r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0)).getUTCDate()
  r += (Math.min(day, last) - 1) * DAY
  return ymd(end ? r - DAY : r)
}
/** The unit boundary nearest to a date (start of day, week, month…). */
export function snapDate(iso, unit, { weekStart = 0, fiscalStart = 1 } = {}) {
  const t = parseDate(iso)
  if (!Number.isFinite(t) || unit === 'day') return iso
  const fs = Math.min(12, Math.max(1, fiscalStart)) - 1
  let a, b
  if (unit === 'week') {
    a = t - ((dowOf(t) - weekStart + 7) % 7) * DAY; b = a + 7 * DAY
  } else {
    const step = { month: 1, quarter: 3, year: 12 }[unit]
    const d = new Date(t)
    let m = d.getUTCMonth()
    m -= ((m - fs) % step + step) % step
    a = Date.UTC(d.getUTCFullYear(), m, 1); b = Date.UTC(d.getUTCFullYear(), m + step, 1)
  }
  return ymd(t - a <= b - t ? a : b)
}
/** Number of whole units (rounded) between two dates: the step of a drag. */
export function unitsBetween(fromIso, toIso, unit) {
  const days = (parseDate(toIso) - parseDate(fromIso)) / DAY
  if (!Number.isFinite(days)) return 0
  const len = { day: 1, week: 7, month: 30.44, quarter: 91.31, year: 365.25 }[unit] ?? 1
  return Math.round(days / len)
}
/** Drag-and-drop of a row: the row and its children go above
 *  `targetKey` (or to the end when `targetKey` is null); never into its own subtree. */
export function moveRowTo(rows, key, targetKey) {
  const i = at(rows, key)
  if (i < 0) return rows
  const end = subtreeEnd(rows, i)
  const block = rows.slice(i, end)
  if (targetKey != null && block.some(r => r.key === targetKey)) return rows
  const rest = [...rows.slice(0, i), ...rows.slice(end)]
  const j = targetKey == null ? rest.length : at(rest, targetKey)
  if (j < 0) return rows
  const out = [...rest.slice(0, j), ...block, ...rest.slice(j)]
  return out.every((r, k) => r === rows[k]) ? rows : out
}
/** Moves a task to another row (drag to another row), keeping its key. */
export function moveItem(rows, rowKey, itemKey, toRowKey, patch = {}) {
  if (rowKey === toRowKey) return patchItem(rows, rowKey, itemKey, patch)
  const it = rows.find(r => r.key === rowKey)?.items?.find(x => x.key === itemKey)
  if (!it || at(rows, toRowKey) < 0) return rows
  const moved = { ...it, ...patch }
  for (const [k, v] of Object.entries(patch)) if (v == null) delete moved[k]
  return rows.map(r => (r.key === rowKey ? { ...r, items: r.items.filter(x => x.key !== itemKey) } : r.key === toRowKey ? { ...r, items: [...(r.items ?? []), moved] } : r))
}

/** Drag step depending on zoom: the day when a day is at least
 *  6 px wide, otherwise the week, the month, the quarter. */
export function ganttSnapUnit(pxPerDay) {
  const p = Number(pxPerDay) || 0
  return p >= 6 ? 'day' : p * 7 >= 6 ? 'week' : p * 30.44 >= 6 ? 'month' : 'quarter'
}

// ─── Calendar ────────────────────────────────────────────────────────────────
/** The weeks of a month for the calendar: 7 days per week, from the first day of the week
 *  (`weekStart` 0 = Monday); days outside the month are marked `out`. */
export function calendarWeeks(year, month, weekStart = 0) {
  const first = Date.UTC(year, month, 1)
  let t = first - ((dowOf(first) - weekStart + 7) % 7) * DAY
  const weeks = []
  do {
    const w = []
    for (let k = 0; k < 7; k++, t += DAY) w.push({ iso: ymd(t), day: new Date(t).getUTCDate(), out: new Date(t).getUTCMonth() !== month })
    weeks.push(w)
  } while (new Date(t).getUTCMonth() === month && new Date(t).getUTCFullYear() === year)
  return weeks
}
/** A key in the calendar → the new focus date (arrows: day / week,
 *  Page Up / Down: month, with Shift: year, Home / End: week bounds). */
export function calendarMove(iso, key, { shift = false, weekStart = 0 } = {}) {
  const t = parseDate(iso)
  if (!Number.isFinite(t)) return iso
  switch (key) {
    case 'ArrowLeft': return ymd(t - DAY)
    case 'ArrowRight': return ymd(t + DAY)
    case 'ArrowUp': return ymd(t - 7 * DAY)
    case 'ArrowDown': return ymd(t + 7 * DAY)
    case 'PageUp': return addUnits(iso, -1, shift ? 'year' : 'month')
    case 'PageDown': return addUnits(iso, 1, shift ? 'year' : 'month')
    case 'Home': return ymd(t - ((dowOf(t) - weekStart + 7) % 7) * DAY)
    case 'End': return ymd(t + (6 - ((dowOf(t) - weekStart + 7) % 7)) * DAY)
    default: return iso
  }
}
/** A chosen range: the anchor date and the current date, in order. */
export const calendarRange = (a, b) => (a <= b ? [a, b] : [b, a])
