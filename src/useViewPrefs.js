// ─── epure-charts · view preferences, with an undoable Reset ──────────────────
// A per-browser VIEW preference (chartPrefs): the numbers never change.
import { useState } from 'react'
import { useChartPrefs } from './chartPrefs.js'

/** useViewPrefs(key, defaults) → { prefs, set, update, reset, undo, canUndo } */
export function useViewPrefs(key, defaults) {
  const [prefs, set, resetAll, update, latest] = useChartPrefs(key, defaults)
  const [snap, setSnap] = useState(null)
  const reset = () => { setSnap(structuredClone(latest())); resetAll() }
  const undo = () => { for (const [k, v] of Object.entries(snap ?? {})) set(k, v); setSnap(null) }
  return { prefs, set, update, reset, undo, canUndo: !!snap }
}
