// ─── epure-charts · the language of the editing interface ────────────────────
// Menus, format bars, tooltips and messages speak the chart's language: each view
// passes localeOf(spec) down through UiLocale, and every piece of the interface reads
// it with useT(). The words themselves live in the one dictionary of src/locale.js;
// the interface's are added here (src/localeUi.js), so the static entry stays light.
import { createContext, createElement, useContext, useMemo } from 'react'
import { addWords, getDefaultLocale, localeOf, t } from './locale.js'
import { UI_WORDS } from './localeUi.js'

for (const [locale, words] of Object.entries(UI_WORDS)) addWords(locale, words)

/** The language of the interface below (a view sets it from its spec). */
export const UiLocale = createContext(null)

/** The current interface language: the closest view's, else the page default. */
export const useLocale = () => useContext(UiLocale) ?? getDefaultLocale()

/** tr(word, vars?): a word or a sentence of the interface in the current language. */
export function useT() {
  const locale = useLocale()
  return useMemo(() => (word, vars) => t(word, locale, vars), [locale])
}

/** Renders `children` with the interface language of `spec`. */
export function SpecLocale({ spec, children }) {
  return createElement(UiLocale.Provider, { value: localeOf(spec) }, children)
}
