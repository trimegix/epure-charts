// The editing interface speaks the chart's language: every word a reader or an editor
// sees in a menu, a format bar, a tooltip or a message goes through t() (src/locale.js).
//
// 1. A static scan of every .jsx in src/: an English string written in the code (JSX text,
//    a label / title / aria-label / placeholder, a menu entry, a control's tooltip…) that
//    does not go through t() fails the test, and so does a t() key with no French entry.
// 2. Rendered views in locale 'fr' no longer carry the English words of the interface.
//
// The scan parses with espree (the parser ESLint already installs), so it reads the real
// syntax tree: strings inside t(…) calls, imports, class names, styles, CSS values and
// identifiers (lowercase ids such as 'stacked100' or 'value-axis') are not text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import * as espree from 'espree'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { hasWord } from './locale.js'
import WaterfallView from './WaterfallView.jsx'
import ChartView from './ChartView.jsx'
import BarhView from './BarhView.jsx'
import PieView from './PieView.jsx'

const SRC = fileURLToPath(new URL('.', import.meta.url))

// Strings that are not English for a reader, kept as they are in every language:
// symbols, units, number samples and proper names. Matched against the whole string.
const EXCEPTIONS = new Set([
  // Keyboard keys and shortcuts (written the same in French), and KeyboardEvent.key names.
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Ctrl+Z', 'Ctrl+Y', 'Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'Ctrl+D', 'Del', 'F2', 'Esc', 'Enter', 'Tab', 'Shift',
  // Proper names: chart types named after their inventors, font families, file formats.
  'Gantt', 'Mekko',
  'Inter', 'Arial', 'Georgia', 'Helvetica', 'Calibri', 'Times New Roman', 'Courier New', 'Verdana', 'Roboto',
  'SVG', 'PNG', 'CSV', 'JSON', 'TSV',
  // The engine's prefix in console messages (developer output, never on screen).
  '[epure-charts]',
])

// Object keys / JSX attributes whose string is never shown as text.
const NOT_TEXT_KEYS = new Set([
  'className', 'class', 'key', 'id', 'style', 'role', 'type', 'd', 'fill', 'stroke', 'transform', 'href', 'xlinkHref',
  'value', 'kind', 'mode', 'cursor', 'display', 'position', 'textAnchor', 'dominantBaseline', 'fontFamily', 'fontWeight',
  'fontStyle', 'whiteSpace', 'overflow', 'textOverflow', 'justifyContent', 'alignItems', 'flexDirection', 'flexWrap',
  'background', 'color', 'border', 'borderBottom', 'borderTop', 'borderLeft', 'borderRight', 'boxShadow', 'outline', 'font',
  'pointerEvents', 'userSelect', 'textDecoration', 'textTransform', 'visibility', 'gridTemplateColumns', 'transition',
  'margin', 'padding', 'width', 'height', 'inputMode', 'autoComplete', 'tone', 'mark', 'shape', 'icon', 'data-testid',
  'aria-haspopup', 'aria-live', 'aria-hidden', 'aria-orientation', 'strokeDasharray', 'strokeLinecap', 'strokeLinejoin',
  'vectorEffect', 'paintOrder', 'preserveAspectRatio', 'fontVariantNumeric', 'clipPath', 'mask', 'filter',
])
// Calls whose string arguments are never shown as text (developer output, DOM queries, ids).
const NOT_TEXT_CALLS = /^(console\.\w+|.*\.(querySelector|querySelectorAll|closest|getElementById|addEventListener|removeEventListener|getPropertyValue|setProperty|setAttribute|getAttribute|startsWith|endsWith|includes|split|join|replace|replaceAll|match|test|indexOf|padStart|padEnd|toLocaleString|setFmt|setPref|setL|setY|setX|setLabels|setSeries|setData)|require|import|Symbol\.for|RegExp|new RegExp|Error|createElement|tok|tokenOf|Number|parseFloat)$/

// A string reads as English text when it holds a capitalised word ("Reset") or two words
// with a space ("value labels"). Ids ('stacked100', 'value-axis'), CSS ('flex-start',
// '0 0 4px'), paths ('yAxis.left') and number samples ('1,234.5') do not.
const isText = s => {
  const v = s.replace(/\s+/g, ' ').trim()
  if (!v || EXCEPTIONS.has(v)) return false
  if (/^((Ctrl|Alt|Shift|Cmd|Ins|Del|Tab|Esc|Enter|F\d{1,2}|[A-Z0-9↑↓←→])[+ /]*)+$/.test(v)) return false // a keyboard shortcut
  if (/^[a-z][\w-]*(\.[\w-]+)*$/.test(v)) return false // id or path
  if (/^(var|calc|rgba?|hsla?|url|translate|rotate|scale|matrix|repeat|minmax|linear-gradient|color-mix)\(|var\(--/.test(v)) return false
  if (/^('[^']*'|[dmyqwhs]+|[\s.,/-])+$/i.test(v)) return false // a date format ('d mmm yyyy', "'FY'yy")
  if (/^[\d\s.,%+\-−()×x€$£#:;/|·…–—'"*<>=_^!?]*$/i.test(v.replace(/\b(px|em|rem|ms|s|deg|vh|vw|fr|auto|none|solid|dashed|dotted|M|k|bn|pp|pts?|bps?)\b/g, ''))) return false
  return /\b[A-Z][a-z]{2,}/.test(v) || /[A-Za-z]{2,}[ ’'][A-Za-z]{2,}/.test(v) || /^[A-Z][a-z]+$/.test(v)
}

const calleeName = n => {
  if (!n) return ''
  if (n.type === 'Identifier') return n.name
  if (n.type === 'MemberExpression') return `${calleeName(n.object)}.${n.property.name ?? ''}`
  return ''
}
const isT = c => c?.type === 'CallExpression' && /^(t|tr)$/.test(calleeName(c.callee))
const attrName = n => (n.name.type === 'JSXNamespacedName' ? `${n.name.namespace.name}:${n.name.name.name}` : n.name.name)
const propName = p => (p.key?.type === 'Identifier' ? p.key.name : p.key?.type === 'Literal' ? String(p.key.value) : '')

/** The English strings written in the code of one .jsx file, outside t(): [{ line, text }]. */
export function hardCoded(code) {
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true, comment: false })
  const out = []
  const keys = []
  const visit = (node, parent, skip) => {
    if (!node || typeof node.type !== 'string') return
    let mute = skip
    switch (node.type) {
      case 'ImportDeclaration': case 'ExportAllDeclaration': case 'ImportExpression': return
      case 'CallExpression': {
        const name = calleeName(node.callee)
        if (isT(node)) {
          const k = node.arguments[0]
          if (k?.type === 'Literal' && typeof k.value === 'string') keys.push({ line: k.loc.start.line, text: k.value })
          for (const a of node.arguments.slice(1)) visit(a, node, skip) // interpolated values are checked too
          return
        }
        // Only the arguments of these calls are not text: the receiver still is ([…].join(' · ')).
        if (NOT_TEXT_CALLS.test(name)) { visit(node.callee, node, skip); for (const a of node.arguments) visit(a, node, true); return }
        break
      }
      case 'NewExpression': if (/^(RegExp|Error|Set|Map)$/.test(calleeName(node.callee))) mute = true; break
      case 'BinaryExpression': if (/^[!=]==?$|^(in|instanceof)$/.test(node.operator)) mute = true; break
      case 'SwitchCase': visit(node.consequent, node, skip); for (const s of node.consequent) visit(s, node, skip); return
      case 'MemberExpression': if (node.computed) visit(node.property, node, true); visit(node.object, node, skip); return
      case 'Property': if (NOT_TEXT_KEYS.has(propName(node))) mute = true; if (!node.computed) { visit(node.value, node, mute); return } break
      case 'JSXAttribute': if (NOT_TEXT_KEYS.has(attrName(node))) return; break
      case 'JSXText': if (!skip && isText(node.value)) out.push({ line: node.loc.start.line, text: node.value.replace(/\s+/g, ' ').trim() }); return
      case 'Literal': if (!skip && typeof node.value === 'string' && isText(node.value)) out.push({ line: node.loc.start.line, text: node.value }); return
      case 'TemplateElement': if (!skip && isText(node.value.cooked ?? '')) out.push({ line: node.loc.start.line, text: node.value.cooked }); return
      case 'TaggedTemplateExpression': return
      default: break
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range' || k === 'parent') continue
      const v = node[k]
      if (Array.isArray(v)) v.forEach(c => visit(c, node, mute))
      else if (v && typeof v.type === 'string') visit(v, node, mute)
    }
  }
  visit(ast, null, false)
  return { strings: out, keys }
}

const files = readdirSync(SRC).filter(f => f.endsWith('.jsx')).sort()

test('no English string written in the editing interface outside t()', () => {
  const found = []
  for (const f of files) for (const s of hardCoded(readFileSync(join(SRC, f), 'utf8')).strings) found.push(`${f}:${s.line}  ${JSON.stringify(s.text)}`)
  assert.deepEqual(found, [], `hard-coded English strings (wrap them in t(…), or list a symbol / proper name in EXCEPTIONS):\n  ${found.join('\n  ')}`)
})

test('every t() key of the interface has its French entry', () => {
  const missing = []
  for (const f of files) for (const k of hardCoded(readFileSync(join(SRC, f), 'utf8')).keys) if (isText(k.text) && !hasWord(k.text, 'fr')) missing.push(`${f}:${k.line}  ${JSON.stringify(k.text)}`)
  assert.deepEqual(missing, [], `t() keys without a French entry in src/locale.js:\n  ${missing.join('\n  ')}`)
})

test('the scan itself: hard-coded text is caught, t() and ids are not', () => {
  const { strings } = hardCoded(`
    const a = <button title="Close" aria-label={t('Close', loc)} className="chart-x">Reset</button>
    const items = [{ label: 'Open data sheet', key: 'open-sheet' }, { label: t('Undo', loc), shortcut: 'Ctrl+Z' }]
    const ctl = ['scale', null, v, \`Scale of \${name}\`, null]
    const ok = mode === 'Format chart' ? 'stacked100' : 'value-axis'
  `)
  assert.deepEqual(strings.map(s => s.text), ['Close', 'Reset', 'Open data sheet', 'Scale of '])
})

// ── Rendered in French ──────────────────────────────────────────────────────
const ENGLISH = ['Format…', 'Open data sheet', 'Reset formatting', 'No data for this bridge yet', 'This chart definition is invalid', 'No data for this chart yet', 'Chart format', 'Bridge format', 'Double-click']
const noEnglish = (html, what) => { for (const w of ENGLISH) assert.ok(!html.includes(w), `${what}: "${w}" left in English`) }
const bridge = { unit: 'M', steps: [
  { key: 'start', label: 'Entry', kind: 'anchor', value: 200, tone: 'anchor' },
  { key: 'growth', label: 'Growth', kind: 'delta', value: 40, tone: 'positive' },
  { key: 'end', label: 'Exit', kind: 'total', value: 0, tone: 'anchor' },
] }

test('a waterfall in French: format button, empty state and invalid definition in French', () => {
  const html = renderToString(h(WaterfallView, { spec: { id: 'fr-wf', title: 'Pont', locale: 'fr' }, bridge, width: 480 }))
  assert.match(html, /class="chart-opts-btn"/, 'the format button is there (edit mode)')
  assert.match(html, /aria-label="Mise en forme du pont"/)
  noEnglish(html, 'waterfall')
  const empty = renderToString(h(WaterfallView, { spec: { id: 'fr-wf0', title: 'Pont', locale: 'fr' }, bridge: { unit: 'M', steps: [] }, width: 480 }))
  assert.match(empty, /Pas encore de données pour ce pont/)
  noEnglish(empty, 'empty waterfall')
  const bad = renderToString(h(WaterfallView, { spec: { id: 'fr-wf1', title: 'Pont', locale: 'fr', unit: 42 }, bridge, width: 480 }))
  if (/chart-engine-error/.test(bad)) assert.match(bad, /Cette définition de graphique n’est pas valide/)
  noEnglish(bad, 'invalid waterfall')
})

test('a cartesian chart in French: empty state, invalid definition, format button', () => {
  const spec = { id: 'fr-c', title: 'Ventes', locale: 'fr', x: { grain: 'year' }, series: [{ id: 'a', mark: 'bar' }] }
  const resolved = [{ label: 'A', unit: 'M', points: [{ x: '2024', y: 1, type: 'actual' }, { x: '2025', y: 2, type: 'actual' }] }]
  const html = renderToString(h(ChartView, { spec, resolved, width: 480 }))
  assert.match(html, /aria-label="Mise en forme du graphique"/)
  noEnglish(html, 'chart')
  const empty = renderToString(h(ChartView, { spec, resolved: [{ label: 'A', unit: 'M', points: [] }], width: 480 }))
  noEnglish(empty, 'empty chart')
  const bad = renderToString(h(ChartView, { spec: { ...spec, x: { grain: 'fortnight' } }, resolved, width: 480 }))
  assert.match(bad, /Cette définition de graphique n’est pas valide/)
  noEnglish(bad, 'invalid chart')
})

test('other views in French, and English stays the default', () => {
  const bars = [{ label: 'A', unit: 'M', points: [{ x: 'North', y: 3 }, { x: 'South', y: 2 }] }]
  noEnglish(renderToString(h(BarhView, { spec: { id: 'fr-bh', title: 'Régions', locale: 'fr' }, resolved: [], width: 480 })), 'empty bars')
  noEnglish(renderToString(h(PieView, { spec: { id: 'fr-pie', title: 'Parts', locale: 'fr' }, resolved: [], width: 480 })), 'empty pie')
  const en = renderToString(h(WaterfallView, { spec: { id: 'en-wf0', title: 'Bridge' }, bridge: { unit: 'M', steps: [] }, width: 480 }))
  assert.match(en, /No data for this bridge yet/)
  assert.match(renderToString(h(ChartView, { spec: { id: 'en-c', title: 'Sales', x: { grain: 'year' }, series: [{ id: 'a', mark: 'bar' }] }, resolved: bars, width: 480 })), /aria-label="Chart format"/)
})
