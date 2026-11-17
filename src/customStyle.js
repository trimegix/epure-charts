// ─── epure-charts · custom style, beyond the palette ────────────────────────
// Default rendering uses tokens; going beyond them is the user's choice:
//   · a color is a token ('cat-1') or a hex ('#1f6f8b'): tok() renders either;
//   · recent custom colors and named schemes are stored per browser
//     (localStorage), exportable as a local JSON file (the "style file"), no network;
//   · a font is picked from system stacks and the two bundled fonts,
//     never by URL; a free size is given in points.
// Pure (apart from guarded localStorage), tested under node --test.

// ── Colors ──────────────────────────────────────────────────────────────────
export const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Free input → '#rrggbb' (lowercase) or null: '#abc', 'abc', '#aabbcc', 'rgb(1, 2, 3)', '1,2,3'. */
export function normHex(raw) {
  const t = String(raw ?? '').trim().toLowerCase()
  if (!t) return null
  let m = t.match(/^#?([0-9a-f]{6})$/)
  if (m) return `#${m[1]}`
  m = t.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  m = t.match(/^(?:rgba?\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[, /]\s*[\d.]+%?\s*)?\)?$/)
  if (m) {
    const v = m.slice(1, 4).map(Number)
    if (v.every(x => x <= 255)) return `#${v.map(hex2).join('')}`
  }
  return null
}

/** Color input → { hex } if readable, { empty } if empty, otherwise { error } (the field's short message). */
export const COLOR_HINT = 'Expected #RRGGBB or R,G,B'
export function parseColorInput(raw) {
  if (String(raw ?? '').trim() === '') return { empty: true }
  const hex = normHex(raw)
  return hex ? { hex } : { error: COLOR_HINT }
}

/**
 * A token resolved to hex at save time (a scheme portable across themes):
 * read(token) returns the computed CSS value ("#1f6f8b", "rgb(31, 111, 139)"); unreadable → the token is kept.
 */
export function resolveColor(c, read) {
  if (isHex(c)) return c
  let v = null
  try { v = read?.(c) } catch { /* no DOM */ }
  return normHex(v) ?? c
}
export const resolveColors = (colors, read) => (Array.isArray(colors) ? colors.map(c => resolveColor(c, read)) : [])

// Semantic chart tokens: what a color MEANS (a gain, a drag, the plan…), themable by the
// host as --chart-*; each falls back on the engine palette when the host leaves it unset.
export const SEMANTIC_TOKENS = Object.freeze({
  'chart-pos': 'green', // value created, a positive step
  'chart-neg': 'red', // a drag, a negative step
  'chart-accent': 'gold', // the one highlighted element
  'chart-hypothesis': 'gold', // a hypothesis (plan, target, assumption)
  'chart-hypothesis-text': 'gold-dark',
  'chart-anchor': 'black', // totals and anchors of a bridge
  'chart-upside': 'blue-chart',
  'chart-gap': 'amber', // unreconciled
  'chart-actual': 'gray-700',
  'chart-plan': 'gold',
  'chart-ic': 'blue-chart',
  'chart-budget': 'gray-600',
  'chart-forecast': 'gray-300',
  'chart-neutral': 'gray-300', // everything but the accent, in single-accent mode
  'chart-neutral-ink': 'gray-500',
})
export const isSemantic = c => Object.prototype.hasOwnProperty.call(SEMANTIC_TOKENS, c)
/** A semantic token → the palette token it stands for by default (other colors unchanged). */
export const baseToken = c => (isSemantic(c) ? SEMANTIC_TOKENS[c] : c)

/** A color (token or hex) → its CSS value. A semantic token keeps its palette fallback. */
export const tok = c => (isHex(c) ? c : isSemantic(c) ? `var(--${c}, var(--${SEMANTIC_TOKENS[c]}))` : `var(--${c})`)

// ── Font sizes as tokens ──────────────────────────────────────────────────────
// Layout is computed at the engine's default sizes (11 px body, 10 px notes); the drawn
// size follows --chart-fs / --chart-fs-note, so a host can align the figures with its
// own type scale. Unset, the result is exactly the px size the layout assumed.
const FS_BASE = 11
const FS_NOTE = 10
const k3 = x => Math.round(x * 1000) / 1000
/** A body text size in px → its CSS value, scaled by --chart-fs. */
export function fs(px = FS_BASE) {
  if (!Number.isFinite(px)) return px
  return px === FS_BASE ? `var(--chart-fs, ${FS_BASE}px)` : `calc(var(--chart-fs, ${FS_BASE}px) * ${k3(px / FS_BASE)})`
}
/** A note size (source, footnote, axis notes) in px → its CSS value, scaled by --chart-fs-note. */
export function fsNote(px = FS_NOTE) {
  if (!Number.isFinite(px)) return px
  return px === FS_NOTE ? `var(--chart-fs-note, ${FS_NOTE}px)` : `calc(var(--chart-fs-note, ${FS_NOTE}px) * ${k3(px / FS_NOTE)})`
}

/** A color safe inside an SVG id (patterns): a hex's '#' is left out. */
export const colorId = c => String(c).replace(/^#/, 'x')

/** Relative luminance (WCAG) of a hex, 0..1; null for a token. */
export function luminance(c) {
  if (!isHex(c)) return null
  const ch = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
/** A light hex: a number drawn on it turns black (automatic contrast). */
export const isLightHex = c => isHex(c) && luminance(c) > 0.45
/** Ink for a number drawn inside a fill: black on a light hex, otherwise the intended ink. */
export const inkOn = (fill, ink = 'white') => (isLightHex(fill) ? 'black' : ink)
/** Cell text on a dark hex fill: white; otherwise nothing (default ink). */
export const inkOnDark = fill => (isHex(fill) && luminance(fill) < 0.18 ? 'white' : null)

// ── Per-browser storage, guarded (private mode, tests) ───────────────────────
const listeners = new Set()
const memo = new Map()
export function subscribeStyle(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Read once, sanitized, then memoized: the same snapshot as long as nothing changes (useSyncExternalStore).
function load(key, clean) {
  if (!memo.has(key)) {
    let v = []
    try { const raw = globalThis.localStorage?.getItem(key); if (raw) v = JSON.parse(raw) } catch { /* private mode */ }
    memo.set(key, clean(Array.isArray(v) ? v : []))
  }
  return memo.get(key)
}
function store(key, v) {
  memo.set(key, v)
  try { globalThis.localStorage?.setItem(key, JSON.stringify(v)) } catch { /* quota / private mode */ }
  for (const fn of listeners) fn()
}

// Recently used custom colors.
const RECENT_KEY = 'epure-chart-recent-colors'
export const RECENT_MAX = 8
export const recentColors = () => load(RECENT_KEY, l => l.filter(isHex).slice(0, RECENT_MAX))
/** Puts a hex at the top of the recent colors (no duplicates, 8 at most). */
export function pushRecent(c) {
  const h = normHex(c)
  if (!h) return recentColors()
  const next = [h, ...recentColors().filter(x => x !== h)].slice(0, RECENT_MAX)
  store(RECENT_KEY, next)
  return next
}

// ── Named fill schemes (custom fill schemes, style file) ──
const SCHEMES_KEY = 'epure-chart-fill-schemes'
const okColor = c => isHex(c) || (typeof c === 'string' && /^[a-z][a-z0-9-]*$/.test(c))
/** A valid scheme: { name, colors[] }; hex colors are normalized. */
export function cleanScheme(s) {
  const name = String(s?.name ?? '').trim().slice(0, 40)
  const colors = (Array.isArray(s?.colors) ? s.colors : []).map(c => normHex(c) ?? c).filter(okColor).slice(0, 24)
  return name && colors.length ? { name, colors } : null
}
export const customSchemes = () => load(SCHEMES_KEY, l => l.map(cleanScheme).filter(Boolean))
/** Adds or replaces (same name) schemes; returns the list. */
export function mergeSchemes(list, add) {
  const out = [...list]
  for (const s of add.map(cleanScheme).filter(Boolean)) {
    const i = out.findIndex(x => x.name === s.name)
    if (i >= 0) out[i] = s; else out.push(s)
  }
  return out
}
export function saveScheme(name, colors) { const next = mergeSchemes(customSchemes(), [{ name, colors }]); store(SCHEMES_KEY, next); return next }
export function deleteScheme(name) { const next = customSchemes().filter(s => s.name !== name); store(SCHEMES_KEY, next); return next }

// The style file: a local JSON file, exported and re-imported by hand.
export const STYLE_FILE_TYPE = 'epure-chart-style'
export const exportStyleFile = (schemes = customSchemes()) => JSON.stringify({ type: STYLE_FILE_TYPE, version: 1, schemes }, null, 2)
/** Reads a style file → the list of its valid schemes; throws a readable error otherwise. */
export function parseStyleFile(text) {
  let o
  try { o = JSON.parse(text) } catch { throw new Error('Not a chart style file (invalid JSON)') }
  const list = Array.isArray(o) ? o : o?.schemes
  if (!Array.isArray(list)) throw new Error('Not a chart style file (no schemes)')
  const schemes = list.map(cleanScheme).filter(Boolean)
  if (!schemes.length) throw new Error('No valid color scheme in this file')
  return schemes
}
/** Exported file name: "<name>.chart-style.json", sanitized (ASCII, no path separator). */
export function styleFileName(name) {
  const base = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 40)
  return `${base || 'chart'}.chart-style.json`
}
export function importStyleFile(text) { const next = mergeSchemes(customSchemes(), parseStyleFile(text)); store(SCHEMES_KEY, next); return next }

// ── Fonts: system stacks + the two bundled fonts, never by URL ─────────────────
// [key, label, CSS family]. null = the engine's figures font.
export const FONTS = [
  [null, 'Mono (figures)', 'var(--font-mono)'],
  ['sans', 'Sans', 'var(--font-sans, var(--font))'],
  ['system', 'System sans', 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'],
  ['arial', 'Arial / Helvetica', 'Arial, Helvetica, "Liberation Sans", sans-serif'],
  ['verdana', 'Verdana', 'Verdana, Geneva, "DejaVu Sans", sans-serif'],
  ['serif', 'Serif', 'Georgia, Cambria, "Times New Roman", Times, serif'],
  ['code', 'System mono', 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace'],
]
const FONT_CSS = new Map([...FONTS.map(([k, , css]) => [k, css]), ['mono', 'var(--font-mono)']])
export const isFont = k => FONT_CSS.has(k ?? null)
/** A font key → its CSS family (unknown: the figures font). */
export const fontFamily = k => FONT_CSS.get(k ?? null) ?? FONT_CSS.get(null)
/** A font's readable name (format bar). */
export const fontName = k => FONTS.find(([x]) => x === (k ?? null))?.[1] ?? 'Mono (figures)'

// ── Sizes: a step (XS…XL) or a free size in points ───────────────────────────
export const PT_MIN = 4
export const PT_MAX = 72
/**
 * Size input in points → { value } (to the half point), { empty }, or { error };
 * out of bounds: clamped, and reported ({ value, note: 'Limited to 72 pt' }).
 */
export function parsePt(raw) {
  const t = String(raw ?? '').trim().replace(',', '.').replace(/\s*pt$/i, '')
  if (t === '') return { empty: true }
  const n = Number(t)
  if (!Number.isFinite(n)) return { error: `Expected a number, ${PT_MIN} to ${PT_MAX}` }
  const v = Math.round(n * 2) / 2
  if (v < PT_MIN) return { value: PT_MIN, note: `Limited to ${PT_MIN} pt` }
  if (v > PT_MAX) return { value: PT_MAX, note: `Limited to ${PT_MAX} pt` }
  return { value: v }
}
export const isPt = v => typeof v === 'number' && Number.isFinite(v) && v >= PT_MIN && v <= PT_MAX
/** Size in pixels: a number = points (1 pt = 4/3 px); a step = base × its factor. */
export function sizePx(size, base, steps) {
  if (isPt(size)) return Math.round((size * 4) / 3)
  return Math.round(base * (steps?.[size] ?? 1))
}
/**
 * A chart's label style (labelFont / labelPt preferences, "Style" control):
 * only the keys that are set come out, to spread AFTER the default text style.
 */
export function labelTextStyle(prefs) {
  const out = {}
  if (prefs?.labelFont && isFont(prefs.labelFont)) out.fontFamily = fontFamily(prefs.labelFont)
  if (isPt(prefs?.labelPt)) out.fontSize = sizePx(prefs.labelPt)
  // Custom label color (CSS style: overrides the scene's fill attribute).
  if (isHex(prefs?.labelColor)) out.fill = prefs.labelColor
  return out
}
// Average character width of a font, relative to the engine's estimate (0.58 em):
// monospace fonts and Verdana are wider, the others stay at 1 (conservative).
const FONT_WIDTH = new Map([[null, 1.05], ['mono', 1.05], ['code', 1.05], ['verdana', 1.12]])
/**
 * Label metrics of a scene, at the real size and font ("Style"
 * control): { size (px), measure(text) (estimated width), base (whether a size is set) }.
 * Nothing set: the scene's default size and the original estimate, unchanged.
 * Placement (measuring, collisions, margins) goes through this; drawing through labelTextStyle.
 */
export function labelMetrics(prefs, baseSize) {
  const pt = isPt(prefs?.labelPt)
  const font = prefs?.labelFont && isFont(prefs.labelFont) ? prefs.labelFont : null
  const size = pt ? sizePx(prefs.labelPt) : baseSize
  const k = pt || font ? FONT_WIDTH.get(font) ?? 1 : 1
  return { size, base: !pt, measure: (text, s = size) => String(text ?? '').length * s * 0.58 * k }
}
/** Only the label style preferences (passed to scenes, stable memo key). */
export const labelPrefs = prefs => ({ labelPt: isPt(prefs?.labelPt) ? prefs.labelPt : null, labelFont: prefs?.labelFont && isFont(prefs.labelFont) ? prefs.labelFont : null })
/** Summary of the "Style" control: "Style: Serif · 12 pt". */
export const styleSummary = prefs => `Style: ${fontName(prefs?.labelFont)}${isPt(prefs?.labelPt) ? ` · ${prefs.labelPt} pt` : ''}${isHex(prefs?.labelColor) ? ` · ${prefs.labelColor}` : ''}`
/** A scheme applied to keys (series, categories) in order: { key: color }, repeated beyond its length. */
export const schemeMap = (keys, colors) => (colors?.length ? Object.fromEntries(keys.map((k, i) => [k, colors[i % colors.length]])) : {})

// ── Custom checkbox symbols ──
/** The custom symbol for a checkbox state ('yes' | 'no'), or null (default drawing). */
export function checkSymbol(state, symbols) {
  const s = symbols?.[state]
  if (typeof s !== 'string') return null
  const t = [...s.trim()].slice(0, 2).join('')
  return t || null
}

// ── Scheme editor: live preview ──
/** Name of the scheme applied as a preview (unsaved draft). */
export const PREVIEW_SCHEME = 'custom'
/**
 * Do the current series colors already follow the draft (preview applied)?
 * The draft repeats beyond its length, like schemeMap; hex compared case-insensitively.
 */
export function draftFollows(current, draft) {
  if (!current?.length || !draft?.length) return false
  const k = c => String(c ?? '').toLowerCase()
  return current.every((c, i) => k(c) === k(draft[i % draft.length]))
}
/** Font choices for a picker; defaultLabel renames the empty choice (a table: "Default", not "Mono (figures)"). */
export const fontOptions = (defaultLabel = null) => FONTS.map(([k, l]) => [k, k == null && defaultLabel ? defaultLabel : l])
