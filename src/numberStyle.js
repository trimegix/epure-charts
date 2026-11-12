// ─── epure-charts · number format ───────────────────────────────────────────
// Rewrites a number ALREADY formatted by the host: thousands and decimal
// separators, currency symbol, negatives in parentheses, prefix / suffix.
// Pure, tested under node --test.
const THOUSANDS = { comma: ',', space: '\u202F', dot: '.', apostrophe: '’', none: '' }

/** Rewrites an already formatted number according to the "Number format" settings. */
export function styleNumber(str, num) {
  let t = String(str)
  if (t === '—') return t
  if (num.currency === false || num.currency === 'after') t = t.replace(/€/g, '')
  if (num.thousands || num.decimal) {
    t = t.replace(/\d[\d,]*(\.\d+)?/, m => {
      const places = (m.split('.')[1] ?? '').length
      const en = Number(m.replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })
      const T = THOUSANDS[num.thousands ?? 'comma'] ?? ','
      // Decimal separator: point, comma or Arabic separator (٫, U+066B).
      const D = num.decimal === 'comma' ? ',' : num.decimal === 'arabic' ? '\u066B' : '.'
      return en.replace(/,/g, '\uE000').replace(/\./g, D).replace(/\uE000/g, T)
    })
  }
  const negative = /[−-](?=[€$£\d])/.test(t)
  // Sign: before the currency (−€12M, default) or before the number (€−12M); "+" on any positive value.
  if (negative && num.signPos === 'value') t = t.replace(/[−-](€|\$|£)/, '$1−')
  if (!negative && num.plus && /\d/.test(t) && !/^\+/.test(t) && !/^0(\D|$)/.test(t.replace(/^[€$£]/, ''))) t = num.signPos === 'value' ? t.replace(/(\d)/, '+$1') : `+${t}`
  if (negative && num.neg === 'paren') t = `(${t.replace(/[−-](?=[€$£\d])/, '')})`
  // Minus glyph: typographic minus (default), hyphen, en dash.
  if (num.minus === 'hyphen') t = t.replace(/−/g, '-')
  else if (num.minus === 'endash') t = t.replace(/[−-](?=[€$£\d])/g, '–')
  else t = t.replace(/-(?=[€$£\d])/g, '−')
  // "173,0 M€": a space before the magnitude, the currency after the number.
  if (num.magSpace) t = t.replace(/(\d)(k|M|B|′|″)(?=\)?$)/, '$1 $2')
  if (num.currency === 'after') t = t.replace(/(\)?)$/, '€$1')
  return `${num.prefix ?? ''}${t}${num.suffix ?? ''}`
}

/**
 * Format by example (type "€1 234,5M" in the control) and read back:
 * thousands and decimal separators, number of decimals, the "+",
 * parentheses for negatives, literal prefix and suffix, magnitude.
 */
export function parseExample(ex) {
  const s = String(ex ?? '').trim()
  const m = /^(.*?)([+−-]?)(\(?)(\d[\d\s.,'’ \u066B]*\d|\d)(\)?)(.*)$/u.exec(s)
  if (!m) return null
  let [, pre, sign, open, digits, close, post] = m
  const out = {}
  const seps = digits.replace(/\d/g, '')
  let dec, thou
  const last = digits.match(/[.,\u066B](\d+)$/)
  if (last && (seps.length === 1 ? last[1].length !== 3 || seps === '\u066B' || /,/.test(seps) && /\./.test(digits) : true)) {
    const decChar = digits[digits.length - last[1].length - 1]
    dec = last[1].length
    out.decimal = decChar === ',' ? 'comma' : decChar === '\u066B' ? 'arabic' : null
    thou = seps.replace(decChar, '')[0] ?? null
  } else {
    dec = 0
    thou = seps[0] ?? null
  }
  out.thousands = thou == null ? (digits.replace(/\D/g, '').length >= 4 ? 'none' : null) : { ',': null, ' ': 'space', '\u202F': 'space', '.': 'dot', "'": 'apostrophe', '’': 'apostrophe' }[thou] ?? null
  out.decimals = dec
  if (sign === '+') out.plus = true
  if (open && close) out.neg = 'paren'
  // A trailing magnitude (k, M, B); the rest of the prefix / suffix is literal.
  // The magnitude attached or spaced ("1,2M", "1,2 M€"); a trailing currency goes after the number.
  const magM = /^(\s*)(k|M|B|bn|m)(?![A-Za-z])/.exec(post)
  if (magM) {
    out.magnitude = { k: 'k', M: 'M', m: 'M', B: 'B', bn: 'B' }[magM[2]]
    if (magM[1]) out.magSpace = true
    post = post.slice(magM[0].length)
  }
  if (/^\s*€/.test(post) && !/€/.test(pre)) { out.currencyAfter = true; post = post.replace(/^\s*€/, '') }
  // A % example ("+12,3%") describes shares, not amounts: flagged to the caller.
  if (/^\s*%/.test(post)) { out.percent = true; post = post.replace(/^\s*%/, '') }
  // Inside literal parentheses ("(€) 1 234") the prefix is kept as is: it is
  // neither the format's currency symbol nor a negative.
  const literal = /[()]/.test(pre)
  out.currency = out.currencyAfter ? 'after' : !literal && /€/.test(pre)
  delete out.currencyAfter
  if (!literal) pre = pre.replace(/€/, '')
  if (pre.trim()) out.prefix = pre
  if (post.trim()) out.suffix = post
  return out
}

/**
 * Consistent rounding (largest remainder method):
 * the rounded values sum exactly to the rounded total. values → rounded values.
 */
export function roundToSum(values, decimals = 0) {
  const f = 10 ** decimals
  const scaled = values.map(v => v * f)
  const floors = scaled.map(Math.floor)
  const target = Math.round(scaled.reduce((a, b) => a + b, 0))
  let short = target - floors.reduce((a, b) => a + b, 0)
  const order = scaled.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0])
  const out = [...floors]
  for (const [, i] of order) { if (short <= 0) break; out[i] += 1; short -= 1 }
  return out.map(v => v / f)
}

const MAGNITUDE = { k: 1e3, M: 1e6, B: 1e9 }

/** A chart's formatter: the host's, then decimals, magnitude and "Number format". */
export function makeFormatter(format, dec, mag, num) {
  // A computed line in % or as a multiple carries its own format.
  const base = (v, unit, d) => (unit === 'calc%' ? `${(v * 100).toFixed(d ?? 1)}%` : unit === 'calcx' ? `${v.toFixed(d ?? 2)}x` : format(v, unit, d))
  const withDec = dec == null ? base
    // Decimals change, the thousands separator stays (€1,234M → €1,234.0M).
    : (v, unit, d) => String(base(v, unit, d)).replace(/\d[\d,]*(\.\d+)?/, m => Number(m.replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
  // Prime notation: ′ for millions, ″ for billions (€12′, €1.2″).
  if (mag === 'prime') {
    const primed = (v, unit, d) => {
      if (!Number.isFinite(v) || (unit ?? 'M') !== 'M') return withDec(v, unit, d)
      const big = Math.abs(v) >= 1000
      const n = big ? v / 1000 : v
      const places = dec ?? (big ? 1 : Math.abs(n) >= 100 ? 0 : 1)
      return `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })}${big ? '″' : '′'}`
    }
    return num && Object.keys(num).length ? (v, unit, d) => styleNumber(primed(v, unit, d), num) : primed
  }
  const scaled = !mag ? withDec : (v, unit, d) => {
    if (!Number.isFinite(v) || ['pct', 'x', 'calc%', 'calcx', '%'].includes(unit)) return withDec(v, unit, d)
    // A volume (units, tonnes…): divided by the magnitude, suffixed.
    if ((unit ?? 'M') !== 'M') {
      const n = v / MAGNITUDE[mag]
      return `${n.toLocaleString('en-US', { minimumFractionDigits: dec ?? 1, maximumFractionDigits: dec ?? 1 })}${mag}`
    }
    const n = (v * 1e6) / MAGNITUDE[mag]
    const places = dec ?? (Math.abs(n) >= 100 ? 0 : 1)
    return `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })}${mag}`
  }
  return num && Object.keys(num).length ? (v, unit, d) => styleNumber(scaled(v, unit, d), num) : scaled
}

// Offered separators: [thousands, decimal, displayed example].
export const SEPARATORS = [[null, null, '1,234.5'], ['space', 'comma', '1 234,5'], ['dot', 'comma', '1.234,5'], ['apostrophe', null, '1’234.5'], ['none', null, '1234.5'], ['space', 'arabic', '1 234\u066B5']]

/** The chosen separator ("1 234,5"…) from the number settings. */
export const separatorOf = num => SEPARATORS.find(x => ((num ?? {}).thousands ?? null) === x[0] && ((num ?? {}).decimal ?? null) === x[1])?.[2] ?? null


// ─── Date format codes ─────────────────────────────────────────────────────────
const DATE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DATE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ROMAN = ['', 'i', 'ii', 'iii', 'iv']
// Longest recognized code per letter (case-insensitive): d…ddddd, w…wwww, M…MMMMM, Q…QQQ, yy / yyyy.
const CODE_MAX = { d: 5, w: 4, m: 5, q: 3, y: 4 }

/** ISO 8601 week of a UTC date (1 to 53). */
function isoWeekOf(dt) {
  const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
}

/**
 * Formats a date with format codes, case-insensitive: d dd ddd dddd ddddd (day),
 * w ww www wwww (ISO week), M MM MMM MMMM MMMMM (month), Q QQ QQQ (quarter 4, iv, IV),
 * yy yyyy; 'text' or "text" literal, \x a literal character, a lone ' or '' an apostrophe,
 * ¶ a line break. parts = { y, m?, d? }; a code without its part (the day of a year) is empty.
 * `full` writes the year with four digits even for yy.
 */
export function formatDateCodes(parts, pattern, full = false) {
  const { y } = parts
  const m = parts.m ?? null
  const q = m == null ? null : Math.ceil(m / 3)
  const dt = m != null && parts.d != null ? new Date(Date.UTC(+y, m - 1, parts.d)) : null
  const code = (c, n) => {
    if (c === 'y') return n >= 3 || full ? String(y) : String(y).slice(-2)
    if (c === 'q') return q == null ? '' : n === 1 ? String(q) : n === 2 ? ROMAN[q] : ROMAN[q].toUpperCase()
    if (c === 'm') return m == null ? '' : n === 1 ? String(m) : n === 2 ? String(m).padStart(2, '0') : n === 3 ? DATE_MONTHS[m - 1].slice(0, 3) : n === 4 ? DATE_MONTHS[m - 1] : DATE_MONTHS[m - 1][0]
    if (!dt) return ''
    if (c === 'd') {
      const dd = dt.getUTCDate(), name = DATE_DAYS[dt.getUTCDay()]
      return n === 1 ? String(dd) : n === 2 ? String(dd).padStart(2, '0') : n === 3 ? name.slice(0, 3) : n === 4 ? name : name[0]
    }
    const w = isoWeekOf(dt)
    return n === 1 ? String(w) : n === 2 ? String(w).padStart(2, '0') : n === 3 ? `Week ${w}` : `Week ${String(w).padStart(2, '0')}`
  }
  const p = String(pattern ?? '')
  let out = ''
  for (let i = 0; i < p.length;) {
    const ch = p[i]
    if (ch === '\\') { out += p[i + 1] ?? ''; i += 2; continue }
    if (ch === '¶') { out += '\n'; i++; continue }
    if (ch === '"' || ch === "'") {
      // '': an apostrophe; 'text': literal; an unmatched apostrophe stays an apostrophe (MMM 'yy).
      if (ch === "'" && p[i + 1] === "'") { out += "'"; i += 2; continue }
      const j = p.indexOf(ch, i + 1)
      if (j < 0) { out += ch; i++; continue }
      out += p.slice(i + 1, j); i = j + 1; continue
    }
    const c = ch.toLowerCase()
    if (CODE_MAX[c]) {
      let n = 1
      while (n < CODE_MAX[c] && p[i + n]?.toLowerCase() === c) n++
      // "yyy" does not exist: two y give the short year, the rest starts over.
      if (c === 'y' && n === 3) n = 2
      out += code(c, n); i += n; continue
    }
    out += ch; i++
  }
  return out.split('\n').map(l => l.trim()).join('\n').trim()
}

/**
 * Consistent rounding to the displayed format (round sums consistently): the rounding
 * grid is read from the formatter (the largest step that changes no text, total included),
 * then the largest remainder method makes the displayed values sum to the displayed total.
 * values → values to display, or null if no grid fits.
 */
export function consistentRound(values, fmt) {
  if (values.length < 2) return null
  const total = values.reduce((a, b) => a + b, 0)
  const all = [...values, total]
  for (let e = 12; e >= -6; e--) {
    const g = 10 ** e
    if (all.every(v => fmt(Math.round(v / g) * g) === fmt(v))) return roundToSum(values.map(v => v / g), 0).map(r => r * g)
  }
  return null
}
