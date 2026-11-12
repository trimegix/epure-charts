import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCell, shiftFormula, colLetter, colIndex, isFormula } from './formula.js'

// A small sheet: row 2 = 100, 110, 121 in B, C, D; row 3 = 90, 100, empty.
const cells = { B2: 100, C2: 110, D2: 121, B3: 90, C3: 100 }
const get = ({ col, row }) => cells[`${colLetter(col)}${row}`] ?? null

test('A1 references, operators, precedence, power, percent', () => {
  assert.equal(evaluateCell('=C2-B2', get).value, 10)
  assert.ok(Math.abs(evaluateCell('=C2/B2-1', get).value - 0.1) < 1e-12)
  assert.equal(evaluateCell('=(B2+B3)*2', get).value, 380)
  assert.equal(evaluateCell('=2^3+10%', get).value, 8.1)
  assert.equal(evaluateCell('=$B$2+B3', get).value, 190)
})

test('functions and ranges; an empty cell is ignored by aggregates', () => {
  assert.equal(evaluateCell('=SUM(B2:D2)', get).value, 331)
  assert.equal(evaluateCell('=AVERAGE(B3:D3)', get).value, 95)
  assert.equal(evaluateCell('=MAX(B2:D3)', get).value, 121)
  assert.equal(evaluateCell('=COUNT(B3:D3)', get).value, 2)
  assert.equal(evaluateCell('=ROUND(C2/B3, 2)', get).value, 1.22)
  assert.equal(evaluateCell('=D3*2', get).value, null, 'empty cell: empty result')
})

test('errors: never an exception, never free evaluation', () => {
  assert.equal(evaluateCell('=B2/0', get).error, '#DIV/0')
  assert.ok(evaluateCell('=B2+', get).error)
  assert.ok(evaluateCell('=alert(1)', get).error)
  assert.ok(evaluateCell('=B2:C2', get).error, 'a bare range is not a number')
  const bad = ({ col, row }) => (col === 1 && row === 2 ? { error: '#CYCLE' } : null)
  assert.equal(evaluateCell('=B2+1', bad).error, '#CYCLE', 'an error propagates')
})

test('fill right: relative references move, $ references stay', () => {
  assert.equal(shiftFormula('=C2/B2-1', 1, 0), '=D2/C2-1')
  assert.equal(shiftFormula('=C2/$B$2', 2, 0), '=E2/$B$2')
  assert.equal(shiftFormula('=SUM(B2:C2)', 1, 0), '=SUM(C2:D2)')
  assert.equal(shiftFormula('12', 1, 0), '12')
  assert.equal(colLetter(26), 'AA')
  assert.equal(colIndex('AA'), 26)
  assert.ok(isFormula(' =A1'))
})

test('formulas: PRODUCT, MEDIAN, POWER, SQRT, MOD', async () => {
  const grid = { 'B2': 2, 'C2': 4, 'D2': 9 }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g).value
  assert.equal(ev('=PRODUCT(B2:D2)'), 72)
  assert.equal(ev('=MEDIAN(B2:D2)'), 4)
  assert.equal(ev('=POWER(B2,3)'), 8)
  assert.equal(ev('=SQRT(D2)'), 3)
  assert.equal(ev('=MOD(D2,4)'), 1)
})

test('logical formulas: IF, comparisons, AND/OR/NOT, IFERROR, ROUNDUP/ROUNDDOWN', () => {
  const grid = { B2: 10, C2: 0, D2: -3.14159 }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g).value
  assert.equal(ev('=IF(B2>5,1,2)'), 1)
  assert.equal(ev('=IF(B2<=5,1,2)'), 2)
  assert.equal(ev('=IF(AND(B2>5,C2=0),B2*2,0)'), 20)
  assert.equal(ev('=OR(B2<0,C2<>0)'), 0)
  assert.equal(ev('=NOT(C2)'), 1)
  assert.equal(ev('=IFERROR(B2/C2,99)'), 99)
  assert.equal(ev('=ROUNDUP(D2,2)'), -3.15)
  assert.equal(ev('=ROUNDDOWN(D2,1)'), -3.1)
  assert.equal(ev('=B2>=10'), 1)
})

test('lookup and rank: INDEX, MATCH, LARGE, SMALL, RANK', () => {
  const grid = { B2: 10, C2: 30, D2: 20 }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g).value
  assert.equal(ev('=INDEX(B2:D2,2)'), 30)
  assert.equal(ev('=MATCH(20,B2:D2,0)'), 3)
  assert.equal(ev('=LARGE(B2:D2,1)'), 30)
  assert.equal(ev('=SMALL(B2:D2,2)'), 20)
  assert.equal(ev('=RANK(20,B2:D2)'), 2)
  assert.equal(evaluateCell('=MATCH(99,B2:D2,0)', g).error, '#N/A')
})

test('dates: DATE, YEAR, MONTH, DAY, DAYS, EDATE (including on a date cell)', () => {
  const grid = { B2: '2025-03-15', C2: '2025-01-01' }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g).value
  assert.equal(ev('=YEAR(B2)'), 2025)
  assert.equal(ev('=MONTH(B2)'), 3)
  assert.equal(ev('=DAY(B2)'), 15)
  assert.equal(ev('=DAYS(B2,C2)'), 73)
  assert.equal(ev('=DAYS(DATE(2025,1,11),C2)'), 10)
  assert.equal(ev('=MONTH(EDATE(C2,14))'), 3)
})

test('text: quotes, &, CONCAT, LEFT/RIGHT/MID, LEN, UPPER, TRIM, TEXT, VALUE', () => {
  const grid = { A2: 'Alpha', B2: 0.1234, C2: '  M&A  deal ' }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g).value
  assert.equal(ev('="Fund "&A2'), 'Fund Alpha')
  assert.equal(ev('=CONCAT(A2," / ",LEFT(A2,2))'), 'Alpha / Al')
  assert.equal(ev('=RIGHT(A2,3)'), 'pha')
  assert.equal(ev('=MID(A2,2,3)'), 'lph')
  assert.equal(ev('=LEN(A2)'), 5)
  assert.equal(ev('=UPPER(A2)'), 'ALPHA')
  assert.equal(ev('=TRIM(C2)'), 'M&A deal')
  assert.equal(ev('=TEXT(B2,"0.0%")'), '12.3%')
  assert.equal(ev('=VALUE("1,234.5")'), 1234.5)
})

test('common Excel formulas: conditionals, lookups, statistics, math', async () => {
  const { criterion } = await import('./formula.js')
  // A = names, row 1 = headers (text); B, C = numbers.
  const grid = { A1: 'Line', B1: '2024', C1: '2025', A2: 'Revenue', B2: 100, C2: 120, A3: 'EBITDA', B3: 20, C3: 30, A4: 'Capex', B4: -5, C4: -8, A5: 'Rev. other', B5: 10, C5: null }
  const g = ({ col, row }) => grid[`${colLetter(col)}${row}`] ?? null
  const ev = f => evaluateCell(f, g)
  assert.equal(ev('=SUMIF(B2:B5,">0")').value, 130)
  assert.equal(ev('=SUMIF(A2:A5,"rev*",C2:C5)').value, 120, 'wildcard and case ignored; empty does not count')
  assert.equal(ev('=COUNTIF(B2:B5,"<>20")').value, 3)
  assert.equal(ev('=COUNTIF(C2:C5,"")').value, 1)
  assert.equal(ev('=AVERAGEIF(B2:B5,">=10")').value, (100 + 20 + 10) / 3)
  assert.equal(ev('=SUMIFS(C2:C5,B2:B5,">0",A2:A5,"<>EBITDA")').value, 120)
  assert.equal(ev('=COUNTIFS(B2:B5,">0",C2:C5,">25")').value, 2)
  assert.equal(ev('=MAXIFS(C2:C5,B2:B5,"<50")').value, 30)
  assert.equal(ev('=VLOOKUP("ebitda",A2:C5,3,FALSE)').value, 30)
  assert.equal(ev('=HLOOKUP("2025",A1:C3,2,0)').value, 120)
  assert.equal(ev('=XLOOKUP("Capex",A2:A5,B2:B5)').value, -5)
  assert.equal(ev('=XLOOKUP("Nope",A2:A5,B2:B5,0)').value, 0)
  assert.equal(ev('=VLOOKUP("Nope",A2:C5,2,FALSE)').error, '#N/A')
  assert.equal(ev('=VLOOKUP(15,B2:C5,2)').error, undefined)
  assert.equal(ev('=IF(A3="EBITDA",C3,0)').value, 30)
  assert.equal(ev('=CHOOSE(2,B2,B3,B4)').value, 20)
  assert.equal(ev('=IFS(B2>200,1,B2>50,2)').value, 2)
  assert.equal(ev('=COUNTA(A2:C5)').value, 11)
  assert.equal(ev('=COUNTBLANK(B2:C5)').value, 1)
  assert.equal(ev('=SUMPRODUCT(B2:B3,C2:C3)').value, 100 * 120 + 20 * 30)
  assert.ok(Math.abs(ev('=STDEV(2,4,4,4,5,5,7,9)').value - 2.138089935) < 1e-8)
  assert.equal(ev('=STDEV.P(2,4,4,4,5,5,7,9)').value, 2)
  assert.equal(ev('=VAR.P(2,4,4,4,5,5,7,9)').value, 4)
  assert.ok(Math.abs(ev('=LN(EXP(2))').value - 2) < 1e-12)
  assert.ok(Math.abs(ev('=LOG(1000)').value - 3) < 1e-12)
  assert.ok(Math.abs(ev('=LOG(8,2)').value - 3) < 1e-12)
  assert.ok(Math.abs(ev('=LOG10(B2)').value - 2) < 1e-12)
  assert.equal(ev('=LN(0)').error, '#NUM')
  assert.equal(ev('=CEILING(23,5)').value, 25)
  assert.equal(ev('=FLOOR(23,5)').value, 20)
  assert.equal(ev('=TRUNC(-2.789,1)').value, -2.7)
  assert.ok(Math.abs(ev('=PI()').value - Math.PI) < 1e-12)
  assert.equal(ev('=ISBLANK(C5)+ISNUMBER(B2)+ISTEXT(A2)').value, 3)
  assert.ok(criterion('>=2024')(2024) && !criterion('>=2024')(2023))
})

test('fill: neither function names (LOG10) nor quoted text move', () => {
  assert.equal(shiftFormula('=LOG10(B2)', 1, 0), '=LOG10(C2)')
  assert.equal(shiftFormula('=SUMIF(B2:B5,"B2",C2:C5)', 1, 0), '=SUMIF(C2:C5,"B2",D2:D5)')
})
