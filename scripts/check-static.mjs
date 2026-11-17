// The static entry stays light: dist/static.js and the chunks it imports must not
// pull the editor (data sheet, icons, editing CSS). Run after `vite build --mode lib`.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const FORBIDDEN = [/^jspreadsheet-ce/, /^jsuites/, /^@tabler\/icons-react/, /\.css$/]
const seen = new Set()
const bad = []
function walk(file) {
  if (seen.has(file)) return
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/(?:import|export)\s*(?:[^'"]*?from\s*)?["']([^"']+)["']/g)) {
    const spec = m[1]
    if (spec.startsWith('.')) { const f = join(dirname(file), spec); if (existsSync(f)) walk(f) }
    else if (FORBIDDEN.some(re => re.test(spec))) bad.push(`${file} → ${spec}`)
  }
}
const entry = 'dist/static.js'
if (!existsSync(entry)) { console.error('check-static: dist/static.js missing (build first)'); process.exit(1) }
walk(entry)
if (bad.length) { console.error(`check-static: the static entry imports the editor:\n  ${bad.join('\n  ')}`); process.exit(1) }
console.log(`check-static: clean (${seen.size} files)`)
