// ─── epure-charts · the readable name of a color token ───────────────────────
// The format bar says "Fill: teal", never the object name or the raw token.
const NAMES = {
  'cat-1': 'teal', 'cat-2': 'blue', 'cat-3': 'orange', 'cat-4': 'purple',
  'cat-5': 'raspberry', 'cat-6': 'cyan', 'cat-7': 'slate', 'cat-8': 'bronze',
  black: 'black', white: 'white', gold: 'gold', 'gold-dark': 'dark gold', 'gold-light': 'light gold',
  red: 'red', green: 'green', amber: 'amber', teal: 'teal', blue: 'blue',
}

/** 'cat-1' → 'teal'; 'gray-400' → 'gray'; a role or an unknown token → itself, hyphens as spaces. */
// Semantic tokens: named by what they mean.
const CHART_NAMES = {
  'chart-pos': 'positive', 'chart-neg': 'negative', 'chart-hypothesis': 'hypothesis', 'chart-hypothesis-text': 'hypothesis',
  'chart-anchor': 'anchor', 'chart-upside': 'upside', 'chart-gap': 'gap', 'chart-actual': 'actual', 'chart-plan': 'plan',
  'chart-ic': 'investment case', 'chart-budget': 'budget', 'chart-forecast': 'forecast',
}

export function colorName(token) {
  if (token == null || token === '') return 'auto'
  const t = String(token)
  if (NAMES[t]) return NAMES[t]
  if (t === 'chart-accent') return 'accent'
  if (t === 'chart-neutral' || t === 'chart-neutral-ink') return 'neutral'
  if (CHART_NAMES[t]) return CHART_NAMES[t]
  if (/^gray-/.test(t)) return Number(t.slice(5)) >= 600 ? 'dark gray' : 'gray'
  if (/-bg$/.test(t)) return `light ${t.replace(/-bg$/, '')}`
  return t.replace(/-/g, ' ')
}
