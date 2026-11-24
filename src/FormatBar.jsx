// ─── epure-charts · generic shell of a format bar ────────────────────────────
// The same model as ChartWheel, BridgeBar and BarhBar, for any new chart
// type: a selected object, a row of "Name: value" controls
// (each opens its own small menu), "+" to add / remove, an undoable Reset;
// on right-click, the object's action menu.
//
// <FormatBar
//   mode="bar" | "menu"
//   anchor={…}                         (useWheelPlacement)
//   objects={{ chart: { name, icon }, slice: { name, icon }, … }}  the current object and the others
//   object="slice" onObject={k => …}
//   controls={[[id, icon, value, title, body], …]}   those of the current object
//   actions={[{ label, onSelect, checked?, shortcut?, keepOpen? }, '-', …]}
//   onReset / onUndo / canUndo (on the "chart" object)
//   onClose />
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown, IconPlus, IconX, IconCheck } from '@tabler/icons-react'
import { ActionMenu, Pop } from './wheelControls.jsx'
import { useWheelPlacement } from './useWheelPlacement'
import { undoLast, canUndo as canUndoPrefs } from './chartPrefs'
import { useCompactLevel, compactList, compactValue } from './compactBar.jsx'
import BarBoundary from './BarBoundary.jsx'
import { useT } from './uiLocale.js'

const GENERIC = /^(chart|legend|labels?|value axis|category axis|x axis|y axis|axes|time scale|scale|partitions?|trend line|trend|bubbles?|points?|slices?|segments?|rows?|columns?|bars?|values?)$/i
const isComp = I =>typeof I === 'function' || I?.$$typeof === Symbol.for('react.forward_ref')

function FormatBarInner({ mode: mode0 = 'bar', anchor, objects, object, onObject, controls = [], actions = [], onReset, onUndo, canUndo, onClose, onOpenSheet, initialCtl }) {
  const tr = useT()
  const ref = useRef(null)
  const [mode, setMode] = useState(mode0 === 'menu' ? 'menu' : 'bar')
  // initialCtl: the control opened right away (e.g. the calendar on a double-click on a scale).
  const [openCtl, setOpenCtl] = useState(initialCtl ?? null)
  // Bar already open: a new double-click (initialCtl changes) also opens the control.
  const [seenCtl, setSeenCtl] = useState(initialCtl)
  if (initialCtl !== seenCtl) { setSeenCtl(initialCtl); if (initialCtl) setOpenCtl(initialCtl) }
  const pos = useWheelPlacement(ref, anchor, mode)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { if (openCtl) setOpenCtl(null); else onClose() } }
    const onDown = e => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-wheel-anchor]')) return
      if (e.ctrlKey || e.metaKey || e.shiftKey) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onClose, openCtl])

  const cur = objects[object] ?? { name: object }
  const menuItems = [
    ...actions,
    // The data sheet opens from any object (not only the chart background).
    ...(onOpenSheet && object !== 'chart' ? [{ label: tr('Open data sheet'), shortcut: tr('Double-click'), onSelect: () => { onOpenSheet(); onClose() } }] : []),
    ...(actions.length || (onOpenSheet && object !== 'chart') ? ['-'] : []),
    // A generic name is lowercased ("Format legend…"); a proper name keeps its case.
    { label: tr('Format {name}…', { name: GENERIC.test(String(cur.name)) ? String(cur.name).toLowerCase() : cur.name }), onSelect: () => setMode('bar'), keepOpen: true },
    ...(canUndoPrefs() ? [{ label: tr('Undo'), shortcut: 'Ctrl+Z', onSelect: () => undoLast() }] : []),
    ...(object === 'chart' && onReset ? ['-', { label: tr('Reset formatting'), onSelect: () => { onReset(); setMode('bar') }, keepOpen: true }] : []),
  ]
  const objectCtl = ['object', cur.icon, cur.name, tr('Object being formatted (click to switch)'), (
    <div className="chart-pop__objects" role="menu">
      {Object.entries(objects).map(([k, o]) => (
        <button key={k} type="button" role="menuitemradio" aria-checked={k === object} className="chart-menu__item"
          onClick={() => { onObject?.(k); setOpenCtl(null) }}>
          <span className="chart-menu__icon">{k === object ? <IconCheck size={13} /> : null}</span><span className="chart-menu__text">{o.name}</span>
        </button>
      ))}
    </div>
  )]
  const addItems = actions.filter(a => a && a !== '-')
  const fullList = [objectCtl, ...controls.filter(Boolean), ...(addItems.length ? [['more', IconPlus, '', tr('Add or remove an element (also on right-click)'), <ActionMenu items={addItems} onClose={() => setOpenCtl(null)} />]] : [])]
  // Short on room: values only, then controls folded behind "⋯" (never a cut-off word).
  const level = useCompactLevel(ref, String(object))
  const list = compactList(fullList, level, { head: 1, tail: addItems.length ? 1 : 0, display: (t, v) => v, pin: openCtl, tr })
  const onBarKey = e => {
    if (!e.target.classList?.contains('chart-bar__ctl')) return
    const all = [...ref.current.querySelectorAll('.chart-bar__ctl')]
    const i = all.indexOf(e.target)
    if (e.key === 'ArrowRight') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpenCtl(list[i]?.[0]) }
  }

  const bar = (
    <div className="chart-bar" role="toolbar" aria-label={tr('Format: {name}', { name: cur.name })} onKeyDown={onBarKey}>
      {list.map(([id, Icon, value, title, body], i) => (
        <div key={id} className={`chart-bar__slot${i === 0 ? ' is-object' : ''}`}>
          <button type="button" className={`chart-bar__ctl${value === '' ? ' is-icon' : ''}${openCtl === id ? ' is-open' : ''}`} aria-haspopup="true" aria-expanded={openCtl === id}
            title={title} aria-label={`${title}${value ? `: ${value}` : ''}`} onClick={() => setOpenCtl(o => (o === id ? null : id))}>
            {Icon && (isComp(Icon) ? <Icon size={14} aria-hidden="true" /> : Icon)}
            {value !== '' && <><span className="chart-bar__val">{compactValue(value, level)}</span><IconChevronDown size={11} aria-hidden="true" /></>}
          </button>
          {openCtl === id && <Pop right={i > list.length / 2}>{body}</Pop>}
        </div>
      ))}
      {object === 'chart' && onReset && <>
        <span className="chart-wheel__sep" aria-hidden="true" />
        {canUndo
          ? <button type="button" className="chart-bar__undo" onClick={onUndo}>{tr('Undo reset')}</button>
          : <button type="button" className="chart-bar__text" onClick={onReset} title={tr('Remove every format change on this chart (you can undo)')}>{tr('Reset')}</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label={tr('Close')} title={tr('Close (Esc)')}><IconX size={13} /></button>
    </div>
  )

  return createPortal(
    <div ref={ref} className={`chart-wheel chart-wheel--${mode}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onContextMenu={e => e.preventDefault()}>
      {mode === 'menu' ? <ActionMenu items={menuItems} onClose={onClose} /> : bar}
    </div>,
    document.body,
  )
}

/** The bar, guarded: an error closes it without affecting the chart. */
export default function FormatBar(props) {
  return <BarBoundary onClose={props.onClose}><FormatBarInner {...props} /></BarBoundary>
}
