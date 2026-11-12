// ─── epure-charts · date axis ticks ──────────────────────────────────────────
// A date axis (YYYY-MM-DD categories placed on a time scale) is ticked by unit:
// years, quarters, months, weeks or days; the week starts on the chosen day.
// Days are counted from 1970-01-01 (UTC), as Date.parse(...) / 864e5.
// Pure: no React, no DOM (tested under node --test).

export const DATE_UNITS = ['year', 'quarter', 'month', 'week', 'day']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 864e5

/** Day of the week, Monday = 0 … Sunday = 6 (1970-01-01 was a Thursday). */
export const dowOf = day => (((Math.floor(day) + 3) % 7) + 7) % 7

/**
 * Ticks between two days (inclusive): [{ day, label }].
 * weekStart: 0 = Monday … 6 = Sunday. Beyond `max` ticks the unit is too fine and [] is returned.
 */
export function dateAxisTicks(minDay, maxDay, unit, weekStart = 0, max = 400) {
  if (!DATE_UNITS.includes(unit) || !(maxDay >= minDay)) return []
  const out = []
  const yy = y => String(y).slice(2)
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? 1 : 7
    let d = Math.ceil(minDay)
    if (unit === 'week') d += (weekStart - dowOf(d) + 7) % 7
    for (; d <= maxDay && out.length <= max; d += step) {
      const t = new Date(d * DAY)
      out.push({ day: d, label: unit === 'day' ? String(t.getUTCDate()) : `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}` })
    }
  } else {
    const months = { year: 12, quarter: 3, month: 1 }[unit]
    const t0 = new Date(Math.ceil(minDay) * DAY)
    let y = t0.getUTCFullYear(), m = t0.getUTCMonth()
    // First unit start on or after minDay.
    m = Math.ceil(m / months) * months
    if (Date.UTC(y, m, 1) / DAY < minDay) m += months
    for (;;) {
      const d = Date.UTC(y, m, 1) / DAY
      if (d > maxDay || out.length > max) break
      const t = new Date(d * DAY)
      const Y = t.getUTCFullYear(), M = t.getUTCMonth()
      out.push({ day: d, label: unit === 'year' ? String(Y) : unit === 'quarter' ? `Q${M / 3 + 1} ${yy(Y)}` : `${MONTHS[M]} ${yy(Y)}` })
      m += months
    }
  }
  return out.length > max ? [] : out
}
