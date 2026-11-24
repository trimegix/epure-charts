// ─── epure-charts · development warnings ─────────────────────────────────────
// What the engine leaves out on purpose (an annotation it cannot draw, settings that hide one)
// is said once in the console, in development only. Production builds stay silent: the host's
// bundler replaces process.env.NODE_ENV; without a bundler (no `process`), silent as well.
let dev
export function isDev() {
  if (dev === undefined) {
    try { dev = process.env.NODE_ENV !== 'production' } catch { dev = false }
  }
  return dev
}

const said = new Set()

/** Logs `message` once per page (development only). Returns true when it was logged. */
export function devWarn(message) {
  if (!isDev() || said.has(message)) return false
  said.add(message)
  console.warn(`[epure-charts] ${message}`)
  return true
}

/** Test hook: forces development mode on or off (null: detect again) and forgets what was said. */
export function setDevWarnings(on) { dev = on == null ? undefined : !!on; said.clear() }
