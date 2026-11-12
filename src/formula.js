// ─── epure-charts · datasheet formulas ───────────────────────────────────────
// Excel-style formulas in the cells of a chart's datasheet:
// "=C2-B2", "=C2/B2-1", "=SUM(B2:F2)".
//
//   A1 references (letter column, numeric row), absolute with $;
//   ranges B2:F2 (inside functions); + - * / ^, parentheses, %, and:
//   SUM  AVERAGE (AVG)  MIN  MAX  COUNT  ABS  ROUND(x, n)  PRODUCT  MEDIAN  POWER(x, n)  SQRT  INT  MOD(x, n)
//   conditionals: SUMIF(S)  COUNTIF(S)  AVERAGEIF(S)  MINIFS  MAXIFS (criteria ">10", "<>0", "Rev*");
//   lookup: VLOOKUP  HLOOKUP  XLOOKUP  CHOOSE; statistics: STDEV(.S/.P)  VAR(.S/.P)  SUMPRODUCT
//   COUNTA  COUNTBLANK; math: LN  LOG  LOG10  EXP  PI  CEILING  FLOOR  TRUNC; IFS, ISBLANK / ISNUMBER / ISTEXT;
//   TRUE / FALSE. Column A (row names) and row 1 (headers) read as text.
//
// Pure and safe: a recursive-descent parser, no eval, nothing but the sheet's
// cells. evaluateCell() never throws: a faulty formula returns { error }
// (#REF, #CYCLE, #DIV/0, syntax).

const FUNCS = ['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT', 'ABS', 'ROUND', 'PRODUCT', 'MEDIAN', 'POWER', 'SQRT', 'INT', 'MOD', 'IF', 'IFERROR', 'AND', 'OR', 'NOT', 'ROUNDUP', 'ROUNDDOWN', 'SIGN', 'INDEX', 'MATCH', 'LARGE', 'SMALL', 'RANK', 'DATE', 'YEAR', 'MONTH', 'DAY', 'DAYS', 'TODAY', 'EDATE', 'CONCAT', 'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'TEXT', 'VALUE',
  'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS', 'MINIFS', 'MAXIFS', 'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'CHOOSE',
  'STDEV', 'STDEV.S', 'STDEV.P', 'STDEVP', 'VAR', 'VAR.S', 'VAR.P', 'VARP', 'SUMPRODUCT', 'COUNTA', 'COUNTBLANK',
  'LN', 'LOG', 'LOG10', 'EXP', 'PI', 'CEILING', 'FLOOR', 'TRUNC', 'IFS', 'ISBLANK', 'ISNUMBER', 'ISTEXT']

/** 0 → A, 25 → Z, 26 → AA. */
export function colLetter(i) {
  let s = ''
  let n = i + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
/** 'A' → 0, 'AA' → 26. */
export function colIndex(letters) {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
}

const REF_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/

function tokenize(src) {
  const out = []
  const s = String(src ?? '').replace(/^\s*=/, '').replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    // Quoted text ("M&A"), for the text functions.
    if (c === '"') {
      let j = i + 1
      while (j < s.length && s[j] !== '"') j++
      if (j >= s.length) throw new Error('unclosed text')
      out.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue
    }
    // &: concatenation (Excel).
    if (c === '&') { out.push({ t: 'op', v: '&' }); i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      const n = Number(s.slice(i, j))
      if (!Number.isFinite(n)) throw new Error(`bad number '${s.slice(i, j)}'`)
      out.push({ t: 'num', v: n }); i = j; continue
    }
    if (/[A-Za-z$]/.test(c)) {
      let j = i
      // A dot may appear in a function name (STDEV.S), never in a reference.
      while (j < s.length && /[A-Za-z0-9$.]/.test(s[j])) j++
      const w = s.slice(i, j)
      const up = w.toUpperCase()
      if (FUNCS.includes(up)) out.push({ t: 'fn', v: up })
      else if (up === 'TRUE' || up === 'FALSE') out.push({ t: 'num', v: up === 'TRUE' ? 1 : 0 })
      else if (REF_RE.test(w)) out.push({ t: 'ref', v: up.replace(/\$/g, '') })
      else throw new Error(`unknown name '${w}'`)
      i = j; continue
    }
    // Comparisons (Excel): <, >, <=, >=, =, <>; true = 1, false = 0.
    if (c === '<' || c === '>' || c === '=') {
      const two = s.slice(i, i + 2)
      if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two }); i += 2; continue }
      out.push({ t: 'op', v: c }); i++; continue
    }
    if ('+-*/^(),:%'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`unexpected '${c}'`)
  }
  return out
}

// expr := term (('+'|'-') term)* ; term := power (('*'|'/') power)* ;
// power := unary ('^' unary)? ; unary := '-' unary | atom '%'?
// atom := num | ref (':' ref)? | fn '(' args ')' | '(' expr ')'
function parse(tokens) {
  let k = 0
  const peek = () => tokens[k]
  const isOp = v => peek()?.t === 'op' && peek().v === v
  const take = v => { const t = tokens[k]; if (!t || (v && t.v !== v)) throw new Error(v ? `expected '${v}'` : 'unexpected end'); k++; return t }
  const CMP = ['<', '>', '<=', '>=', '=', '<>']
  const concat = () => {
    let n = expr()
    while (isOp('&')) { take(); n = { op: '&', a: n, b: expr() } }
    return n
  }
  const compare = () => {
    const n = concat()
    if (peek()?.t === 'op' && CMP.includes(peek().v)) { const op = take().v; return { op, a: n, b: concat() } }
    return n
  }
  const expr = () => {
    let n = term()
    while (isOp('+') || isOp('-')) { const op = take().v; n = { op, a: n, b: term() } }
    return n
  }
  const term = () => {
    let n = power()
    while (isOp('*') || isOp('/')) { const op = take().v; n = { op, a: n, b: power() } }
    return n
  }
  const power = () => {
    const n = unary()
    if (isOp('^')) { take(); return { op: '^', a: n, b: unary() } }
    return n
  }
  const unary = () => {
    if (isOp('-')) { take(); return { op: 'neg', a: unary() } }
    if (isOp('+')) { take(); return unary() }
    let n = atom()
    if (isOp('%')) { take(); n = { op: '*', a: n, b: { num: 0.01 } } }
    return n
  }
  const atom = () => {
    const t = take()
    if (t.t === 'num') return { num: t.v }
    if (t.t === 'str') return { str: t.v }
    if (t.t === 'ref') {
      if (isOp(':')) { take(); const b = take(); if (b.t !== 'ref') throw new Error('bad range'); return { range: [t.v, b.v] } }
      return { ref: t.v }
    }
    if (t.t === 'fn') {
      take('(')
      const args = []
      if (!isOp(')')) { args.push(compare()); while (isOp(',')) { take(); args.push(compare()) } }
      take(')')
      return { fn: t.v, args }
    }
    if (t.t === 'op' && t.v === '(') { const a = compare(); take(')'); return a }
    throw new Error(`unexpected '${t.v}'`)
  }
  const tree = compare()
  if (k < tokens.length) throw new Error(`unexpected '${tokens[k].v}'`)
  return tree
}

const split = ref => { const m = REF_RE.exec(ref); return { col: colIndex(m[1]), row: Number(m[2]) } }

function run(node, get) {
  if ('num' in node) return node.num
  if ('str' in node) return node.str
  if (node.ref) return scalar(get(split(node.ref)))
  if (node.range) throw new Error('a range only goes inside a function')
  if (node.fn) {
    // Logic (lazy, like Excel): only the selected branch is evaluated.
    if (node.fn === 'IF') { const c = run(node.args[0], get); return c ? (node.args[1] ? run(node.args[1], get) : 1) : (node.args[2] ? run(node.args[2], get) : 0) }
    if (node.fn === 'IFERROR') { try { const v = run(node.args[0], get); return v == null || !Number.isFinite(v) ? run(node.args[1], get) : v } catch { return run(node.args[1], get) } }
    if (node.fn === 'NOT') return run(node.args[0], get) ? 0 : 1
    if (node.fn === 'AND' || node.fn === 'OR') {
      const bs = node.args.map(a => !!run(a, get))
      return (node.fn === 'AND' ? bs.every(Boolean) : bs.some(Boolean)) ? 1 : 0
    }
    // Text (Excel): CONCAT, LEFT / RIGHT / MID, LEN, UPPER / LOWER, TRIM, TEXT(v, "0.0"), VALUE.
    const txtArg = a => { const v = a?.ref ? get(split(a.ref)) : run(a, get); if (v && typeof v === 'object' && 'error' in v) throw new Error(v.error); return v == null ? '' : String(v) }
    if (node.fn === 'CONCAT' || node.fn === 'CONCATENATE') return node.args.map(txtArg).join('')
    if (node.fn === 'LEFT') return txtArg(node.args[0]).slice(0, node.args[1] ? run(node.args[1], get) : 1)
    if (node.fn === 'RIGHT') { const t = txtArg(node.args[0]); const k = node.args[1] ? run(node.args[1], get) : 1; return k ? t.slice(-k) : '' }
    if (node.fn === 'MID') return txtArg(node.args[0]).substr(run(node.args[1], get) - 1, run(node.args[2], get))
    if (node.fn === 'LEN') return txtArg(node.args[0]).length
    if (node.fn === 'UPPER') return txtArg(node.args[0]).toUpperCase()
    if (node.fn === 'LOWER') return txtArg(node.args[0]).toLowerCase()
    if (node.fn === 'TRIM') return txtArg(node.args[0]).trim().replace(/\s+/g, ' ')
    if (node.fn === 'VALUE') { const n = Number(txtArg(node.args[0]).replace(/[\s,]/g, '')); if (!Number.isFinite(n)) throw new Error('#VALUE'); return n }
    if (node.fn === 'TEXT') {
      const v = run(node.args[0], get), f = node.args[1] ? txtArg(node.args[1]) : '0'
      const dec = (f.split('.')[1] ?? '').replace(/[^0#]/g, '').length
      const pct = f.includes('%')
      const n = pct ? v * 100 : v
      const body = f.includes(',') ? n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : n.toFixed(dec)
      return `${body}${pct ? '%' : ''}`
    }
    // Dates (days since 1970, like the sheet's date columns): DATE(y, m, d),
    // YEAR / MONTH / DAY(date), DAYS(end, start), EDATE(date, months), TODAY().
    const dayArg = a => {
      const v = a?.ref ? get(split(a.ref)) : run(a, get)
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return Math.round(Date.parse(`${v}T00:00:00Z`) / 864e5)
      if (v && typeof v === 'object' && 'error' in v) throw new Error(v.error)
      if (!Number.isFinite(v)) throw new Error('#VALUE')
      return v
    }
    const asDate = d => new Date(d * 864e5)
    if (node.fn === 'DATE') { const [y, m, d] = node.args.map(a => run(a, get)); return Math.round(Date.UTC(y, m - 1, d) / 864e5) }
    if (node.fn === 'YEAR') return asDate(dayArg(node.args[0])).getUTCFullYear()
    if (node.fn === 'MONTH') return asDate(dayArg(node.args[0])).getUTCMonth() + 1
    if (node.fn === 'DAY') return asDate(dayArg(node.args[0])).getUTCDate()
    if (node.fn === 'DAYS') return dayArg(node.args[0]) - dayArg(node.args[1])
    if (node.fn === 'TODAY') return Math.floor(Date.now() / 864e5)
    if (node.fn === 'EDATE') { const d = asDate(dayArg(node.args[0])); const m = run(node.args[1], get); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()) / 864e5) }
    // Lookup and rank (over a range flattened row by row): INDEX(range, n), MATCH(v, range, 0|1|-1),
    // LARGE / SMALL(range, k), RANK(v, range, 0=descending | 1=ascending).
    const listOf = a => (a?.range ? rangeValues(a.range, get).filter(v => v != null) : [run(a, get)])
    if (node.fn === 'INDEX') { const xs = listOf(node.args[0]); const i = run(node.args[1], get); if (!(i >= 1 && i <= xs.length)) throw new Error('#REF'); return xs[i - 1] }
    if (node.fn === 'MATCH') {
      const v = run(node.args[0], get), xs = listOf(node.args[1]), mode = node.args[2] ? run(node.args[2], get) : 1
      let pos = -1
      if (mode === 0) pos = xs.findIndex(x => x === v)
      else if (mode > 0) xs.forEach((x, i) => { if (x <= v) pos = i })
      else xs.forEach((x, i) => { if (x >= v) pos = i })
      if (pos < 0) throw new Error('#N/A')
      return pos + 1
    }
    if (node.fn === 'LARGE' || node.fn === 'SMALL') {
      const xs = listOf(node.args[0]).sort((a, b) => (node.fn === 'LARGE' ? b - a : a - b)); const k = run(node.args[1], get)
      if (!(k >= 1 && k <= xs.length)) throw new Error('#NUM'); return xs[k - 1]
    }
    if (node.fn === 'RANK') {
      const v = run(node.args[0], get), xs = listOf(node.args[1]), asc = node.args[2] ? run(node.args[2], get) : 0
      if (!xs.includes(v)) throw new Error('#N/A')
      return xs.filter(x => (asc ? x < v : x > v)).length + 1
    }
    // A raw value (text included): a reference reads the cell as is.
    const valArg = a => (a?.ref ? raw(get(split(a.ref))) : run(a, get))
    const gridOf = a => (a?.range ? rangeGrid(a.range, get) : [[valArg(a)]])
    const flat = a => gridOf(a).flat()
    // Conditionals (Excel): (range, criterion[, sum range]) or (target range, range1, criterion1, ...).
    if (['SUMIF', 'COUNTIF', 'AVERAGEIF'].includes(node.fn)) {
      const crit = flat(node.args[0]), test = criterion(valArg(node.args[1]))
      const target = node.args[2] ? flat(node.args[2]) : crit
      const hit = crit.map((v, i) => (test(v) ? target[i] : undefined)).filter(v => v !== undefined)
      return aggregateIf(node.fn, hit)
    }
    if (['SUMIFS', 'COUNTIFS', 'AVERAGEIFS', 'MINIFS', 'MAXIFS'].includes(node.fn)) {
      const counting = node.fn === 'COUNTIFS'
      const pairs = node.args.slice(counting ? 0 : 1)
      if (!pairs.length || pairs.length % 2) throw new Error('#VALUE')
      const tests = []
      for (let i = 0; i < pairs.length; i += 2) tests.push([flat(pairs[i]), criterion(valArg(pairs[i + 1]))])
      const target = counting ? tests[0][0] : flat(node.args[0])
      if (tests.some(([r]) => r.length !== target.length)) throw new Error('#VALUE')
      const hit = target.filter((_, i) => tests.every(([r, t]) => t(r[i])))
      return aggregateIf(node.fn, hit)
    }
    if (node.fn === 'VLOOKUP' || node.fn === 'HLOOKUP') {
      const v = valArg(node.args[0]), g = gridOf(node.args[1]), n = run(node.args[2], get)
      const approx = node.args[3] ? !!run(node.args[3], get) : true
      const lines = node.fn === 'VLOOKUP' ? g : g[0].map((_, c) => g.map(r => r[c]))
      if (!(n >= 1 && n <= lines[0].length)) throw new Error('#REF')
      let at = lines.findIndex(r => same(r[0], v))
      if (at < 0 && approx) lines.forEach((r, i) => { if (r[0] != null && typeof r[0] === typeof v && r[0] <= v) at = i })
      if (at < 0) throw new Error('#N/A')
      return lines[at][Math.floor(n) - 1]
    }
    if (node.fn === 'XLOOKUP') {
      const v = valArg(node.args[0]), keys = flat(node.args[1]), back = flat(node.args[2])
      const at = keys.findIndex(k => same(k, v))
      if (at < 0) { if (node.args[3]) return valArg(node.args[3]); throw new Error('#N/A') }
      return back[at] ?? null
    }
    if (node.fn === 'CHOOSE') { const i = Math.floor(run(node.args[0], get)); if (!(i >= 1 && i < node.args.length)) throw new Error('#VALUE'); return valArg(node.args[i]) }
    if (node.fn === 'IFS') {
      for (let i = 0; i + 1 < node.args.length; i += 2) if (run(node.args[i], get)) return valArg(node.args[i + 1])
      throw new Error('#N/A')
    }
    if (node.fn === 'ISBLANK') { const v = valArg(node.args[0]); return v == null || v === '' ? 1 : 0 }
    if (node.fn === 'ISNUMBER') return typeof valArg(node.args[0]) === 'number' ? 1 : 0
    if (node.fn === 'ISTEXT') return typeof valArg(node.args[0]) === 'string' ? 1 : 0
    if (node.fn === 'COUNTA') return node.args.flatMap(flat).filter(v => v != null && v !== '').length
    if (node.fn === 'COUNTBLANK') return node.args.flatMap(flat).filter(v => v == null || v === '').length
    if (node.fn === 'SUMPRODUCT') {
      const ls = node.args.map(a => flat(a).map(v => (typeof v === 'number' ? v : 0)))
      if (ls.some(l => l.length !== ls[0].length)) throw new Error('#VALUE')
      return ls[0].reduce((s, _, i) => s + ls.reduce((p, l) => p * l[i], 1), 0)
    }
    if (node.fn === 'PI') return Math.PI
    const vals = node.args.flatMap(a => (a.range ? rangeValues(a.range, get) : [run(a, get)])).filter(v => v != null)
    switch (node.fn) {
      case 'SUM': return vals.reduce((s, v) => s + v, 0)
      case 'AVERAGE': case 'AVG': if (!vals.length) throw new Error('#DIV/0'); return vals.reduce((s, v) => s + v, 0) / vals.length
      case 'MIN': return vals.length ? Math.min(...vals) : 0
      case 'MAX': return vals.length ? Math.max(...vals) : 0
      case 'COUNT': return vals.length
      case 'ABS': return vals.length ? Math.abs(vals[0]) : null
      case 'ROUND': { const [x, d = 0] = node.args.map(a => run(a, get)); const f = 10 ** d; return x == null ? null : Math.round(x * f) / f }
      case 'PRODUCT': return vals.reduce((s, v) => s * v, 1)
      case 'MEDIAN': { if (!vals.length) return null; const v = [...vals].sort((p, q) => p - q); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
      case 'POWER': { const [x, n] = node.args.map(a => run(a, get)); return x == null || n == null ? null : x ** n }
      case 'SQRT': { if (!vals.length) return null; if (vals[0] < 0) throw new Error('#NUM'); return Math.sqrt(vals[0]) }
      case 'INT': return vals.length ? Math.floor(vals[0]) : null
      case 'ROUNDUP': case 'ROUNDDOWN': { const [x, d = 0] = node.args.map(a => run(a, get)); const f = 10 ** d; if (x == null) return null; const fnr = node.fn === 'ROUNDUP' ? (v => Math.sign(v) * Math.ceil(Math.abs(v))) : (v => Math.sign(v) * Math.floor(Math.abs(v))); return fnr(x * f) / f }
      case 'SIGN': return vals.length ? Math.sign(vals[0]) : null
      case 'STDEV': case 'STDEV.S': case 'STDEV.P': case 'STDEVP': case 'VAR': case 'VAR.S': case 'VAR.P': case 'VARP': {
        const pop = /P$/.test(node.fn), n = vals.length
        if (n < (pop ? 1 : 2)) throw new Error('#DIV/0')
        const mu = vals.reduce((s, v) => s + v, 0) / n
        const vr = vals.reduce((s, v) => s + (v - mu) ** 2, 0) / (pop ? n : n - 1)
        return node.fn.startsWith('VAR') ? vr : Math.sqrt(vr)
      }
      case 'LN': case 'LOG10': case 'LOG': {
        const [x, b = node.fn === 'LN' ? Math.E : 10] = node.args.map(a => run(a, get))
        if (x == null) return null
        if (!(x > 0) || !(b > 0) || b === 1) throw new Error('#NUM')
        return Math.log(x) / Math.log(b)
      }
      case 'EXP': return vals.length ? Math.exp(vals[0]) : null
      case 'CEILING': case 'FLOOR': {
        const [x, sig = 1] = node.args.map(a => run(a, get))
        if (x == null) return null
        if (!sig) return 0
        const q = x / sig
        return (node.fn === 'CEILING' ? Math.ceil(q - 1e-12) : Math.floor(q + 1e-12)) * sig
      }
      case 'TRUNC': { const [x, d = 0] = node.args.map(a => run(a, get)); const f = 10 ** d; return x == null ? null : Math.trunc(x * f) / f }
      case 'MOD': { const [x, n] = node.args.map(a => run(a, get)); if (!n) throw new Error('#DIV/0'); return x == null ? null : x - n * Math.floor(x / n) }
      default: throw new Error(`unknown function ${node.fn}`)
    }
  }
  if (node.op === '&') { const t = x => (x?.ref ? get(split(x.ref)) : run(x, get)); const a2 = t(node.a), b2 = t(node.b); return `${a2 ?? ''}${b2 ?? ''}` }
  // A comparison also reads text (=A2="Revenue", case-insensitive like Excel).
  if (['<', '>', '<=', '>=', '=', '<>'].includes(node.op) && [node.a, node.b].some(x => x.str != null || x.ref)) {
    const t = x => { const v = x?.ref ? raw(get(split(x.ref))) : run(x, get); return typeof v === 'string' ? v.toLowerCase() : v }
    const a2 = t(node.a), b2 = t(node.b)
    if (typeof a2 === 'string' || typeof b2 === 'string') {
      const r = { '<': a2 < b2, '>': a2 > b2, '<=': a2 <= b2, '>=': a2 >= b2, '=': (a2 ?? '') === (b2 ?? ''), '<>': (a2 ?? '') !== (b2 ?? '') }[node.op]
      return r ? 1 : 0
    }
  }
  const a = run(node.a, get)
  if (node.op === 'neg') return a == null ? null : -a
  const b = run(node.b, get)
  if (a == null || b == null) return null
  switch (node.op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': if (b === 0) throw new Error('#DIV/0'); return a / b
    case '^': return a ** b
    case '<': return a < b ? 1 : 0
    case '>': return a > b ? 1 : 0
    case '<=': return a <= b ? 1 : 0
    case '>=': return a >= b ? 1 : 0
    case '=': return a === b ? 1 : 0
    case '<>': return a !== b ? 1 : 0
    default: throw new Error(`unknown operator ${node.op}`)
  }
}

function scalar(v) {
  if (v && typeof v === 'object' && 'error' in v) throw new Error(v.error)
  return v == null || !Number.isFinite(v) ? null : v
}

// A cell as is (number, text or empty); a faulty cell propagates its error.
function raw(v) {
  if (v && typeof v === 'object' && 'error' in v) throw new Error(v.error)
  return v === '' || v === undefined ? null : v
}

// A range as rows of raw values (text included).
function rangeGrid([from, to], get) {
  const a = split(from)
  const b = split(to)
  const out = []
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
    const line = []
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) line.push(raw(get({ col: c, row: r })))
    out.push(line)
  }
  return out
}

// Excel lookup equality: case-insensitive text, exact number.
const same = (x, v) => (typeof x === 'string' && typeof v === 'string' ? x.toLowerCase() === v.toLowerCase() : x != null && x === v)

/**
 * Turns an Excel criterion (SUMIF, COUNTIF...) into a predicate: 10, ">10", "<>0", "<=2024",
 * "Rev*" (wildcards * and ?, case-insensitive), "" (empty), "<>" (not empty).
 */
export function criterion(c) {
  if (typeof c === 'number') return v => v === c
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(String(c ?? ''))
  const op = m[1] ?? '=', rhs = m[2]
  if (rhs === '') return op === '<>' ? v => v != null && v !== '' : v => v == null || v === ''
  const n = rhs.trim() !== '' && Number.isFinite(Number(rhs)) ? Number(rhs) : null
  const cmp = (a, b) => ({ '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b })[op]
  if (n != null) return v => (typeof v === 'number' ? cmp(v, n) : op === '<>')
  if (op === '=' || op === '<>') {
    const re = new RegExp(`^${rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    return op === '=' ? v => v != null && re.test(String(v)) : v => !(v != null && re.test(String(v)))
  }
  return v => typeof v === 'string' && cmp(v.toLowerCase(), rhs.toLowerCase())
}

// Aggregates a conditional over the matched cells (empty cells and text do not count).
function aggregateIf(fn, hit) {
  if (fn.startsWith('COUNT')) return hit.length
  const ns = hit.filter(v => typeof v === 'number')
  if (fn.startsWith('SUM')) return ns.reduce((s, v) => s + v, 0)
  if (fn.startsWith('MIN')) return ns.length ? Math.min(...ns) : 0
  if (fn.startsWith('MAX')) return ns.length ? Math.max(...ns) : 0
  if (!ns.length) throw new Error('#DIV/0')
  return ns.reduce((s, v) => s + v, 0) / ns.length
}

function rangeValues([from, to], get) {
  const a = split(from)
  const b = split(to)
  const out = []
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(scalar(get({ col: c, row: r })))
  }
  return out
}

/** Whether an input is a formula. */
export const isFormula = raw => /^\s*=/.test(String(raw ?? ''))

/**
 * Evaluates a cell formula. `get({ col, row })` returns a cell's value
 * (col 0 = A, row 1 = row 1), null when empty, { error } when the cell itself
 * is faulty. Returns { value } or { error }.
 */
export function evaluateCell(raw, get) {
  try {
    const v = run(parse(tokenize(raw)), get)
    // A text formula returns text (a number column flags it as an error, like Excel).
    return { value: typeof v === 'string' ? v : v == null || !Number.isFinite(v) ? null : v }
  } catch (e) {
    return { error: e.message.startsWith('#') ? e.message : e.message || '#ERROR' }
  }
}

/**
 * Copies a formula shifted by (dCol, dRow): relative references move,
 * $-anchored ones stay (Excel's "Fill right").
 */
export function shiftFormula(raw, dCol, dRow) {
  if (!isFormula(raw)) return raw
  // Quoted text (a criterion like "B2") does not move.
  return String(raw).split(/("[^"]*")/).map(part => (part.startsWith('"') ? part : part.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (m, dc, letters, dr, digits, offset, whole) => {
    const before = whole.slice(0, offset)
    // A function name (SUM..., LOG10) is not a reference.
    if (/[A-Za-z.]$/.test(before) || /^\s*\(/.test(whole.slice(offset + m.length))) return m
    const c = dc ? colIndex(letters) : colIndex(letters) + dCol
    const r = dr ? Number(digits) : Number(digits) + dRow
    if (c < 0 || r < 1) return '#REF'
    return `${dc}${colLetter(c)}${dr}${r}`
  }))).join('')
}
