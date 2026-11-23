// ─── The options menu of a chart, shared by every chart ─────────────────────
// A permanent icon (never a right-click or a hidden handle: no action has to be
// guessed) opens a short list: "pills" for an exclusive choice (shape, split…),
// checkboxes to add or remove an element (CAGR, connectors, quadrants…).
//
// Settings are a VIEW preference, per browser (localStorage), never a fact
// about the underlying data and never shared between users.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconPalette, IconCheck } from '@tabler/icons-react'
import { tok } from './customStyle.js'
import { useT } from './uiLocale.js'

// ── The menu ─────────────────────────────────────────────────────────────────
/**
 * sections : [{ label, kind: 'pills' | 'checks' | 'fields', items: [...], error }]
 *   pills / checks : items = [{ key, label, on, onToggle }]
 *   swatches       : items = [{ key, color (token name), on, onToggle }], the color of a series
 *   fields         : items = [{ key, label, type: 'text' | 'select', value, onChange(value), options?: [{ value, label }] }]
 *   error          : sentence shown under the faulty setting (the chart editor)
 * A section without items is not shown: the menu only offers what makes sense
 * for this particular chart.
 */
export function ChartMenu({ sections }) {
  // Labels may come from hooks that do not know the language (useWaterfallPrefs…): translated here.
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 236) })
    }
    setOpen(o => !o)
  }

  const visible = sections.filter(s => s.items?.length)
  if (!visible.length) return null

  return (
    <>
      <button type="button" ref={btnRef} className="chart-opts-btn" onClick={toggle}
        title={tr('Chart options: display settings for this chart')} aria-label={tr('Chart options')} aria-expanded={open}>
        <IconPalette size={13} />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} className="chart-opts-menu" style={{ top: pos.top, left: pos.left, maxHeight: `calc(100vh - ${pos.top + 12}px)`, overflowY: 'auto' }} role="menu">
          {visible.map(section => (
            <div key={section.label}>
              <div className="chart-opts-menu__label">{tr(section.label)}</div>
              {section.kind === 'fields' ? (
                <div className="chart-opts-menu__fields">
                  {section.items.map(it => (
                    <label key={it.key} className="chart-opts-field">
                      {it.label && <span className="chart-opts-field__label">{tr(it.label)}</span>}
                      {it.type === 'select' ? (
                        <select className="chart-opts-input" value={it.value} onChange={e => it.onChange(e.target.value)}>
                          {it.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input className="chart-opts-input" type="text" value={it.value}
                          onChange={e => it.onChange(e.target.value)} />
                      )}
                    </label>
                  ))}
                </div>
              ) : section.kind === 'swatches' ? (
                <div className="chart-opts-menu__row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {section.items.map(it => (
                    <button key={it.key} type="button" className={`chart-editor-swatch${it.on ? ' is-on' : ''}`}
                      style={{ background: tok(it.color) }} aria-label={tr('Color {color}', { color: it.color })} aria-pressed={it.on} title={it.color}
                      onClick={it.onToggle} />
                  ))}
                </div>
              ) : section.kind === 'pills' ? (
                <div className="chart-opts-menu__row">
                  {section.items.map(it => (
                    <button key={it.key} type="button" className={`chart-opts-pill${it.on ? ' is-on' : ''}`}
                      onClick={it.onToggle}>{tr(it.label)}</button>
                  ))}
                </div>
              ) : section.items.map(it => (
                <button key={it.key} type="button" className="chart-opts-check" role="menuitemcheckbox"
                  aria-checked={it.on} onClick={it.onToggle}>
                  <span className={`chart-opts-check__box${it.on ? ' is-on' : ''}`}>{it.on && <IconCheck size={10} />}</span>
                  {tr(it.label)}
                </button>
              ))}
              {section.error && <div className="chart-opts-menu__error" role="alert">{tr(section.error)}</div>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
