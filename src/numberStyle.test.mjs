import { test } from 'node:test'
import assert from 'node:assert/strict'
import { styleNumber, parseExample } from './numberStyle.js'

test('French-style separators', () => {
  assert.equal(styleNumber('€1234.5M', { thousands: 'space', decimal: 'comma' }), '€1 234,5M')
  assert.equal(styleNumber('€1,234.5k', { thousands: 'dot', decimal: 'comma' }), '€1.234,5k')
})
test('no thousands separator, no currency symbol', () => {
  assert.equal(styleNumber('€1,234M', { thousands: 'none', currency: false }), '1234M')
})
test('negatives in parentheses, prefix and suffix', () => {
  assert.equal(styleNumber('−€12M', { neg: 'paren' }), '(€12M)')
  assert.equal(styleNumber('€-12.0M', { neg: 'paren' }), '(€12.0M)')
  assert.equal(styleNumber('12%', { prefix: '~', suffix: ' FY' }), '~12% FY')
})
test('the "no data" dash is left untouched', () => {
  assert.equal(styleNumber('—', { prefix: 'x' }), '—')
})

test('format by example', async () => {
  const { parseExample } = await import('./numberStyle.js')
  assert.deepEqual(parseExample('€1 234,5M'), { decimal: 'comma', thousands: 'space', decimals: 1, magnitude: 'M', currency: true })
  assert.equal(parseExample('(1,234)').neg, 'paren')
  assert.equal(parseExample('+12.30%').plus, true)
  assert.equal(parseExample('+12.30%').decimals, 2)
  assert.equal(parseExample('+12.30%').percent, true)
})
test('plus sign, sign position, dash', async () => {
  const { styleNumber } = await import('./numberStyle.js')
  assert.equal(styleNumber('€12M', { plus: true }), '+€12M')
  assert.equal(styleNumber('−€12M', { signPos: 'value' }), '€−12M')
  assert.equal(styleNumber('−€12M', { minus: 'endash' }), '–€12M')
})
test('consistent rounding: the rounded parts sum to the rounded total', async () => {
  const { roundToSum } = await import('./numberStyle.js')
  const r = roundToSum([33.33, 33.33, 33.34], 0)
  assert.equal(r.reduce((a, b) => a + b, 0), 100)
})
test('prime notation', async () => {
  const { makeFormatter } = await import('./numberStyle.js')
  const f = makeFormatter(v => `€${v}M`, null, 'prime', null)
  assert.equal(f(12, 'M'), '€12.0′')
  assert.equal(f(1200, 'M'), '€1.2″')
})

test('format by example: literal parentheses around a prefix or suffix', () => {
  const a = parseExample('(€) 1,234')
  assert.equal(a.prefix, '(€) ')
  assert.equal(a.neg, undefined)
  const b = parseExample('1,234 (m)')
  assert.equal(b.suffix, ' (m)')
})

test('format by example "(1 234,5) M€": a single magnitude, currency after', async () => {
  const { makeFormatter } = await import('./numberStyle.js')
  const f = parseExample('(1 234,5) M€')
  assert.equal(f.magnitude, 'M'); assert.equal(f.currency, 'after'); assert.equal(f.suffix, undefined)
  const fmt = makeFormatter((v, u, d) => `€${v.toFixed(d ?? 0)}M`, f.decimals, f.magnitude, { thousands: f.thousands, decimal: f.decimal, neg: f.neg, magSpace: f.magSpace, currency: f.currency })
  assert.equal(fmt(173, 'M'), '173,0 M€')
  assert.equal(fmt(-12, 'M'), '(12,0 M€)')
})

test('Arabic decimal separator (٫) and date codes', async () => {
  const { styleNumber, parseExample, formatDateCodes } = await import('./numberStyle.js')
  assert.equal(styleNumber('€1,234.5M', { thousands: 'space', decimal: 'arabic' }), '€1 234٫5M')
  assert.equal(parseExample('1 234٫5').decimal, 'arabic')
  assert.equal(parseExample('1٫234').decimals, 3)
  const f = formatDateCodes
  assert.equal(f({ y: '2024', m: 3 }, "'Q'Q yy"), 'Q1 24')
  assert.equal(f({ y: '2024', m: 12 }, '"Quarter" QQQ'), 'Quarter IV')
  assert.equal(f({ y: '2024', m: 12 }, 'QQ'), 'iv')
  assert.equal(f({ y: '2024', m: 7 }, "MMM 'yy"), "Jul '24", "single apostrophe")
  assert.equal(f({ y: '2024', m: 7 }, "MMM ''yy"), "Jul '24", 'double apostrophe')
  assert.equal(f({ y: '2024', m: 7 }, '\\QQ'), 'Q3', 'backslash')
  assert.equal(f({ y: '2024', m: 2, d: 12 }, 'ddd¶dd'), 'Mon\n12', 'line break')
  assert.equal(f({ y: '2024', m: 2, d: 5 }, 'd dddd ddddd'), '5 Monday M')
  assert.equal(f({ y: '2024', m: 2, d: 12 }, 'w ww www wwww'), '7 07 Week 7 Week 07')
  assert.equal(f({ y: '2024', m: 9 }, 'M MM MMM MMMM MMMMM'), '9 09 Sep September S')
  assert.equal(f({ y: '2024', m: 3 }, 'mmm YYYY q'), 'Mar 2024 1', 'case-insensitive codes')
  assert.equal(f({ y: '2024' }, "'FY'yy"), 'FY24')
  assert.equal(f({ y: '2024' }, 'yy', true), '2024')
})

test('consistent rounding to the displayed format: labels sum to the displayed total', async () => {
  const { consistentRound } = await import('./numberStyle.js')
  const f0 = v => String(Math.round(v))
  const r = consistentRound([1.4, 1.4, 1.4], f0)
  assert.equal(r.reduce((a, b) => a + b, 0), 4, 'displayed total 4 = sum of labels')
  assert.deepEqual(r.map(f0).sort(), ['1', '1', '2'])
  const f1 = v => v.toFixed(1)
  const r1 = consistentRound([0.33, 0.33, 0.34], f1)
  assert.equal(f1(r1.reduce((a, b) => a + b, 0)), '1.0')
  assert.equal(consistentRound([5], f0), null, 'a single value: nothing to do')
})
