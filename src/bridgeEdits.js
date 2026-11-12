// ─── epure-charts · edit a bridge without touching its numbers ───────────────
// applyBridgeEdits(bridge, { hiddenSteps, subtotals }) → a re-read bridge:
//   · a hidden lever does not disappear: it joins an "Other levers" bar placed
//     where the first hidden one was. The bridge always closes (no
//     "Unreconciled" gap is created by the view);
//   · a subtotal is inserted after a step: the running total reached,
//     computed, never typed.
// Only movements can be hidden: an anchor (cost, current value, exit) is a
// level read from the data, and an unreconciled gap is always shown.
// Pure, tested under node --test.

const sign = v => (v >= 0 ? 'positive' : 'negative')

/** True when a step can be hidden: a movement, not an anchor nor a reconciliation gap. */
export function canHide(step) {
  return step?.kind === 'delta' && step.tone !== 'gap'
}

/** Applies hidden steps (merged into "Other levers") and subtotals to a bridge. */
export function applyBridgeEdits(bridge, edits = {}) {
  const steps = bridge?.steps ?? []
  const hidden = new Set((edits.hiddenSteps ?? []).map(String))
  const subtotals = new Set((edits.subtotals ?? []).map(String))
  const out = []
  let other = null
  for (const s of steps) {
    if (hidden.has(s.key) && canHide(s)) {
      if (!other) {
        other = { key: 'other', label: 'Other levers', value: 0, kind: 'delta', tone: 'positive', members: [] }
        out.push(other)
      }
      other.value += s.value
      other.members.push(s.label)
      other.tone = sign(other.value)
      continue
    }
    out.push(s)
    if (subtotals.has(s.key)) out.push({ key: `sub:${s.key}`, label: 'Subtotal', value: 0, kind: 'total', tone: 'anchor', after: s.key })
  }
  return { ...bridge, steps: out }
}
