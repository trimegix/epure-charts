// Free style: custom color, recent colors, named schemes
// and style file, font, size in points, checkbox symbols.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// An in-memory localStorage, set BEFORE the module loads (lazy read).
const mem = new Map()
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) }

const S = await import('./customStyle.js')
const { buildScene } = await import('./scene.js')
const { applyReading, readingDefaults, schemeColors } = await import('./reading.js')
const { validateSpec } = await import('./spec.js')

const H = (...p) => ['#', ...p].join('') // a hex, written in pieces (design lint convention)

test('color: token → var(--…), hex → as is; hex and RGB input normalized', () => {
  assert.equal(S.tok('cat-1'), 'var(--cat-1)')
  assert.equal(S.tok(H('1f6f8b')), H('1f6f8b'))
  assert.equal(S.normHex('ABC'), H('aabbcc'))
  assert.equal(S.normHex(H('1F6F8B')), H('1f6f8b'))
  assert.equal(S.normHex('rgb(255, 0, 16)'), H('ff0010'))
  assert.equal(S.normHex('12,34,56'), H('0c2238'))
  assert.equal(S.normHex('300,0,0'), null)
  assert.equal(S.normHex('teal'), null)
  assert.equal(S.colorId(H('aabbcc')), 'xaabbcc')
  assert.equal(S.colorId('cat-1'), 'cat-1')
  assert.ok(S.isLightHex(H('f5f0e1')))
  assert.ok(!S.isLightHex(H('1f2a44')))
  assert.ok(!S.isLightHex('gray-100'))
})

test('recent colors: first, no duplicates, at most 8, kept per browser', () => {
  for (let i = 0; i < 10; i++) S.pushRecent(H(`0000${String(i).padStart(2, '0')}`))
  S.pushRecent(H('000003'))
  const r = S.recentColors()
  assert.equal(r.length, S.RECENT_MAX)
  assert.equal(r[0], H('000003'))
  assert.equal(new Set(r).size, r.length)
  assert.deepEqual(JSON.parse(mem.get('epure-chart-recent-colors')), r)
  assert.equal(S.recentColors(), S.recentColors()) // stable snapshot (useSyncExternalStore)
})

test('named schemes: save, replace, delete; JSON style file round trip', () => {
  S.saveScheme('Brand', [H('112233'), 'cat-2', 'nope!'])
  S.saveScheme('Brand', [H('112233'), H('445566')])
  S.saveScheme('Grays', ['gray-800', 'gray-400'])
  assert.deepEqual(S.customSchemes().map(s => s.name), ['Brand', 'Grays'])
  assert.deepEqual(S.customSchemes()[0].colors, [H('112233'), H('445566')])
  const file = S.exportStyleFile()
  S.deleteScheme('Brand')
  assert.deepEqual(S.customSchemes().map(s => s.name), ['Grays'])
  S.importStyleFile(file)
  assert.deepEqual(S.customSchemes().map(s => s.name), ['Grays', 'Brand'])
  assert.throws(() => S.parseStyleFile('{nope'), /JSON/)
  assert.throws(() => S.parseStyleFile('{"schemes":[{"name":"x","colors":[]}]}'), /No valid/)
  assert.deepEqual(S.parseStyleFile(JSON.stringify([{ name: 'A', colors: ['FFF'] }])), [{ name: 'A', colors: [H('ffffff')] }])
})

test('font: system stacks and bundled fonts, never a URL; unknown → figure font', () => {
  assert.equal(S.fontFamily(null), 'var(--font-mono)')
  assert.equal(S.fontFamily('mono'), 'var(--font-mono)')
  assert.match(S.fontFamily('serif'), /serif$/)
  assert.equal(S.fontFamily('Comic'), 'var(--font-mono)')
  for (const [, , css] of S.FONTS) assert.ok(!/url\(|https?:/.test(css))
})

test('size: step or points (1 pt = 4/3 px), clamped to 4–72', () => {
  assert.equal(S.sizePx(12, 10, { large: 1.2 }), 16)
  assert.equal(S.sizePx('large', 10, { large: 1.2 }), 12)
  assert.equal(S.sizePx(null, 10, {}), 10)
  assert.equal(S.sizePx(200, 10, {}), 10)
})

test('free checkbox symbols: one or two characters, otherwise the drawn mark', () => {
  assert.equal(S.checkSymbol('yes', { yes: ' ★ ' }), '★')
  assert.equal(S.checkSymbol('no', { yes: '★' }), null)
  assert.equal(S.checkSymbol('no', { no: 'NOPE' }), 'NO')
})

// ── The chart reads these settings ───────────────────────────────────────────
const pts = pairs => pairs.map(([x, y]) => ({ x, y }))
const SPEC = format => ({
  id: 'cs', version: 1, kind: 'cartesian', scope: 'shared', x: { grain: 'year', range: 'all' },
  series: [
    { id: 'a', ref: { metric: 'sales', source: 'actual' }, mark: 'bar', labels: 'all', style: { color: H('f5f0e1') } },
    { id: 'b', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar', style: { color: 'cat-2' } },
  ],
  bars: 'stacked',
  format,
})
const RES = [
  { label: 'A', unit: 'M', role: 'actual', points: pts([['2023', 100], ['2024', 120]]) },
  { label: 'B', unit: 'M', role: 'actual', points: pts([['2023', 40], ['2024', 50]]) },
]
const OPTS = { width: 640, height: 300 }

test('scene: a hex passes as is; black figure on a light hex', () => {
  const sc = buildScene(SPEC({ labels: { position: 'inside' } }), RES, OPTS)
  const bar = sc.bars.find(b => b.seriesId === 'a')
  assert.equal(bar.color, H('f5f0e1'))
  const inBar = sc.labels.filter(l => l.on === H('f5f0e1'))
  assert.ok(inBar.length > 0)
  assert.ok(inBar.every(l => l.color === 'black'))
})

test('scene: free font and size for all labels, then for a single one', () => {
  const sc = buildScene(SPEC({ labels: { font: 'serif', size: 15, styles: { 'a|2024': { font: 'code', size: 9 } } } }), RES, OPTS)
  const all = sc.labels.filter(l => l.key?.startsWith('a|'))
  const one = all.find(l => l.key === 'a|2024')
  const other = all.find(l => l.key === 'a|2023')
  assert.equal(other.font, 'serif')
  assert.equal(other.size, 20)
  assert.equal(one.font, 'code')
  assert.equal(one.size, 12)
})

test('applied named scheme: its colors go to the series, in order', () => {
  const spec = SPEC()
  const custom = { scheme: 'custom', customScheme: { name: 'Brand', colors: [H('112233'), H('445566')] } }
  assert.deepEqual(schemeColors(custom), [H('112233'), H('445566')])
  assert.deepEqual(schemeColors({ scheme: 'gray' }).slice(0, 1), ['gray-800'])
  const eff = applyReading(spec, { ...readingDefaults(spec), format: custom })
  assert.deepEqual(eff.series.map(s => s.style.color), [H('112233'), H('445566')])
})

test('validation: a chart spec may carry a hex where a token is allowed', () => {
  const spec = SPEC()
  spec.series[1].style = { color: 'cat-2', stroke: H('202020'), points: { 2024: H('a0a0a0') } }
  assert.ok(!validateSpec(spec).some(e => /style\.(color|stroke|points)/.test(e)))
  spec.series[1].style = { color: 'cat-2', stroke: 'nope' }
  assert.ok(validateSpec(spec).some(e => e.includes('style.stroke')))
})

test('automatic contrast on hex: light → black in the bar; dark → white text in a table', () => {
  assert.equal(S.inkOn(H('f5f0e1')), 'black')
  assert.equal(S.inkOn(H('1f2a44')), 'white')
  assert.equal(S.inkOn('cat-1'), 'white')
  assert.equal(S.inkOnDark(H('1f2a44')), 'white')
  assert.equal(S.inkOnDark(H('f5f0e1')), null)
  assert.equal(S.inkOnDark('cat-1'), null)
})

test('label style and scheme by keys (all types)', () => {
  assert.deepEqual(S.labelTextStyle({}), {})
  assert.deepEqual(S.labelTextStyle({ labelFont: 'serif', labelPt: 9 }), { fontFamily: S.fontFamily('serif'), fontSize: 12 })
  assert.deepEqual(S.labelTextStyle({ labelFont: 'Comic', labelPt: 500 }), {})
  assert.equal(S.styleSummary({ labelFont: 'serif', labelPt: 9 }), 'Style: Serif · 9 pt')
  assert.deepEqual(S.schemeMap(['a', 'b', 'c'], ['x', 'y']), { a: 'x', b: 'y', c: 'x' })
  assert.deepEqual(S.schemeMap(['a'], []), {})
})

// ── The scenes of the other types: automatic contrast on light / dark hex ──
const { buildPieScene } = await import('./pieScene.js')
const { buildMekkoScene } = await import('./mekkoScene.js')
const { buildTableScene } = await import('./tableScene.js')

test('pie: black inside figure on a light hex slice', () => {
  const sc = buildPieScene({ labels: 'inside' }, [{ key: 'a', label: 'A', value: 60, color: H('f5f0e1') }, { key: 'b', label: 'B', value: 40, color: 'cat-2' }], { width: 400, height: 300 })
  assert.equal(sc.labels.find(l => l.key === 'a')?.color, 'black')
  assert.equal(sc.labels.find(l => l.key === 'b')?.color, 'white')
})

test('table: white text on a dark hex fill, chosen ink kept', () => {
  const cols = [{ key: 'v', label: 'V', type: 'number' }]
  const rows = [{ key: 'r1', label: 'R1', cells: { v: 1 } }, { key: 'r2', label: 'R2', cells: { v: 2 } }]
  const sc = buildTableScene({ fills: { 'r1|v': H('1f2a44'), 'r2|v': H('1f2a44') }, colors: { 'r2|v': 'gold' } }, cols, rows, { width: 300 })
  assert.equal(sc.cells.find(c => c.row === 'r1' && c.col === 'v').color, 'white')
  assert.equal(sc.cells.find(c => c.row === 'r2' && c.col === 'v').color, 'gold')
})

test('mekko: black figure in a light hex segment', () => {
  const spec = { series: [{ id: 's1', label: 'S1', color: H('f5f0e1') }, { id: 's2', label: 'S2', color: 'cat-2' }] }
  const cols = [{ key: 'c1', label: 'C1', values: { s1: 60, s2: 40 } }, { key: 'c2', label: 'C2', values: { s1: 50, s2: 50 } }]
  const sc = buildMekkoScene(spec, cols, { width: 500, height: 320 })
  const l1 = sc.labels.filter(l => l.key.endsWith('|s1'))
  assert.ok(l1.length > 0)
  assert.ok(l1.every(l => l.color === 'black'))
})

// ── Invalid input reported, portable schemes, exported file name ──
test('color input: readable → hex, empty → nothing, unreadable → message (nothing applied)', () => {
  assert.deepEqual(S.parseColorInput(' #08F '), { hex: H('0088ff') })
  assert.deepEqual(S.parseColorInput('0,128,255'), { hex: H('0080ff') })
  assert.deepEqual(S.parseColorInput(''), { empty: true })
  assert.deepEqual(S.parseColorInput('zzz'), { error: S.COLOR_HINT })
  assert.deepEqual(S.parseColorInput('300,0,0'), { error: S.COLOR_HINT })
})

test('size in points: half-points, clamped and reported when out of bounds, error if not a number', () => {
  assert.deepEqual(S.parsePt('14'), { value: 14 })
  assert.deepEqual(S.parsePt('10,26 pt'), { value: 10.5 })
  assert.deepEqual(S.parsePt(''), { empty: true })
  assert.deepEqual(S.parsePt('200'), { value: S.PT_MAX, note: `Limited to ${S.PT_MAX} pt` })
  assert.deepEqual(S.parsePt('-3'), { value: S.PT_MIN, note: `Limited to ${S.PT_MIN} pt` })
  assert.match(S.parsePt('abc').error, /Expected a number/)
})

test('import: a non-conforming JSON is rejected with a readable message', () => {
  assert.throws(() => S.parseStyleFile('{"foo":1}'), /Not a chart style file/)
  assert.throws(() => S.parseStyleFile('hello'), /Not a chart style file/)
  assert.throws(() => S.parseStyleFile('{"schemes":[{"name":"","colors":["#fff"]}]}'), /No valid/)
})

test('saved scheme: tokens resolved to hex (portable), unreadable → token kept', () => {
  const read = t => ({ 'gray-700': 'rgb(64, 64, 64)', 'cat-2': H('2E6FB0') })[t] ?? ''
  assert.deepEqual(S.resolveColors(['gray-700', 'cat-2', H('112233'), 'nope'], read), [H('404040'), H('2e6fb0'), H('112233'), 'nope'])
  assert.deepEqual(S.resolveColors(['cat-1'], () => { throw new Error('no DOM') }), ['cat-1'])
})

test('exported file: "<name>.chart-style.json", sanitized name', () => {
  assert.equal(S.styleFileName('Fund A'), 'Fund-A.chart-style.json')
  assert.equal(S.styleFileName('Série ../ été/2026'), 'Serie-ete-2026.chart-style.json')
  assert.equal(S.styleFileName(''), 'chart.chart-style.json')
  assert.equal(S.styleFileName('***'), 'chart.chart-style.json')
})

test('free label color: output as fill in the style, summarized in "Style"', () => {
  assert.equal(S.labelTextStyle({ labelColor: H('c0392b') }).fill, H('c0392b'))
  assert.equal(S.labelTextStyle({ labelColor: 'cat-1' }).fill, undefined)
  assert.match(S.styleSummary({ labelColor: H('c0392b') }), /c0392b/)
})

test('scene: a free (hex) label color takes precedence over the series color', () => {
  const sc = buildScene(SPEC({ labels: { position: 'outside', color: H('c0392b') } }), RES, OPTS)
  const out = sc.labels.filter(l => l.key?.startsWith('a|') && !l.on)
  assert.ok(out.length > 0)
  assert.ok(out.every(l => l.color === H('c0392b')))
})
