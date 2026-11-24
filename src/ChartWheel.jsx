// ─── Chart formatting ────────────────────────────────────────────────────────
// Select an OBJECT (series or bar, value axis, category axis,
// label, legend, annotation, chart background), then:
//   · left click → that object's MINI TOOLBAR: a single row of controls,
//     placed just above the object, without leaving the card. Each control
//     shows its value and opens a small menu (color, line, scale…);
//   · right click (or the Menu key, Shift+F10) → its ACTION MENU: add,
//     remove, back to automatic; "Format…" opens the mini toolbar;
//   · the settings button in the header → the same mini toolbar, on the chart; its
//     first control switches objects: everything stays reachable without the gesture.
// All entry points set the same view preferences (useReadingPrefs), per
// browser: the figures never change.
import { useEffect, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { createPortal } from 'react-dom'
import {
  IconPalette, IconChartBar, IconChartLine, IconChartArea, IconLayoutColumns, IconStack2,
  IconPercentage, IconX, IconCheck, IconChevronDown, IconArrowsSort, IconArrowsExchange,
  IconSortDescending, IconSortAscending, IconTrash, IconPlus, IconRuler2, IconEye, IconGridDots, IconLetterT,
  IconTag, IconTextSize, IconRotate, IconColumns, IconLine, IconCategory, IconListDetails, IconAlignBoxBottomCenter,
  IconBrush, IconLayoutList, IconCalendar, IconAdjustments, IconFocus2, IconArrowsVertical, IconBorderStyle2, IconSum, IconLineHeight, IconTable, IconLink,
} from '@tabler/icons-react'
// Data table "styled like a table": TableView's pale fills and size steps.
const TABLE_FILLS = ['gray-50', 'gray-100', 'gray-200', 'green-bg', 'amber-bg', 'red-bg', 'blue-bg']
const TABLE_SIZES = [['xsmall', 'XS'], ['small', 'S'], [null, 'M'], ['large', 'L'], ['xlarge', 'XL']]
import { ROLE_TOKEN, formatDateKey, yearOfKey } from './scene'
import { SCHEMES, schemeColors } from './reading'
import { cardGeometry } from './cardGeometry'
import { useWheelPlacement } from './useWheelPlacement'
import { SEPARATORS, parseExample } from './numberStyle'
import { colorName } from './colorNames'
import { tok, baseToken } from './customStyle.js'
import { CustomColor, FontPick, PtField, SchemeTools } from './CustomStyle.jsx'
import { undoLast, canUndo } from './chartPrefs'
import { useCompactLevel, compactList, compactValue } from './compactBar.jsx'
import BarBoundary from './BarBoundary.jsx'

const SHAPES = [['bar', 'Bars', IconChartBar], ['line', 'Line', IconChartLine], ['area', 'Area', IconChartArea]]
const BAR_MODES = [['clustered', 'Clustered', IconLayoutColumns], ['stacked', 'Stacked', IconStack2], ['stacked100', '100% stacked', IconPercentage]]
const ORDERS = [[null, 'Sheet order', IconArrowsSort], ['reverse', 'Reverse order', IconArrowsExchange], ['desc', 'Largest first', IconSortDescending], ['asc', 'Smallest first', IconSortAscending]]
const SHOW = [['none', 'None'], ['last', 'Last'], ['some', 'Chosen'], ['all', 'All']]
const DASHES = [['solid', 'Solid', null], ['dash', 'Dashed', '4 3'], ['dot', 'Dotted', '1.5 2.5']]
const WEIGHTS = [1, 1.5, 2, 3]
const MARKERS = [['none', 'No marker', '∅'], ['circle', 'Circle', '●'], ['square', 'Square', '■'], ['diamond', 'Diamond', '◆'], ['triangle', 'Triangle', '▲']]
const DECIMALS = [[null, 'Auto'], [0, '0'], [1, '0.0'], [2, '0.00']]
// The magnitude of an amount (×10³, ×10⁶, ×10⁹).
const MAGNITUDES = [[null, 'Auto', 'Magnitude chosen by the screen'], ['k', 'k', 'Thousands (×10³)'], ['M', 'M', 'Millions (×10⁶)'], ['B', 'B', 'Billions (×10⁹)'], ['prime', 'Prime (′ ″)', 'Prime notation: ′ millions, ″ billions']]
const SCHEME_LIST = [['', 'Default colors'], ['categorical', 'Categorical'], ['accent', 'Accent'], ['gray', 'Grays'], ['blue', 'Blues']]
// Fill patterns.
const PATTERN_ITEMS = [[null, 'Solid'], ['hatch', '///', null, 'Hatched'], ['hatchBack', '\\\\\\', null, 'Hatched backward'], ['cross', '×', null, 'Crosshatch'], ['dots', '···', null, 'Dots'], ['lines', '≡', null, 'Lines']]
// Ends of an error bar.
const CAPS = [['bar', '—', 'line'], ['none', '∅', 'none'], ['dot', '●', 'dot'], ['arrow', '▲', 'arrow']]
// Text size steps (chart, labels, legend).
const SIZES = [['xsmall', 'XS', null, 'Extra small'], ['small', 'S', null, 'Small'], [null, 'M', null, 'Medium'], ['large', 'L', null, 'Large'], ['xlarge', 'XL', null, 'Extra large']]
const GAPS = [[null, 'Auto'], [0.1, 'Wide'], [0.3, 'Medium'], [0.5, 'Narrow'], [0.7, 'Thin']]
const OBJECTS = [['chart', 'Chart'], ['series', 'Series'], ['yaxis', 'Value axis'], ['xaxis', 'Category axis'], ['labels', 'Labels'], ['legend', 'Legend']]

const numOrNull = raw => {
  const t = String(raw ?? '').trim().replace(',', '.')
  if (t === '' || t === '-' || t.endsWith('.')) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ── Building blocks ────────────────────────────────────────────────────────
/** An exclusive choice: a segmented group (bordered, the active one in the cap color). */
export function Seg({ items, value, onPick, label }) {
  return (
    <div className="chart-seg" role="radiogroup" aria-label={label}>
      {items.map(([v, l, I, t]) => (
        <button key={String(v) + l} type="button" role="radio" aria-checked={value === v} title={t ?? l} aria-label={t ?? l}
          className={`chart-seg__opt${value === v ? ' is-on' : ''}`} onClick={() => onPick(v)}>
          {I ? <I size={15} aria-hidden="true" /> : l}
        </button>
      ))}
    </div>
  )
}
/** An independent toggle: a checkbox. */
export function Check({ on, onClick, children, title }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!on} className="chart-check" onClick={onClick} title={title}>
      <span className={`chart-check__box${on ? ' is-on' : ''}`}>{on && <IconCheck size={10} />}</span>{children}
    </button>
  )
}
export const Line = ({ label, children }) => (
  <div className="chart-pop__row">
    {label && <span className="chart-pop__label">{label}</span>}
    <div className="chart-pop__tools">{children}</div>
  </div>
)

// custom: the "free color" row (picker, hex, recent colors) under the palette swatches.
export function Swatches({ palette, value, onPick, custom = true }) {
  const [more, setMore] = useState(false)
  // One row: the scheme's colors, plus the current color if it is not one of them.
  const main = [...palette.slice(0, 8), ...(value && !palette.slice(0, 8).includes(value) && palette.includes(value) ? [value] : [])]
  const all = more ? palette : main
  return (
    <div className="chart-pop__swatches">
      {all.map(c => (
        <button key={c} type="button" className={`chart-editor-swatch${value === c ? ' is-on' : ''}`}
          style={{ background: tok(c) }} aria-label={`Color ${c}`} aria-pressed={value === c} title={c} onClick={() => onPick(c)} />
      ))}
      {all === main && palette.length > main.length && (
        <button type="button" className="chart-pop__more" onClick={() => setMore(true)}>More…</button>
      )}
      {custom && <CustomColor value={value} onPick={onPick} />}
    </div>
  )
}

/** A field that keeps the input in progress ("3.", "-") and only writes a valid setting. */
export function Field({ label, value, onCommit, placeholder, numeric, wide, inline, autoFocus, type, multiline, title }) {
  const [draft, setDraft] = useState(null)
  // F2 (edit mode): the field takes focus, with its text selected.
  const inputRef = useRef(null)
  useEffect(() => { if (autoFocus) { inputRef.current?.focus(); inputRef.current?.select() } }, [autoFocus])
  return (
    <label className="chart-pop__field" aria-label={inline ? label : undefined}>
      {!inline && <span>{label}</span>}
      {multiline ? (
        // Multiple lines: Shift+Enter inserts a line break, Enter confirms.
        <textarea ref={inputRef} rows={2} title={title} className={`chart-opts-input chart-opts-input--area${wide ? ' is-wide' : ''}`} value={draft ?? String(value ?? '')} placeholder={placeholder}
          onFocus={() => setDraft(String(value ?? ''))} onBlur={() => setDraft(null)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}
          onChange={e => { setDraft(e.target.value); onCommit(e.target.value) }} />
      ) : <input ref={inputRef} type={type} title={title} className={`chart-opts-input${wide ? ' is-wide' : ''}`} value={draft ?? String(value ?? '')} placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        onFocus={() => setDraft(String(value ?? ''))} onBlur={() => setDraft(null)}
        onChange={e => {
          setDraft(e.target.value)
          if (!numeric) return onCommit(e.target.value)
          const t = e.target.value.trim()
          if (t === '') onCommit(null)
          else { const n = numOrNull(t); if (n != null) onCommit(n) }
        }} />}
    </label>
  )
}

/**
 * The menu of a control: below it, never over the source line (audit) placed under the
 * bar, and ALWAYS inside the window: shifted left / right if it overflows, its height
 * bounded (it scrolls); re-measured when its content grows ("More options…").
 */
export function Pop({ right, auditRight, children }) {
  const ref = useRef(null)
  const [fit, setFit] = useState({ dx: 0, maxH: null, up: false })
  const up = fit.up
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      el.style.transform = ''
      const r = el.getBoundingClientRect()
      const W = window.innerWidth, H = window.innerHeight, M = 8
      let dx = 0
      if (auditRight != null && !right) dx = Math.max(0, auditRight + 12 - r.left)
      if (r.right + dx > W - M) dx -= r.right + dx - (W - M)
      if (r.left + dx < M) dx += M - (r.left + dx)
      // The natural height (scrollHeight), not the bounded box: otherwise the bound is set and
      // removed on every measurement. Little room below the bar and more above: it opens upwards.
      const need = el.scrollHeight + 2
      const slot = el.parentElement?.getBoundingClientRect() ?? { top: r.top - 6, bottom: r.top - 6 }
      const below = H - M - (slot.bottom + 6)
      const above = slot.top - 6 - M
      const flip = need > below && above > below
      const room = flip ? above : below
      const maxH = need > room ? Math.max(160, room) : null
      el.style.transform = dx ? `translateX(${dx}px)` : ''
      setFit(f => (f.dx === dx && f.maxH === maxH && f.up === flip ? f : { dx, maxH, up: flip }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Content added under an already bounded height (the box does not move): re-measure too.
    const mo = new MutationObserver(measure)
    mo.observe(el, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', measure) }
  }, [auditRight, right])
  return (
    <div ref={ref} className={`chart-pop${right ? ' is-right' : ''}${up ? ' is-up' : ''}`}
      style={{ ...(fit.dx ? { transform: `translateX(${fit.dx}px)` } : {}), ...(fit.maxH ? { maxHeight: fit.maxH, overflowY: 'auto' } : {}) }}>{children}</div>
  )
}

/** The number format: shared by all mini toolbars. */
export function NumberFormatFields({ preview, decimals, magnitude, num = {}, sep, setDec, setMag, setNum, showMagnitude, money, onPercent, consistent, setConsistent }) {
  // Format by example: type "€1 234,5M" and everything is set; the last 4 are kept.
  // Essentials first: preview, example, decimals, magnitude; the rest on demand
  // (open by default if an advanced setting is already set).
  const [more, setMore] = useState(() => ['thousands', 'decimal', 'neg', 'plus', 'signPos', 'minus', 'prefix', 'suffix'].some(k => num[k] != null) || num.currency === false)
  const [note, setNote] = useState(null)
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('epure-chart-recent-formats') ?? '[]') } catch { return [] } })
  const applyExample = ex => {
    const f = parseExample(ex)
    if (!f) return
    // A % sets the share format (and switches the content to %); never "M" and "%" stacked.
    if (f.percent) { if (onPercent) { onPercent(f); setNote(null) } else setNote('% applies to shares: set the labels Content to %'); return }
    setNote(null)
    setDec(f.decimals ?? null)
    if (f.magnitude) setMag(f.magnitude)
    for (const k of ['thousands', 'decimal', 'neg', 'plus', 'prefix', 'suffix', 'magSpace']) setNum(k, f[k] ?? null)
    setNum('currency', f.currency === 'after' ? 'after' : f.currency === false && money ? false : null)
    const next = [ex, ...recent.filter(r => r !== ex)].slice(0, 4)
    setRecent(next)
    try { localStorage.setItem('epure-chart-recent-formats', JSON.stringify(next)) } catch { /* private mode */ }
  }
  return (
    <>
      <Line label="Preview"><span className="chart-pop__preview">{preview}</span></Line>
      <Line label="Example">
        <input className="chart-opts-input chart-pop__example" aria-label="Type an example" placeholder="e.g. €1 234,5M or (1,234)" title="Type an example number: decimals, separators, sign, prefix and suffix follow it"
          onKeyDown={e => { if (e.key === 'Enter') { applyExample(e.currentTarget.value); e.currentTarget.value = '' } }}
          onBlur={e => { if (e.currentTarget.value) { applyExample(e.currentTarget.value); e.currentTarget.value = '' } }} />
      </Line>
      {note && <Line label=""><span className="chart-pop__hint" role="status">{note}</span></Line>}
      {recent.length > 0 && <Line label="Recent">{recent.map(r => <button key={r} type="button" className="chart-seg__opt chart-pop__recent" onClick={() => applyExample(r)}>{r}</button>)}</Line>}
      <Line label="Decimals"><Seg label="Decimals" value={decimals} onPick={setDec} items={DECIMALS} /></Line>
      {showMagnitude && <Line label="Magnitude"><Seg label="Magnitude" value={magnitude} onPick={setMag} items={MAGNITUDES.map(([v, l]) => [v, l])} /></Line>}
      {/* Round sums consistently: the labels of a stack sum to the displayed total. */}
      {setConsistent && <Line label=""><Check on={!!consistent} onClick={() => setConsistent(!consistent)}>Round sums consistently</Check></Line>}
      <Line label=""><button type="button" className="chart-seg__opt chart-pop__more" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Fewer options' : 'More options…'}</button></Line>
      {more && <>
      <Line label="Separators">
        <Seg label="Separators" value={sep}
          onPick={v => { const x = SEPARATORS.find(y => y[2] === v); setNum('thousands', x[0]); setNum('decimal', x[1]) }}
          items={SEPARATORS.map(x => [x[2], x[2]])} />
      </Line>
      <Line label="Negatives">
        <Seg label="Negatives" value={num.neg ?? null} onPick={v => setNum('neg', v)} items={[[null, '−12'], ['paren', '(12)']]} />
        {money && <Check on={num.currency !== false} onClick={() => setNum('currency', num.currency === false ? null : false)}>Show €</Check>}
      </Line>
      <Line label="Sign">
        <Check on={!!num.plus} onClick={() => setNum('plus', num.plus ? null : true)}>+ on positives</Check>
        <Seg label="Sign position" value={num.signPos ?? null} onPick={v => setNum('signPos', v)} items={[[null, '−€12'], ['value', '€−12']]} />
      </Line>
      <Line label="Minus">
        <Seg label="Minus" value={num.minus ?? null} onPick={v => setNum('minus', v)} items={[[null, '− minus'], ['hyphen', '- hyphen'], ['endash', '– dash']]} />
      </Line>
      <Line label="Affixes">
        <Field label="Prefix" inline placeholder="Prefix" value={num.prefix ?? ''} onCommit={v => setNum('prefix', v)} />
        <Field label="Suffix" inline placeholder="Suffix" value={num.suffix ?? ''} onCommit={v => setNum('suffix', v)} />
      </Line>
      </>}
    </>
  )
}

// ── The action menu (right click): a list, keyboard and mouse alike ──
export function ActionMenu({ items, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('[role^="menuitem"]')?.focus() }, [])
  const onKey = e => {
    const all = [...ref.current.querySelectorAll('[role^="menuitem"]')]
    const i = all.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    if (e.key === 'Home') { e.preventDefault(); all[0]?.focus() }
    if (e.key === 'End') { e.preventDefault(); all.at(-1)?.focus() }
  }
  return (
    <div ref={ref} role="menu" className="chart-menu" onKeyDown={onKey}>
      {items.filter(Boolean).map((it, i) => it === '-'
        ? <div key={`s${i}`} className="chart-menu__sep" role="separator" />
        : (
          <button key={it.label} type="button" role={it.checked == null ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.checked == null ? undefined : !!it.checked}
            className="chart-menu__item" disabled={it.disabled} title={it.title} aria-disabled={it.disabled || undefined}
            onClick={() => { if (it.disabled) return; it.onSelect(); if (!it.keepOpen) onClose() }}>
            <span className="chart-menu__icon">{it.checked ? <IconCheck size={13} /> : null}</span>
            <span className="chart-menu__text">{it.label}</span>
            {it.shortcut && <kbd className="chart-menu__kbd">{it.shortcut}</kbd>}
          </button>
        ))}
    </div>
  )
}

/**
 * api    : the useReadingPrefs API
 * pick   : the selected object { mode: 'menu' | 'bar', tab, seriesId, key, keyLabel, points, side, labelKey, ann }
 * anchor : { x, y, align: 'right' (under the button) | 'cursor' (menu) | 'above' (above the object), box (the card) }
 * extra  : settings specific to the host [{ label, items: [{ key, label, on, onToggle }] }]
 */
function ChartWheelInner({ api, pick = {}, anchor, onClose, onMode, extra = [], onDeleteLabel, onResetValueLine, onResetValueLineAt, onAddNote, onAnnAdded, formatters, labelInfo = null }) {
  const ref = useRef(null)
  const [mode, setModeState] = useState(pick.mode === 'menu' ? 'menu' : 'bar')
  const [obj, setObj] = useState(pick.ann ? 'annotation' : pick.tab ?? 'chart')
  const [sid, setSid] = useState(pick.seriesId ?? api.labelOn ?? api.series[0]?.value)
  // A raw date (2024-04-30) is never displayed: the axis format, otherwise "30 Apr 2024".
  const pointLabel = l => (/^\d{4}-\d{2}-\d{2}$/.test(String(l)) ? formatDateKey(l, 'day', api.fmt?.xAxis?.dateFormat || 'd mmm yyyy', true) || l : l)
  const point = pick.key ? { key: pick.key, label: pointLabel(pick.keyLabel ?? pick.key) } : null
  const sel = pick.points?.length ? pick.points : null
  const [scope, setScope] = useState(sel ? 'selection' : point ? 'point' : 'series')
  const [side, setSide] = useState(pick.side ?? 'left')
  // A control to reopen after switching to bar mode (F2, "Edit text…").
  const [openCtl, setOpenCtl] = useState(pick.ctl ?? null)
  const [undo, setUndo] = useState(null)
  // The latest "replace the label text" (read by the keyboard handler, outside render).
  const overwrite = useRef(null)
  const setMode = (m, ctl) => { setModeState(m); onMode?.(m, ctl) }

  // Focus returns to the chart object on close
  // (keyboard only: with the mouse, no focus ring must reappear).
  const back = useRef(typeof document !== 'undefined' && document.activeElement?.matches?.(':focus-visible') ? document.activeElement : null)
  useEffect(() => () => { if (back.current?.focus && document.body.contains(back.current)) back.current.focus() }, [])
  // Mini toolbar opened from the keyboard: focus on its first control.
  useEffect(() => { if (mode === 'bar' && back.current) ref.current?.querySelector('.chart-bar__ctl')?.focus({ preventScroll: true }) }, [mode])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { if (openCtl) setOpenCtl(null); else onClose() }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      // Delete: the selected label disappears.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && pick.labelKey) { e.preventDefault(); onDeleteLabel?.(pick.labelKey) }
      // F2: edit the text of the selected label.
      if (e.key === 'F2' && !typing && pick.labelKey) { e.preventDefault(); setModeState('bar'); setOpenCtl('text'); onMode?.('bar', 'text') }
      // Typing on a selected label replaces its text.
      if (!typing && pick.labelKey && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        overwrite.current?.(e.key)
        setModeState('bar'); setOpenCtl('text'); onMode?.('bar', 'text')
      }
      // Alt + arrows: move to the next or previous object.
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !typing) {
        e.preventDefault()
        setOpenCtl(null)
        setObj(o => { const ids = OBJECTS.map(([v]) => v); const i = Math.max(0, ids.indexOf(o)); return ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length] })
      }
    }
    const onDown = e => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-wheel-anchor]')) return
      // Ctrl / Cmd / Shift + click: extends the selection, the mini toolbar stays.
      if (e.ctrlKey || e.metaKey || e.shiftKey) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onClose, onDeleteLabel, pick.labelKey, openCtl, onMode])

  // Placement (shared with the mini toolbar of a waterfall): see useWheelPlacement.js.
  const pos = useWheelPlacement(ref, anchor, mode)

  const p = api.prefs
  const F = api.fmt
  const shown = api.shown
  const n = shown.length
  const mark = api.markOf(sid)
  const st = api.styleOf(sid)
  const tokenOf = c => baseToken(ROLE_TOKEN[c] ?? c)
  const multi = api.series.length > 1
  const at = k => shown.indexOf(k)
  const seriesName = id => api.series.find(s => s.value === id)?.label ?? id

  // ── Actions (context menu) ──
  // As many CAGR arrows as wanted; the new one is selected.
  const addCagr = () => { addCagrRaw(); onAnnAdded?.('cagr', api.cagrs.length) }
  // Several categories selected: one arrow per successive pair.
  const selKeys = [...new Set((pick.points ?? []).map(q => String(q.key)))]
  const addCagrRaw = () => {
    if (point?.key && n > 1) {
      const i = at(point.key)
      return i === n - 1 ? api.addCagr(shown[0], point.key) : api.addCagr(point.key, shown[n - 1])
    }
    if (!api.cagrs.length) return api.addCagr(shown[0], shown[n - 1])
    return api.addCagr(shown[Math.floor((n - 1) / 2)], shown[n - 1])
  }
  const diffOn = !!(p.diffFrom && p.diffTo)
  const diffCount = (diffOn ? 1 : 0) + (api.diffs?.length ?? 0)
  // An arrow from the list (format.diffs) carries its index; without an index, the one from the original reading settings.
  const listDiff = pick.ann?.kind === 'diff' && pick.ann.i != null ? api.diffs?.[pick.ann.i] : null
  // The ends of the selected arrow (CAGR #i, or difference arrow) and their setting.
  const arrowEnds = pick.ann?.kind === 'cagr' ? (api.cagrs?.[pick.ann.i] ?? {})
    : listDiff ? { from: listDiff.from?.key, to: listDiff.to?.key }
    : pick.ann?.kind === 'diff' ? { from: p.diffFrom, to: p.diffTo } : {}
  const setEnd = (end, k) => {
    if (pick.ann?.kind === 'cagr') api.setCagr(pick.ann.i, end, k)
    else if (listDiff) api.setDiffAt(pick.ann.i, { [end]: { ...(listDiff[end] ?? {}), key: k } })
    else if (pick.ann?.kind === 'diff') api.setDiff(end === 'from' ? k : p.diffFrom, end === 'to' ? k : p.diffTo, p.diffSeries || undefined)
  }
  const yearsOf = (a, b) => { const n = Math.abs(yearOfKey(b) - yearOfKey(a)); return Number.isFinite(n) && n > 0 ? n : null }
  const endsLabel = arrowEnds.from && arrowEnds.to
    ? `${api.nameOf(arrowEnds.from)} → ${api.nameOf(arrowEnds.to)}${pick.ann?.kind === 'cagr' && yearsOf(arrowEnds.from, arrowEnds.to) ? ` (${yearsOf(arrowEnds.from, arrowEnds.to)} yrs)` : ''}`
    : 'From → to'
  // From the selected element to the next category; on a series, the difference of THAT series.
  // Several difference arrows: each one is added to the list.
  // `level`: the level difference arrow, placed next to the two elements.
  const addDiff = (forSeries, level = false) => {
    const end = k => ({ key: k, ...(forSeries ? { series: forSeries } : {}) })
    let from = shown[n - 2], to = shown[n - 1]
    if (point?.key && n > 1) {
      const i = at(point.key)
      if (i >= n - 1) { from = shown[n - 2]; to = point.key } else { from = point.key; to = shown[i + 1] }
    }
    api.addDiff({ from: end(from), to: end(to), ...(level ? { level: true } : {}) })
    onAnnAdded?.('diff', api.diffs?.length ?? 0)
  }
  // Two elements selected (Ctrl + click): the arrow goes from one to the other.
  const addDiffBetween = level => {
    const [a, b] = sel
    api.addDiff({ from: { key: a.key, series: a.seriesId }, to: { key: b.key, series: b.seriesId }, ...(level ? { level: true } : {}) })
    onAnnAdded?.('diff', api.diffs?.length ?? 0)
  }
  const vlOn = String(p.valueLine ?? '').trim() !== ''
  const vlCount = (vlOn ? 1 : 0) + (api.valueLines?.length ?? 0)
  // Several value lines: the first at the average of the totals (double-click
  // returns to it), the next ones at the highest then the lowest of the columns.
  const addValueLine = () => {
    const mean = api.meanOfTotals?.() ?? 0
    if (!vlOn) { api.setValueLine(mean); onAnnAdded?.('vline'); return }
    const t = api.columnTotals?.() ?? []
    const taken = [Number(p.valueLine), ...(api.valueLines ?? []).map(v => v.value)]
    const v = [mean, Math.max(...t, mean), Math.min(...t, mean)].map(x => Number(x.toPrecision(3))).find(x => !taken.includes(x)) ?? Number((mean * 1.1).toPrecision(3))
    api.addValueLine({ value: v })
    onAnnAdded?.('vline', api.valueLines?.length ?? 0)
  }
  const removeValueLines = () => { api.setValueLine(null, ''); api.setFmt('valueLines', null) }
  const listVl = pick.ann?.kind === 'vline' && pick.ann.i != null ? api.valueLines?.[pick.ann.i] : null
  const totalsAvail = api.bars === 'stacked' && api.barCount > 1
  const yo = F.yAxis?.[side] ?? {}
  const setY = (k, v) => api.setFmt(`yAxis.${side}.${k}`, v)
  const manual = Number.isFinite(yo.min) || Number.isFinite(yo.max) || Number.isFinite(yo.step) || yo.log
  // Shared scale: set here, or set by the host (api.scaleGroup) as long as it is not cut (same: false).
  const sameOn = yo.same === false ? false : !!(yo.same ?? api.scaleGroup)
  // Leaving a named group (Ctrl + click): the chart left alone is unlinked too.
  const toggleSame = () => (sameOn && !api.scaleGroup && typeof yo.same === 'string' && pick.yUnlink ? pick.yUnlink()
    : setY('same', sameOn ? (api.scaleGroup ? false : null) : (api.scaleGroup && yo.same === false ? null : true)))
  const autoScale = () => api.setFmt(`yAxis.${side}`, { ...yo, min: undefined, max: undefined, step: undefined, log: undefined })
  const xo = F.xAxis ?? {}
  const setX = (k, v) => api.setFmt(`xAxis.${k}`, v)
  // Same X scale (applies to the chosen charts, linked one by one): the menu
  // offers "with <title>" for each other chart with the same axis type; once linked, it says how many.
  const xLinked = pick.xLinked?.() ?? []
  const xPart = pick.xPartners ?? []
  const xUnlink = () => (pick.xUnlink ? pick.xUnlink() : setX('same', null))
  const xSameLabel = `Same scale: ${xLinked.length + 1} charts`
  const xSameItems = !pick.xNumeric ? [] : xo.same
    ? [
      { label: xLinked.length ? xSameLabel : 'Same scale (no linked chart)', checked: true, title: `${xLinked.length ? `Linked with ${xLinked.join(', ')}. ` : ''}Click to remove same scale`, onSelect: xUnlink },
      ...xPart.filter(q => !q.linked).map(q => ({ label: `Also same scale with ${q.title}`, onSelect: () => pick.xLink([q.id]) })),
    ]
    : xPart.length
      ? [
        ...xPart.map(q => ({ label: `Set same scale with ${q.title}`, onSelect: () => pick.xLink([q.id]) })),
        xPart.length > 1 && { label: `Set same scale with all ${xPart.length + 1} charts`, onSelect: () => pick.xLink(xPart.map(q => q.id)) },
      ]
      : [{ label: 'Set same scale as other charts', disabled: true, title: 'No other chart with this kind of axis on the page', onSelect: () => {} }]
  const LO = F.labels ?? {}
  const setL = (k, v) => api.setFmt(`labels.${k}`, v)
  const hiddenCount = (LO.hidden ?? []).length
  const movedCount = Object.keys(LO.offsets ?? {}).length
  // "Chosen" labels: the list of the series' categories that carry a figure.
  const setLabelKeys = ks => api.setFmt('labelKeys', { ...(F.labelKeys ?? {}), [sid]: ks })
  const toggleLabelKey = k => { const cur = (F.labelKeys?.[sid] ?? []).map(String); setLabelKeys(cur.includes(String(k)) ? cur.filter(x => x !== String(k)) : [...cur, String(k)]) }
  const note = pick.ann?.kind === 'note' ? F.notes?.[pick.ann.i] : null
  const setNote = patch => api.setFmt('notes', (F.notes ?? []).map((n, i) => (i === pick.ann.i ? { ...n, ...patch } : n)))
  const legendIds = Array.isArray(F.legendOrder) ? [...F.legendOrder, ...api.series.map(x => x.value).filter(v => !F.legendOrder.includes(v))] : api.series.map(x => x.value)
  // The series' error bars, the other series eligible for the difference, the data table.
  const EB = F.errorBars?.[sid] ?? null
  const setEB = v => api.setFmt('errorBars', { ...(F.errorBars ?? {}), [sid]: v ?? undefined })
  const others = (api.series ?? []).filter(x => x.value !== sid).map(x => [x.value, x.label])
  const inTable = (F.table ?? []).includes(sid)
  // A series is in the data table if it was moved there, or if the table takes all series except the first.
  const asTable = inTable || (!!F.tableAll && api.series.findIndex(x => x.value === sid) > 0)
  const TS = F.tableStyle ?? {}
  const setTS = (k, v) => api.setFmt('tableStyle', { ...TS, [k]: v ?? undefined })
  const setTable = on => api.setFmt('table', on ? [...new Set([...(F.table ?? []), sid])] : (F.table ?? []).filter(x => x !== sid))
  const textOf = pick.labelKey ? LO.texts?.[pick.labelKey] : undefined
  // The current text of the label, as linked fields: typing over it overwrites it,
  // editing it keeps the link to the data.
  // An axis bound reads in the chart's unit ("€230M"), "auto" otherwise.
  const fmtBound = v => (Number.isFinite(v) ? (formatters?.axis ?? formatters?.value)?.(v, api.unitOf?.(api.series.find(x => api.axisOf(x.value) === side)?.value) ?? 'M') ?? String(v) : 'auto')
  const currentLabelText = { share: '{share}', series: '{series}', category: '{category}', valueShare: '{value} ({share})', seriesValue: '{series} {value}', seriesShare: '{series} {share}' }[LO.content] ?? '{value}'
  const setText = v => api.setFmt('labels.texts', { ...(LO.texts ?? {}), [pick.labelKey]: v ?? undefined })
  useEffect(() => { overwrite.current = setText })
  const oneStyle = (pick.labelKey && LO.styles?.[pick.labelKey]) || {}
  const setOne = patch => {
    const next = { ...oneStyle, ...patch }
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k]
    api.setFmt('labels.styles', { ...(LO.styles ?? {}), [pick.labelKey]: Object.keys(next).length ? next : undefined })
  }
  const resetAll = () => { setUndo(api.snapshot()); api.reset(); setObj('chart'); setMode('bar') }
  const formatItem = label => ({ label: `Format ${label}…`, onSelect: () => setMode('bar'), keepOpen: true })
  const ann = pick.ann

  const addItems = [
    n > 1 && { label: point ? `Add CAGR arrow from ${point.label}` : 'Add CAGR arrow', onSelect: addCagr },
    selKeys.length > 2 && { label: `Add CAGR arrows for successive pairs (${selKeys.length - 1})`, onSelect: () => { api.addCagrPairs(selKeys); onAnnAdded?.('cagr', api.cagrs.length) } },
    n > 1 && { label: point ? `Add difference arrow from ${point.label}` : 'Add difference arrow', onSelect: () => addDiff(point && multi ? sid : undefined) },
    sel?.length === 2 && { label: 'Add difference arrow between these two', onSelect: () => addDiffBetween(false) },
    sel?.length === 2 ? { label: 'Add level difference arrow between these two', onSelect: () => addDiffBetween(true) }
      : point && n > 1 && { label: `Add level difference arrow from ${point.label}`, onSelect: () => addDiff(sid, true) },
    diffCount > 0 && { label: `Remove difference arrows (${diffCount})`, onSelect: () => { api.setDiff('', ''); api.setFmt('diffs', null) } },
    api.cagrs.length > 1 && { label: `Remove CAGR arrows (${api.cagrs.length})`, onSelect: () => api.setPref('cagrs', []) },
    { label: 'Add value line', onSelect: addValueLine },
    vlCount > 0 && { label: vlCount > 1 ? `Remove value lines (${vlCount})` : 'Remove value line', onSelect: removeValueLines },
    // The difference to the target (arrow to value line): from this point to the value line.
    point && vlCount > 0 && { label: `Add difference arrow from ${point.label} to the value line`, onSelect: () => {
      api.addDiff({ from: { key: point.key, series: sid }, to: { key: point.key, vline: vlOn ? 'user' : 0 }, level: true })
      onAnnAdded?.('diff', api.diffs?.length ?? 0)
    } },
    { label: p.average === sid ? 'Remove average line' : 'Add average line', onSelect: () => api.setAverage(p.average === sid ? '' : sid) },
  ]
  // Right-click only adds and removes OBJECTS; styling lives in the mini toolbar ("Format…").
  const menus = {
    chart: [
      ...addItems,
      api.bars === 'stacked100' && { label: F.indicator100 ? 'Remove 100% indicator' : 'Add 100% indicator', onSelect: () => api.setFmt('indicator100', F.indicator100 ? null : true) },
      F.legend === 'none' && { label: 'Add legend', onSelect: () => api.setFmt('legend', null) },
      api.hasBars && api.bars !== 'stacked100' && { label: F.grandTotal ? 'Remove grand total' : 'Add grand total', onSelect: () => api.setFmt('grandTotal', F.grandTotal ? null : true) },
      api.barCount > 0 && api.keys.length > 1 && { label: F.connectors ? 'Remove series connectors' : 'Add series connectors', onSelect: () => api.setFmt('connectors', F.connectors ? null : true) },
      (F.table ?? []).length > 0 && { label: `Move all series to chart (${F.table.length} in table)`, onSelect: () => api.setFmt('table', null) },
      api.series.length > 1 && { label: 'Data table for all series but the first', checked: !!F.tableAll, onSelect: () => api.setFmt('tableAll', F.tableAll ? null : true) },
      api.hasBars && { label: F.horizontal ? 'Rotate to columns' : 'Rotate to horizontal bars', onSelect: () => api.setFmt('horizontal', F.horizontal ? null : true) },
      // Lines only: the profile chart (lines rotated by 90°).
      !api.hasBars && api.hasLines && { label: F.profile ? 'Rotate to lines' : 'Rotate to profile chart', onSelect: () => api.setFmt('profile', F.profile ? null : true) },
      // 180° rotation: categories and values flipped together.
      { label: 'Rotate 180°', checked: F.catOrder === 'reverse' && !!F.yAxis?.left?.reverse, onSelect: () => { const on = F.catOrder === 'reverse' && !!F.yAxis?.left?.reverse; api.setFmt('catOrder', on ? null : 'reverse'); api.setFmt('yAxis.left.reverse', on ? null : true) } },
      api.bars !== 'clustered' && api.barCount > 2 && { label: F.otherBelow ? 'Remove the Other series' : 'Group small segments as Other (< 5%)', onSelect: () => api.setFmt('otherBelow', F.otherBelow ? null : 5) },
      (F.tableCols ?? []).length > 0 && { label: `Move table columns to chart (${F.tableCols.length})`, onSelect: () => api.setFmt('tableCols', null) },
      { label: 'Transpose rows and columns', checked: !!F.transpose, onSelect: () => api.setFmt('transpose', F.transpose ? null : true) },
      { label: 'Flip horizontally', checked: F.catOrder === 'reverse', onSelect: () => api.setFmt('catOrder', F.catOrder === 'reverse' ? null : 'reverse') },
      { label: 'Flip vertically', checked: !!F.yAxis?.left?.reverse, onSelect: () => api.setFmt('yAxis.left.reverse', F.yAxis?.left?.reverse ? null : true) },
      '-',
      { label: 'Add text label', onSelect: () => (onAddNote ? onAddNote() : api.setFmt('notes', [...(F.notes ?? []), { fx: pick.atFx ?? 0.5, fy: pick.atFy ?? 0.1, text: 'Text' }])), keepOpen: !!onAddNote },
      canUndo() && { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => undoLast() },
      { label: 'Open data sheet', onSelect: () => api.setSheetOpen(true), shortcut: 'Double-click' },
      formatItem('chart'),
      '-',
      { label: 'Reset formatting', onSelect: resetAll, keepOpen: true },
    ],
    series: [
      // Ctrl + click on a segment or a point of another chart (mixed selection).
      pick.crossScale && { label: 'Set same scale', onSelect: () => pick.crossScale() },
      pick.crossScale && '-',
      ...addItems,
      { label: api.labelsOf(sid) === 'none' ? 'Add value labels' : 'Remove value labels', onSelect: () => api.setLabels(sid, api.labelsOf(sid) === 'none' ? 'all' : 'none') },
      point && { label: `Hide ${point.label}`, onSelect: () => api.toggleHidden(point.key) },
      // A figure on this single point (point-by-point labels).
      point && (api.labelsOf(sid) === 'some' && (F.labelKeys?.[sid] ?? []).map(String).includes(String(point.key))
        ? { label: `Hide the value label on ${point.label}`, onSelect: () => toggleLabelKey(point.key) }
        : api.labelsOf(sid) !== 'all' && { label: `Show the value label on ${point.label}`, onSelect: () => { if (api.labelsOf(sid) !== 'some') { api.setLabels(sid, 'some'); setLabelKeys([...(api.labelsOf(sid) === 'last' ? api.shown.slice(-1) : []), String(point.key)]) } else toggleLabelKey(point.key) } }),
      sel?.length > 1 && { label: `Remove labels of these ${sel.length}`, onSelect: () => setL('hidden', [...new Set([...(LO.hidden ?? []), ...sel.map(q => `${q.seriesId}|${q.key}`)])]) },
      sel?.length > 1 && new Set(sel.map(q => q.key)).size > 1 && { label: `Hide these ${new Set(sel.map(q => q.key)).size} categories`, onSelect: () => [...new Set(sel.map(q => q.key))].forEach(k => api.toggleHidden(k)) },
      sel?.length === 2 && { label: 'Connect these two', onSelect: () => api.setFmt('links', [...(F.links ?? []), { from: sel[0], to: sel[1] }]) },
      (F.links ?? []).length > 0 && { label: `Remove connectors (${F.links.length})`, onSelect: () => api.setFmt('links', null) },
      // Right-angle or straight connector.
      (F.links ?? []).length > 0 && { label: F.links.every(l => l.elbow === false) ? 'Use right-angle connectors' : 'Use straight connectors', onSelect: () => { const straight = !F.links.every(l => l.elbow === false); api.setFmt('links', F.links.map(l => ({ ...l, elbow: straight ? false : undefined }))) } },
      // Connector of a single segment to the next column, or of the whole series.
      mark === 'bar' && point && !sel && { label: (F.segConnectors ?? []).includes(`${sid}|${point.key}`) ? `Remove connector from ${point.label}` : `Add connector from ${point.label}`,
        onSelect: () => { const k = `${sid}|${point.key}`, cur = F.segConnectors ?? []; const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; api.setFmt('segConnectors', next.length ? next : null) } },
      mark === 'bar' && !F.connectors && { label: (F.connectorSeries ?? []).includes(sid) ? `Remove connectors of ${seriesName(sid)}` : `Add connectors to ${seriesName(sid)}`,
        onSelect: () => { const cur = F.connectorSeries ?? []; const next = cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid]; api.setFmt('connectorSeries', next.length ? next : null) } },
      // Multiple selection: the menu applies to the whole selection.
      sel?.length > 1 && { label: `Show value labels on these ${sel.length}`, onSelect: () => {
        for (const id of new Set(sel.map(q => q.seriesId))) {
          const ks = sel.filter(q => q.seriesId === id).map(q => String(q.key))
          if (api.labelsOf(id) === 'all') continue
          const cur = api.labelsOf(id) === 'some' ? (F.labelKeys?.[id] ?? []).map(String) : []
          api.setLabels(id, 'some')
          api.setFmt(`labelKeys.${id}`, [...new Set([...cur, ...ks])])
        }
        setL('hidden', (LO.hidden ?? []).filter(k => !sel.some(q => `${q.seriesId}|${q.key}` === k)) )
      } },
      sel?.length > 1 && sel.some(q => api.markOf(q.seriesId) === 'bar') && { label: `Add connectors from these ${sel.length}`, onSelect: () => api.setFmt('segConnectors', [...new Set([...(F.segConnectors ?? []), ...sel.map(q => `${q.seriesId}|${q.key}`)])]) },
      { label: inTable ? 'Move series to chart' : 'Move series to table', onSelect: () => setTable(!inTable) },
      // KPI rows under the columns (report style): growth of the series, its ratio to the first series.
      ...[['growth', null], ['ratio', api.series.find(x => x.value !== sid)?.value ?? null]].filter(([k, o]) => sid && (k === 'growth' || (o && o === api.series[0]?.value))).map(([k, o]) => {
        const has = (F.kpiRows ?? []).some(r => r.kind === k && r.of === sid && (r.over ?? null) === o)
        const name = k === 'growth' ? `${seriesName(sid)} growth` : `${seriesName(sid)} / ${seriesName(o)}`
        return { label: has ? `Remove ${name} row` : `Add ${name} row to table`,
          onSelect: () => { const rest = (F.kpiRows ?? []).filter(r => !(r.kind === k && r.of === sid && (r.over ?? null) === o)); api.setFmt('kpiRows', has ? (rest.length ? rest : null) : [...rest, { kind: k, of: sid, ...(o ? { over: o } : {}) }]) } }
      }),
      (F.table ?? []).length > 1 && { label: F.tableStripes ? 'Remove table stripes' : 'Add table stripes', onSelect: () => api.setFmt('tableStripes', F.tableStripes ? null : true) },
      { label: EB ? 'Remove error bars' : 'Add error bars', onSelect: () => setEB(EB ? null : { pct: 10 }) },
      '-',
      formatItem(sel ? 'selection' : 'series'),
    ],
    yaxis: [
      // Fit scale to data: bounds and step set by hand hand control back to the data.
      // Grayed out while the scale already follows the data.
      { label: 'Fit scale to data', disabled: ![yo.min, yo.max, yo.step].some(Number.isFinite), title: [yo.min, yo.max, yo.step].some(Number.isFinite) ? undefined : 'The scale already fits the data',
        onSelect: () => api.setFmt(`yAxis.${side}`, { ...yo, min: undefined, max: undefined, step: undefined }) },
      { label: F.grid === 'none' ? 'Add gridlines' : 'Remove gridlines', onSelect: () => api.setFmt('grid', F.grid === 'none' ? null : 'none') },
      { label: yo.tickMarks ? 'Remove tick marks' : 'Add tick marks', onSelect: () => setY('tickMarks', yo.tickMarks ? null : true) },
      { label: yo.log ? 'Set linear scale' : 'Set logarithmic scale', onSelect: () => { if (!yo.log) setY('break', null); setY('log', yo.log ? null : true) } },
      // Remove the axis: ticks, lines and title go; the scale stays.
      yo.labels === false ? { label: 'Add value axis', onSelect: () => setY('labels', null) }
        : { label: 'Remove value axis', onSelect: () => api.setFmt(`yAxis.${side}`, { ...yo, labels: false, tickMarks: undefined, line: undefined, title: undefined }) },
      '-',
      // Break at the point clicked on the axis, otherwise the suggested break.
      (yo.break || pick.atBreak || api.suggestBreak?.(side)) && { label: yo.break ? 'Remove axis break' : pick.atBreak ? 'Add axis break here' : 'Add axis break', onSelect: () => setY('break', yo.break ? null : pick.atBreak ?? api.suggestBreak?.(side)) },
      yo.break && { label: yo.breakShape === 'straight' ? 'Set wiggle break shape' : 'Set straight break shape', onSelect: () => setY('breakShape', yo.breakShape === 'straight' ? null : 'straight') },
      side === 'left' && { label: sameOn ? `Same scale as other charts${pick.ySameCount > 1 ? ` (${pick.ySameCount})` : ''}` : 'Set same scale as other charts', checked: sameOn, title: sameOn ? 'Click to remove same scale' : undefined, onSelect: toggleSame },
      // Move the axis (drag the axis to the other side): all series switch sides.
      api.series.every(x => api.axisOf(x.value) === side) && { label: `Move axis to the ${side === 'left' ? 'right' : 'left'}`, onSelect: () => api.series.forEach(x => api.setSeries(x.value, { axis: side === 'left' ? 'right' : 'left' })) },
      onAddNote && { label: 'Add text label', onSelect: () => onAddNote(), keepOpen: true },
      { label: yo.title ? 'Remove axis title' : 'Add axis title', onSelect: () => (yo.title ? setY('title', null) : (setOpenCtl('title'), setMode('bar', 'title'))), keepOpen: !yo.title },
      '-',
      formatItem('axis'),
    ],
    xaxis: [
      api.hidden.size > 0 && { label: `Show all categories (${api.hidden.size} hidden)`, onSelect: () => [...api.hidden].forEach(k => api.toggleHidden(k)) },
      { label: xo.labels === false ? 'Add category labels' : 'Remove category labels', onSelect: () => setX('labels', xo.labels === false ? null : false) },
      // X axis in dates or numbers: same range as the other charts ("Set Same Scale", X axis).
      ...xSameItems,
      { label: xo.title ? 'Remove axis title' : 'Add axis title', onSelect: () => (xo.title ? setX('title', null) : (setOpenCtl('xtitle'), setMode('bar', 'xtitle'))), keepOpen: !xo.title },
      point && api.hasBars && ((F.colBreaks ?? []).includes(point.key) || pick.breakable) && { label: (F.colBreaks ?? []).includes(point.key) ? `Remove column break on ${point.label}` : `Add column break on ${point.label}`,
        onSelect: () => api.setFmt('colBreaks', (F.colBreaks ?? []).includes(point.key) ? (F.colBreaks ?? []).filter(k => k !== point.key) : [...(F.colBreaks ?? []), point.key]) },
      point && api.hasBars && !(F.colBreaks ?? []).includes(point.key) && !pick.breakable && { label: `Add column break on ${point.label}`, disabled: true, title: 'Not the tallest value: a break would have no effect', onSelect: () => {} },
      point && at(point.key) > 0 && !api.gapBefore?.(point.key) && { label: (F.catGaps ?? []).includes(point.key) ? `Remove gap before ${point.label}` : `Add gap before ${point.label}`,
        onSelect: () => api.setFmt('catGaps', (F.catGaps ?? []).includes(point.key) ? (F.catGaps ?? []).filter(k => k !== point.key) : [...(F.catGaps ?? []), point.key]) },
      (F.catGaps ?? []).length > 0 && { label: 'Remove all category gaps', onSelect: () => { api.setFmt('catGaps', null); api.setFmt('catGapSize', null) } },
      // Category axis break without a gap.
      point && at(point.key) > 0 && !(F.tableCols ?? []).includes(point.key) && { label: (F.catBreaks ?? []).includes(point.key) ? `Remove axis break before ${point.label}` : `Add axis break before ${point.label}`,
        onSelect: () => { const cur = F.catBreaks ?? []; const next = cur.includes(point.key) ? cur.filter(k => k !== point.key) : [...cur, point.key]; api.setFmt('catBreaks', next.length ? next : null) } },
      // A category into the table on the right, then back (move to table column).
      point && ((F.tableCols ?? []).includes(point.key)
        ? { label: `Move ${point.label} back to chart`, onSelect: () => { const next = (F.tableCols ?? []).filter(k => k !== point.key); api.setFmt('tableCols', next.length ? next : null) } }
        : api.shown.length > 2 && { label: `Move ${point.label} to table column`, onSelect: () => api.setFmt('tableCols', [...(F.tableCols ?? []), point.key]) }),
      '-',
      formatItem('axis'),
    ],
    labels: [
      pick.labelKey && { label: 'Remove this label', onSelect: () => onDeleteLabel?.(pick.labelKey), shortcut: 'Del' },
      { label: `Remove all labels of ${seriesName(sid)}`, onSelect: () => api.setLabels(sid, 'none') },
      hiddenCount > 0 && { label: `Restore ${hiddenCount} removed label${hiddenCount > 1 ? 's' : ''}`, onSelect: () => setL('hidden', null) },
      movedCount > 0 && { label: `Reset label positions (${movedCount} moved)`, onSelect: () => setL('offsets', null) },
      textOf != null && { label: 'Restore original content', onSelect: () => setText(null) },
      pick.labelKey && textOf == null && { label: 'Edit text…', shortcut: 'F2', onSelect: () => { setModeState('bar'); setOpenCtl('text'); onMode?.('bar', 'text') }, keepOpen: true },
      totalsAvail && { label: p.totals ? 'Remove stack totals' : 'Add stack totals', onSelect: () => api.setPref('totals', !p.totals) },
      '-',
      formatItem('labels'),
    ],
    legend: [
      pick.seriesLabels && { label: 'Remove series labels', onSelect: () => {
        // Bar names (direct legend, the default on stacked columns) go back to a legend on top;
        // line end names are switched off.
        const onBars = ['series', 'direct'].includes(F.legend)
        if (onBars || F.legend == null) api.setFmt('legend', 'top')
        if (!onBars) api.setFmt('endLabels', false)
      } },
      { label: 'Remove legend', onSelect: () => api.setFmt('legend', 'none') },
      '-',
      formatItem('legend'),
    ],
    annotation: ann && [
      ...(ann.kind === 'diff' ? [['both', 'Show value and %'], ['abs', 'Show value'], ['pct', 'Show % of start'], ['pctEnd', 'Show % of end']].map(([v, l]) => (
        { label: l, checked: (F.diffMode ?? 'abs') === v, onSelect: () => api.setFmt('diffMode', v === 'abs' ? null : v) })) : []),
      listDiff && { label: listDiff.level ? 'Draw over the columns' : 'Draw as level difference', onSelect: () => api.setDiffAt(ann.i, { level: listDiff.level ? undefined : true }) },
      ann.kind === 'vline' && { label: 'Back to the average', onSelect: () => (listVl ? onResetValueLineAt?.(ann.i) : onResetValueLine?.()), shortcut: 'Double-click' },
      ann.kind === 'vline' && formatItem('value line'),
      '-',
      { label: 'Remove', shortcut: 'Del', onSelect: () => removeAnn() },
    ],
  }
  // The data sheet from any object (series, axes, labels, legend).
  for (const k of ['series', 'yaxis', 'xaxis', 'labels', 'legend']) {
    if (Array.isArray(menus[k])) menus[k] = [...menus[k], '-', { label: 'Open data sheet', shortcut: 'Double-click', onSelect: () => api.setSheetOpen(true) }]
  }
  // Rotated view (horizontal bars): only the actions visible there remain.
  if (F.horizontal) {
    const ok = /^(Rotate to columns|Transpose rows and columns|Flip horizontally|Undo|Open data sheet|Format chart…|Reset formatting|Add legend|Remove legend|-)$/
    menus.chart = menus.chart.filter(it => it === '-' || (it && ok.test(it.label)))
  }
  function removeAnn() {
    if (ann?.kind === 'cagr') api.removeCagr(ann.i)
    if (ann?.kind === 'diff') { if (ann.i != null) api.removeDiff(ann.i); else api.setDiff('', '') }
    if (ann?.kind === 'vline') { if (ann.i != null) api.removeValueLine(ann.i); else api.setValueLine(null, '') }
    if (ann?.kind === 'note') api.setFmt('notes', (F.notes ?? []).map((n, i) => (i === ann.i ? null : n)))
  }

  // ── Mini toolbar controls: [id, button text, menu content] ──
  // The number format: the labels' one (and the axis' by default), or an axis-specific format.
  const numbersFor = target => {
    const own = target === 'axis'
    const A = F.axisNum ?? {}
    const num = (own ? A.num : F.num) ?? {}
    const decimals = own ? A.decimals ?? null : api.decimals
    const magnitude = own ? A.magnitude ?? null : api.magnitude
    const setDec = v => (own ? api.setFmt('axisNum.decimals', v) : api.setPref('decimals', v))
    const setMag = v => (own ? api.setFmt('axisNum.magnitude', v) : api.setPref('magnitude', v))
    const setNum = (k, v) => api.setFmt(own ? `axisNum.num.${k}` : `num.${k}`, v)
    const sep = SEPARATORS.find(x => (num.thousands ?? null) === x[0] && (num.decimal ?? null) === x[1])?.[2] ?? null
    const sample = (() => {
      const base = sep ?? '1,234.5'
      const body = decimals === 0 ? base.replace(/[.,]5$/, '') : decimals === 2 ? `${base}0` : base
      const core = `${api.hasMoney && num.currency !== false ? '€' : ''}${body}${api.hasMoney ? magnitude ?? 'M' : magnitude ?? ''}`
      return `${num.prefix ?? ''}${num.neg === 'paren' ? `(${core})` : core}${num.suffix ?? ''}`
    })()
    // The preview: the series' last value, in the chosen format (not a made-up figure).
    const last = api.valuesOf(sid).at(-1)
    const fmtFn = own ? formatters?.axis : formatters?.value
    // Labels as shares: the preview shows the % actually displayed ("+86.2%"), not the euro amount.
    const shareMode = target === 'labels' && (LO.content === 'share' || LO.content === 'valueShare')
    const colSum = api.series.map(x => api.valuesOf(x.value).at(-1)).filter(Number.isFinite).reduce((a, v) => a + Math.abs(v), 0)
    const pctShown = shareMode && last != null && colSum ? `${LO.pctPlus && last > 0 ? '+' : ''}${((Math.abs(last) / colSum) * 100).toFixed(LO.pctDecimals ?? api.decimals ?? 0)}%` : null
    const preview = pctShown ? (LO.content === 'valueShare' && fmtFn ? `${fmtFn(last, api.unitOf?.(sid))} (${pctShown})` : pctShown) : last != null && fmtFn ? fmtFn(last, api.unitOf?.(sid)) : sample
    const body = (
      <NumberFormatFields preview={preview} decimals={decimals} magnitude={magnitude} num={num} sep={sep}
        setDec={setDec} setMag={setMag} setNum={setNum} showMagnitude={api.hasMagnitude} money={api.hasMoney}
        consistent={!!LO.consistent} setConsistent={target === 'labels' && api.bars === 'stacked' ? v => setL('consistent', v || null) : undefined}
        onPercent={target === 'labels' && api.hasBars ? f => { setL('content', LO.content === 'valueShare' ? 'valueShare' : 'share'); setL('pctDecimals', f.decimals ?? 0); setL('pctPlus', f.plus ? true : null) } : undefined} />
    )
    return { sample, preview, body }
  }
  const labelNumbers = numbersFor('labels')
  const axisOwn = !!F.axisNum
  const axisNumbers = numbersFor(axisOwn ? 'axis' : 'labels')

  const fill = tokenOf(scope === 'point' && point ? (st.points?.[point.key] ?? st.color) : st.color)
  const paint = c => {
    if (scope === 'selection' && sel) return sel.forEach(q => api.setPointColor(q.seriesId, q.key, c))
    if (scope === 'point' && point) return api.setPointColor(sid, point.key, c)
    api.setSeries(sid, { color: c })
  }
  const dot = c => <span className="chart-bar__dot" style={{ background: tok(c ?? 'gray-400') }} />
  // The pattern of the chosen scope: a segment (format.patternPoints), the selection, or the series.
  const patternNow = scope === 'point' && point ? (F.patternPoints?.[`${sid}|${point.key}`] ?? F.patterns?.[sid] ?? null) : (F.patterns?.[sid] ?? null)
  const setPattern = v => {
    const pts = scope === 'selection' && sel ? sel.map(q => `${q.seriesId}|${q.key}`) : scope === 'point' && point ? [`${sid}|${point.key}`] : null
    if (pts) {
      const next = { ...(F.patternPoints ?? {}) }
      for (const k of pts) { if (v == null) next[k] = 'none'; else next[k] = v }
      return api.setFmt('patternPoints', next)
    }
    api.setFmt(`patterns.${sid}`, v)
  }
  const lineGlyph = (d, w = 1.75) => <svg width={18} height={8} aria-hidden="true"><line x1={1} x2={17} y1={4} y2={4} stroke="currentColor" strokeWidth={w} strokeDasharray={d ?? undefined} /></svg>
  const seriesPicker = multi && (
    <Line label="Series">
      <div className="chart-pop__chips">
        {api.series.map(s => (
          <button key={s.value} type="button" className={`chart-wheel__chip${sid === s.value ? ' is-on' : ''}`} aria-pressed={sid === s.value}
            onClick={() => { setSid(s.value); if (scope === 'point') setScope('series') }}>
            {dot(tokenOf(api.colorOf(s.value)))}<span className="chart-wheel__chip-text">{s.label}</span>
          </button>
        ))}
      </div>
    </Line>
  )

  const controls = {
    chart: [
      api.barCount > 1 && ['type', BAR_MODES.find(([v]) => v === api.bars)?.[2] ?? IconLayoutColumns, `Type: ${(BAR_MODES.find(([v]) => v === api.bars)?.[1] ?? 'Clustered').toLowerCase()}`, 'Bar type', (
        <>
          <Line label="Bars"><Seg label="Bar type" value={api.bars} onPick={v => api.setPref('bars', v)} items={BAR_MODES} /></Line>
          {api.bars !== 'clustered' && <Line label="Segments"><Seg label="Segment order" value={F.stackOrder ?? null} onPick={v => api.setFmt('stackOrder', v)} items={ORDERS} /></Line>}
          {api.bars !== 'clustered' && <Line label="Per column"><Seg label="Segment order within each column" value={F.stackOrder === 'descCat' || F.stackOrder === 'ascCat' ? F.stackOrder : null} onPick={v => api.setFmt('stackOrder', v)}
            items={[[null, 'Same in all'], ['descCat', 'Largest at bottom'], ['ascCat', 'Smallest at bottom']]} /></Line>}
          {api.bars !== 'clustered' && <Line label="Colors"><Seg label="Color scheme order" value={F.colorOrder ?? null} onPick={v => api.setFmt('colorOrder', v)} items={[[null, 'Bottom to top'], ['reverse', 'Top to bottom']]} /></Line>}
          {/* "Other" series: the small segments of a column grouped at the top. */}
          {api.bars !== 'clustered' && api.barCount > 2 && <Line label="Other"><Seg label="Group small segments as Other" value={F.otherBelow ?? null} onPick={v => api.setFmt('otherBelow', v)}
            items={[[null, 'Off'], [3, '< 3%'], [5, '< 5%'], [10, '< 10%']]} /></Line>}
        </>
      )],
      api.hasAreas && ['areas', IconArrowsExchange, `Areas: ${{ stacked: 'stacked', stacked100: '100%' }[F.areaMode] ?? 'overlapping'}`, 'Area type and order', (
        <>
          <Line label="Areas"><Seg label="Area type" value={F.areaMode ?? null} onPick={v => api.setFmt('areaMode', v)} items={[[null, 'Overlapping'], ['stacked', 'Stacked'], ['stacked100', '100%']]} /></Line>
          <Line label="Order"><Seg label="Area order" value={F.areaOrder ?? null} onPick={v => api.setFmt('areaOrder', v)} items={ORDERS.slice(0, 2)} /></Line>
        </>
      )],
      ['colors', <>{(schemeColors(F) ?? api.series.map(s => tokenOf(api.colorOf(s.value)))).slice(0, 3).map((c, i) => <span key={i}>{dot(c)}</span>)}</>, `Colors: ${F.scheme === 'custom' ? (F.customScheme?.name ?? 'custom') : (SCHEME_LIST.find(([v]) => v === (F.scheme ?? ''))?.[1] ?? 'Default').replace(' colors', '').toLowerCase()}`, 'Color scheme', (
        <div className="chart-pop__schemes">
          {SCHEME_LIST.map(([v, l]) => (
            <button key={v || 'screen'} type="button" role="radio" aria-checked={(F.scheme ?? '') === v}
              className={`chart-wheel__scheme${(F.scheme ?? '') === v ? ' is-on' : ''}`} onClick={() => api.setFmt('scheme', v || null)}>
              <span className="chart-wheel__scheme-dots">{(SCHEMES[v] ?? api.series.map(s => tokenOf(api.colorOf(s.value)))).slice(0, 4).map((c, i) => <span key={i} style={{ background: tok(c ?? 'gray-400') }} />)}</span>
              {l}
            </button>
          ))}
          {/* The user's named schemes (custom fill schemes): saved per browser, JSON style file. */}
          <SchemeTools current={api.series.map(s => tokenOf(api.colorOf(s.value)) ?? 'gray-400')} active={F.scheme === 'custom' ? F.customScheme?.name : null}
            onApply={s => { api.setFmt('scheme', s ? 'custom' : null); api.setFmt('customScheme', s) }} />
        </div>
      )],
      ['text', IconTextSize, { xsmall: 'Extra small', small: 'Small', large: 'Large', xlarge: 'Extra large' }[F.fontSize] ?? 'Medium', 'Text size', (
        <Line label="Text size"><Seg label="Text size" value={F.fontSize ?? null} onPick={v => api.setFmt('fontSize', v)} items={SIZES} /></Line>
      )],
      extra.some(s => s.items?.length) && ['extra', IconAdjustments, extra.filter(s => s.items?.length).map(s => s.label).join(' · '), 'More options for this chart', (
        <>{extra.filter(s => s.items?.length).map(s => (
          <Line key={s.label} label={s.label}>{s.items.map(it => <Check key={it.key} on={it.on} onClick={it.onToggle}>{it.label}</Check>)}</Line>
        ))}</>
      )],
    ],
    series: [
      // A data table series (style like a table): fill, rules, size.
      asTable && ['tablestyle', IconTable, `Table: ${TS.fill === 'rows' || (TS.fill == null && F.tableStripes) ? 'stripes' : 'no fill'}${TS.lines && TS.lines !== 'none' ? ` · ${TS.lines === 'all' ? 'row lines' : 'frame'}` : ''}${TS.size ? ` · ${TABLE_SIZES.find(([v]) => v === TS.size)?.[1]}` : ''}`, 'Style like a table', (
        <>
          <Line label="Fill"><Seg label="Table fill" value={TS.fill ?? (F.tableStripes ? 'rows' : null)} onPick={v => { api.setFmt('tableStripes', null); setTS('fill', v ?? 'none') }} items={[[null, 'None'], ['rows', 'Stripes']]} /></Line>
          {(TS.fill === 'rows' || (TS.fill == null && F.tableStripes)) && <>
            <Line label="Color 1"><Swatches palette={TABLE_FILLS} value={TS.colors?.[0] ?? 'gray-100'} onPick={c => setTS('colors', [c, TS.colors?.[1] ?? null])} /></Line>
            <Line label="Color 2"><Swatches palette={TABLE_FILLS} value={TS.colors?.[1] ?? null} onPick={c => setTS('colors', [TS.colors?.[0] ?? null, c])} /></Line>
          </>}
          <Line label="Lines"><Seg label="Table lines" value={TS.lines ?? 'none'} onPick={v => setTS('lines', v === 'none' ? null : v)} items={[['none', 'None'], ['frame', 'Top and bottom'], ['all', 'Every row']]} /></Line>
          <Line label="Size"><Seg label="Table text size" value={TS.size ?? null} onPick={v => setTS('size', v)} items={TABLE_SIZES} /></Line>
        </>
      )],
      ['type', SHAPES.find(([v]) => v === mark)?.[2] ?? IconChartBar, `${SHAPES.find(([v]) => v === mark)?.[1] ?? 'Bars'}${multi && api.axisOf(sid) === 'right' ? ' · right axis' : ''}`, 'Series type and axis', (
        <>
          {seriesPicker}
          <Line label="Type"><Seg label="Series type" value={mark} onPick={v => api.setSeries(sid, { mark: v })} items={SHAPES} /></Line>
          {multi && <Line label="Axis"><Seg label="Axis" value={api.axisOf(sid)} onPick={v => api.setSeries(sid, { axis: v })} items={[['left', 'Left'], ['right', 'Right']]} /></Line>}
          {mark === 'bar' && api.barCount > 1 && api.bars !== 'clustered' && (
            <Line label="Stack"><Seg label="Stack group" value={api.stackOf?.(sid) ?? null} onPick={v => api.setSeries(sid, { stack: v })}
              items={[[null, 'Main'], ['B', 'Second'], ['C', 'Third']]} /></Line>
          )}
        </>
      )],
      ['fill', dot(fill), `${mark === 'bar' ? 'Fill' : 'Color'}: ${scope === 'selection' && sel ? (new Set(sel.map(q => api.styleOf(q.seriesId)?.points?.[q.key] ?? api.styleOf(q.seriesId)?.color)).size > 1 ? 'mixed' : colorName(fill)) : colorName(fill)}${scope === 'point' && point ? ` (${point.label} only)` : ''}`, 'Fill color', (
        <>
          {(point || sel) && (
            <Line label="Apply to"><Seg label="Fill scope" value={scope} onPick={setScope}
              items={[['series', 'Whole series'], ...(sel ? [['selection', `${sel.length} selected`]] : point ? [['point', `${point.label} only`, null, `${point.label} only. Ctrl + click (or Ctrl + A) to add bars`]] : [])]} /></Line>
          )}
          <Swatches palette={api.palette} value={fill} onPick={paint} />
          {/* Patterns: on the same scope as the color. */}
          {mark === 'bar' && <Line label="Pattern"><Seg label="Fill pattern" value={patternNow} onPick={setPattern} items={PATTERN_ITEMS} /></Line>}
          {mark === 'bar' && api.hasForecast && <Line label=""><Check on={!!F.forecastHatch} onClick={() => api.setFmt('forecastHatch', F.forecastHatch ? null : true)} title="Forecast bars in their series color, hatched">Hatch forecast bars</Check></Line>}
        </>
      )],
      mark === 'bar' && ['outline', IconBorderStyle2, !st.stroke || st.stroke === 'none' ? 'None' : st.stroke === 'gray-800' ? 'Dark' : st.stroke === 'white' ? 'Light' : 'Color', 'Outline', (
        <>
          <Line label="Color"><Seg label="Outline" value={!st.stroke || st.stroke === 'none' ? 'none' : ['gray-800', 'white'].includes(st.stroke) ? st.stroke : 'custom'} onPick={v => v !== 'custom' && api.setSeries(sid, { stroke: v })} items={[['none', 'None'], ['gray-800', 'Dark'], ['white', 'Light']]} /></Line>
          <Swatches palette={api.palette} value={st.stroke} onPick={c => api.setSeries(sid, { stroke: c })} />
          {st.stroke && st.stroke !== 'none' && <>
            <Line label="Style"><Seg label="Outline style" value={st.dash ?? 'solid'} onPick={v => api.setSeries(sid, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
            <Line label="Weight"><Seg label="Outline weight" value={st.weight ?? null} onPick={v => api.setSeries(sid, { weight: v })} items={WEIGHTS.map(w => [w, `${w} pt`])} /></Line>
          </>}
        </>
      )],
      mark !== 'bar' && ['line', lineGlyph(DASHES.find(d => d[0] === (st.dash ?? 'solid'))?.[2], st.weight ?? 1.75), `${DASHES.find(d => d[0] === (st.dash ?? 'solid'))?.[1]}${st.weight ? ` · ${st.weight} pt` : ''}`, 'Line style, weight and markers', (
        <>
          <Line label="Style"><Seg label="Line style" value={st.dash ?? 'solid'} onPick={v => api.setSeries(sid, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
          <Line label="Weight"><Seg label="Line weight" value={st.weight ?? null} onPick={v => api.setSeries(sid, { weight: v })} items={WEIGHTS.map(w => [w, `${w} pt`])} /></Line>
          <Line label="Markers"><Seg label="Markers" value={st.markerShape ?? (st.marker ? 'circle' : 'none')} onPick={v => api.setSeries(sid, { markerShape: v })} items={MARKERS.map(([v, l, g]) => [v, `${g}`, null, l])} /></Line>
          <Line label=""><Check on={!!st.smooth} onClick={() => api.setSeries(sid, { smooth: !st.smooth })}>Smooth line</Check></Line>
          <Line label="Shape"><Seg label="Line shape" value={st.step ?? null} onPick={v => api.setSeries(sid, { step: v })} items={[[null, 'Line'], ['lines', 'Net (one dash per column)'], ['steps', 'Steps']]} /></Line>
          {st.step === 'lines' && <Line label="">
            <Check on={F.netJoin !== false} onClick={() => api.setFmt('netJoin', F.netJoin === false ? null : false)} title="Neighbouring dashes of equal value form one line">Join equal dashes</Check>
            <Check on={!!F.netConnectors} onClick={() => api.setFmt('netConnectors', F.netConnectors ? null : true)}>Connectors between dashes</Check>
          </Line>}
          {/* Per-series interpolation: connect, break, or count missing values as zero. */}
          <Line label="Missing"><Seg label="Missing values on this line" value={F.gapsBy?.[sid] ?? null} onPick={v => api.setFmt(`gapsBy.${sid}`, v)}
            items={[[null, 'As the chart'], ['connect', 'Connect'], ['break', 'Break'], ['zero', 'Zero']]} /></Line>
          <Line label=""><Check on={F.lineScheme === 'distinct'} onClick={() => api.setFmt('lineScheme', F.lineScheme === 'distinct' ? null : 'distinct')}>Line scheme: distinct dash and marker per line</Check></Line>
        </>
      )],
      ['errors', IconArrowsVertical, EB ? `Error: ${EB.lo || EB.hi ? 'from series' : `±${EB.pct}%`}${EB.thick ? ' · range' : ''}` : 'Error: none', 'Error bars', (
        <>
          <Line label="Error bars"><Seg label="Error bars" value={EB ? (EB.lo || EB.hi ? 'series' : 'pct') : null}
            onPick={v => setEB(v === null ? null : v === 'pct' ? { pct: EB?.pct ?? 10, thick: EB?.thick } : { lo: others[0]?.[0], hi: others[0]?.[0], thick: EB?.thick })}
            items={[[null, 'None'], ['pct', '± %'], ...(others.length ? [['series', 'From a series']] : [])]} /></Line>
          {EB && !(EB.lo || EB.hi) && <Line label="Percent"><Field label="Error percent" value={String(EB.pct ?? 10)} onCommit={v => { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= 0) setEB({ ...EB, pct: n }) }} /></Line>}
          {EB && (EB.lo || EB.hi) && <>
            <Line label="Up"><Seg label="Upper deviation series" value={EB.hi ?? null} onPick={v => setEB({ ...EB, hi: v })} items={[[null, 'None'], ...others]} /></Line>
            <Line label="Down"><Seg label="Lower deviation series" value={EB.lo ?? null} onPick={v => setEB({ ...EB, lo: v })} items={[[null, 'None'], ...others]} /></Line>
          </>}
          {EB && <Line label=""><Check on={!!EB.thick} onClick={() => setEB({ ...EB, thick: EB.thick ? null : true })}>Thick (range bar)</Check></Line>}
          {EB && !EB.thick && <Line label="Line"><Seg label="Error bar line weight" value={EB.weight ?? null} onPick={v => setEB({ ...EB, weight: v })} items={[[null, 'Thin'], [1.75, 'Medium'], [2.5, 'Thick']]} /></Line>}
          {EB && <Line label="Color"><Swatches palette={api.palette} value={EB.color} onPick={c => setEB({ ...EB, color: c })} /></Line>}
          {/* Ends: the shape of each marker, top and bottom separately. */}
          {EB && !EB.thick && <Line label="Ends">
            <Seg label="Upper end" value={EB.capHi ?? 'bar'} onPick={v => setEB({ ...EB, capHi: v === 'bar' ? undefined : v })} items={CAPS.map(([v, g, t]) => [v, g, null, `Upper end: ${t}`])} />
            <Seg label="Lower end" value={EB.capLo ?? 'bar'} onPick={v => setEB({ ...EB, capLo: v === 'bar' ? undefined : v })} items={CAPS.map(([v, g, t]) => [v, g === '▲' ? '▼' : g, null, `Lower end: ${t}`])} />
          </Line>}
          {/* Several pairs: each with its own % difference and color. */}
          {EB && !(EB.lo || EB.hi) && (EB.more ?? []).map((m, j) => (
            <Line key={j} label={`Pair ${j + 2}`}>
              <Field label={`Error percent, pair ${j + 2}`} value={String(m.pct ?? '')} onCommit={v => { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= 0) setEB({ ...EB, more: EB.more.map((x, i) => (i === j ? { ...x, pct: n } : x)) }) }} />
              <Swatches palette={api.palette} value={m.color} onPick={c => setEB({ ...EB, more: EB.more.map((x, i) => (i === j ? { ...x, color: c } : x)) })} />
              <button type="button" className="chart-pop__link" onClick={() => setEB({ ...EB, more: EB.more.filter((_, i) => i !== j) })}>Remove</button>
            </Line>
          ))}
          {EB && !(EB.lo || EB.hi) && !EB.thick && <Line label=""><button type="button" className="chart-pop__link" onClick={() => setEB({ ...EB, more: [...(EB.more ?? []), { pct: (EB.pct ?? 10) * 2, color: 'gray-400' }] })}>Add another pair</button></Line>}
        </>
      )],
      ['labels', IconTag, SHOW.find(([v]) => v === api.labelsOf(sid))?.[1] ?? 'None', 'Value labels', (
        <Line label="Show"><Seg label="Value labels" value={api.labelsOf(sid)} onPick={v => api.setLabels(sid, v)} items={SHOW} /></Line>
      )],
    ],
    yaxis: [
      api.hasRight && ['side', IconArrowsVertical, side === 'left' ? 'Left' : 'Right', 'Which value axis', (
        <Line label="Axis"><Seg label="Axis" value={side} onPick={setSide} items={[['left', 'Left'], ['right', 'Right']]} /></Line>
      )],
      ['scale', IconRuler2, manual ? `Scale: ${fmtBound(yo.min)} – ${fmtBound(yo.max)}${yo.log ? ' · log' : ''}` : yo.break ? 'Scale: auto · break' : 'Scale: auto', 'Scale', (
        <>
          <Line label="Range">
            <Field label="Min" numeric value={yo.min ?? ''} placeholder="Auto" onCommit={v => setY('min', v)} />
            <Field label="Max" numeric value={yo.max ?? ''} placeholder="Auto" onCommit={v => setY('max', v)} />
            <Field label="Step" numeric value={yo.step ?? ''} placeholder="Auto" onCommit={v => setY('step', v != null && v > 0 ? v : null)} />
          </Line>
          <Line label="Options">
            <div className="chart-pop__stack">
            <Check on={!!yo.log} onClick={() => { if (!yo.log) setY('break', null); setY('log', yo.log ? null : true) }} title="Zero and negative values sit on the base, flagged ! (removes any axis break)">Logarithmic</Check>
            <Check on={!!yo.reverse} onClick={() => setY('reverse', yo.reverse ? null : true)}>Descending</Check>
            {side === 'left' && <Check on={sameOn} onClick={toggleSame} title="All charts on this page with this option share one scale">Same scale as other charts</Check>}
            <Check on={!!yo.break} onClick={() => setY('break', yo.break ? null : api.suggestBreak?.(side))}
              title={api.suggestBreak?.(side) || yo.break ? 'Compress part of the axis' : 'Not available on a % or logarithmic axis'}>Axis break</Check>
            </div>
          </Line>
          {side === 'left' && sameOn && yo.same != null && yo.same !== false && <Line label="Shared with"><Seg label="Same scale group" value={yo.same === true ? true : yo.same} onPick={v => setY('same', v)} items={[[true, 'All charts'], ['A', 'Group A'], ['B', 'Group B'], ['C', 'Group C']]} /></Line>}
          {yo.break && (
            <Line label="Break">
              <Field label="From" numeric value={yo.break.from} onCommit={v => v != null && setY('break', { ...yo.break, from: v })} />
              <Field label="To" numeric value={yo.break.to} onCommit={v => v != null && setY('break', { ...yo.break, to: v })} />
              <Seg label="Break shape" value={yo.breakShape ?? null} onPick={v => setY('breakShape', v)} items={[[null, 'Wiggle'], ['straight', 'Straight']]} />
            </Line>
          )}
          {manual && <Line label=""><button type="button" className="chart-pop__link" onClick={autoScale}>Reset to automatic scale</button></Line>}
        </>
      )],
      ['show', IconEye, `Tick labels: ${yo.labels !== false ? 'on' : 'off'}${yo.tickMarks ? ' · ticks' : ''}${yo.line ? ' · line' : ''}`, 'Show tick labels, tick marks, axis line', (
        <Line label="">
          <Check on={yo.labels !== false} onClick={() => setY('labels', yo.labels === false ? null : false)}>Tick labels</Check>
          <Check on={!!yo.tickMarks} onClick={() => setY('tickMarks', yo.tickMarks ? null : true)}>Tick marks</Check>
          <Check on={!!yo.line} onClick={() => setY('line', yo.line ? null : true)}>Axis line</Check>
          <Check on={!!yo.labelsInside} onClick={() => setY('labelsInside', yo.labelsInside ? null : true)} title="Tick labels on the other side of the axis line, inside the plot">Labels inside</Check>
        </Line>
      )],
      ['grid', IconGridDots, { none: 'None', dash: 'Dashed' }[F.grid] ?? 'Solid', 'Gridlines', (
        <>
          <Line label="Style"><Seg label="Gridlines" value={F.grid ?? null} onPick={v => api.setFmt('grid', v)} items={[['none', 'None'], [null, 'Solid'], ['dash', 'Dashed']]} /></Line>
          {F.grid !== 'none' && <Line label="Tone"><Seg label="Gridline tone" value={F.gridColor ? 'custom' : F.gridTone ?? null} onPick={v => { if (v !== 'custom') { api.setFmt('gridColor', null); api.setFmt('gridTone', v) } }} items={[[null, 'Light'], ['dark', 'Dark']]} /></Line>}
          {F.grid !== 'none' && <Line label="Color"><Swatches palette={api.palette} value={F.gridColor} onPick={c => api.setFmt('gridColor', c)} /></Line>}
        </>
      )],
      // Lines only: switching to % turns them into 100 % areas (percent axis conversion).
      !api.hasBars && api.hasLines && api.series.length > 1 && ['content', IconPercentage, F.areaMode === 'stacked100' ? '% (100% areas)' : 'Absolute', 'Axis values', (
        <Line label="Values"><Seg label="Axis content" value={F.areaMode === 'stacked100' ? 'pct' : 'abs'}
          onPick={v => { api.setFmt('areaMode', v === 'pct' ? 'stacked100' : null); api.series.forEach(x => api.setSeries(x.value, { mark: v === 'pct' ? 'area' : 'line' })) }}
          items={[['abs', 'Absolute'], ['pct', '% (100% areas)']]} /></Line>
      )],
      api.barCount > 1 && ['content', IconPercentage, api.bars === 'stacked100' ? '% of column' : 'Absolute', 'Axis values', (
        <Line label="Values"><Seg label="Axis content" value={api.bars === 'stacked100' ? 'pct' : 'abs'}
          onPick={v => api.setPref('bars', v === 'pct' ? 'stacked100' : api.bars === 'stacked100' ? 'stacked' : api.bars)}
          items={[['abs', 'Absolute'], ['pct', '% of column']]} /></Line>
      )],
      ['title', IconLetterT, `Title: ${yo.title || 'none'}`, 'Axis title', (
        <Line label=""><Field label="Axis title" wide value={yo.title ?? ''} placeholder="None" onCommit={v => setY('title', v)} /></Line>
      )],
      ['numbers', null, `Format: ${axisNumbers.preview}`, 'Number format of the axis', (
        <>
          <Line label=""><Check on={!axisOwn} onClick={() => api.setFmt('axisNum', axisOwn ? null : { decimals: api.decimals ?? undefined })}>Same format as the labels</Check></Line>
          {axisNumbers.body}
        </>
      )],
    ],
    xaxis: [
      // Linked axis (same scale): marked with a link icon at the start of the mini toolbar.
      pick.xNumeric && xo.same && ['same', IconLink, xLinked.length ? xSameLabel : 'Same scale', xLinked.length ? `Same scale as ${xLinked.join(', ')}` : 'Same scale as other charts', (
        <>
          {xLinked.length > 0 && <div className="chart-pop__note">Same days per pixel as {xLinked.join(', ')}.</div>}
          <Line label=""><button type="button" className="chart-pop__more" onClick={xUnlink}>Remove same scale</button></Line>
        </>
      )],
      ['order', ORDERS.find(([v]) => v === (F.catOrder === 'reverse' ? 'reverse' : p.sort || null))?.[2] ?? IconArrowsSort, (ORDERS.find(([v]) => v === (F.catOrder === 'reverse' ? 'reverse' : p.sort || null))?.[1] ?? 'Sheet order').replace(' order', ''), 'Category order', (
        <Line label="Order"><Seg label="Category order" value={F.catOrder === 'reverse' ? 'reverse' : p.sort || null}
          onPick={v => { api.setFmt('catOrder', v === 'reverse' ? 'reverse' : null); api.setPref('sort', v === 'desc' || v === 'asc' ? v : '') }}
          items={api.grain === 'category' ? ORDERS : ORDERS.slice(0, 2)} /></Line>
      )],
      ['show', IconEye, `Labels: ${xo.labels !== false ? 'on' : 'off'}${xo.tickMarks ? ' · ticks' : ''}${xo.line ? ' · line' : ''}`, 'Show labels, tick marks, axis line', (
        <Line label="">
          <Check on={xo.labels !== false} onClick={() => setX('labels', xo.labels === false ? null : false)}>Labels</Check>
          <Check on={!!xo.tickMarks} onClick={() => setX('tickMarks', xo.tickMarks ? null : true)}>Tick marks</Check>
          <Check on={!!xo.line} onClick={() => setX('line', xo.line ? null : true)}>Axis line</Check>
        </Line>
      )],
      xo.labels !== false && ['text', IconCalendar, xo.ordinal ? 'Ranks' : xo.dateFormat ? `Date: ${xo.dateFormat}` : api.grain === 'category' ? 'Names' : 'Date: auto', 'Label text: date format or ranks', (
        <>
          {api.grain !== 'category' && <Line label="Date"><Seg label="Date format" value={xo.dateFormat ?? null} onPick={v => setX('dateFormat', v)}
            items={[[null, 'Auto'], ...(api.grain === 'year' ? [['yyyy', '2024'], ['’yy', '’24'], ["'FY'yy", 'FY24']] : api.grain === 'quarter' ? [["'Q'Q yy", 'Q1 24'], ["'Q'Q yyyy", 'Q1 2024'], ["yyyy-'Q'Q", '2024-Q1'], ['QQQ yyyy', 'I 2024'], ["'Q'Q¶yyyy", 'Q1¶2024'], ['MMM yy', 'Mar 24']] : [['MMM yy', 'Mar 24'], ['MMMM yyyy', 'March 2024'], ['MM/yy', '03/24'], ['MMM¶yyyy', 'Mar¶2024'], ['M', '3']])]} /></Line>}
          {api.grain !== 'category' && <Line label="Custom"><Field label="Date format codes" wide value={xo.dateFormat ?? ''} placeholder="yyyy yy QQQ QQ Q MMMM MMM M dd ddd w www · 'text' \x ¶" onCommit={v => setX('dateFormat', v || null)} /></Line>}
          {api.grain !== 'category' && <Line label=""><Check on={!!xo.mixedYears} onClick={() => setX('mixedYears', xo.mixedYears ? null : true)}>Full year on first label and each new year</Check></Line>}
          <Line label=""><Check on={!!xo.ordinal} onClick={() => setX('ordinal', xo.ordinal ? null : true)}>Ranks instead of names (1st, 2nd…)</Check></Line>
          {/* Date axis (YYYY-MM-DD categories): ticks per unit, start of week. */}
          {api.grain === 'category' && !api.hasBars && xo.numeric !== false && api.shown.length > 2 && api.shown.every(k => /^\d{4}-\d{2}-\d{2}$/.test(k)) && <>
            <Line label="Ticks"><Seg label="Date axis tick unit" value={xo.dateUnit ?? null} onPick={v => setX('dateUnit', v)} items={[[null, 'Each date'], ['year', 'Years'], ['quarter', 'Quarters'], ['month', 'Months'], ['week', 'Weeks'], ['day', 'Days']]} /></Line>
            {xo.dateUnit === 'week' && <Line label="Week starts"><Seg label="Week starts on" value={xo.weekStart ?? null} onPick={v => setX('weekStart', v)} items={[[null, 'Monday'], [6, 'Sunday'], [5, 'Saturday']]} /></Line>}
          </>}
          {api.grain === 'category' && !api.hasBars && <Line label=""><Check on={xo.numeric !== false} onClick={() => setX('numeric', xo.numeric === false ? null : false)} title="Numeric categories placed at their value, not their rank">Value axis for numeric categories</Check></Line>}
          {!api.hasBars && api.hasLines && <Line label="Position"><Seg label="Axis crosses" value={xo.crosses ?? null} onPick={v => setX('crosses', v)} items={[[null, 'Between categories'], ['at', 'On categories']]} /></Line>}
          <Line label="Spacing"><Seg label="Label spacing" value={xo.every ?? null} onPick={v => setX('every', v)} items={[[null, 'Auto'], [1, 'Every label'], [2, 'Every 2nd'], [4, 'Every 4th'], [12, 'Every 12th']]} /></Line>
        </>
      )],
      ['xtitle', IconLetterT, `Title: ${xo.title || 'none'}`, 'Axis title (drag it along the axis; double-click to recenter)', (
        <Line label=""><Field label="Category axis title" wide value={xo.title ?? ''} placeholder="None" onCommit={v => setX('title', v || null)} /></Line>
      )],
      xo.labels !== false && ['rotation', IconRotate, `${xo.rotate ?? 0}°`, 'Label rotation', (
        <Line label="Rotation"><Seg label="Label rotation" value={xo.rotate ?? null} onPick={v => setX('rotate', v)} items={[[null, '0°'], [45, '45°'], [90, '90°']]} /></Line>
      )],
      api.hasBars && ['gap', IconColumns, GAPS.find(([v]) => v === (Number.isFinite(F.gap) ? F.gap : null))?.[1] ?? `${Math.round((1 - (F.gap ?? 0)) * 100)}%`, 'Column width (or drag the handle on the baseline)', (
        <Line label="Width"><Seg label="Column width" value={Number.isFinite(F.gap) ? F.gap : null} onPick={v => api.setFmt('gap', v)} items={GAPS} /></Line>
      )],
      api.hasLines && api.grain !== 'category' && ['gaps', IconLine, F.gaps === 'break' ? 'Break' : 'Connect', 'Missing periods on lines', (
        <>
          <Line label="Missing"><Seg label="Missing periods on lines" value={F.gaps ?? null} onPick={v => api.setFmt('gaps', v)} items={[[null, 'Connect the line'], ['break', 'Break the line']]} /></Line>
          {api.hasAreas && <Line label="Areas"><Seg label="Missing periods on areas" value={F.areaGaps ?? null} onPick={v => api.setFmt('areaGaps', v)} items={[[null, 'Interpolate'], ['zero', 'Drop to zero']]} /></Line>}
        </>
      )],
      api.keys.length > 1 && ['cats', IconCategory, `Shown: ${api.shown.length}/${api.keys.length}`, 'Categories shown', (
        <div className="chart-wheel__cats" role="group" aria-label="Categories shown">
          {api.keys.map(k => {
            const on = !api.hidden.has(k)
            return (
              <button key={k} type="button" className={`chart-wheel__cat${on ? ' is-on' : ''}`} aria-pressed={on}
                title={on ? `Hide ${api.nameOf(k)}` : `Show ${api.nameOf(k)}`} onClick={() => api.toggleHidden(k)}>{api.nameOf(k)}</button>
            )
          })}
        </div>
      )],
    ],
    labels: [
      // Free size too large for the card: reported (drawn size); labels removed for lack of room: counted.
      (labelInfo?.noRoom > 0 || labelInfo?.cap) && ['noroom', null, [labelInfo.noRoom > 0 && `${labelInfo.noRoom} hidden (no room)`, labelInfo.cap && `shown at ${labelInfo.cap.used} pt`].filter(Boolean).join(', '), 'Labels that do not fit', (
        <div className="chart-pop__note">{[
          labelInfo.cap && `${labelInfo.cap.asked} pt does not fit in the chart: labels are drawn at ${labelInfo.cap.used} pt.`,
          labelInfo.noRoom > 0 && `${labelInfo.noRoom} label${labelInfo.noRoom > 1 ? 's' : ''} left out for lack of room; hover a bar or point to read its value.`,
        ].filter(Boolean).join(' ')}</div>
      )],
      ['show', IconTag, SHOW.find(([v]) => v === api.labelsOf(sid))?.[1] ?? 'None', 'Value labels', (
        <>
          {seriesPicker}
          <Line label="Show"><Seg label="Value labels" value={api.labelsOf(sid)} onPick={v => { api.setLabels(sid, v); if (v === 'some' && !(F.labelKeys?.[sid] ?? []).length) setLabelKeys(point ? [point.key] : api.shown.slice(-1)) }} items={SHOW} /></Line>
          {/* "Chosen": tick the categories that carry their figure. */}
          {api.labelsOf(sid) === 'some' && (
            <div className="chart-wheel__cats" role="group" aria-label="Categories with a value label">
              {api.shown.map(k => {
                const on = (F.labelKeys?.[sid] ?? []).map(String).includes(String(k))
                return <button key={k} type="button" className={`chart-wheel__cat${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleLabelKey(k)}>{api.nameOf(k)}</button>
              })}
            </div>
          )}
        </>
      )],
      totalsAvail && ['totals', IconSum, `Totals: ${p.totals ? 'on' : 'off'}`, 'Stack totals', (
        <Line label=""><Check on={!!p.totals} onClick={() => api.setPref('totals', !p.totals)}>Show stack totals</Check></Line>
      )],
      ['content', IconListDetails, { share: '%', valueShare: 'Value + %', series: 'Series', category: 'Category', seriesValue: 'Series + value', seriesShare: 'Series + %' }[LO.content] ?? 'Value', 'Label content', (
        <>
          <Line label="Content"><Seg label="Label content" value={LO.content ?? null} onPick={v => setL('content', v)}
            items={[[null, 'Value'], ...(api.hasBars ? [['share', '%'], ['valueShare', 'Value + %'], ['seriesShare', 'Series + %']] : []), ['series', 'Series'], ['seriesValue', 'Series + value'], ['category', 'Category']]} /></Line>
          {(LO.content === 'share' || LO.content === 'valueShare' || LO.content === 'seriesShare') && <Line label="% format">
            <Seg label="Percent decimals" value={LO.pctDecimals ?? null} onPick={v => setL('pctDecimals', v)} items={[[null, 'Same'], [0, '0%'], [1, '0.0%'], [2, '0.00%']]} />
            <Check on={!!LO.pctPlus} onClick={() => setL('pctPlus', LO.pctPlus ? null : true)}>+ on positives</Check>
          </Line>}
        </>
      )],
      pick.labelKey && ['text', IconLetterT, textOf != null ? `Text: ${textOf}` : 'Text: automatic', 'Text of this label (F2)', (
        <>
          <Line label="Text"><Field label="This label's text" wide autoFocus value={textOf ?? currentLabelText ?? ''} placeholder="{value}" onCommit={v => setText(v === '' ? null : v)} /></Line>
          <Line label="Fields"><span className="chart-pop__hint">{'{value} {share} {series} {category} stay linked to the data'}</span></Line>
          <Line label="This label">
            <Seg label="Size of this label" value={oneStyle.size ?? null} onPick={v => setOne({ size: v })} items={SIZES} />
            <PtField label="Size of this label in points" value={oneStyle.size} onPick={v => setOne({ size: v })} />
            <FontPick label="Font of this label" value={oneStyle.font ?? LO.font ?? null} onPick={v => setOne({ font: v === (LO.font ?? null) ? null : v ?? 'mono' })} />
            <Check on={oneStyle.bold !== false} onClick={() => setOne({ bold: oneStyle.bold === false ? null : false })}>Bold</Check>
            <Check on={oneStyle.italic ?? !!LO.italic} onClick={() => setOne({ italic: !(oneStyle.italic ?? !!LO.italic) === !!LO.italic ? null : !(oneStyle.italic ?? !!LO.italic) })}>Italic</Check>
            <Check on={oneStyle.underline ?? !!LO.underline} onClick={() => setOne({ underline: !(oneStyle.underline ?? !!LO.underline) === !!LO.underline ? null : !(oneStyle.underline ?? !!LO.underline) })}>Underline</Check>
          </Line>
          <Line label="Color"><Swatches palette={api.palette} value={oneStyle.color} onPick={c => setOne({ color: c })} /></Line>
        </>
      )],
      api.hasBars && ['position', IconAlignBoxBottomCenter, { inside: 'Inside', outside: 'Outside' }[LO.position] ?? 'Auto', 'Label position', (
        <Line label="Position"><Seg label="Label position" value={LO.position ?? null} onPick={v => setL('position', v)} items={[[null, 'Auto'], ['inside', 'Inside'], ['outside', 'Outside']]} /></Line>
      )],
      ['style', IconBrush, `Style: ${LO.bold === false ? 'regular' : 'bold'}${LO.color ? `, ${LO.color}` : ''}`, 'Label style', (
        <>
          <Line label="Color"><Seg label="Label color" value={LO.color ?? null} onPick={v => setL('color', v)} items={[[null, 'Series'], ['black', 'Black'], ['gray', 'Gray'], ['accent', 'Accent']]} />
            {/* Free label color (free style): the same row as Fill. */}
            <CustomColor value={LO.color} onPick={c => setL('color', c)} /></Line>
          <Line label="Rotation"><Seg label="Label rotation" value={LO.rotate ?? null} onPick={v => setL('rotate', v)} items={[[null, '0°'], [45, '45°'], [90, '90° left', null, 'Rotate 90° left (reads upward)'], [-90, '90° right', null, 'Rotate 90° right (reads downward)']]} /></Line>
          <Line label="Size"><Seg label="Label size" value={LO.size ?? null} onPick={v => setL('size', v)} items={SIZES} /><PtField label="Label size in points" value={LO.size} onPick={v => setL('size', v)} /></Line>
          <Line label="">
            <Check on={LO.bold !== false} onClick={() => setL('bold', LO.bold === false ? null : false)}>Bold</Check>
            <Check on={!!LO.italic} onClick={() => setL('italic', LO.italic ? null : true)}>Italic</Check>
            <Check on={!!LO.underline} onClick={() => setL('underline', LO.underline ? null : true)}>Underline</Check>
            <Check on={!!LO.keepAll} onClick={() => setL('keepAll', LO.keepAll ? null : true)}>Keep overlapping</Check>
          </Line>
          <Line label="Font"><FontPick label="Label font" value={LO.font ?? null} onPick={v => setL('font', v)} /></Line>
        </>
      )],
      ['numbers', null, `Format: ${labelNumbers.preview}`, 'Number format', labelNumbers.body],
    ],
    legend: [
      ['position', IconLayoutList, { bottom: 'Bottom', none: 'Hidden', series: 'On chart' }[F.legend] ?? 'Top', 'Legend position', (
        <>
          <Line label="Position"><Seg label="Legend position" value={F.legend ?? null} onPick={v => api.setFmt('legend', v)} items={[['top', 'Top'], ['bottom', 'Bottom'], ['direct', 'On chart'], ['none', 'Hidden']]} /></Line>
          {(F.legend ?? null) !== 'none' && !['series', 'direct'].includes(F.legend) && <Line label=""><Check on={!!F.legendFrame} onClick={() => api.setFmt('legendFrame', F.legendFrame ? null : true)}>Frame</Check></Line>}
          {/* The frame line style of the legend. */}
          {F.legendFrame && !['series', 'direct'].includes(F.legend) && <Line label="Frame"><Seg label="Legend frame style" value={F.legendFrameStyle ?? null} onPick={v => api.setFmt('legendFrameStyle', v)} items={DASHES.map(([v, l, d]) => [v === 'solid' ? null : v, l, () => lineGlyph(d)])} /></Line>}
          {F.legendOffset && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.setFmt('legendOffset', null)}>Put the legend back in place</button></Line>}
        </>
      )],
      ['size', IconTextSize, { xsmall: 'Extra small', small: 'Small', large: 'Large', xlarge: 'Extra large' }[F.legendSize] ?? 'Medium', 'Legend text size', (
        <Line label="Text size"><Seg label="Legend text size" value={F.legendSize ?? null} onPick={v => api.setFmt('legendSize', v)} items={SIZES} /></Line>
      )],
      ['options', IconAdjustments, [F.legendOrder === 'reverse' && 'Reversed', F.legendCagr && 'CAGR in names', api.hasLines && (F.endLabels !== false ? 'Line names: at ends' : 'Line names: off')].filter(Boolean).join(' · ') || 'Default order', 'Legend options', (
        <Line label="">
          <Check on={F.legendOrder === 'reverse'} onClick={() => api.setFmt('legendOrder', F.legendOrder === 'reverse' ? null : 'reverse')}>Reverse order</Check>
          {api.series.length > 2 && <span className="chart-pop__order" role="group" aria-label="Legend order">
            {legendIds.map((id, i) => (
              <button key={id} type="button" className="chart-seg__opt" disabled={i === 0} title={`Move ${seriesName(id)} up in the legend`}
                onClick={() => { const n = [...legendIds]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; api.setFmt('legendOrder', n) }}>↑ {seriesName(id)}</button>
            ))}
          </span>}
          <Check on={!!F.legendCagr} onClick={() => api.setFmt('legendCagr', F.legendCagr ? null : true)}>CAGR in names</Check>
          {api.hasLines && <Check on={F.endLabels !== false} onClick={() => api.setFmt('endLabels', F.endLabels === false ? null : false)}>Names at line ends</Check>}
        </Line>
      )],
    ],
    annotation: ann ? [
      // Start and end of an arrow (choose from which column to which column).
      (ann.kind === 'cagr' || ann.kind === 'diff') && ['ends', IconArrowsExchange, endsLabel, 'Where the arrow starts and ends', (
        <>
          <Line label="From"><select className="chart-opts-input" aria-label="Arrow start" value={arrowEnds.from ?? ''} onChange={e => setEnd('from', e.target.value)}>
            {api.shown.map(k => <option key={k} value={k} disabled={k === arrowEnds.to}>{api.nameOf(k)}</option>)}
          </select></Line>
          <Line label="To"><select className="chart-opts-input" aria-label="Arrow end" value={arrowEnds.to ?? ''} onChange={e => setEnd('to', e.target.value)}>
            {api.shown.map(k => <option key={k} value={k} disabled={k === arrowEnds.from}>{api.nameOf(k)}</option>)}
          </select></Line>
          {ann.kind === 'cagr' && <Line label=""><span className="chart-pop__hint">Years are counted on the real dates, hidden or missing years included.</span></Line>}
        </>
      )],
      // CAGR arrow color: tokens.
      ann.kind === 'cagr' && arrowEnds.from && arrowEnds.to && ['color', dot(F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500'), `Color: ${colorName(F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500')}`, 'Arrow color', (
        <Swatches palette={['gray-500', 'gray-700', 'black', ...api.palette.filter(c => !['gray-500', 'gray-700', 'black'].includes(c))]} value={F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500'}
          onPick={c => api.setFmt('cagrTones', { ...(F.cagrTones ?? {}), [`${arrowEnds.from}|${arrowEnds.to}`]: c === 'gray-500' ? undefined : c })} />
      )],
      ann.kind === 'diff' && ['mode', IconPercentage, { both: 'Value + %', pct: '% of start', pctEnd: '% of end' }[F.diffMode] ?? 'Value', 'What the arrow shows (double-click it to cycle)', (
        <>
          <Line label="Show"><Seg label="Difference arrow" value={F.diffMode ?? null} onPick={v => api.setFmt('diffMode', v)} items={[[null, 'Value'], ['both', 'Value + %'], ['pct', '% of start'], ['pctEnd', '% of end']]} /></Line>
        </>
      )],
      ann.kind === 'note' && ['text', IconLetterT, `Text: ${note?.text || 'empty'}`, 'Text label (drag it to move)', (
        <>
          <Line label="Text"><Field label="Text label" wide autoFocus multiline title="Enter to confirm, Shift+Enter for a new line; {B2} shows that data-sheet cell and follows it; drag the label on the chart to move it" value={note?.text ?? ''} onCommit={v => setNote({ text: v })} /></Line>
        </>
      )],
      ann.kind === 'note' && ['style', IconBrush, `Style: ${note?.bold ? 'bold' : 'regular'}`, 'Text label style', (
        <Line label="">
          <Seg label="Text size" value={note?.size ?? null} onPick={v => setNote({ size: v })} items={[['small', 'S'], [null, 'M'], ['large', 'L']]} />
          <Seg label="Text alignment" value={note?.align ?? null} onPick={v => setNote({ align: v })} items={[[null, 'Left'], ['center', 'Center'], ['right', 'Right']]} />
          <Seg label="Vertical alignment" value={note?.valign ?? null} onPick={v => setNote({ valign: v })} items={[[null, 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} />
          <Seg label="Text rotation" value={note?.rotate ?? null} onPick={v => setNote({ rotate: v })} items={[[null, '0°'], [90, '↺ 90°', null, 'Rotate 90° left'], [-90, '↻ 90°', null, 'Rotate 90° right']]} />
          <Check on={!!note?.bold} onClick={() => setNote({ bold: note?.bold ? null : true })}>Bold</Check>
        </Line>
      )],
      listDiff && ['style', IconArrowsVertical, listDiff.level ? 'Level difference' : 'Over the columns', 'Arrow style', (
        <Line label="Style"><Seg label="Arrow style" value={listDiff.level ? 'level' : null} onPick={v => api.setDiffAt(ann.i, { level: v === 'level' ? true : undefined })}
          items={[[null, 'Over the columns'], ['level', 'Level difference (beside)']]} /></Line>
      )],
      listVl && ['value', IconLineHeight, `${listVl.value}${listVl.label ? ` · ${listVl.label}` : ''}`, 'Value line', (
        <>
          <Line label=""><Field label="Value" numeric value={listVl.value ?? ''} onCommit={v => v != null && api.setValueLineAt(ann.i, { value: v })} /><Field label="Label" value={listVl.label ?? ''} placeholder="e.g. Budget" onCommit={v => api.setValueLineAt(ann.i, { label: v || undefined })} /></Line>
          <Line label="Label at"><Seg label="Label side" value={listVl.side ?? 'right'} onPick={v => api.setValueLineAt(ann.i, { side: v })} items={[['left', 'Left'], ['right', 'Right']]} /></Line>
          <Line label="Style"><Seg label="Value line style" value={listVl.dash ?? 'dash'} onPick={v => api.setValueLineAt(ann.i, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
          <button type="button" className="chart-pop__link" onClick={() => onResetValueLineAt?.(ann.i)}>Back to the average</button>
        </>
      )],
      ann.kind === 'vline' && !listVl && ['value', IconLineHeight, `${p.valueLine}${p.valueLineLabel ? ` · ${p.valueLineLabel}` : ''}`, 'Value line', (
        <>
          <Line label=""><Field label="Value" numeric value={p.valueLine ?? ''} onCommit={v => api.setValueLine(v)} /><Field label="Label" value={p.valueLineLabel ?? ''} placeholder="e.g. Target" onCommit={v => api.setPref('valueLineLabel', v)} /></Line>
          <Line label="Label at"><Seg label="Label side" value={p.valueLineSide ?? 'right'} onPick={v => api.setPref('valueLineSide', v)} items={[['left', 'Left'], ['right', 'Right']]} /></Line>
          <button type="button" className="chart-pop__link" onClick={() => onResetValueLine?.()}>Back to the average</button>
        </>
      )],
    ] : [],
  }

  const annName = ann && { cagr: 'CAGR arrow', diff: 'Difference arrow', vline: 'Value line', note: 'Text label' }[ann.kind]
  const objName = obj === 'annotation' ? annName
    : obj === 'series' ? (sel ? `${sel.length} bars` : `${seriesName(sid)}${point ? ` · ${point.label}` : ''}`)
    : obj === 'labels' ? 'Labels'
    : OBJECTS.find(([v]) => v === obj)?.[1] ?? 'Chart'
  // The first control: the object being formatted, and switching to another one.
  const OBJ_ICON = { chart: IconLayoutColumns, series: SHAPES.find(([v]) => v === mark)?.[2] ?? IconChartBar, yaxis: IconArrowsVertical, xaxis: IconArrowsExchange, labels: IconTag, legend: IconLayoutList, annotation: IconFocus2 }
  const objectCtl = ['object', OBJ_ICON[obj] ?? IconFocus2, objName, 'Object being formatted (click to switch)', (
    <div className="chart-pop__objects" role="menu">
      {OBJECTS.map(([v, l]) => (
        <button key={v} type="button" role="menuitemradio" aria-checked={obj === v} className={`chart-menu__item${obj === v ? ' is-on' : ''}`}
          onClick={() => { setObj(v); setOpenCtl(null) }}>
          <span className="chart-menu__icon">{obj === v ? <IconCheck size={13} /> : null}</span><span className="chart-menu__text">{l}</span>
        </button>
      ))}
    </div>
  )]
  // "+ Add" in every mini toolbar: the right-click additions and removals stay reachable without it.
  // Same list as the right click (minus "Format…" and "Reset"), for all objects.
  const addOf = (menus[obj] ?? []).filter(it => it && it !== '-' && !String(it.label).startsWith('Format ') && it.label !== 'Reset formatting')
    // From the bar, no category is designated: the break is set by right-clicking one of them.
    .map(it => (/^(Add|Remove) gap before /.test(it.label) ? { label: 'Add gap before a category', disabled: true, title: 'Right-click a category on the axis', onSelect: () => {} } : it))
  const addCtl = obj !== 'annotation' && addOf.length > 0
    && ['more', IconPlus, '', 'Add, remove and other actions (same as right-click)', <ActionMenu items={addOf} onClose={() => setOpenCtl(null)} />]
  // A generic value (None, Auto, Medium…) reads with its name: "Outline: none".
  const GENERIC = /^(None|Auto|Medium|Solid|Absolute|Sheet|Reverse|Value|0°|Top|Bars|Line|Area|Series|Connect|All|Last|On|Off|%|Value \+ %|Category)$/
  const SHORT = {
    'Series type and axis': 'Type', 'Outline': 'Outline', 'Value labels': 'Labels', 'Scale': 'Scale', 'Gridlines': 'Gridlines',
    'Axis values': 'Values', 'Category order': 'Order', 'Label rotation': 'Rotation', 'Column width (or drag the handle on the baseline)': 'Width',
    'Missing periods on lines': 'Gaps', 'Label content': 'Content', 'Label position': 'Position', 'Legend position': 'Position',
    'Legend text size': 'Text', 'Text size': 'Text', 'Fill color': 'Fill',
  }
  const display = (title, value) => {
    if (typeof value !== 'string' || !GENERIC.test(value) || !title) return value
    const name = SHORT[title] ?? title.replace(/\s*\(.*\)$/, '')
    return `${name}: ${value.toLowerCase()}`
  }
  const fullList = [objectCtl, ...(controls[obj] ?? []).filter(Boolean), ...(addCtl ? [addCtl] : [])]
  // Room counted: values only, then controls folded behind "⋯" (never a cut word).
  const level = useCompactLevel(ref, String(obj))
  const list = compactList(fullList, level, { head: 1, tail: addCtl ? 1 : 0, display: display, pin: openCtl })

  // Left / right arrows move from one control to the next (a toolbar).
  const onBarKey = e => {
    if (!e.target.classList?.contains('chart-bar__ctl')) return
    const all = [...ref.current.querySelectorAll('.chart-bar__ctl')]
    const i = all.indexOf(e.target)
    if (e.key === 'ArrowRight') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpenCtl(list[i]?.[0]) }
  }

  const barContent = (
    <div className="chart-bar" role="toolbar" aria-label={`Format: ${objName}`} onKeyDown={onBarKey}>
      {list.map(([id, Icon, value, title, body], i) => (
        <div key={id} className={`chart-bar__slot${i === 0 ? ' is-object' : ''}`}>
          <button type="button" className={`chart-bar__ctl${value === '' ? ' is-icon' : ''}${openCtl === id ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded={openCtl === id}
            title={title} aria-label={value === "" ? title : `${title}: ${value}`} onClick={() => setOpenCtl(o => (o === id ? null : id))}>
            {/* The name already says what the control sets: the icon only stays where there is no text
                (object picker, "+"), or when it carries the value (the fill color). */}
            {Icon && (id === 'object' || value === '' || id === 'fill' || id === 'colors' || id === 'same') &&
              (typeof Icon === 'function' || Icon.$$typeof === Symbol.for('react.forward_ref') ? <Icon size={14} aria-hidden="true" /> : Icon)}
            {value !== '' && <><span className="chart-bar__val">{compactValue(display(title, value), level)}</span><IconChevronDown size={11} aria-hidden="true" /></>}
          </button>
          {openCtl === id && <Pop right={i > list.length / 2} auditRight={anchor.auditRight}>{body}</Pop>}
        </div>
      ))}
      {obj === 'annotation' && (
        <button type="button" className="chart-bar__icon" onClick={() => { removeAnn(); onClose() }} title="Remove (Del)" aria-label="Remove"><IconTrash size={14} /></button>
      )}
      {obj === 'chart' && <>
        <button type="button" className="chart-bar__text" onClick={() => { api.setSheetOpen(true); onClose() }} title="Open the data sheet (or double-click the chart)">Data</button>
        <span className="chart-wheel__sep" aria-hidden="true" />
        {undo
          ? <button type="button" className="chart-bar__undo" onClick={() => { api.restore(undo); setUndo(null) }}>Undo reset</button>
          : <button type="button" className="chart-bar__text" onClick={resetAll} title="Remove every format change on this chart (you can undo)">Reset</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label="Close" title="Close (Esc)"><IconX size={13} /></button>
    </div>
  )

  const panel = (
    <div ref={ref} className={`chart-wheel chart-wheel--${mode}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onContextMenu={e => e.preventDefault()}>
      {mode === 'menu' ? <ActionMenu items={menus[obj] ?? menus.chart} onClose={onClose} /> : barContent}
    </div>
  )
  return createPortal(panel, document.body)
}

/** The settings button: opens the mini toolbar under it, on the whole chart. */
export function ChartWheelButton({ api, extra, formatters }) {
  const [anchor, setAnchor] = useState(null)
  const btnRef = useRef(null)
  if (!api) return null
  const toggle = () => {
    if (anchor) return setAnchor(null)
    const r = btnRef.current.getBoundingClientRect()
    const geo = cardGeometry(btnRef.current)
    setAnchor({ x: r.right, y: r.bottom, align: 'right', box: geo.box, lineTop: geo.lineTop, minLeft: geo.minLeft })
  }
  return (
    <>
      <button type="button" ref={btnRef} data-wheel-anchor className="chart-opts-btn" onClick={toggle}
        title="Chart format: colours, labels, scale and sort. Tip: click any part of the chart to format it directly" aria-label="Chart format" aria-expanded={!!anchor}>
        <IconPalette size={13} />
      </button>
      {anchor && <ChartWheel api={api} formatters={formatters} pick={{ tab: 'chart', mode: 'bar' }} anchor={anchor} extra={extra} onClose={() => setAnchor(null)} />}
    </>
  )
}

/** The bar, guarded: an error closes it without touching the chart. */
export function ChartWheel(props) {
  return <BarBoundary onClose={props.onClose}><ChartWheelInner {...props} /></BarBoundary>
}
