#!/usr/bin/env node
// Fails when a forbidden word appears in the repository files, or in a commit message
// (`node scripts/forbidden-words.mjs --message <file>`). Runs in the git hooks.
//
// The list itself is private and never committed: one regular expression per line
// (case-insensitive, `#` starts a comment), read from $FORBIDDEN_WORDS_FILE or, by
// default, from .git/info/forbidden-words. Without a list, the check is skipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const listFile = process.env.FORBIDDEN_WORDS_FILE || join(process.cwd(), '.git', 'info', 'forbidden-words')
if (!existsSync(listFile)) {
  console.log('forbidden-words: no private list found, skipped')
  process.exit(0)
}
const WORDS = readFileSync(listFile, 'utf8')
  .split('\n')
  .map(l => l.replace(/#.*/, '').trim())
  .filter(Boolean)
  .map(w => new RegExp(w, 'i'))

const SKIP = new Set(['node_modules', '.git', 'dist', 'demo-dist', 'coverage'])
const TEXT = /\.(m?js|jsx|ts|tsx|css|json|md|ya?ml|html|txt|svg)$|^(LICENSE|\.gitignore|\.npmignore)$/i

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (TEXT.test(name)) yield p
  }
}

const hits = []
const scan = (label, text) => text.split('\n').forEach((line, i) => {
  for (const re of WORDS) if (re.test(line)) hits.push(`${label}:${i + 1}: ${line.trim().slice(0, 120)}`)
})

const msg = process.argv.indexOf('--message')
if (msg > -1) scan('commit message', readFileSync(process.argv[msg + 1], 'utf8'))
else {
  const root = process.cwd()
  for (const f of files(root)) scan(relative(root, f), readFileSync(f, 'utf8'))
}

if (hits.length) {
  console.error(`Forbidden words found (${hits.length}):\n` + hits.slice(0, 200).join('\n'))
  process.exit(1)
}
console.log(`forbidden-words: clean (${WORDS.length} patterns)`)
