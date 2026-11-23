// ─── epure-charts · locale ───────────────────────────────────────────────────
// The engine's own words ("Other", "Weighted average"…) and the punctuation of the
// numbers it prints, per language. A chart picks its language with `spec.locale`;
// without it, the page-wide default (setDefaultLocale) applies, 'en' out of the box.
// Pure: no React, no DOM.
//
// French: decimal comma, a narrow no-break space between thousands, a no-break space
// before %, x and units (« 12,5 % », « 1 234 M€ »).

export const NBSP = ' '
export const NNBSP = ' '

const WORDS = {
  fr: {
    Other: 'Autres',
    Others: 'Autres',
    'Weighted average': 'Moyenne pondérée',
    Average: 'Moyenne',
    Mean: 'Moyenne',
    Median: 'Médiane',
    Total: 'Total',
    Anchor: 'Ancrage',
    'Value created': 'Création de valeur',
    Drag: 'Destruction de valeur',
    'Upside to exit': 'Potentiel à la sortie',
    Unreconciled: 'Écart non expliqué',
    Value: 'Valeur',
    'Running total': 'Cumul',
    Target: 'Cible',
    Threshold: 'Seuil',
    Min: 'Min',
    Max: 'Max',
    Actual: 'Réel',
    Forecast: 'Prévision',
    Plan: 'Plan',
    Budget: 'Budget',
    Before: 'Avant',
    After: 'Après',
    Range: 'Fourchette',
    Today: 'Aujourd’hui',
    Start: 'Début',
    End: 'Fin',
    Duration: 'Durée',
    Task: 'Tâche',
    Progress: 'Avancement',
    Owner: 'Responsable',
    Index: 'Indice',
    'shared scale': 'échelle commune',
    Signed: 'Signé',
    'Working (simulated)': 'Hypothèse (simulée)',
    'High scenario': 'Scénario haut',
    vs: 'vs',
    'vs running total': 'vs cumul',
    Move: 'Variation',
    Filter: 'Filtre',
    Change: 'Variation',
    'Pass rate': 'Taux de passage',
    Share: 'Part',
    Low: 'Bas',
    High: 'Haut',
    Marker: 'Repère',
    CAGR: 'TCAM',
    Avg: 'Moy.',
    'no data': 'aucune donnée',
    growth: 'croissance',
    'Empty cell': 'Cellule vide',
    'no value': 'sans valeur',
    Checked: 'Coché',
    Crossed: 'Barré',
    Unchecked: 'Non coché',
    Text: 'Texte',
    Size: 'Taille',
    Group: 'Groupe',
    Event: 'Événement',
    Milestone: 'Jalon',
    'No value': 'Sans valeur',
    'Invalid value in the data sheet': 'Valeur non valide dans la feuille de données',
    'Connector conflict: {text}': 'Conflit de connecteur : {text}',
    'Overwritten: no longer linked to the data sheet': 'Remplacé : n’est plus lié à la feuille de données',
  },
}

let defaultLocale = 'en'
/** Sets the language of every chart that does not name its own (spec.locale). */
export function setDefaultLocale(locale) { defaultLocale = WORDS[locale] || locale === 'en' ? locale : 'en' }
export const getDefaultLocale = () => defaultLocale
/** The language a spec reads in. */
export const localeOf = spec => (spec?.locale === 'en' || WORDS[spec?.locale] ? spec.locale : defaultLocale)

/**
 * A word or a sentence in the chart's language (unknown words are kept). The engine's
 * words and the editing interface's (menus, format bars, messages: src/localeUi.js, added
 * by the editor with addWords) share this one dictionary. `vars` fills the {name} slots:
 * t('Hide {name}', 'fr', { name: 'Q3' }) → 'Masquer Q3'.
 */
export function t(word, locale = defaultLocale, vars) {
  const s = WORDS[locale]?.[word] ?? word
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s
}

/**
 * Adds words to a language: { 'English text': 'translation' }. The editor adds its own
 * (the static entry stays light without them); an application can complete a language
 * or add one (then usable as spec.locale).
 */
export function addWords(locale, words) {
  WORDS[locale] = { ...WORDS[locale], ...words }
}
/** Whether a word has its own entry in that language ('en' has them all). */
export const hasWord = (word, locale) => locale === 'en' || WORDS[locale]?.[word] != null

// A formatted number in English punctuation: optional sign and currency, digits with ','
// thousands and '.' decimals, then an optional magnitude or unit.
const NUM_RE = /(^|[^\w.,'])([−+-]?)([€$£]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(\s?)(bn|pp|pts?|bps?|[kKMB%x×])(?![A-Za-z]))?/g

/**
 * A string printed in English punctuation → the same in the chart's language.
 * 'en' returns it unchanged. French: '1,234.5' → '1 234,5', '12.5%' → '12,5 %',
 * '€12.5M' → '12,5 M€', '2.4x' → '2,4x'. Dates ('2024-Q3'), years and words are left alone.
 */
export function localizeNumber(str, locale = defaultLocale) {
  if (locale !== 'fr' || typeof str !== 'string' || !/\d/.test(str)) return str
  return str.replace(NUM_RE, (m, pre, sign, cur, int, dec, sp, unit) => {
    // A bare 4-digit year ('2024') stays as is.
    if (!cur && !dec && !unit && !int.includes(',') && /^\d{4}$/.test(int)) return m
    const n = `${int.replace(/,/g, NNBSP)}${dec ? `,${dec.slice(1)}` : ''}`
    let tail = ''
    if (unit === 'x' || unit === '×') tail = unit
    else if (unit) tail = `${NBSP}${unit === 'B' || unit === 'bn' ? 'Md' : unit}`
    if (cur) tail = `${unit && unit !== '%' && unit !== 'x' && unit !== '×' ? tail : `${tail}${NBSP}`}${cur}`
    return `${pre}${sign}${n}${tail}`
  })
}

/** A value formatter (v, unit, decimals) → string, wrapped to print in the chart's language. */
export function localizedFormat(format, locale = defaultLocale) {
  if (locale === 'en' || typeof format !== 'function') return format
  if (format.__locale === locale) return format
  const f = (...args) => localizeNumber(format(...args), locale)
  f.__locale = locale
  return f
}
