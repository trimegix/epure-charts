// ─── Chart display preferences: a small store, one key per chart ────────────
// A VIEW preference, per browser (localStorage). It is never a fact about the
// underlying data and never shared between users.
import { useSyncExternalStore } from 'react'

const listeners = new Set()
const cache = new Map()

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

function read(key, defaults) {
  if (!cache.has(key)) {
    let stored = {}
    // Server rendering (no window): the defaults, the browser reads its own on hydration.
    if (typeof window !== 'undefined') try { stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') ?? {} } catch { /* private mode */ }
    cache.set(key, { ...defaults, ...stored })
  }
  return cache.get(key)
}

// Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y): one history per chart; the
// most recently touched key receives the shortcut. Writes made in quick
// succession (a drag, several settings from one click) form a single step.
const undoStack = new Map() // key → [previous states]
const redoStack = new Map()
let lastKey = null
let lastPush = { key: null, at: 0 }
// A gesture (dragging a label or a handle) is a single undo step, whatever its duration.
let gesture = null

/** Opens a gesture: every write until endStep() forms a single undo step. */
export function beginStep() { gesture = new Set() }
/** Closes the gesture opened by beginStep(). */
export function endStep() { gesture = null; lastPush = { key: null, at: 0 } }

function persist(key, next) {
  cache.set(key, next)
  if (typeof window !== 'undefined') try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* quota / private mode */ }
  for (const fn of listeners) fn()
}

function write(key, next) {
  const now = Date.now()
  const grouped = gesture ? gesture.has(key) : lastPush.key === key && now - lastPush.at < 400
  if (cache.has(key) && !grouped) {
    const st = undoStack.get(key) ?? []
    st.push(cache.get(key))
    if (st.length > 50) st.shift()
    undoStack.set(key, st)
    redoStack.delete(key)
  }
  gesture?.add(key)
  lastPush = { key, at: now }
  lastKey = key
  persist(key, next)
}

/** Undoes the last change of the most recently touched chart; returns true if anything changed. */
export function undoLast() {
  const st = lastKey && undoStack.get(lastKey)
  if (!st?.length) return false
  const r = redoStack.get(lastKey) ?? []
  r.push(cache.get(lastKey))
  redoStack.set(lastKey, r)
  lastPush = { key: null, at: 0 }
  persist(lastKey, st.pop())
  return true
}
export function redoLast() {
  const r = lastKey && redoStack.get(lastKey)
  if (!r?.length) return false
  const st = undoStack.get(lastKey) ?? []
  st.push(cache.get(lastKey))
  undoStack.set(lastKey, st)
  lastPush = { key: null, at: 0 }
  persist(lastKey, r.pop())
  return true
}
export const canUndo = () => !!(lastKey && undoStack.get(lastKey)?.length)

if (typeof document !== 'undefined' && !globalThis.__epureChartsUndo) {
  globalThis.__epureChartsUndo = true
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
    // The data sheet (Jspreadsheet) keeps its own history.
    if (e.target?.closest?.('.chart-datasheet')) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) { if (undoLast()) e.preventDefault() }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { if (redoLast()) e.preventDefault() }
  })
}

/** Returns `[prefs, setPref, reset, update, latest]`: prefs persisted under `key`, completed by `defaults`; `reset` restores the defaults; `update(name, fn)` writes from the most recent state. */
export function useChartPrefs(key, defaults) {
  // The same snapshot on the server side (static rendering, tests): the store is process-local.
  const prefs = useSyncExternalStore(subscribe, () => read(key, defaults), () => read(key, defaults))
  const setPref = (name, value) => write(key, { ...read(key, defaults), [name]: value })
  const reset = () => write(key, { ...defaults })
  // Writes from the most recent STORED state (not the rendered one):
  // several writes within the same click accumulate instead of overwriting each other.
  const update = (name, fn) => { const cur = read(key, defaults); write(key, { ...cur, [name]: fn(cur[name]) }) }
  const latest = () => read(key, defaults)
  return [prefs, setPref, reset, update, latest]
}


/** A checkbox bound to a boolean preference. */
export const check = (prefs, setPref, key, label) => ({ key, label, on: !!prefs[key], onToggle: () => setPref(key, !prefs[key]) })
