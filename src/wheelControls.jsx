// ─── epure-charts · the controls of the format bars ─────────────────────────
// The building blocks shared by every format bar and menu (ChartWheel, BridgeBar, BarhBar,
// the Gantt, scatter and table views): segmented choices, check boxes, fields, swatches, the
// popover, the number-format fields, the right-click action menu, and the option tables in
// the interface's language. Split out of ChartWheel.jsx (which re-exports them).
import { useEffect, useRef, useState } from 'react'
import { useIsoLayoutEffect } from './useIsoLayoutEffect.js'
import { IconCheck } from '@tabler/icons-react'
import { SEPARATORS, parseExample } from './numberStyle'
import { tok } from './customStyle.js'
import { CustomColor } from './CustomStyle.jsx'
import { useT } from './uiLocale.js'
import { tablesOf, numOrNull } from './wheelTables.js'

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
