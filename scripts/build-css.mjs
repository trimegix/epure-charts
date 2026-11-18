// Builds the package stylesheets after `vite build --mode lib`, so that a host imports CSS
// files only (no CSS imported from JavaScript: server renderers such as Astro or Next load
// the package without any bundler setting).
//   dist/styles.css       the engine styles + the data sheet grid (Jspreadsheet CE, jSuites)
//   dist/theme-light.css  the default tokens, light only (no switch with the system theme)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const read = p => readFileSync(p, 'utf8')
mkdirSync('dist', { recursive: true })

const grid = [
  ['jspreadsheet-ce/dist/jspreadsheet.css', 'Jspreadsheet CE, MIT'],
  ['jsuites/dist/jsuites.css', 'jSuites, MIT'],
].map(([p, who]) => `/* ── ${who} (${p}) ── */\n${read(require.resolve(p))}`).join('\n')
writeFileSync('dist/styles.css', `${grid}\n/* ── epure-charts ── */\n${read('styles/charts.css')}`)

// The light block of tokens.css: the first `:where(:root) { … }`.
const tokens = read('styles/tokens.css')
const light = tokens.match(/:where\(:root\)\s*\{[^}]*\}/)
if (!light) throw new Error('build-css: light token block not found in styles/tokens.css')
writeFileSync('dist/theme-light.css', `/* epure-charts · default tokens, light only (styles/tokens.css without the dark blocks) */\n${light[0]}\n`)
console.log('build-css: dist/styles.css, dist/theme-light.css')
