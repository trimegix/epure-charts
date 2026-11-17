// Node module hooks: load .jsx sources (and extensionless relative imports, as Vite resolves
// them) so the figures can be rendered under node --test without a build.
import { transform } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$|\.json$|\.css$/.test(specifier) && context.parentURL) {
    for (const ext of ['.jsx', '.js']) {
      const url = new URL(specifier + ext, context.parentURL)
      if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
  }
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
  if (!url.endsWith('.jsx')) return next(url, context)
  const src = await readFile(fileURLToPath(url), 'utf8')
  const { code } = await transform(src, { loader: 'jsx', jsx: 'automatic', format: 'esm', sourcefile: fileURLToPath(url) })
  return { format: 'module', source: code, shortCircuit: true }
}
