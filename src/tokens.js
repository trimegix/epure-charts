// ─── epure-charts · the default token values, as data ──────────────────────
// The same values as styles/tokens.css, for what runs without a stylesheet:
// sceneToSVGString (exports, decks) resolves var(--…) against them.
// Pure: no React, no DOM. Keep in step with styles/tokens.css.

export const LIGHT_TOKENS = Object.freeze({
  'amber': '#E0912F',
  'amber-bg': '#FBECC8',
  'amber-text': '#8A5A0B',
  'black': '#14212A',
  'blue-bg': '#E3EFFA',
  'blue-chart': '#2E7DD6',
  'cap': '#0E9E82',
  'cat-1': '#0E9E82',
  'cat-2': '#2E7DD6',
  'cat-3': '#E0912F',
  'cat-4': '#7C5CD0',
  'cat-5': '#C64F72',
  'cat-6': '#2FA0A8',
  'cat-7': '#6C8AB0',
  'cat-8': '#B0803A',
  'font': `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  'font-mono': `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`,
  'gold': '#0E9E82',
  'gold-dark': '#0B7D67',
  'gold-light': '#DAF1EB',
  'gray-100': '#F1F4F6',
  'gray-200': '#E4E9ED',
  'gray-300': '#CBD3D9',
  'gray-400': '#93A0A8',
  'gray-50': '#F9FAFB',
  'gray-500': '#566670',
  'gray-600': '#46535A',
  'gray-700': '#33424A',
  'gray-800': '#1F2C33',
  'gray-900': '#0C1519',
  'green': '#0F9D63',
  'red': '#D14343',
  'red-bg': '#FBE3E3',
  'red-text': '#C0362F',
  'surface': '#FFFFFF',
  'white': '#FFFFFF',
  'yellow-chart': '#D9A02B',
})

export const DARK_TOKENS = Object.freeze({ ...LIGHT_TOKENS, ...{
  'amber': '#F2A34E',
  'amber-bg': '#2E2410',
  'amber-text': '#F2A34E',
  'black': '#F1F5F2',
  'blue-bg': '#0E2433',
  'blue-chart': '#57B6E8',
  'cap': '#2DE0B4',
  'cat-1': '#2DE0B4',
  'cat-2': '#57B6E8',
  'cat-3': '#F2A34E',
  'cat-4': '#A78BFA',
  'cat-5': '#F0708F',
  'cat-6': '#4BD1D9',
  'cat-7': '#9DB4D8',
  'cat-8': '#E0B872',
  'gold': '#2DE0B4',
  'gold-dark': '#6FE9CE',
  'gold-light': '#0E2E2A',
  'gray-100': '#0A1824',
  'gray-200': '#17303F',
  'gray-300': '#3C5563',
  'gray-400': '#6E8592',
  'gray-50': '#0A1622',
  'gray-500': '#9DB4BF',
  'gray-600': '#A9BFC9',
  'gray-700': '#C4D2DA',
  'gray-800': '#E4EDF0',
  'gray-900': '#F4F8F5',
  'green': '#4BD98A',
  'red': '#FF6470',
  'red-bg': '#2E1416',
  'red-text': '#FF6470',
  'surface': '#0C1E2B',
  'white': '#0C1E2B',
  'yellow-chart': '#F2C14E',
} })

// Type sizes (FigureSvg, fs / fsNote in customStyle.js).
export const TYPE_TOKENS = Object.freeze({ 'chart-fs': '11px', 'chart-fs-note': '10px' })

/**
 * Resolves the CSS variables of a string (an SVG, a style) against token values:
 * var(--x, fallback) → tokens[x] ?? fallback; then the calc(Npx * k) the font tokens make.
 * `tokens` overrides the light defaults (names with or without the leading '--').
 */
export function resolveVars(str, tokens = {}) {
  const T = { ...LIGHT_TOKENS, ...TYPE_TOKENS }
  for (const [k, v] of Object.entries(tokens ?? {})) T[k.replace(/^--/, '')] = String(v)
  let s = String(str)
  // Innermost first, until no var() is left (fallbacks can nest).
  for (let i = 0; i < 8 && s.includes('var(--'); i++) {
    s = s.replace(/var\(--([\w-]+)(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, name, fb) => T[name] ?? (fb != null ? fb.trim() : m))
  }
  s = s.replace(/calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)/g, (m, a, k) => `${Math.round(a * k * 100) / 100}px`)
  return s
}
