// ─── Chart engine · "Set Same Scale" ─────────────────────────────────────────
// Charts on the same page that enable the shared scale publish the natural
// extent of their value axis; each one then draws the union of the extents
// of its unit (X axis: the same density, see sameRangeFor). A chart that leaves the screen withdraws its own.
import { useSyncExternalStore } from 'react'

const domains = new Map() // id → { unit, lo, hi }
const listeners = new Set()
let version = 0
const emit = () => { version++; for (const fn of listeners) fn() }

export function publishDomain(id, unit, lo, hi, brk = null, w = null) {
  const cur = domains.get(id)
  const bk = brk && Number.isFinite(brk.from) && Number.isFinite(brk.to) ? `${brk.from}|${brk.to}` : ''
  const pw = Number.isFinite(w) && w > 0 ? Math.round(w * 100) / 100 : null
  if (cur && cur.unit === unit && cur.lo === lo && cur.hi === hi && cur.bk === bk && cur.w === pw) return
  domains.set(id, { unit, lo, hi, bk, brk: bk ? { from: brk.from, to: brk.to } : null, w: pw })
  emit()
}
export function withdrawDomain(id) { if (domains.delete(id)) emit() }

/** The union of the extents published for this unit (null if none). */
export function unionFor(unit) {
  let lo = Infinity, hi = -Infinity
  for (const d of domains.values()) if (d.unit === unit) { lo = Math.min(lo, d.lo); hi = Math.max(hi, d.hi) }
  return Number.isFinite(lo) && Number.isFinite(hi) && lo < hi ? [lo, hi] : null
}
/**
 * The range of an X axis on a shared scale (same units per pixel).
 * All members of the group get exactly the same days per pixel: the highest density
 * needed for each of them to fit its own extent in its plot. Each chart keeps its range
 * (it starts at its first point, snapped to its tick) and extends it to the right as far as
 * its plot allows at that scale.
 * own: the chart's natural extent [lo, hi]; snapLo: the snapped lower bound (start of quarter…).
 */
export function sameRangeFor(unit, ownW, snapLo = v => v, own = null) {
  const members = [...domains.values()].filter(d => d.unit === unit && d.w > 0 && d.hi > d.lo)
  const base = own && Number.isFinite(own[0]) && Number.isFinite(own[1]) ? own : unionFor(unit)
  if (!base) return null
  const lo0 = Math.min(base[0], snapLo(base[0], base[1]))
  if (!(ownW > 0) || !members.length) return [lo0, base[1]]
  const need = d => (d.hi - Math.min(d.lo, snapLo(d.lo, d.hi))) / d.w
  const perPx = Math.max((base[1] - lo0) / ownW, ...members.map(need))
  return [lo0, lo0 + perPx * ownW]
}
/** The group's axis break (a break propagates with the same scale): the one of the first member that sets one. */
export function breakFor(unit) {
  for (const d of domains.values()) if (d.unit === unit && d.brk) return d.brk
  return null
}
export function useSameScaleVersion() {
  // Third argument: the server snapshot (no shared scale while rendering on the server).
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => version, () => 0)
}

/** How many charts share this scale (same group, same unit). */
export function groupCount(unit) {
  let n = 0
  for (const d of domains.values()) if (d.unit === unit) n++
  return n
}

/** The X-scale group already set by another chart for this axis type ("Set same scale" joins it). */
export function xGroupFor(kind, exceptId) {
  for (const [id, d] of domains) {
    if (id === exceptId || !d.unit.startsWith('x|') || !d.unit.endsWith(`|${kind}`)) continue
    const g = d.unit.slice(2, -kind.length - 1)
    return g === '*' ? true : g
  }
  return true
}

// ── Link charts one by one ("Set Same Scale" applies to the selected charts) ──
// Each chart with a value X axis (dates, numbers) registers here: its title, its current group
// (format.xAxis.same) and a way to change it. The axis menu offers "with <title>" for each one.
const offers = new Map() // id → { kind, title, group(), link(g), alive() }
let fresh = 0
/** A fresh group name that never falls back on a group stored by a past session. */
export const newXGroup = () => `x-${Date.now().toString(36)}-${++fresh}`
export function offerX(id, entry) {
  offers.set(id, entry)
  return () => { if (offers.get(id) === entry) offers.delete(id) }
}
const live = o => o && (o.alive?.() ?? true)
const sameGroup = (a, b) => a != null && a !== false && a === b
/** The other charts of the page with the same X-axis type: [{ id, title, linked }]. */
export function xPartners(kind, exceptId) {
  const own = offers.get(exceptId)?.group?.() ?? null
  return [...offers].filter(([id, o]) => id !== exceptId && o.kind === kind && live(o))
    .map(([id, o]) => ({ id, title: o.title || 'Untitled chart', linked: sameGroup(own, o.group?.() ?? null) }))
}
/** The group to set on two charts being linked: an existing named group first (its own, then the other's), otherwise a new one. */
export function linkGroup(ownG, otherG, make = newXGroup) {
  if (typeof ownG === 'string' && ownG) return ownG
  if (typeof otherG === 'string' && otherG) return otherG
  if (ownG === true || otherG === true) return true
  return make()
}
/** Links this chart to the chosen charts (same X scale); returns the group set. */
export function linkX(id, partnerIds, make = newXGroup) {
  const own = offers.get(id)
  const others = partnerIds.map(p => offers.get(p)).filter(live)
  if (!own || !others.length) return null
  const g = linkGroup(own.group?.() ?? null, others[0].group?.() ?? null, make)
  own.link(g)
  for (const o of others) o.link(g)
  return g
}
/** Removes this chart from its group; a partner left alone is unlinked too (a one-chart group makes no sense). */
export function unlinkX(id) {
  const own = offers.get(id)
  if (!own) return
  const g = own.group?.() ?? null
  own.link(null)
  // Only a named group dissolves (true = the whole page, it stays open).
  if (typeof g !== 'string') return
  const rest = [...offers].filter(([k, o]) => k !== id && o.kind === own.kind && live(o) && sameGroup(g, o.group?.() ?? null))
  if (rest.length === 1) rest[0][1].link(null)
}
/** The titles of the charts linked to this one (same group, same axis type). */
export function linkedTitles(id) {
  const own = offers.get(id)
  const g = own?.group?.() ?? null
  if (!own || g == null || g === false) return []
  return [...offers].filter(([k, o]) => k !== id && o.kind === own.kind && live(o) && sameGroup(g, o.group?.() ?? null)).map(([, o]) => o.title || 'Untitled chart')
}

/**
 * The scene on a shared X scale, fitted to the plot width actually drawn: if setting the
 * range changes the plot's room (margins), the range is recomputed for that width (exact px per day).
 * buildAt(range) → scene; rangeAt(w) → [lo, hi]; w0: the starting width.
 */
export function fitSameScene(buildAt, rangeAt, w0) {
  let w = w0
  let sc = buildAt(rangeAt(w))
  for (let i = 0; i < 3 && sc?.plot?.width && Math.abs(sc.plot.width - w) > 0.01; i++) {
    w = Math.round(sc.plot.width * 100) / 100
    sc = buildAt(rangeAt(w))
  }
  return sc
}
