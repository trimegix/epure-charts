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
import { useT } from './uiLocale.js'

const WEIGHTS = [1, 1.5, 2, 3]
// The objects of a chart, in the order Alt + arrows walks them.
const OBJECT_IDS = ['chart', 'series', 'yaxis', 'xaxis', 'labels', 'legend']
// The option tables, in the interface's language (tr = useT()).
const tablesOf = tr => {
  const SHAPES = [['bar', tr('Bars'), IconChartBar], ['line', tr('Line'), IconChartLine], ['area', tr('Area'), IconChartArea]]
  const BAR_MODES = [['clustered', tr('Clustered'), IconLayoutColumns], ['stacked', tr('Stacked'), IconStack2], ['stacked100', '100% stacked', IconPercentage]]
  const ORDERS = [[null, tr('Sheet order'), IconArrowsSort], ['reverse', tr('Reverse order'), IconArrowsExchange], ['desc', tr('Largest first'), IconSortDescending], ['asc', tr('Smallest first'), IconSortAscending]]
  // The order's short name in a bar value ("Order: sheet").
  const ORDER_SHORT = { sheet: tr('Sheet'), reverse: tr('Reverse') }
  const SHOW = [['none', tr('None')], ['last', tr('Last')], ['some', tr('Chosen')], ['all', tr('All')]]
  const DASHES = [['solid', tr('Solid'), null], ['dash', tr('Dashed'), '4 3'], ['dot', tr('Dotted'), '1.5 2.5']]
  const MARKERS = [['none', tr('No marker'), '∅'], ['circle', tr('Circle'), '●'], ['square', tr('Square'), '■'], ['diamond', tr('Diamond'), '◆'], ['triangle', tr('Triangle'), '▲']]
  const DECIMALS = [[null, tr('Auto')], [0, '0'], [1, tr('0.0')], [2, tr('0.00')]]
  // The magnitude of an amount (×10³, ×10⁶, ×10⁹).
  const MAGNITUDES = [[null, tr('Auto'), tr('Magnitude chosen by the screen')], ['k', 'k', tr('Thousands (×10³)')], ['M', 'M', tr('Millions (×10⁶)')], ['B', 'B', tr('Billions (×10⁹)')], ['prime', tr('Prime (′ ″)'), tr('Prime notation: ′ millions, ″ billions')]]
  const SCHEME_LIST = [['', tr('Default colors')], ['categorical', tr('Categorical')], ['accent', tr('Accent')], ['gray', tr('Grays')], ['blue', tr('Blues')]]
  // Fill patterns.
  const PATTERN_ITEMS = [[null, tr('Solid')], ['hatch', '///', null, tr('Hatched')], ['hatchBack', '\\\\\\', null, tr('Hatched backward')], ['cross', '×', null, tr('Crosshatch')], ['dots', '···', null, tr('Dots')], ['lines', '≡', null, tr('Lines')]]
  // Ends of an error bar.
  const CAPS = [['bar', '—', tr('line')], ['none', '∅', tr('none')], ['dot', '●', tr('dot')], ['arrow', '▲', tr('arrow')]]
  // Text size steps (chart, labels, legend).
  const SIZES = [['xsmall', 'XS', null, tr('Extra small')], ['small', 'S', null, tr('Small')], [null, 'M', null, tr('Medium')], ['large', 'L', null, tr('Large')], ['xlarge', 'XL', null, tr('Extra large')]]
  const GAPS = [[null, tr('Auto')], [0.1, tr('Wide')], [0.3, tr('Medium')], [0.5, tr('Narrow')], [0.7, tr('Thin')]]
  const OBJECTS = [['chart', tr('Chart')], ['series', tr('Series')], ['yaxis', tr('Value axis')], ['xaxis', tr('Category axis')], ['labels', tr('Labels')], ['legend', tr('Legend')]]
  return { SHAPES, BAR_MODES, ORDERS, ORDER_SHORT, SHOW, DASHES, MARKERS, DECIMALS, MAGNITUDES, SCHEME_LIST, PATTERN_ITEMS, CAPS, SIZES, GAPS, OBJECTS }
}

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
  const tr = useT()
  const [more, setMore] = useState(false)
  // One row: the scheme's colors, plus the current color if it is not one of them.
  const main = [...palette.slice(0, 8), ...(value && !palette.slice(0, 8).includes(value) && palette.includes(value) ? [value] : [])]
  const all = more ? palette : main
  return (
    <div className="chart-pop__swatches">
      {all.map(c => (
        <button key={c} type="button" className={`chart-editor-swatch${value === c ? ' is-on' : ''}`}
          style={{ background: tok(c) }} aria-label={tr('Color {name}', { name: c })} aria-pressed={value === c} title={c} onClick={() => onPick(c)} />
      ))}
      {all === main && palette.length > main.length && (
        <button type="button" className="chart-pop__more" onClick={() => setMore(true)}>{tr('More…')}</button>
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
  const tr = useT()
  const { DECIMALS, MAGNITUDES } = tablesOf(tr)
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
    if (f.percent) { if (onPercent) { onPercent(f); setNote(null) } else setNote(tr('% applies to shares: set the labels Content to %')); return }
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
      <Line label={tr('Preview')}><span className="chart-pop__preview">{preview}</span></Line>
      <Line label={tr('Example')}>
        <input className="chart-opts-input chart-pop__example" aria-label={tr('Type an example')} placeholder={tr('e.g. €1 234,5M or (1,234)')} title={tr('Type an example number: decimals, separators, sign, prefix and suffix follow it')}
          onKeyDown={e => { if (e.key === 'Enter') { applyExample(e.currentTarget.value); e.currentTarget.value = '' } }}
          onBlur={e => { if (e.currentTarget.value) { applyExample(e.currentTarget.value); e.currentTarget.value = '' } }} />
      </Line>
      {note && <Line label=""><span className="chart-pop__hint" role="status">{note}</span></Line>}
      {recent.length > 0 && <Line label={tr('Recent')}>{recent.map(r => <button key={r} type="button" className="chart-seg__opt chart-pop__recent" onClick={() => applyExample(r)}>{r}</button>)}</Line>}
      <Line label={tr('Decimals')}><Seg label={tr('Decimals')} value={decimals} onPick={setDec} items={DECIMALS} /></Line>
      {showMagnitude && <Line label={tr('Magnitude')}><Seg label={tr('Magnitude')} value={magnitude} onPick={setMag} items={MAGNITUDES.map(([v, l]) => [v, l])} /></Line>}
      {/* Round sums consistently: the labels of a stack sum to the displayed total. */}
      {setConsistent && <Line label=""><Check on={!!consistent} onClick={() => setConsistent(!consistent)}>{tr('Round sums consistently')}</Check></Line>}
      <Line label=""><button type="button" className="chart-seg__opt chart-pop__more" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? tr('Fewer options') : tr('More options…')}</button></Line>
      {more && <>
      <Line label={tr('Separators')}>
        <Seg label={tr('Separators')} value={sep}
          onPick={v => { const x = SEPARATORS.find(y => y[2] === v); setNum('thousands', x[0]); setNum('decimal', x[1]) }}
          items={SEPARATORS.map(x => [x[2], x[2]])} />
      </Line>
      <Line label={tr('Negatives')}>
        <Seg label={tr('Negatives')} value={num.neg ?? null} onPick={v => setNum('neg', v)} items={[[null, '−12'], ['paren', '(12)']]} />
        {money && <Check on={num.currency !== false} onClick={() => setNum('currency', num.currency === false ? null : false)}>{tr('Show €')}</Check>}
      </Line>
      <Line label={tr('Sign')}>
        <Check on={!!num.plus} onClick={() => setNum('plus', num.plus ? null : true)}>{tr('+ on positives')}</Check>
        <Seg label={tr('Sign position')} value={num.signPos ?? null} onPick={v => setNum('signPos', v)} items={[[null, '−€12'], ['value', '€−12']]} />
      </Line>
      <Line label={tr('Minus')}>
        <Seg label={tr('Minus')} value={num.minus ?? null} onPick={v => setNum('minus', v)} items={[[null, tr('− minus')], ['hyphen', tr('- hyphen')], ['endash', tr('– dash')]]} />
      </Line>
      <Line label={tr('Affixes')}>
        <Field label={tr('Prefix')} inline placeholder={tr('Prefix')} value={num.prefix ?? ''} onCommit={v => setNum('prefix', v)} />
        <Field label={tr('Suffix')} inline placeholder={tr('Suffix')} value={num.suffix ?? ''} onCommit={v => setNum('suffix', v)} />
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
  const tr = useT()
  const { SHAPES, BAR_MODES, ORDERS, ORDER_SHORT, SHOW, DASHES, MARKERS, SCHEME_LIST, PATTERN_ITEMS, CAPS, SIZES, GAPS, OBJECTS } = tablesOf(tr)
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
        setObj(o => { const ids = OBJECT_IDS; const i = Math.max(0, ids.indexOf(o)); return ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length] })
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
    ? `${api.nameOf(arrowEnds.from)} → ${api.nameOf(arrowEnds.to)}${pick.ann?.kind === 'cagr' && yearsOf(arrowEnds.from, arrowEnds.to) ? tr(' ({n} yrs)', { n: yearsOf(arrowEnds.from, arrowEnds.to) }) : ''}`
    : tr('From → to')
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
  const xSameLabel = tr('Same scale: {n} charts', { n: xLinked.length + 1 })
  const xSameItems = !pick.xNumeric ? [] : xo.same
    ? [
      { label: xLinked.length ? xSameLabel : tr('Same scale (no linked chart)'), checked: true, title: `${xLinked.length ? tr('Linked with {names}. ', { names: xLinked.join(', ') }) : ''}${tr('Click to remove same scale')}`, onSelect: xUnlink },
      ...xPart.filter(q => !q.linked).map(q => ({ label: tr('Also same scale with {name}', { name: q.title }), onSelect: () => pick.xLink([q.id]) })),
    ]
    : xPart.length
      ? [
        ...xPart.map(q => ({ label: tr('Set same scale with {name}', { name: q.title }), onSelect: () => pick.xLink([q.id]) })),
        xPart.length > 1 && { label: tr('Set same scale with all {n} charts', { n: xPart.length + 1 }), onSelect: () => pick.xLink(xPart.map(q => q.id)) },
      ]
      : [{ label: tr('Set same scale as other charts'), disabled: true, title: tr('No other chart with this kind of axis on the page'), onSelect: () => {} }]
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
  const fmtBound = v => (Number.isFinite(v) ? (formatters?.axis ?? formatters?.value)?.(v, api.unitOf?.(api.series.find(x => api.axisOf(x.value) === side)?.value) ?? 'M') ?? String(v) : tr('auto'))
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
  // format: true marks the "Format…" entries (left out of the bar's "+" list).
  const formatItem = label => ({ label, format: true, onSelect: () => setMode('bar'), keepOpen: true })
  const ann = pick.ann

  const addItems = [
    n > 1 && { label: point ? tr('Add CAGR arrow from {name}', { name: point.label }) : tr('Add CAGR arrow'), onSelect: addCagr },
    selKeys.length > 2 && { label: tr('Add CAGR arrows for successive pairs ({n})', { n: selKeys.length - 1 }), onSelect: () => { api.addCagrPairs(selKeys); onAnnAdded?.('cagr', api.cagrs.length) } },
    n > 1 && { label: point ? tr('Add difference arrow from {name}', { name: point.label }) : tr('Add difference arrow'), onSelect: () => addDiff(point && multi ? sid : undefined) },
    sel?.length === 2 && { label: tr('Add difference arrow between these two'), onSelect: () => addDiffBetween(false) },
    sel?.length === 2 ? { label: tr('Add level difference arrow between these two'), onSelect: () => addDiffBetween(true) }
      : point && n > 1 && { label: tr('Add level difference arrow from {name}', { name: point.label }), onSelect: () => addDiff(sid, true) },
    diffCount > 0 && { label: tr('Remove difference arrows ({n})', { n: diffCount }), onSelect: () => { api.setDiff('', ''); api.setFmt('diffs', null) } },
    api.cagrs.length > 1 && { label: tr('Remove CAGR arrows ({n})', { n: api.cagrs.length }), onSelect: () => api.setPref('cagrs', []) },
    { label: tr('Add value line'), onSelect: addValueLine },
    vlCount > 0 && { label: vlCount > 1 ? tr('Remove value lines ({n})', { n: vlCount }) : tr('Remove value line'), onSelect: removeValueLines },
    // The difference to the target (arrow to value line): from this point to the value line.
    point && vlCount > 0 && { label: tr('Add difference arrow from {name} to the value line', { name: point.label }), onSelect: () => {
      api.addDiff({ from: { key: point.key, series: sid }, to: { key: point.key, vline: vlOn ? 'user' : 0 }, level: true })
      onAnnAdded?.('diff', api.diffs?.length ?? 0)
    } },
    { label: p.average === sid ? tr('Remove average line') : tr('Add average line'), onSelect: () => api.setAverage(p.average === sid ? '' : sid) },
  ]
  // Right-click only adds and removes OBJECTS; styling lives in the mini toolbar ("Format…").
  const menus = {
    chart: [
      ...addItems,
      api.bars === 'stacked100' && { label: F.indicator100 ? tr('Remove 100% indicator') : tr('Add 100% indicator'), onSelect: () => api.setFmt('indicator100', F.indicator100 ? null : true) },
      F.legend === 'none' && { label: tr('Add legend'), onSelect: () => api.setFmt('legend', null) },
      api.hasBars && api.bars !== 'stacked100' && { label: F.grandTotal ? tr('Remove grand total') : tr('Add grand total'), onSelect: () => api.setFmt('grandTotal', F.grandTotal ? null : true) },
      api.barCount > 0 && api.keys.length > 1 && { label: F.connectors ? tr('Remove series connectors') : tr('Add series connectors'), onSelect: () => api.setFmt('connectors', F.connectors ? null : true) },
      (F.table ?? []).length > 0 && { label: tr('Move all series to chart ({n} in table)', { n: F.table.length }), onSelect: () => api.setFmt('table', null) },
      api.series.length > 1 && { label: tr('Data table for all series but the first'), checked: !!F.tableAll, onSelect: () => api.setFmt('tableAll', F.tableAll ? null : true) },
      api.hasBars && { label: F.horizontal ? tr('Rotate to columns') : tr('Rotate to horizontal bars'), onSelect: () => api.setFmt('horizontal', F.horizontal ? null : true) },
      // Lines only: the profile chart (lines rotated by 90°).
      !api.hasBars && api.hasLines && { label: F.profile ? tr('Rotate to lines') : tr('Rotate to profile chart'), onSelect: () => api.setFmt('profile', F.profile ? null : true) },
      // 180° rotation: categories and values flipped together.
      { label: tr('Rotate 180°'), checked: F.catOrder === 'reverse' && !!F.yAxis?.left?.reverse, onSelect: () => { const on = F.catOrder === 'reverse' && !!F.yAxis?.left?.reverse; api.setFmt('catOrder', on ? null : 'reverse'); api.setFmt('yAxis.left.reverse', on ? null : true) } },
      api.bars !== 'clustered' && api.barCount > 2 && { label: F.otherBelow ? tr('Remove the Other series') : tr('Group small segments as Other (< 5%)'), onSelect: () => api.setFmt('otherBelow', F.otherBelow ? null : 5) },
      (F.tableCols ?? []).length > 0 && { label: tr('Move table columns to chart ({n})', { n: F.tableCols.length }), onSelect: () => api.setFmt('tableCols', null) },
      { label: tr('Transpose rows and columns'), checked: !!F.transpose, onSelect: () => api.setFmt('transpose', F.transpose ? null : true) },
      { label: tr('Flip horizontally'), checked: F.catOrder === 'reverse', onSelect: () => api.setFmt('catOrder', F.catOrder === 'reverse' ? null : 'reverse') },
      { label: tr('Flip vertically'), checked: !!F.yAxis?.left?.reverse, onSelect: () => api.setFmt('yAxis.left.reverse', F.yAxis?.left?.reverse ? null : true) },
      '-',
      { label: tr('Add text label'), onSelect: () => (onAddNote ? onAddNote() : api.setFmt('notes', [...(F.notes ?? []), { fx: pick.atFx ?? 0.5, fy: pick.atFy ?? 0.1, text: tr('Text') }])), keepOpen: !!onAddNote },
      canUndo() && { label: tr('Undo'), shortcut: 'Ctrl+Z', onSelect: () => undoLast() },
      api.setSheetOpen && { label: tr('Open data sheet'), onSelect: () => api.setSheetOpen(true), shortcut: tr('Double-click') },
      formatItem(tr('Format chart…')),
      '-',
      { label: tr('Reset formatting'), reset: true, onSelect: resetAll, keepOpen: true },
    ],
    series: [
      // Ctrl + click on a segment or a point of another chart (mixed selection).
      pick.crossScale && { label: tr('Set same scale'), onSelect: () => pick.crossScale() },
      pick.crossScale && '-',
      ...addItems,
      { label: api.labelsOf(sid) === 'none' ? tr('Add value labels') : tr('Remove value labels'), onSelect: () => api.setLabels(sid, api.labelsOf(sid) === 'none' ? 'all' : 'none') },
      point && { label: tr('Hide {name}', { name: point.label }), onSelect: () => api.toggleHidden(point.key) },
      // A figure on this single point (point-by-point labels).
      point && (api.labelsOf(sid) === 'some' && (F.labelKeys?.[sid] ?? []).map(String).includes(String(point.key))
        ? { label: tr('Hide the value label on {name}', { name: point.label }), onSelect: () => toggleLabelKey(point.key) }
        : api.labelsOf(sid) !== 'all' && { label: tr('Show the value label on {name}', { name: point.label }), onSelect: () => { if (api.labelsOf(sid) !== 'some') { api.setLabels(sid, 'some'); setLabelKeys([...(api.labelsOf(sid) === 'last' ? api.shown.slice(-1) : []), String(point.key)]) } else toggleLabelKey(point.key) } }),
      sel?.length > 1 && { label: tr('Remove labels of these {n}', { n: sel.length }), onSelect: () => setL('hidden', [...new Set([...(LO.hidden ?? []), ...sel.map(q => `${q.seriesId}|${q.key}`)])]) },
      sel?.length > 1 && new Set(sel.map(q => q.key)).size > 1 && { label: tr('Hide these {n} categories', { n: new Set(sel.map(q => q.key)).size }), onSelect: () => [...new Set(sel.map(q => q.key))].forEach(k => api.toggleHidden(k)) },
      sel?.length === 2 && { label: tr('Connect these two'), onSelect: () => api.setFmt('links', [...(F.links ?? []), { from: sel[0], to: sel[1] }]) },
      (F.links ?? []).length > 0 && { label: tr('Remove connectors ({n})', { n: F.links.length }), onSelect: () => api.setFmt('links', null) },
      // Right-angle or straight connector.
      (F.links ?? []).length > 0 && { label: F.links.every(l => l.elbow === false) ? tr('Use right-angle connectors') : tr('Use straight connectors'), onSelect: () => { const straight = !F.links.every(l => l.elbow === false); api.setFmt('links', F.links.map(l => ({ ...l, elbow: straight ? false : undefined }))) } },
      // Connector of a single segment to the next column, or of the whole series.
      mark === 'bar' && point && !sel && { label: (F.segConnectors ?? []).includes(`${sid}|${point.key}`) ? tr('Remove connector from {name}', { name: point.label }) : tr('Add connector from {name}', { name: point.label }),
        onSelect: () => { const k = `${sid}|${point.key}`, cur = F.segConnectors ?? []; const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; api.setFmt('segConnectors', next.length ? next : null) } },
      mark === 'bar' && !F.connectors && { label: (F.connectorSeries ?? []).includes(sid) ? tr('Remove connectors of {name}', { name: seriesName(sid) }) : tr('Add connectors to {name}', { name: seriesName(sid) }),
        onSelect: () => { const cur = F.connectorSeries ?? []; const next = cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid]; api.setFmt('connectorSeries', next.length ? next : null) } },
      // Multiple selection: the menu applies to the whole selection.
      sel?.length > 1 && { label: tr('Show value labels on these {n}', { n: sel.length }), onSelect: () => {
        for (const id of new Set(sel.map(q => q.seriesId))) {
          const ks = sel.filter(q => q.seriesId === id).map(q => String(q.key))
          if (api.labelsOf(id) === 'all') continue
          const cur = api.labelsOf(id) === 'some' ? (F.labelKeys?.[id] ?? []).map(String) : []
          api.setLabels(id, 'some')
          api.setFmt(`labelKeys.${id}`, [...new Set([...cur, ...ks])])
        }
        setL('hidden', (LO.hidden ?? []).filter(k => !sel.some(q => `${q.seriesId}|${q.key}` === k)) )
      } },
      sel?.length > 1 && sel.some(q => api.markOf(q.seriesId) === 'bar') && { label: tr('Add connectors from these {n}', { n: sel.length }), onSelect: () => api.setFmt('segConnectors', [...new Set([...(F.segConnectors ?? []), ...sel.map(q => `${q.seriesId}|${q.key}`)])]) },
      { label: inTable ? tr('Move series to chart') : tr('Move series to table'), onSelect: () => setTable(!inTable) },
      // KPI rows under the columns (report style): growth of the series, its ratio to the first series.
      ...[['growth', null], ['ratio', api.series.find(x => x.value !== sid)?.value ?? null]].filter(([k, o]) => sid && (k === 'growth' || (o && o === api.series[0]?.value))).map(([k, o]) => {
        const has = (F.kpiRows ?? []).some(r => r.kind === k && r.of === sid && (r.over ?? null) === o)
        const name = k === 'growth' ? tr('{name} growth', { name: seriesName(sid) }) : `${seriesName(sid)} / ${seriesName(o)}`
        return { label: has ? tr('Remove {name} row', { name }) : tr('Add {name} row to table', { name }),
          onSelect: () => { const rest = (F.kpiRows ?? []).filter(r => !(r.kind === k && r.of === sid && (r.over ?? null) === o)); api.setFmt('kpiRows', has ? (rest.length ? rest : null) : [...rest, { kind: k, of: sid, ...(o ? { over: o } : {}) }]) } }
      }),
      (F.table ?? []).length > 1 && { label: F.tableStripes ? tr('Remove table stripes') : tr('Add table stripes'), onSelect: () => api.setFmt('tableStripes', F.tableStripes ? null : true) },
      { label: EB ? tr('Remove error bars') : tr('Add error bars'), onSelect: () => setEB(EB ? null : { pct: 10 }) },
      '-',
      formatItem(sel ? tr('Format selection…') : tr('Format series…')),
    ],
    yaxis: [
      // Fit scale to data: bounds and step set by hand hand control back to the data.
      // Grayed out while the scale already follows the data.
      { label: tr('Fit scale to data'), disabled: ![yo.min, yo.max, yo.step].some(Number.isFinite), title: [yo.min, yo.max, yo.step].some(Number.isFinite) ? undefined : tr('The scale already fits the data'),
        onSelect: () => api.setFmt(`yAxis.${side}`, { ...yo, min: undefined, max: undefined, step: undefined }) },
      { label: F.grid === 'none' ? tr('Add gridlines') : tr('Remove gridlines'), onSelect: () => api.setFmt('grid', F.grid === 'none' ? null : 'none') },
      { label: yo.tickMarks ? tr('Remove tick marks') : tr('Add tick marks'), onSelect: () => setY('tickMarks', yo.tickMarks ? null : true) },
      { label: yo.log ? tr('Set linear scale') : tr('Set logarithmic scale'), onSelect: () => { if (!yo.log) setY('break', null); setY('log', yo.log ? null : true) } },
      // Remove the axis: ticks, lines and title go; the scale stays.
      yo.labels === false ? { label: tr('Add value axis'), onSelect: () => setY('labels', null) }
        : { label: tr('Remove value axis'), onSelect: () => api.setFmt(`yAxis.${side}`, { ...yo, labels: false, tickMarks: undefined, line: undefined, title: undefined }) },
      '-',
      // Break at the point clicked on the axis, otherwise the suggested break.
      (yo.break || pick.atBreak || api.suggestBreak?.(side)) && { label: yo.break ? tr('Remove axis break') : pick.atBreak ? tr('Add axis break here') : tr('Add axis break'), onSelect: () => setY('break', yo.break ? null : pick.atBreak ?? api.suggestBreak?.(side)) },
      yo.break && { label: yo.breakShape === 'straight' ? tr('Set wiggle break shape') : tr('Set straight break shape'), onSelect: () => setY('breakShape', yo.breakShape === 'straight' ? null : 'straight') },
      side === 'left' && { label: sameOn ? (pick.ySameCount > 1 ? tr('Same scale as other charts ({n})', { n: pick.ySameCount }) : tr('Same scale as other charts')) : tr('Set same scale as other charts'), checked: sameOn, title: sameOn ? tr('Click to remove same scale') : undefined, onSelect: toggleSame },
      // Move the axis (drag the axis to the other side): all series switch sides.
      api.series.every(x => api.axisOf(x.value) === side) && { label: side === 'left' ? tr('Move axis to the right') : tr('Move axis to the left'), onSelect: () => api.series.forEach(x => api.setSeries(x.value, { axis: side === 'left' ? 'right' : 'left' })) },
      onAddNote && { label: tr('Add text label'), onSelect: () => onAddNote(), keepOpen: true },
      { label: yo.title ? tr('Remove axis title') : tr('Add axis title'), onSelect: () => (yo.title ? setY('title', null) : (setOpenCtl('title'), setMode('bar', 'title'))), keepOpen: !yo.title },
      '-',
      formatItem(tr('Format axis…')),
    ],
    xaxis: [
      api.hidden.size > 0 && { label: tr('Show all categories ({n} hidden)', { n: api.hidden.size }), onSelect: () => [...api.hidden].forEach(k => api.toggleHidden(k)) },
      { label: xo.labels === false ? tr('Add category labels') : tr('Remove category labels'), onSelect: () => setX('labels', xo.labels === false ? null : false) },
      // X axis in dates or numbers: same range as the other charts ("Set Same Scale", X axis).
      ...xSameItems,
      { label: xo.title ? tr('Remove axis title') : tr('Add axis title'), onSelect: () => (xo.title ? setX('title', null) : (setOpenCtl('xtitle'), setMode('bar', 'xtitle'))), keepOpen: !xo.title },
      point && api.hasBars && ((F.colBreaks ?? []).includes(point.key) || pick.breakable) && { label: (F.colBreaks ?? []).includes(point.key) ? tr('Remove column break on {name}', { name: point.label }) : tr('Add column break on {name}', { name: point.label }),
        onSelect: () => api.setFmt('colBreaks', (F.colBreaks ?? []).includes(point.key) ? (F.colBreaks ?? []).filter(k => k !== point.key) : [...(F.colBreaks ?? []), point.key]) },
      point && api.hasBars && !(F.colBreaks ?? []).includes(point.key) && !pick.breakable && { label: tr('Add column break on {name}', { name: point.label }), disabled: true, title: tr('Not the tallest value: a break would have no effect'), onSelect: () => {} },
      point && at(point.key) > 0 && !api.gapBefore?.(point.key) && { label: (F.catGaps ?? []).includes(point.key) ? tr('Remove gap before {name}', { name: point.label }) : tr('Add gap before {name}', { name: point.label }), gap: true,
        onSelect: () => api.setFmt('catGaps', (F.catGaps ?? []).includes(point.key) ? (F.catGaps ?? []).filter(k => k !== point.key) : [...(F.catGaps ?? []), point.key]) },
      (F.catGaps ?? []).length > 0 && { label: tr('Remove all category gaps'), onSelect: () => { api.setFmt('catGaps', null); api.setFmt('catGapSize', null) } },
      // Category axis break without a gap.
      point && at(point.key) > 0 && !(F.tableCols ?? []).includes(point.key) && { label: (F.catBreaks ?? []).includes(point.key) ? tr('Remove axis break before {name}', { name: point.label }) : tr('Add axis break before {name}', { name: point.label }),
        onSelect: () => { const cur = F.catBreaks ?? []; const next = cur.includes(point.key) ? cur.filter(k => k !== point.key) : [...cur, point.key]; api.setFmt('catBreaks', next.length ? next : null) } },
      // A category into the table on the right, then back (move to table column).
      point && ((F.tableCols ?? []).includes(point.key)
        ? { label: tr('Move {name} back to chart', { name: point.label }), onSelect: () => { const next = (F.tableCols ?? []).filter(k => k !== point.key); api.setFmt('tableCols', next.length ? next : null) } }
        : api.shown.length > 2 && { label: tr('Move {name} to table column', { name: point.label }), onSelect: () => api.setFmt('tableCols', [...(F.tableCols ?? []), point.key]) }),
      '-',
      formatItem(tr('Format axis…')),
    ],
    labels: [
      pick.labelKey && { label: tr('Remove this label'), onSelect: () => onDeleteLabel?.(pick.labelKey), shortcut: 'Del' },
      { label: tr('Remove all labels of {name}', { name: seriesName(sid) }), onSelect: () => api.setLabels(sid, 'none') },
      hiddenCount > 0 && { label: hiddenCount > 1 ? tr('Restore {n} removed labels', { n: hiddenCount }) : tr('Restore {n} removed label', { n: hiddenCount }), onSelect: () => setL('hidden', null) },
      movedCount > 0 && { label: tr('Reset label positions ({n} moved)', { n: movedCount }), onSelect: () => setL('offsets', null) },
      textOf != null && { label: tr('Restore original content'), onSelect: () => setText(null) },
      pick.labelKey && textOf == null && { label: tr('Edit text…'), shortcut: 'F2', onSelect: () => { setModeState('bar'); setOpenCtl('text'); onMode?.('bar', 'text') }, keepOpen: true },
      totalsAvail && { label: p.totals ? tr('Remove stack totals') : tr('Add stack totals'), onSelect: () => api.setPref('totals', !p.totals) },
      '-',
      formatItem(tr('Format labels…')),
    ],
    legend: [
      pick.seriesLabels && { label: tr('Remove series labels'), onSelect: () => {
        // Bar names (direct legend, the default on stacked columns) go back to a legend on top;
        // line end names are switched off.
        const onBars = ['series', 'direct'].includes(F.legend)
        if (onBars || F.legend == null) api.setFmt('legend', 'top')
        if (!onBars) api.setFmt('endLabels', false)
      } },
      { label: tr('Remove legend'), onSelect: () => api.setFmt('legend', 'none') },
      '-',
      formatItem(tr('Format legend…')),
    ],
    annotation: ann && [
      ...(ann.kind === 'diff' ? [['both', tr('Show value and %')], ['abs', tr('Show value')], ['pct', tr('Show % of start')], ['pctEnd', tr('Show % of end')]].map(([v, l]) => (
        { label: l, checked: (F.diffMode ?? 'abs') === v, onSelect: () => api.setFmt('diffMode', v === 'abs' ? null : v) })) : []),
      listDiff && { label: listDiff.level ? tr('Draw over the columns') : tr('Draw as level difference'), onSelect: () => api.setDiffAt(ann.i, { level: listDiff.level ? undefined : true }) },
      ann.kind === 'vline' && { label: tr('Back to the average'), onSelect: () => (listVl ? onResetValueLineAt?.(ann.i) : onResetValueLine?.()), shortcut: tr('Double-click') },
      ann.kind === 'vline' && formatItem(tr('Format value line…')),
      '-',
      { label: tr('Remove'), shortcut: 'Del', onSelect: () => removeAnn() },
    ],
  }
  // The data sheet from any object (series, axes, labels, legend).
  for (const k of ['series', 'yaxis', 'xaxis', 'labels', 'legend']) {
    if (Array.isArray(menus[k]) && api.setSheetOpen) menus[k] = [...menus[k], '-', { label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => api.setSheetOpen(true) }]
  }
  // Rotated view (horizontal bars): only the actions visible there remain.
  if (F.horizontal) {
    const ok = new Set([tr('Rotate to columns'), tr('Transpose rows and columns'), tr('Flip horizontally'), tr('Undo'), tr('Open data sheet'), tr('Format chart…'), tr('Reset formatting'), tr('Add legend'), tr('Remove legend')])
    menus.chart = menus.chart.filter(it => it === '-' || (it && ok.has(it.label)))
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
    <Line label={tr('Series')}>
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
      api.barCount > 1 && ['type', BAR_MODES.find(([v]) => v === api.bars)?.[2] ?? IconLayoutColumns, tr('Type: {value}', { value: (BAR_MODES.find(([v]) => v === api.bars)?.[1] ?? tr('Clustered')).toLowerCase() }), tr('Bar type'), (
        <>
          <Line label={tr('Bars')}><Seg label={tr('Bar type')} value={api.bars} onPick={v => api.setPref('bars', v)} items={BAR_MODES} /></Line>
          {api.bars !== 'clustered' && <Line label={tr('Segments')}><Seg label={tr('Segment order')} value={F.stackOrder ?? null} onPick={v => api.setFmt('stackOrder', v)} items={ORDERS} /></Line>}
          {api.bars !== 'clustered' && <Line label={tr('Per column')}><Seg label={tr('Segment order within each column')} value={F.stackOrder === 'descCat' || F.stackOrder === 'ascCat' ? F.stackOrder : null} onPick={v => api.setFmt('stackOrder', v)}
            items={[[null, tr('Same in all')], ['descCat', tr('Largest at bottom')], ['ascCat', tr('Smallest at bottom')]]} /></Line>}
          {api.bars !== 'clustered' && <Line label={tr('Colors')}><Seg label={tr('Color scheme order')} value={F.colorOrder ?? null} onPick={v => api.setFmt('colorOrder', v)} items={[[null, tr('Bottom to top')], ['reverse', tr('Top to bottom')]]} /></Line>}
          {/* "Other" series: the small segments of a column grouped at the top. */}
          {api.bars !== 'clustered' && api.barCount > 2 && <Line label={tr('Other')}><Seg label={tr('Group small segments as Other')} value={F.otherBelow ?? null} onPick={v => api.setFmt('otherBelow', v)}
            items={[[null, tr('Off')], [3, tr('< 3%')], [5, tr('< 5%')], [10, tr('< 10%')]]} /></Line>}
        </>
      )],
      api.hasAreas && ['areas', IconArrowsExchange, tr('Areas: {value}', { value: { stacked: tr('stacked'), stacked100: tr('100%') }[F.areaMode] ?? tr('overlapping') }), tr('Area type and order'), (
        <>
          <Line label={tr('Areas')}><Seg label={tr('Area type')} value={F.areaMode ?? null} onPick={v => api.setFmt('areaMode', v)} items={[[null, tr('Overlapping')], ['stacked', tr('Stacked')], ['stacked100', tr('100%')]]} /></Line>
          <Line label={tr('Order')}><Seg label={tr('Area order')} value={F.areaOrder ?? null} onPick={v => api.setFmt('areaOrder', v)} items={ORDERS.slice(0, 2)} /></Line>
        </>
      )],
      ['colors', <>{(schemeColors(F) ?? api.series.map(s => tokenOf(api.colorOf(s.value)))).slice(0, 3).map((c, i) => <span key={i}>{dot(c)}</span>)}</>, tr('Colors: {value}', { value: F.scheme === 'custom' ? (F.customScheme?.name ?? tr('custom')) : ((F.scheme ?? '') !== '' && SCHEME_LIST.find(([v]) => v === F.scheme)?.[1] || tr('Default')).toLowerCase() }), tr('Color scheme'), (
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
      ['text', IconTextSize, { xsmall: tr('Extra small'), small: tr('Small'), large: tr('Large'), xlarge: tr('Extra large') }[F.fontSize] ?? tr('Medium'), tr('Text size'), (
        <Line label={tr('Text size')}><Seg label={tr('Text size')} value={F.fontSize ?? null} onPick={v => api.setFmt('fontSize', v)} items={SIZES} /></Line>
      )],
      extra.some(s => s.items?.length) && ['extra', IconAdjustments, extra.filter(s => s.items?.length).map(s => s.label).join(' · '), tr('More options for this chart'), (
        <>{extra.filter(s => s.items?.length).map(s => (
          <Line key={s.label} label={s.label}>{s.items.map(it => <Check key={it.key} on={it.on} onClick={it.onToggle}>{it.label}</Check>)}</Line>
        ))}</>
      )],
    ],
    series: [
      // A data table series (style like a table): fill, rules, size.
      asTable && ['tablestyle', IconTable, `${tr('Table: {value}', { value: TS.fill === 'rows' || (TS.fill == null && F.tableStripes) ? tr('stripes') : tr('no fill') })}${TS.lines && TS.lines !== 'none' ? ` · ${TS.lines === 'all' ? tr('row lines') : tr('frame')}` : ''}${TS.size ? ` · ${TABLE_SIZES.find(([v]) => v === TS.size)?.[1]}` : ''}`, tr('Style like a table'), (
        <>
          <Line label={tr('Fill')}><Seg label={tr('Table fill')} value={TS.fill ?? (F.tableStripes ? 'rows' : null)} onPick={v => { api.setFmt('tableStripes', null); setTS('fill', v ?? 'none') }} items={[[null, tr('None')], ['rows', tr('Stripes')]]} /></Line>
          {(TS.fill === 'rows' || (TS.fill == null && F.tableStripes)) && <>
            <Line label={tr('Color 1')}><Swatches palette={TABLE_FILLS} value={TS.colors?.[0] ?? 'gray-100'} onPick={c => setTS('colors', [c, TS.colors?.[1] ?? null])} /></Line>
            <Line label={tr('Color 2')}><Swatches palette={TABLE_FILLS} value={TS.colors?.[1] ?? null} onPick={c => setTS('colors', [TS.colors?.[0] ?? null, c])} /></Line>
          </>}
          <Line label={tr('Lines')}><Seg label={tr('Table lines')} value={TS.lines ?? 'none'} onPick={v => setTS('lines', v === 'none' ? null : v)} items={[['none', tr('None')], ['frame', tr('Top and bottom')], ['all', tr('Every row')]]} /></Line>
          <Line label={tr('Size')}><Seg label={tr('Table text size')} value={TS.size ?? null} onPick={v => setTS('size', v)} items={TABLE_SIZES} /></Line>
        </>
      )],
      ['type', SHAPES.find(([v]) => v === mark)?.[2] ?? IconChartBar, `${SHAPES.find(([v]) => v === mark)?.[1] ?? tr('Bars')}${multi && api.axisOf(sid) === 'right' ? tr(' · right axis') : ''}`, tr('Series type and axis'), (
        <>
          {seriesPicker}
          <Line label={tr('Type')}><Seg label={tr('Series type')} value={mark} onPick={v => api.setSeries(sid, { mark: v })} items={SHAPES} /></Line>
          {multi && <Line label={tr('Axis')}><Seg label={tr('Axis')} value={api.axisOf(sid)} onPick={v => api.setSeries(sid, { axis: v })} items={[['left', tr('Left')], ['right', tr('Right')]]} /></Line>}
          {mark === 'bar' && api.barCount > 1 && api.bars !== 'clustered' && (
            <Line label={tr('Stack')}><Seg label={tr('Stack group')} value={api.stackOf?.(sid) ?? null} onPick={v => api.setSeries(sid, { stack: v })}
              items={[[null, tr('Main')], ['B', tr('Second')], ['C', tr('Third')]]} /></Line>
          )}
        </>
      )],
      ['fill', dot(fill), `${tr('{name}: {value}', { name: mark === 'bar' ? tr('Fill') : tr('Color'), value: scope === 'selection' && sel ? (new Set(sel.map(q => api.styleOf(q.seriesId)?.points?.[q.key] ?? api.styleOf(q.seriesId)?.color)).size > 1 ? tr('mixed') : colorName(fill)) : colorName(fill) })}${scope === 'point' && point ? tr(' ({name} only)', { name: point.label }) : ''}`, tr('Fill color'), (
        <>
          {(point || sel) && (
            <Line label={tr('Apply to')}><Seg label={tr('Fill scope')} value={scope} onPick={setScope}
              items={[['series', tr('Whole series')], ...(sel ? [['selection', tr('{n} selected', { n: sel.length })]] : point ? [['point', tr('{name} only', { name: point.label }), null, tr('{name} only. Ctrl + click (or Ctrl + A) to add bars', { name: point.label })]] : [])]} /></Line>
          )}
          <Swatches palette={api.palette} value={fill} onPick={paint} />
          {/* Patterns: on the same scope as the color. */}
          {mark === 'bar' && <Line label={tr('Pattern')}><Seg label={tr('Fill pattern')} value={patternNow} onPick={setPattern} items={PATTERN_ITEMS} /></Line>}
          {mark === 'bar' && api.hasForecast && <Line label=""><Check on={!!F.forecastHatch} onClick={() => api.setFmt('forecastHatch', F.forecastHatch ? null : true)} title={tr('Forecast bars in their series color, hatched')}>{tr('Hatch forecast bars')}</Check></Line>}
        </>
      )],
      mark === 'bar' && ['outline', IconBorderStyle2, !st.stroke || st.stroke === 'none' ? tr('None') : st.stroke === 'gray-800' ? tr('Dark') : st.stroke === 'white' ? tr('Light') : tr('Color'), tr('Outline'), (
        <>
          <Line label={tr('Color')}><Seg label={tr('Outline')} value={!st.stroke || st.stroke === 'none' ? 'none' : ['gray-800', 'white'].includes(st.stroke) ? st.stroke : 'custom'} onPick={v => v !== 'custom' && api.setSeries(sid, { stroke: v })} items={[['none', tr('None')], ['gray-800', tr('Dark')], ['white', tr('Light')]]} /></Line>
          <Swatches palette={api.palette} value={st.stroke} onPick={c => api.setSeries(sid, { stroke: c })} />
          {st.stroke && st.stroke !== 'none' && <>
            <Line label={tr('Style')}><Seg label={tr('Outline style')} value={st.dash ?? 'solid'} onPick={v => api.setSeries(sid, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
            <Line label={tr('Weight')}><Seg label={tr('Outline weight')} value={st.weight ?? null} onPick={v => api.setSeries(sid, { weight: v })} items={WEIGHTS.map(w => [w, `${w} pt`])} /></Line>
          </>}
        </>
      )],
      mark !== 'bar' && ['line', lineGlyph(DASHES.find(d => d[0] === (st.dash ?? 'solid'))?.[2], st.weight ?? 1.75), `${DASHES.find(d => d[0] === (st.dash ?? 'solid'))?.[1]}${st.weight ? ` · ${st.weight} pt` : ''}`, tr('Line style, weight and markers'), (
        <>
          <Line label={tr('Style')}><Seg label={tr('Line style')} value={st.dash ?? 'solid'} onPick={v => api.setSeries(sid, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
          <Line label={tr('Weight')}><Seg label={tr('Line weight')} value={st.weight ?? null} onPick={v => api.setSeries(sid, { weight: v })} items={WEIGHTS.map(w => [w, `${w} pt`])} /></Line>
          <Line label={tr('Markers')}><Seg label={tr('Markers')} value={st.markerShape ?? (st.marker ? 'circle' : 'none')} onPick={v => api.setSeries(sid, { markerShape: v })} items={MARKERS.map(([v, l, g]) => [v, `${g}`, null, l])} /></Line>
          <Line label=""><Check on={!!st.smooth} onClick={() => api.setSeries(sid, { smooth: !st.smooth })}>{tr('Smooth line')}</Check></Line>
          <Line label={tr('Shape')}><Seg label={tr('Line shape')} value={st.step ?? null} onPick={v => api.setSeries(sid, { step: v })} items={[[null, tr('Line')], ['lines', tr('Net (one dash per column)')], ['steps', tr('Steps')]]} /></Line>
          {st.step === 'lines' && <Line label="">
            <Check on={F.netJoin !== false} onClick={() => api.setFmt('netJoin', F.netJoin === false ? null : false)} title={tr('Neighbouring dashes of equal value form one line')}>{tr('Join equal dashes')}</Check>
            <Check on={!!F.netConnectors} onClick={() => api.setFmt('netConnectors', F.netConnectors ? null : true)}>{tr('Connectors between dashes')}</Check>
          </Line>}
          {/* Per-series interpolation: connect, break, or count missing values as zero. */}
          <Line label={tr('Missing')}><Seg label={tr('Missing values on this line')} value={F.gapsBy?.[sid] ?? null} onPick={v => api.setFmt(`gapsBy.${sid}`, v)}
            items={[[null, tr('As the chart')], ['connect', tr('Connect')], ['break', tr('Break')], ['zero', tr('Zero')]]} /></Line>
          <Line label=""><Check on={F.lineScheme === 'distinct'} onClick={() => api.setFmt('lineScheme', F.lineScheme === 'distinct' ? null : 'distinct')}>{tr('Line scheme: distinct dash and marker per line')}</Check></Line>
        </>
      )],
      ['errors', IconArrowsVertical, EB ? `${tr('Error: {value}', { value: EB.lo || EB.hi ? tr('from series') : tr('±{n}%', { n: EB.pct }) })}${EB.thick ? tr(' · range') : ''}` : tr('Error: none'), tr('Error bars'), (
        <>
          <Line label={tr('Error bars')}><Seg label={tr('Error bars')} value={EB ? (EB.lo || EB.hi ? 'series' : 'pct') : null}
            onPick={v => setEB(v === null ? null : v === 'pct' ? { pct: EB?.pct ?? 10, thick: EB?.thick } : { lo: others[0]?.[0], hi: others[0]?.[0], thick: EB?.thick })}
            items={[[null, tr('None')], ['pct', tr('± %')], ...(others.length ? [['series', tr('From a series')]] : [])]} /></Line>
          {EB && !(EB.lo || EB.hi) && <Line label={tr('Percent')}><Field label={tr('Error percent')} value={String(EB.pct ?? 10)} onCommit={v => { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= 0) setEB({ ...EB, pct: n }) }} /></Line>}
          {EB && (EB.lo || EB.hi) && <>
            <Line label={tr('Up')}><Seg label={tr('Upper deviation series')} value={EB.hi ?? null} onPick={v => setEB({ ...EB, hi: v })} items={[[null, tr('None')], ...others]} /></Line>
            <Line label={tr('Down')}><Seg label={tr('Lower deviation series')} value={EB.lo ?? null} onPick={v => setEB({ ...EB, lo: v })} items={[[null, tr('None')], ...others]} /></Line>
          </>}
          {EB && <Line label=""><Check on={!!EB.thick} onClick={() => setEB({ ...EB, thick: EB.thick ? null : true })}>{tr('Thick (range bar)')}</Check></Line>}
          {EB && !EB.thick && <Line label={tr('Line')}><Seg label={tr('Error bar line weight')} value={EB.weight ?? null} onPick={v => setEB({ ...EB, weight: v })} items={[[null, tr('Thin')], [1.75, tr('Medium')], [2.5, tr('Thick')]]} /></Line>}
          {EB && <Line label={tr('Color')}><Swatches palette={api.palette} value={EB.color} onPick={c => setEB({ ...EB, color: c })} /></Line>}
          {/* Ends: the shape of each marker, top and bottom separately. */}
          {EB && !EB.thick && <Line label={tr('Ends')}>
            <Seg label={tr('Upper end')} value={EB.capHi ?? 'bar'} onPick={v => setEB({ ...EB, capHi: v === 'bar' ? undefined : v })} items={CAPS.map(([v, g, e]) => [v, g, null, tr('Upper end: {end}', { end: e })])} />
            <Seg label={tr('Lower end')} value={EB.capLo ?? 'bar'} onPick={v => setEB({ ...EB, capLo: v === 'bar' ? undefined : v })} items={CAPS.map(([v, g, e]) => [v, g === '▲' ? '▼' : g, null, tr('Lower end: {end}', { end: e })])} />
          </Line>}
          {/* Several pairs: each with its own % difference and color. */}
          {EB && !(EB.lo || EB.hi) && (EB.more ?? []).map((m, j) => (
            <Line key={j} label={tr('Pair {n}', { n: j + 2 })}>
              <Field label={tr('Error percent, pair {n}', { n: j + 2 })} value={String(m.pct ?? '')} onCommit={v => { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n) && n >= 0) setEB({ ...EB, more: EB.more.map((x, i) => (i === j ? { ...x, pct: n } : x)) }) }} />
              <Swatches palette={api.palette} value={m.color} onPick={c => setEB({ ...EB, more: EB.more.map((x, i) => (i === j ? { ...x, color: c } : x)) })} />
              <button type="button" className="chart-pop__link" onClick={() => setEB({ ...EB, more: EB.more.filter((_, i) => i !== j) })}>{tr('Remove')}</button>
            </Line>
          ))}
          {EB && !(EB.lo || EB.hi) && !EB.thick && <Line label=""><button type="button" className="chart-pop__link" onClick={() => setEB({ ...EB, more: [...(EB.more ?? []), { pct: (EB.pct ?? 10) * 2, color: 'gray-400' }] })}>{tr('Add another pair')}</button></Line>}
        </>
      )],
      ['labels', IconTag, SHOW.find(([v]) => v === api.labelsOf(sid))?.[1] ?? tr('None'), tr('Value labels'), (
        <Line label={tr('Show')}><Seg label={tr('Value labels')} value={api.labelsOf(sid)} onPick={v => api.setLabels(sid, v)} items={SHOW} /></Line>
      )],
    ],
    yaxis: [
      api.hasRight && ['side', IconArrowsVertical, side === 'left' ? tr('Left') : tr('Right'), tr('Which value axis'), (
        <Line label={tr('Axis')}><Seg label={tr('Axis')} value={side} onPick={setSide} items={[['left', tr('Left')], ['right', tr('Right')]]} /></Line>
      )],
      ['scale', IconRuler2, manual ? `${tr('Scale: {min} – {max}', { min: fmtBound(yo.min), max: fmtBound(yo.max) })}${yo.log ? tr(' · log') : ''}` : yo.break ? tr('Scale: auto · break') : tr('Scale: auto'), tr('Scale'), (
        <>
          <Line label={tr('Range')}>
            <Field label={tr('Min')} numeric value={yo.min ?? ''} placeholder={tr('Auto')} onCommit={v => setY('min', v)} />
            <Field label={tr('Max')} numeric value={yo.max ?? ''} placeholder={tr('Auto')} onCommit={v => setY('max', v)} />
            <Field label={tr('Step')} numeric value={yo.step ?? ''} placeholder={tr('Auto')} onCommit={v => setY('step', v != null && v > 0 ? v : null)} />
          </Line>
          <Line label={tr('Options')}>
            <div className="chart-pop__stack">
            <Check on={!!yo.log} onClick={() => { if (!yo.log) setY('break', null); setY('log', yo.log ? null : true) }} title={tr('Zero and negative values sit on the base, flagged ! (removes any axis break)')}>{tr('Logarithmic')}</Check>
            <Check on={!!yo.reverse} onClick={() => setY('reverse', yo.reverse ? null : true)}>{tr('Descending')}</Check>
            {side === 'left' && <Check on={sameOn} onClick={toggleSame} title={tr('All charts on this page with this option share one scale')}>{tr('Same scale as other charts')}</Check>}
            <Check on={!!yo.break} onClick={() => setY('break', yo.break ? null : api.suggestBreak?.(side))}
              title={api.suggestBreak?.(side) || yo.break ? tr('Compress part of the axis') : tr('Not available on a % or logarithmic axis')}>{tr('Axis break')}</Check>
            </div>
          </Line>
          {side === 'left' && sameOn && yo.same != null && yo.same !== false && <Line label={tr('Shared with')}><Seg label={tr('Same scale group')} value={yo.same === true ? true : yo.same} onPick={v => setY('same', v)} items={[[true, tr('All charts')], ['A', tr('Group A')], ['B', tr('Group B')], ['C', tr('Group C')]]} /></Line>}
          {yo.break && (
            <Line label={tr('Break')}>
              <Field label={tr('From')} numeric value={yo.break.from} onCommit={v => v != null && setY('break', { ...yo.break, from: v })} />
              <Field label={tr('To')} numeric value={yo.break.to} onCommit={v => v != null && setY('break', { ...yo.break, to: v })} />
              <Seg label={tr('Break shape')} value={yo.breakShape ?? null} onPick={v => setY('breakShape', v)} items={[[null, tr('Wiggle')], ['straight', tr('Straight')]]} />
            </Line>
          )}
          {manual && <Line label=""><button type="button" className="chart-pop__link" onClick={autoScale}>{tr('Reset to automatic scale')}</button></Line>}
        </>
      )],
      ['show', IconEye, `${tr('Tick labels: {value}', { value: yo.labels !== false ? tr('on') : tr('off') })}${yo.tickMarks ? tr(' · ticks') : ''}${yo.line ? tr(' · line') : ''}`, tr('Show tick labels, tick marks, axis line'), (
        <Line label="">
          <Check on={yo.labels !== false} onClick={() => setY('labels', yo.labels === false ? null : false)}>{tr('Tick labels')}</Check>
          <Check on={!!yo.tickMarks} onClick={() => setY('tickMarks', yo.tickMarks ? null : true)}>{tr('Tick marks')}</Check>
          <Check on={!!yo.line} onClick={() => setY('line', yo.line ? null : true)}>{tr('Axis line')}</Check>
          <Check on={!!yo.labelsInside} onClick={() => setY('labelsInside', yo.labelsInside ? null : true)} title={tr('Tick labels on the other side of the axis line, inside the plot')}>{tr('Labels inside')}</Check>
        </Line>
      )],
      ['grid', IconGridDots, { none: tr('None'), dash: tr('Dashed') }[F.grid] ?? tr('Solid'), tr('Gridlines'), (
        <>
          <Line label={tr('Style')}><Seg label={tr('Gridlines')} value={F.grid ?? null} onPick={v => api.setFmt('grid', v)} items={[['none', tr('None')], [null, tr('Solid')], ['dash', tr('Dashed')]]} /></Line>
          {F.grid !== 'none' && <Line label={tr('Tone')}><Seg label={tr('Gridline tone')} value={F.gridColor ? 'custom' : F.gridTone ?? null} onPick={v => { if (v !== 'custom') { api.setFmt('gridColor', null); api.setFmt('gridTone', v) } }} items={[[null, tr('Light')], ['dark', tr('Dark')]]} /></Line>}
          {F.grid !== 'none' && <Line label={tr('Color')}><Swatches palette={api.palette} value={F.gridColor} onPick={c => api.setFmt('gridColor', c)} /></Line>}
        </>
      )],
      // Lines only: switching to % turns them into 100 % areas (percent axis conversion).
      !api.hasBars && api.hasLines && api.series.length > 1 && ['content', IconPercentage, F.areaMode === 'stacked100' ? tr('% (100% areas)') : tr('Absolute'), tr('Axis values'), (
        <Line label={tr('Values')}><Seg label={tr('Axis content')} value={F.areaMode === 'stacked100' ? 'pct' : 'abs'}
          onPick={v => { api.setFmt('areaMode', v === 'pct' ? 'stacked100' : null); api.series.forEach(x => api.setSeries(x.value, { mark: v === 'pct' ? 'area' : 'line' })) }}
          items={[['abs', tr('Absolute')], ['pct', tr('% (100% areas)')]]} /></Line>
      )],
      api.barCount > 1 && ['content', IconPercentage, api.bars === 'stacked100' ? tr('% of column') : tr('Absolute'), tr('Axis values'), (
        <Line label={tr('Values')}><Seg label={tr('Axis content')} value={api.bars === 'stacked100' ? 'pct' : 'abs'}
          onPick={v => api.setPref('bars', v === 'pct' ? 'stacked100' : api.bars === 'stacked100' ? 'stacked' : api.bars)}
          items={[['abs', tr('Absolute')], ['pct', tr('% of column')]]} /></Line>
      )],
      ['title', IconLetterT, tr('Title: {value}', { value: yo.title || tr('none') }), tr('Axis title'), (
        <Line label=""><Field label={tr('Axis title')} wide value={yo.title ?? ''} placeholder={tr('None')} onCommit={v => setY('title', v)} /></Line>
      )],
      ['numbers', null, tr('Format: {value}', { value: axisNumbers.preview }), tr('Number format of the axis'), (
        <>
          <Line label=""><Check on={!axisOwn} onClick={() => api.setFmt('axisNum', axisOwn ? null : { decimals: api.decimals ?? undefined })}>{tr('Same format as the labels')}</Check></Line>
          {axisNumbers.body}
        </>
      )],
    ],
    xaxis: [
      // Linked axis (same scale): marked with a link icon at the start of the mini toolbar.
      pick.xNumeric && xo.same && ['same', IconLink, xLinked.length ? xSameLabel : tr('Same scale'), xLinked.length ? tr('Same scale as {names}', { names: xLinked.join(', ') }) : tr('Same scale as other charts'), (
        <>
          {xLinked.length > 0 && <div className="chart-pop__note">{tr('Same days per pixel as {names}.', { names: xLinked.join(', ') })}</div>}
          <Line label=""><button type="button" className="chart-pop__more" onClick={xUnlink}>{tr('Remove same scale')}</button></Line>
        </>
      )],
      ['order', ORDERS.find(([v]) => v === (F.catOrder === 'reverse' ? 'reverse' : p.sort || null))?.[2] ?? IconArrowsSort, ORDER_SHORT[F.catOrder === 'reverse' ? 'reverse' : p.sort || 'sheet'] ?? ORDERS.find(([v]) => v === p.sort)?.[1] ?? ORDER_SHORT.sheet, tr('Category order'), (
        <Line label={tr('Order')}><Seg label={tr('Category order')} value={F.catOrder === 'reverse' ? 'reverse' : p.sort || null}
          onPick={v => { api.setFmt('catOrder', v === 'reverse' ? 'reverse' : null); api.setPref('sort', v === 'desc' || v === 'asc' ? v : '') }}
          items={api.grain === 'category' ? ORDERS : ORDERS.slice(0, 2)} /></Line>
      )],
      ['show', IconEye, `${tr('Labels: {value}', { value: xo.labels !== false ? tr('on') : tr('off') })}${xo.tickMarks ? tr(' · ticks') : ''}${xo.line ? tr(' · line') : ''}`, tr('Show labels, tick marks, axis line'), (
        <Line label="">
          <Check on={xo.labels !== false} onClick={() => setX('labels', xo.labels === false ? null : false)}>{tr('Labels')}</Check>
          <Check on={!!xo.tickMarks} onClick={() => setX('tickMarks', xo.tickMarks ? null : true)}>{tr('Tick marks')}</Check>
          <Check on={!!xo.line} onClick={() => setX('line', xo.line ? null : true)}>{tr('Axis line')}</Check>
        </Line>
      )],
      xo.labels !== false && ['text', IconCalendar, xo.ordinal ? tr('Ranks') : xo.dateFormat ? tr('Date: {value}', { value: xo.dateFormat }) : api.grain === 'category' ? tr('Names') : tr('Date: auto'), tr('Label text: date format or ranks'), (
        <>
          {api.grain !== 'category' && <Line label={tr('Date')}><Seg label={tr('Date format')} value={xo.dateFormat ?? null} onPick={v => setX('dateFormat', v)}
            items={[[null, tr('Auto')], ...(api.grain === 'year' ? [['yyyy', '2024'], ['’yy', '’24'], ["'FY'yy", 'FY24']] : api.grain === 'quarter' ? [["'Q'Q yy", 'Q1 24'], ["'Q'Q yyyy", 'Q1 2024'], ["yyyy-'Q'Q", '2024-Q1'], ['QQQ yyyy', 'I 2024'], ["'Q'Q¶yyyy", 'Q1¶2024'], ['MMM yy', tr('Mar 24')]] : [['MMM yy', tr('Mar 24')], ['MMMM yyyy', tr('March 2024')], ['MM/yy', '03/24'], ['MMM¶yyyy', tr('Mar¶2024')], ['M', '3']])]} /></Line>}
          {api.grain !== 'category' && <Line label={tr('Custom')}><Field label={tr('Date format codes')} wide value={xo.dateFormat ?? ''} placeholder={tr("yyyy yy QQQ QQ Q MMMM MMM M dd ddd w www · 'text' \\x ¶")} onCommit={v => setX('dateFormat', v || null)} /></Line>}
          {api.grain !== 'category' && <Line label=""><Check on={!!xo.mixedYears} onClick={() => setX('mixedYears', xo.mixedYears ? null : true)}>{tr('Full year on first label and each new year')}</Check></Line>}
          <Line label=""><Check on={!!xo.ordinal} onClick={() => setX('ordinal', xo.ordinal ? null : true)}>{tr('Ranks instead of names (1st, 2nd…)')}</Check></Line>
          {/* Date axis (YYYY-MM-DD categories): ticks per unit, start of week. */}
          {api.grain === 'category' && !api.hasBars && xo.numeric !== false && api.shown.length > 2 && api.shown.every(k => /^\d{4}-\d{2}-\d{2}$/.test(k)) && <>
            <Line label={tr('Ticks')}><Seg label={tr('Date axis tick unit')} value={xo.dateUnit ?? null} onPick={v => setX('dateUnit', v)} items={[[null, tr('Each date')], ['year', tr('Years')], ['quarter', tr('Quarters')], ['month', tr('Months')], ['week', tr('Weeks')], ['day', tr('Days')]]} /></Line>
            {xo.dateUnit === 'week' && <Line label={tr('Week starts')}><Seg label={tr('Week starts on')} value={xo.weekStart ?? null} onPick={v => setX('weekStart', v)} items={[[null, tr('Monday')], [6, tr('Sunday')], [5, tr('Saturday')]]} /></Line>}
          </>}
          {api.grain === 'category' && !api.hasBars && <Line label=""><Check on={xo.numeric !== false} onClick={() => setX('numeric', xo.numeric === false ? null : false)} title={tr('Numeric categories placed at their value, not their rank')}>{tr('Value axis for numeric categories')}</Check></Line>}
          {!api.hasBars && api.hasLines && <Line label={tr('Position')}><Seg label={tr('Axis crosses')} value={xo.crosses ?? null} onPick={v => setX('crosses', v)} items={[[null, tr('Between categories')], ['at', tr('On categories')]]} /></Line>}
          <Line label={tr('Spacing')}><Seg label={tr('Label spacing')} value={xo.every ?? null} onPick={v => setX('every', v)} items={[[null, tr('Auto')], [1, tr('Every label')], [2, tr('Every 2nd')], [4, tr('Every 4th')], [12, tr('Every 12th')]]} /></Line>
        </>
      )],
      ['xtitle', IconLetterT, tr('Title: {value}', { value: xo.title || tr('none') }), tr('Axis title (drag it along the axis; double-click to recenter)'), (
        <Line label=""><Field label={tr('Category axis title')} wide value={xo.title ?? ''} placeholder={tr('None')} onCommit={v => setX('title', v || null)} /></Line>
      )],
      xo.labels !== false && ['rotation', IconRotate, `${xo.rotate ?? 0}°`, tr('Label rotation'), (
        <Line label={tr('Rotation')}><Seg label={tr('Label rotation')} value={xo.rotate ?? null} onPick={v => setX('rotate', v)} items={[[null, '0°'], [45, '45°'], [90, '90°']]} /></Line>
      )],
      api.hasBars && ['gap', IconColumns, GAPS.find(([v]) => v === (Number.isFinite(F.gap) ? F.gap : null))?.[1] ?? tr('{n}%', { n: Math.round((1 - (F.gap ?? 0)) * 100) }), tr('Column width (or drag the handle on the baseline)'), (
        <Line label={tr('Width')}><Seg label={tr('Column width')} value={Number.isFinite(F.gap) ? F.gap : null} onPick={v => api.setFmt('gap', v)} items={GAPS} /></Line>
      )],
      api.hasLines && api.grain !== 'category' && ['gaps', IconLine, F.gaps === 'break' ? tr('Break') : tr('Connect'), tr('Missing periods on lines'), (
        <>
          <Line label={tr('Missing')}><Seg label={tr('Missing periods on lines')} value={F.gaps ?? null} onPick={v => api.setFmt('gaps', v)} items={[[null, tr('Connect the line')], ['break', tr('Break the line')]]} /></Line>
          {api.hasAreas && <Line label={tr('Areas')}><Seg label={tr('Missing periods on areas')} value={F.areaGaps ?? null} onPick={v => api.setFmt('areaGaps', v)} items={[[null, tr('Interpolate')], ['zero', tr('Drop to zero')]]} /></Line>}
        </>
      )],
      api.keys.length > 1 && ['cats', IconCategory, tr('Shown: {n}/{total}', { n: api.shown.length, total: api.keys.length }), tr('Categories shown'), (
        <div className="chart-wheel__cats" role="group" aria-label={tr('Categories shown')}>
          {api.keys.map(k => {
            const on = !api.hidden.has(k)
            return (
              <button key={k} type="button" className={`chart-wheel__cat${on ? ' is-on' : ''}`} aria-pressed={on}
                title={on ? tr('Hide {name}', { name: api.nameOf(k) }) : tr('Show {name}', { name: api.nameOf(k) })} onClick={() => api.toggleHidden(k)}>{api.nameOf(k)}</button>
            )
          })}
        </div>
      )],
    ],
    labels: [
      // Free size too large for the card: reported (drawn size); labels removed for lack of room: counted.
      (labelInfo?.noRoom > 0 || labelInfo?.cap) && ['noroom', null, [labelInfo.noRoom > 0 && tr('{n} hidden (no room)', { n: labelInfo.noRoom }), labelInfo.cap && tr('shown at {n} pt', { n: labelInfo.cap.used })].filter(Boolean).join(', '), tr('Labels that do not fit'), (
        <div className="chart-pop__note">{[
          labelInfo.cap && tr('{asked} pt does not fit in the chart: labels are drawn at {used} pt.', { asked: labelInfo.cap.asked, used: labelInfo.cap.used }),
          labelInfo.noRoom > 0 && (labelInfo.noRoom > 1
            ? tr('{n} labels left out for lack of room; hover a bar or point to read its value.', { n: labelInfo.noRoom })
            : tr('{n} label left out for lack of room; hover a bar or point to read its value.', { n: labelInfo.noRoom })),
        ].filter(Boolean).join(' ')}</div>
      )],
      ['show', IconTag, SHOW.find(([v]) => v === api.labelsOf(sid))?.[1] ?? tr('None'), tr('Value labels'), (
        <>
          {seriesPicker}
          <Line label={tr('Show')}><Seg label={tr('Value labels')} value={api.labelsOf(sid)} onPick={v => { api.setLabels(sid, v); if (v === 'some' && !(F.labelKeys?.[sid] ?? []).length) setLabelKeys(point ? [point.key] : api.shown.slice(-1)) }} items={SHOW} /></Line>
          {/* "Chosen": tick the categories that carry their figure. */}
          {api.labelsOf(sid) === 'some' && (
            <div className="chart-wheel__cats" role="group" aria-label={tr('Categories with a value label')}>
              {api.shown.map(k => {
                const on = (F.labelKeys?.[sid] ?? []).map(String).includes(String(k))
                return <button key={k} type="button" className={`chart-wheel__cat${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleLabelKey(k)}>{api.nameOf(k)}</button>
              })}
            </div>
          )}
        </>
      )],
      totalsAvail && ['totals', IconSum, tr('Totals: {value}', { value: p.totals ? tr('on') : tr('off') }), tr('Stack totals'), (
        <Line label=""><Check on={!!p.totals} onClick={() => api.setPref('totals', !p.totals)}>{tr('Show stack totals')}</Check></Line>
      )],
      ['content', IconListDetails, { share: '%', valueShare: tr('Value + %'), series: tr('Series'), category: tr('Category'), seriesValue: tr('Series + value'), seriesShare: tr('Series + %') }[LO.content] ?? tr('Value'), tr('Label content'), (
        <>
          <Line label={tr('Content')}><Seg label={tr('Label content')} value={LO.content ?? null} onPick={v => setL('content', v)}
            items={[[null, tr('Value')], ...(api.hasBars ? [['share', '%'], ['valueShare', tr('Value + %')], ['seriesShare', tr('Series + %')]] : []), ['series', tr('Series')], ['seriesValue', tr('Series + value')], ['category', tr('Category')]]} /></Line>
          {(LO.content === 'share' || LO.content === 'valueShare' || LO.content === 'seriesShare') && <Line label={tr('% format')}>
            <Seg label={tr('Percent decimals')} value={LO.pctDecimals ?? null} onPick={v => setL('pctDecimals', v)} items={[[null, tr('Same')], [0, tr('0%')], [1, tr('0.0%')], [2, tr('0.00%')]]} />
            <Check on={!!LO.pctPlus} onClick={() => setL('pctPlus', LO.pctPlus ? null : true)}>{tr('+ on positives')}</Check>
          </Line>}
        </>
      )],
      pick.labelKey && ['text', IconLetterT, textOf != null ? tr('Text: {value}', { value: textOf }) : tr('Text: automatic'), tr('Text of this label (F2)'), (
        <>
          <Line label={tr('Text')}><Field label={tr("This label's text")} wide autoFocus value={textOf ?? currentLabelText ?? ''} placeholder="{value}" onCommit={v => setText(v === '' ? null : v)} /></Line>
          <Line label={tr('Fields')}><span className="chart-pop__hint">{tr('{value} {share} {series} {category} stay linked to the data')}</span></Line>
          <Line label={tr('This label')}>
            <Seg label={tr('Size of this label')} value={oneStyle.size ?? null} onPick={v => setOne({ size: v })} items={SIZES} />
            <PtField label={tr('Size of this label in points')} value={oneStyle.size} onPick={v => setOne({ size: v })} />
            <FontPick label={tr('Font of this label')} value={oneStyle.font ?? LO.font ?? null} onPick={v => setOne({ font: v === (LO.font ?? null) ? null : v ?? 'mono' })} />
            <Check on={oneStyle.bold !== false} onClick={() => setOne({ bold: oneStyle.bold === false ? null : false })}>{tr('Bold')}</Check>
            <Check on={oneStyle.italic ?? !!LO.italic} onClick={() => setOne({ italic: !(oneStyle.italic ?? !!LO.italic) === !!LO.italic ? null : !(oneStyle.italic ?? !!LO.italic) })}>{tr('Italic')}</Check>
            <Check on={oneStyle.underline ?? !!LO.underline} onClick={() => setOne({ underline: !(oneStyle.underline ?? !!LO.underline) === !!LO.underline ? null : !(oneStyle.underline ?? !!LO.underline) })}>{tr('Underline')}</Check>
          </Line>
          <Line label={tr('Color')}><Swatches palette={api.palette} value={oneStyle.color} onPick={c => setOne({ color: c })} /></Line>
        </>
      )],
      api.hasBars && ['position', IconAlignBoxBottomCenter, { inside: tr('Inside'), outside: tr('Outside') }[LO.position] ?? tr('Auto'), tr('Label position'), (
        <Line label={tr('Position')}><Seg label={tr('Label position')} value={LO.position ?? null} onPick={v => setL('position', v)} items={[[null, tr('Auto')], ['inside', tr('Inside')], ['outside', tr('Outside')]]} /></Line>
      )],
      ['style', IconBrush, `${tr('Style: {value}', { value: LO.bold === false ? tr('regular') : tr('bold') })}${LO.color ? `, ${LO.color}` : ''}`, tr('Label style'), (
        <>
          <Line label={tr('Color')}><Seg label={tr('Label color')} value={LO.color ?? null} onPick={v => setL('color', v)} items={[[null, tr('Series')], ['black', tr('Black')], ['gray', tr('Gray')], ['accent', tr('Accent')]]} />
            {/* Free label color (free style): the same row as Fill. */}
            <CustomColor value={LO.color} onPick={c => setL('color', c)} /></Line>
          <Line label={tr('Rotation')}><Seg label={tr('Label rotation')} value={LO.rotate ?? null} onPick={v => setL('rotate', v)} items={[[null, '0°'], [45, '45°'], [90, tr('90° left'), null, tr('Rotate 90° left (reads upward)')], [-90, tr('90° right'), null, tr('Rotate 90° right (reads downward)')]]} /></Line>
          <Line label={tr('Size')}><Seg label={tr('Label size')} value={LO.size ?? null} onPick={v => setL('size', v)} items={SIZES} /><PtField label={tr('Label size in points')} value={LO.size} onPick={v => setL('size', v)} /></Line>
          <Line label="">
            <Check on={LO.bold !== false} onClick={() => setL('bold', LO.bold === false ? null : false)}>{tr('Bold')}</Check>
            <Check on={!!LO.italic} onClick={() => setL('italic', LO.italic ? null : true)}>{tr('Italic')}</Check>
            <Check on={!!LO.underline} onClick={() => setL('underline', LO.underline ? null : true)}>{tr('Underline')}</Check>
            <Check on={!!LO.keepAll} onClick={() => setL('keepAll', LO.keepAll ? null : true)}>{tr('Keep overlapping')}</Check>
          </Line>
          <Line label={tr('Font')}><FontPick label={tr('Label font')} value={LO.font ?? null} onPick={v => setL('font', v)} /></Line>
        </>
      )],
      ['numbers', null, tr('Format: {value}', { value: labelNumbers.preview }), tr('Number format'), labelNumbers.body],
    ],
    legend: [
      ['position', IconLayoutList, { bottom: tr('Bottom'), none: tr('Hidden'), series: tr('On chart') }[F.legend] ?? tr('Top'), tr('Legend position'), (
        <>
          <Line label={tr('Position')}><Seg label={tr('Legend position')} value={F.legend ?? null} onPick={v => api.setFmt('legend', v)} items={[['top', tr('Top')], ['bottom', tr('Bottom')], ['direct', tr('On chart')], ['none', tr('Hidden')]]} /></Line>
          {(F.legend ?? null) !== 'none' && !['series', 'direct'].includes(F.legend) && <Line label=""><Check on={!!F.legendFrame} onClick={() => api.setFmt('legendFrame', F.legendFrame ? null : true)}>{tr('Frame')}</Check></Line>}
          {/* The frame line style of the legend. */}
          {F.legendFrame && !['series', 'direct'].includes(F.legend) && <Line label={tr('Frame')}><Seg label={tr('Legend frame style')} value={F.legendFrameStyle ?? null} onPick={v => api.setFmt('legendFrameStyle', v)} items={DASHES.map(([v, l, d]) => [v === 'solid' ? null : v, l, () => lineGlyph(d)])} /></Line>}
          {F.legendOffset && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.setFmt('legendOffset', null)}>{tr('Put the legend back in place')}</button></Line>}
        </>
      )],
      ['size', IconTextSize, { xsmall: tr('Extra small'), small: tr('Small'), large: tr('Large'), xlarge: tr('Extra large') }[F.legendSize] ?? tr('Medium'), tr('Legend text size'), (
        <Line label={tr('Text size')}><Seg label={tr('Legend text size')} value={F.legendSize ?? null} onPick={v => api.setFmt('legendSize', v)} items={SIZES} /></Line>
      )],
      ['options', IconAdjustments, [F.legendOrder === 'reverse' && tr('Reversed'), F.legendCagr && tr('CAGR in names'), api.hasLines && (F.endLabels !== false ? tr('Line names: at ends') : tr('Line names: off'))].filter(Boolean).join(' · ') || tr('Default order'), tr('Legend options'), (
        <Line label="">
          <Check on={F.legendOrder === 'reverse'} onClick={() => api.setFmt('legendOrder', F.legendOrder === 'reverse' ? null : 'reverse')}>{tr('Reverse order')}</Check>
          {api.series.length > 2 && <span className="chart-pop__order" role="group" aria-label={tr('Legend order')}>
            {legendIds.map((id, i) => (
              <button key={id} type="button" className="chart-seg__opt" disabled={i === 0} title={tr('Move {name} up in the legend', { name: seriesName(id) })}
                onClick={() => { const n = [...legendIds]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; api.setFmt('legendOrder', n) }}>↑ {seriesName(id)}</button>
            ))}
          </span>}
          <Check on={!!F.legendCagr} onClick={() => api.setFmt('legendCagr', F.legendCagr ? null : true)}>{tr('CAGR in names')}</Check>
          {api.hasLines && <Check on={F.endLabels !== false} onClick={() => api.setFmt('endLabels', F.endLabels === false ? null : false)}>{tr('Names at line ends')}</Check>}
        </Line>
      )],
    ],
    annotation: ann ? [
      // Start and end of an arrow (choose from which column to which column).
      (ann.kind === 'cagr' || ann.kind === 'diff') && ['ends', IconArrowsExchange, endsLabel, tr('Where the arrow starts and ends'), (
        <>
          <Line label={tr('From')}><select className="chart-opts-input" aria-label={tr('Arrow start')} value={arrowEnds.from ?? ''} onChange={e => setEnd('from', e.target.value)}>
            {api.shown.map(k => <option key={k} value={k} disabled={k === arrowEnds.to}>{api.nameOf(k)}</option>)}
          </select></Line>
          <Line label={tr('To')}><select className="chart-opts-input" aria-label={tr('Arrow end')} value={arrowEnds.to ?? ''} onChange={e => setEnd('to', e.target.value)}>
            {api.shown.map(k => <option key={k} value={k} disabled={k === arrowEnds.from}>{api.nameOf(k)}</option>)}
          </select></Line>
          {ann.kind === 'cagr' && <Line label=""><span className="chart-pop__hint">{tr('Years are counted on the real dates, hidden or missing years included.')}</span></Line>}
        </>
      )],
      // CAGR arrow color: tokens.
      ann.kind === 'cagr' && arrowEnds.from && arrowEnds.to && ['color', dot(F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500'), tr('Color: {value}', { value: colorName(F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500') }), tr('Arrow color'), (
        <Swatches palette={['gray-500', 'gray-700', 'black', ...api.palette.filter(c => !['gray-500', 'gray-700', 'black'].includes(c))]} value={F.cagrTones?.[`${arrowEnds.from}|${arrowEnds.to}`] ?? 'gray-500'}
          onPick={c => api.setFmt('cagrTones', { ...(F.cagrTones ?? {}), [`${arrowEnds.from}|${arrowEnds.to}`]: c === 'gray-500' ? undefined : c })} />
      )],
      ann.kind === 'diff' && ['mode', IconPercentage, { both: tr('Value + %'), pct: tr('% of start'), pctEnd: tr('% of end') }[F.diffMode] ?? tr('Value'), tr('What the arrow shows (double-click it to cycle)'), (
        <>
          <Line label={tr('Show')}><Seg label={tr('Difference arrow')} value={F.diffMode ?? null} onPick={v => api.setFmt('diffMode', v)} items={[[null, tr('Value')], ['both', tr('Value + %')], ['pct', tr('% of start')], ['pctEnd', tr('% of end')]]} /></Line>
        </>
      )],
      ann.kind === 'note' && ['text', IconLetterT, tr('Text: {value}', { value: note?.text || tr('empty') }), tr('Text label (drag it to move)'), (
        <>
          <Line label={tr('Text')}><Field label={tr('Text label')} wide autoFocus multiline title={tr('Enter to confirm, Shift+Enter for a new line; {B2} shows that data-sheet cell and follows it; drag the label on the chart to move it')} value={note?.text ?? ''} onCommit={v => setNote({ text: v })} /></Line>
        </>
      )],
      ann.kind === 'note' && ['style', IconBrush, tr('Style: {value}', { value: note?.bold ? tr('bold') : tr('regular') }), tr('Text label style'), (
        <Line label="">
          <Seg label={tr('Text size')} value={note?.size ?? null} onPick={v => setNote({ size: v })} items={[['small', 'S'], [null, 'M'], ['large', 'L']]} />
          <Seg label={tr('Text alignment')} value={note?.align ?? null} onPick={v => setNote({ align: v })} items={[[null, tr('Left')], ['center', tr('Center')], ['right', tr('Right')]]} />
          <Seg label={tr('Vertical alignment')} value={note?.valign ?? null} onPick={v => setNote({ valign: v })} items={[[null, tr('Top')], ['middle', tr('Middle')], ['bottom', tr('Bottom')]]} />
          <Seg label={tr('Text rotation')} value={note?.rotate ?? null} onPick={v => setNote({ rotate: v })} items={[[null, '0°'], [90, '↺ 90°', null, tr('Rotate 90° left')], [-90, '↻ 90°', null, tr('Rotate 90° right')]]} />
          <Check on={!!note?.bold} onClick={() => setNote({ bold: note?.bold ? null : true })}>{tr('Bold')}</Check>
        </Line>
      )],
      listDiff && ['style', IconArrowsVertical, listDiff.level ? tr('Level difference') : tr('Over the columns'), tr('Arrow style'), (
        <Line label={tr('Style')}><Seg label={tr('Arrow style')} value={listDiff.level ? 'level' : null} onPick={v => api.setDiffAt(ann.i, { level: v === 'level' ? true : undefined })}
          items={[[null, tr('Over the columns')], ['level', tr('Level difference (beside)')]]} /></Line>
      )],
      listVl && ['value', IconLineHeight, `${listVl.value}${listVl.label ? ` · ${listVl.label}` : ''}`, tr('Value line'), (
        <>
          <Line label=""><Field label={tr('Value')} numeric value={listVl.value ?? ''} onCommit={v => v != null && api.setValueLineAt(ann.i, { value: v })} /><Field label={tr('Label')} value={listVl.label ?? ''} placeholder={tr('e.g. Budget')} onCommit={v => api.setValueLineAt(ann.i, { label: v || undefined })} /></Line>
          <Line label={tr('Label at')}><Seg label={tr('Label side')} value={listVl.side ?? 'right'} onPick={v => api.setValueLineAt(ann.i, { side: v })} items={[['left', tr('Left')], ['right', tr('Right')]]} /></Line>
          <Line label={tr('Style')}><Seg label={tr('Value line style')} value={listVl.dash ?? 'dash'} onPick={v => api.setValueLineAt(ann.i, { dash: v })} items={DASHES.map(([v, l, d]) => [v, l, () => lineGlyph(d)])} /></Line>
          <button type="button" className="chart-pop__link" onClick={() => onResetValueLineAt?.(ann.i)}>{tr('Back to the average')}</button>
        </>
      )],
      ann.kind === 'vline' && !listVl && ['value', IconLineHeight, `${p.valueLine}${p.valueLineLabel ? ` · ${p.valueLineLabel}` : ''}`, tr('Value line'), (
        <>
          <Line label=""><Field label={tr('Value')} numeric value={p.valueLine ?? ''} onCommit={v => api.setValueLine(v)} /><Field label={tr('Label')} value={p.valueLineLabel ?? ''} placeholder={tr('e.g. Target')} onCommit={v => api.setPref('valueLineLabel', v)} /></Line>
          <Line label={tr('Label at')}><Seg label={tr('Label side')} value={p.valueLineSide ?? 'right'} onPick={v => api.setPref('valueLineSide', v)} items={[['left', tr('Left')], ['right', tr('Right')]]} /></Line>
          <button type="button" className="chart-pop__link" onClick={() => onResetValueLine?.()}>{tr('Back to the average')}</button>
        </>
      )],
    ] : [],
  }

  const annName = ann && { cagr: tr('CAGR arrow'), diff: tr('Difference arrow'), vline: tr('Value line'), note: tr('Text label') }[ann.kind]
  const objName = obj === 'annotation' ? annName
    : obj === 'series' ? (sel ? tr('{n} bars', { n: sel.length }) : `${seriesName(sid)}${point ? ` · ${point.label}` : ''}`)
    : obj === 'labels' ? tr('Labels')
    : OBJECTS.find(([v]) => v === obj)?.[1] ?? tr('Chart')
  // The first control: the object being formatted, and switching to another one.
  const OBJ_ICON = { chart: IconLayoutColumns, series: SHAPES.find(([v]) => v === mark)?.[2] ?? IconChartBar, yaxis: IconArrowsVertical, xaxis: IconArrowsExchange, labels: IconTag, legend: IconLayoutList, annotation: IconFocus2 }
  const objectCtl = ['object', OBJ_ICON[obj] ?? IconFocus2, objName, tr('Object being formatted (click to switch)'), (
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
  const addOf = (menus[obj] ?? []).filter(it => it && it !== '-' && !it.format && !it.reset)
    // From the bar, no category is designated: the break is set by right-clicking one of them.
    .map(it => (it.gap ? { label: tr('Add gap before a category'), disabled: true, title: tr('Right-click a category on the axis'), onSelect: () => {} } : it))
  const addCtl = obj !== 'annotation' && addOf.length > 0
    && ['more', IconPlus, '', tr('Add, remove and other actions (same as right-click)'), <ActionMenu items={addOf} onClose={() => setOpenCtl(null)} />]
  // A generic value (None, Auto, Medium…) reads with its name: "Outline: none".
  const GENERIC = new Set([tr('None'), tr('Auto'), tr('Medium'), tr('Solid'), tr('Absolute'), tr('Sheet'), tr('Reverse'), tr('Value'), '0°', tr('Top'), tr('Bars'),
    tr('Line'), tr('Area'), tr('Series'), tr('Connect'), tr('All'), tr('Last'), tr('On'), tr('Off'), '%', tr('Value + %'), tr('Category')])
  // The control's short name before a generic value, by control title.
  const SHORT = new Map([
    [tr('Series type and axis'), tr('Type')], [tr('Outline'), tr('Outline')], [tr('Value labels'), tr('Labels')], [tr('Scale'), tr('Scale')], [tr('Gridlines'), tr('Gridlines')],
    [tr('Axis values'), tr('Values')], [tr('Category order'), tr('Order')], [tr('Label rotation'), tr('Rotation')], [tr('Column width (or drag the handle on the baseline)'), tr('Width')],
    [tr('Missing periods on lines'), tr('Gaps')], [tr('Label content'), tr('Content')], [tr('Label position'), tr('Position')], [tr('Legend position'), tr('Position')],
    [tr('Legend text size'), tr('Text')], [tr('Text size'), tr('Text')], [tr('Fill color'), tr('Fill')],
  ])
  const display = (title, value) => {
    if (typeof value !== 'string' || !GENERIC.has(value) || !title) return value
    const name = SHORT.get(title) ?? title.replace(/\s*\(.*\)$/, '')
    return tr('{name}: {value}', { name, value: value.toLowerCase() })
  }
  const fullList = [objectCtl, ...(controls[obj] ?? []).filter(Boolean), ...(addCtl ? [addCtl] : [])]
  // Room counted: values only, then controls folded behind "⋯" (never a cut word).
  const level = useCompactLevel(ref, String(obj))
  const list = compactList(fullList, level, { head: 1, tail: addCtl ? 1 : 0, display: display, pin: openCtl, tr })

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
    <div className="chart-bar" role="toolbar" aria-label={tr('Format: {name}', { name: objName })} onKeyDown={onBarKey}>
      {list.map(([id, Icon, value, title, body], i) => (
        <div key={id} className={`chart-bar__slot${i === 0 ? ' is-object' : ''}`}>
          <button type="button" className={`chart-bar__ctl${value === '' ? ' is-icon' : ''}${openCtl === id ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded={openCtl === id}
            title={title} aria-label={value === '' ? title : tr('{name}: {value}', { name: title, value })} onClick={() => setOpenCtl(o => (o === id ? null : id))}>
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
        <button type="button" className="chart-bar__icon" onClick={() => { removeAnn(); onClose() }} title={tr('Remove (Del)')} aria-label={tr('Remove')}><IconTrash size={14} /></button>
      )}
      {obj === 'chart' && <>
        {api.setSheetOpen && <>
          <button type="button" className="chart-bar__text" onClick={() => { api.setSheetOpen(true); onClose() }} title={tr('Open the data sheet (or double-click the chart)')}>{tr('Data')}</button>
          <span className="chart-wheel__sep" aria-hidden="true" />
        </>}
        {undo
          ? <button type="button" className="chart-bar__undo" onClick={() => { api.restore(undo); setUndo(null) }}>{tr('Undo reset')}</button>
          : <button type="button" className="chart-bar__text" onClick={resetAll} title={tr('Remove every format change on this chart (you can undo)')}>{tr('Reset')}</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label={tr('Close')} title={tr('Close (Esc)')}><IconX size={13} /></button>
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
  const tr = useT()
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
        title={tr('Chart format: colours, labels, scale and sort. Tip: click any part of the chart to format it directly')} aria-label={tr('Chart format')} aria-expanded={!!anchor}>
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
