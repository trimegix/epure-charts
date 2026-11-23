// ─── epure-charts · formatting for horizontal bars ───────────────────────────
// Same model as the other charts (ChartWheel) and bridges (BridgeBar):
//   · right-click anywhere → the ACTION MENU of the target object (a bar,
//     the values, the axis) or of the chart: value line, values, axis…;
//   · click on a bar (when the host gives it no gesture of its own), on
//     the values or on the axis → that object's one-row FORMAT BAR;
//   · the settings button → the same format bar, for the whole chart.
// View preferences (useBarhPrefs), per browser: the numbers never change.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconPalette, IconChevronDown, IconPlus, IconX, IconCheck, IconChartBar, IconTag, IconArrowsExchange, IconLayoutRows, IconRuler2 } from '@tabler/icons-react'
import { Seg, Check, Line, Swatches, Field, ActionMenu, NumberFormatFields, Pop } from './ChartWheel'
import { useWheelPlacement } from './useWheelPlacement'
import { cardGeometry } from './cardGeometry'
import { separatorOf } from './numberStyle'
import { useCompactLevel, compactList, compactValue } from './compactBar.jsx'
import BarBoundary from './BarBoundary.jsx'
import { tok, schemeMap, styleSummary } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
import { useT } from './uiLocale.js'

const sortsOf = tr => [[null, tr('Sheet')], ['reverse', tr('Reverse')], ['desc', tr('Largest first')], ['asc', tr('Smallest first')]]
const thickOf = tr => [['compact', tr('Thin')], [null, tr('Medium')], ['wide', tr('Thick')]]

/**
 * api    : the useBarhPrefs API
 * pick   : { mode: 'menu' | 'bar', obj: 'chart' | 'row' | 'values' | 'axis', rowKey, rowLabel, color }
 * anchor : as in ChartWheel
 * format : (v) => text, the effective formatter (format preview)
 * sample : a number from the series (for the preview)
 * money  : the numbers are amounts (currency and magnitude offered)
 */
function BarhBarInner({ api, pick = {}, anchor, onClose, format, sample, money, chartActions = [] }) {
  const tr = useT()
  const SORTS = sortsOf(tr)
  const THICK = thickOf(tr)
  const ref = useRef(null)
  const [mode, setMode] = useState(pick.mode === 'menu' ? 'menu' : 'bar')
  const [obj, setObj] = useState(pick.obj ?? 'chart')
  // A clicked segment (stacked bar) adjusts its series; a plain bar adjusts that bar.
  const [scope, setScope] = useState(pick.seriesId ? 'series' : 'row')
  const [sid, setSid] = useState(pick.seriesId ?? api.series[0]?.value)
  const [openCtl, setOpenCtl] = useState(null)
  const [undo, setUndo] = useState(null)
  const pos = useWheelPlacement(ref, anchor, mode)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { if (openCtl) setOpenCtl(null); else onClose() } }
    const onDown = e => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-wheel-anchor]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onClose, openCtl])

  const p = api.prefs
  const valuesOn = (p.labels ?? 'end') !== 'none'
  const axisOn = p.axis !== false
  const gridOn = p.grid !== 'none'
  const sc = p.scale ?? {}
  const legendOn = api.legendShown
  const resetAll = () => { setUndo(api.snapshot()); api.reset(); setObj('chart'); setMode('bar') }
  const formatItem = label => ({ label, format: true, onSelect: () => setMode('bar'), keepOpen: true })
  const toggleValueLine = () => (api.valueLineOn ? (api.setPref('valueLine', ''), api.setPref('valueLineLabel', '')) : api.setPref('valueLine', String(api.meanOfRows())))
  const dot = c => <span className="chart-bar__dot" style={{ background: tok(c ?? 'gray-400') }} />
  const preview = sample != null && format ? format(sample) : '—'

  const menus = {
    chart: [
      ...chartActions,
      { label: api.valueLineOn ? tr('Remove value line') : tr('Add value line'), onSelect: toggleValueLine },
      { label: valuesOn ? tr('Remove value labels') : tr('Add value labels'), onSelect: () => api.setPref('labels', valuesOn ? 'none' : null) },
      api.multi && { label: legendOn ? tr('Remove legend') : tr('Add legend'), onSelect: () => api.setPref('legend', !legendOn) },
      '-', formatItem(tr('Format chart…')), '-',
      { label: tr('Reset formatting'), reset: true, onSelect: resetAll, keepOpen: true },
    ],
    // A bar (or segment): same grammar as columns: labels, value line,
    // data sheet, format (difference arrows do not exist on horizontal bars).
    row: [
      { label: valuesOn ? tr('Remove value labels') : tr('Add value labels'), onSelect: () => api.setPref('labels', valuesOn ? 'none' : null) },
      !pick.seriesId && pick.rowLabel && { label: tr('Value line at {name}', { name: pick.rowLabel }), onSelect: () => api.setPref('valueLine', String(pick.rowValue ?? api.meanOfRows())) },
      api.valueLineOn && { label: tr('Remove value line'), onSelect: () => api.setPref('valueLine', '') },
      ...chartActions.filter(a => a && typeof a === 'object' && (a.sheet || /data sheet/i.test(a.label ?? ''))),
      '-', formatItem(tr('Format bar…')),
    ],
    values: [
      { label: valuesOn ? tr('Remove value labels') : tr('Add value labels'), onSelect: () => api.setPref('labels', valuesOn ? 'none' : null) },
      '-', formatItem(tr('Format values…')),
    ],
    axis: [
      { label: axisOn ? tr('Remove axis labels') : tr('Add axis labels'), onSelect: () => api.setPref('axis', axisOn ? false : null) },
      { label: gridOn ? tr('Remove gridlines') : tr('Add gridlines'), onSelect: () => api.setPref('grid', gridOn ? 'none' : null) },
      api.manualScale && { label: tr('Fit scale to data'), onSelect: () => api.autoScale() },
      '-', formatItem(tr('Format axis…')),
    ],
  }

  const numbers = (
    <NumberFormatFields preview={preview} decimals={p.decimals ?? null} magnitude={p.magnitude ?? null} num={p.num ?? {}} sep={separatorOf(p.num)}
      setDec={v => api.setPref('decimals', v)} setMag={v => api.setPref('magnitude', v)} setNum={api.setNum} showMagnitude={money} money={money} />
  )
  const numbersCtl = ['numbers', null, tr('Format: {value}', { value: preview }), tr('Number format'), numbers]
  const showSummary = [valuesOn && tr('values'), axisOn && tr('axis'), gridOn && tr('gridlines'), api.multi && legendOn && tr('legend')].filter(Boolean).join(', ') || tr('bars only')
  const rowColor = p.rowColors?.[pick.rowKey]
  const controls = {
    chart: [
      api.multi && ['mode', null, tr('Type: {type}', { type: { stacked: tr('stacked'), stacked100: '100%', clustered: tr('clustered'), butterfly: tr('butterfly'), profile: tr('profile') }[api.mode] }), tr('Bar type'), (
        <Line label={tr('Type')}><Seg label={tr('Bar type')} value={api.mode} onPick={v => api.setPref('mode', v)}
          items={[['clustered', tr('Clustered')], ['stacked', tr('Stacked')], ['stacked100', '100%'], ...(api.series.length === 2 ? [['butterfly', tr('Butterfly')]] : []), ['profile', tr('Profile')]]} /></Line>
      )],
      ['sort', null, tr('Order: {order}', { order: (SORTS.find(([v]) => v === (p.sort ?? null))?.[1] ?? tr('Sheet')).toLowerCase() }), tr('Bar order'), (
        <Line label={tr('Order')}><Seg label={tr('Bar order')} value={p.sort ?? null} onPick={v => api.setPref('sort', v)} items={SORTS} /></Line>
      )],
      ['show', null, tr('Show: {list}', { list: showSummary }), tr('What the chart shows'), (
        <Line label="">
          <div className="chart-pop__stack">
            <Check on={valuesOn} onClick={() => api.setPref('labels', valuesOn ? 'none' : null)}>{tr('Value labels')}</Check>
            <Check on={axisOn} onClick={() => api.setPref('axis', axisOn ? false : null)}>{tr('Axis labels')}</Check>
            <Check on={gridOn} onClick={() => api.setPref('grid', gridOn ? 'none' : null)}>{tr('Gridlines')}</Check>
            {api.multi && <Check on={legendOn} onClick={() => api.setPref('legend', !legendOn)}>{tr('Legend')}</Check>}
          </div>
        </Line>
      )],
      ['thick', null, tr('Bars: {size}', { size: (THICK.find(([v]) => v === (p.thickness ?? null))?.[1] ?? tr('Medium')).toLowerCase() }), tr('Bar thickness'), (
        <Line label={tr('Thickness')}><Seg label={tr('Bar thickness')} value={p.thickness ?? null} onPick={v => api.setPref('thickness', v)} items={THICK} /></Line>
      )],
      ['colors', <>{api.series.slice(0, 3).map(s => <span key={s.value}>{dot(s.color)}</span>)}</>, tr('Colors'), tr('Series colors'), (
        <>
          {api.series.map(s => (
            <Line key={s.value} label={api.multi ? s.label : tr('Bars')}><Swatches palette={api.palette} value={s.color} onPick={c => api.setSeriesColor(s.value, c)} /></Line>
          ))}
          {/* Named fill schemes: one color per series; a single series = one color per bar. */}
          <SchemeTools current={api.multi ? api.series.map(s => s.color ?? 'gray-400') : api.rows.map(r => p.rowColors?.[r.key] ?? api.series[0]?.color ?? 'gray-400')} active={p.schemeName}
            onApply={sc => {
              if (sc) api.setPref(api.multi ? 'seriesColors' : 'rowColors', schemeMap(api.multi ? api.series.map(s => s.value) : api.rows.map(r => r.key), sc.colors))
              api.setPref('schemeName', sc?.name ?? null)
            }} />
        </>
      )],
      api.valueLineOn && ['vline', null, tr('Value line: {value}', { value: p.valueLine }), tr('Value line'), (
        <Line label="">
          <Field label={tr('Value')} numeric value={p.valueLine} onCommit={v => api.setPref('valueLine', v == null ? '' : String(v))} />
          <Field label={tr('Label')} value={p.valueLineLabel ?? ''} placeholder={tr('e.g. Target')} onCommit={v => api.setPref('valueLineLabel', v)} />
        </Line>
      )],
      numbersCtl,
    ],
    row: [
      ['fill', dot(scope === 'row' ? rowColor ?? pick.color : api.series.find(s => s.value === sid)?.color), tr('Fill: {what}', { what: pick.seriesId ? pick.rowLabel : scope === 'row' ? tr('{name} only', { name: pick.rowLabel ?? tr('this bar') }) : tr('all bars') }), tr('Fill color'), (
        <>
          {!pick.seriesId && <Line label={tr('Apply to')}><Seg label={tr('Fill scope')} value={scope} onPick={setScope} items={[['row', tr('{name} only', { name: pick.rowLabel ?? tr('This bar') })], ['series', api.multi ? tr('Whole series') : tr('All bars')]]} /></Line>}
          {scope === 'series' && api.multi && !pick.seriesId && (
            <Line label={tr('Series')}><Seg label={tr('Series')} value={sid} onPick={setSid} items={api.series.map(s => [s.value, s.label])} /></Line>
          )}
          <Swatches palette={api.palette} value={scope === 'row' ? rowColor : api.series.find(s => s.value === sid)?.color}
            onPick={c => (scope === 'row' ? api.setRowColor(pick.rowKey, c) : api.setSeriesColor(sid, c))} />
          {/* Series pattern: hatched, dots, lines. */}
          {scope === 'series' && api.setSeriesPattern && <Line label={tr('Pattern')}><Seg label={tr('Fill pattern')} value={api.patternOf(pick.seriesId ?? sid)} onPick={v => api.setSeriesPattern(pick.seriesId ?? sid, v)}
            items={[[null, tr('Solid')], ['hatch', '///', null, tr('Hatched')], ['cross', '×', null, tr('Crosshatch')], ['dots', '···', null, tr('Dots')], ['lines', '≡', null, tr('Lines')]]} /></Line>}
        </>
      )],
    ],
    values: [
      ['textstyle', null, styleSummary(p), tr('Label color, font and size'), <TextStyle font={p.labelFont} pt={p.labelPt} color={p.labelColor} onFont={v => api.setPref('labelFont', v)} onPt={v => api.setPref('labelPt', v)} onColor={v => api.setPref('labelColor', v)} />],
      ['show', null, tr('Values: {state}', { state: valuesOn ? tr('on') : tr('off') }), tr('Value labels'), (
        <Line label=""><Check on={valuesOn} onClick={() => api.setPref('labels', valuesOn ? 'none' : null)}>{tr('Value labels')}</Check></Line>
      )],
      numbersCtl,
    ],
    axis: [
      ['scale', IconRuler2, api.manualScale ? tr('Scale: {min} – {max}', { min: Number.isFinite(sc.min) ? sc.min : tr('auto'), max: Number.isFinite(sc.max) ? sc.max : tr('auto') }) : tr('Scale: auto'), tr('Scale'), (
        <>
          <Line label={tr('Range')}>
            <Field label={tr('Min')} numeric value={sc.min ?? ''} placeholder={tr('Auto')} onCommit={v => api.setScale('min', v)} />
            <Field label={tr('Max')} numeric value={sc.max ?? ''} placeholder={tr('Auto')} onCommit={v => api.setScale('max', v)} />
            <Field label={tr('Step')} numeric value={sc.step ?? ''} placeholder={tr('Auto')} onCommit={v => api.setScale('step', v != null && v > 0 ? v : null)} />
          </Line>
          {api.manualScale && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.autoScale()}>{tr('Reset to automatic scale')}</button></Line>}
        </>
      )],
      ['show', null, tr('Axis labels: {state}', { state: axisOn ? tr('on') : tr('off') }), tr('Axis labels'), (
        <Line label=""><Check on={axisOn} onClick={() => api.setPref('axis', axisOn ? false : null)}>{tr('Axis labels')}</Check></Line>
      )],
      ['grid', null, tr('Gridlines: {style}', { style: { none: tr('none'), dash: tr('dashed') }[p.grid] ?? tr('solid') }), tr('Gridlines'), (
        <Line label={tr('Style')}><Seg label={tr('Gridlines')} value={p.grid ?? null} onPick={v => api.setPref('grid', v)} items={[['none', tr('None')], [null, tr('Solid')], ['dash', tr('Dashed')]]} /></Line>
      )],
      numbersCtl,
    ],
  }

  const NAMES = { chart: tr('Chart'), row: pick.rowLabel ?? tr('Bar'), values: tr('Values'), axis: tr('Axis') }
  const ICONS = { chart: IconLayoutRows, row: IconChartBar, values: IconTag, axis: IconArrowsExchange }
  const objectCtl = ['object', ICONS[obj], NAMES[obj], tr('Object being formatted (click to switch)'), (
    <div className="chart-pop__objects" role="menu">
      {Object.entries(NAMES).filter(([v]) => v !== 'row' || pick.rowKey).map(([v, l]) => (
        <button key={v} type="button" role="menuitemradio" aria-checked={obj === v} className="chart-menu__item"
          onClick={() => { setObj(v); setOpenCtl(null) }}>
          <span className="chart-menu__icon">{obj === v ? <IconCheck size={13} /> : null}</span><span className="chart-menu__text">{l}</span>
        </button>
      ))}
    </div>
  )]
  const addItems = (menus[obj] ?? []).filter(it => it && it !== '-' && !it.format && !it.reset)
  const fullList = [objectCtl, ...(controls[obj] ?? []).filter(Boolean), ...(addItems.length ? [['more', IconPlus, '', tr('Add or remove an element (also on right-click)'), <ActionMenu items={addItems} onClose={() => setOpenCtl(null)} />]] : [])]
  // Width is measured: values only, then controls folded behind "⋯" (never a cut word).
  const level = useCompactLevel(ref, String(obj))
  const list = compactList(fullList, level, { head: 1, tail: addItems.length ? 1 : 0, display: (t, v) => v, pin: openCtl, tr })
  const isComp = I => typeof I === 'function' || I?.$$typeof === Symbol.for('react.forward_ref')
  const onBarKey = e => {
    if (!e.target.classList?.contains('chart-bar__ctl')) return
    const all = [...ref.current.querySelectorAll('.chart-bar__ctl')]
    const i = all.indexOf(e.target)
    if (e.key === 'ArrowRight') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpenCtl(list[i]?.[0]) }
  }

  const bar = (
    <div className="chart-bar" role="toolbar" aria-label={tr('Format: {name}', { name: NAMES[obj] })} onKeyDown={onBarKey}>
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
      {obj === 'chart' && <>
        <span className="chart-wheel__sep" aria-hidden="true" />
        {undo
          ? <button type="button" className="chart-bar__undo" onClick={() => { api.restore(undo); setUndo(null) }}>{tr('Undo reset')}</button>
          : <button type="button" className="chart-bar__text" onClick={resetAll} title={tr('Remove every format change on this chart (you can undo)')}>{tr('Reset')}</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label={tr('Close')} title={tr('Close (Esc)')}><IconX size={13} /></button>
    </div>
  )

  return createPortal(
    <div ref={ref} className={`chart-wheel chart-wheel--${mode}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onContextMenu={e => e.preventDefault()}>
      {mode === 'menu' ? <ActionMenu items={menus[obj] ?? menus.chart} onClose={onClose} /> : bar}
    </div>,
    document.body,
  )
}

/** The settings button: the format bar for the whole chart. */
export function BarhBarButton(props) {
  const tr = useT()
  const [anchor, setAnchor] = useState(null)
  const btnRef = useRef(null)
  if (!props.api) return null
  const toggle = () => {
    if (anchor) return setAnchor(null)
    const r = btnRef.current.getBoundingClientRect()
    const geo = cardGeometry(btnRef.current)
    setAnchor({ x: r.right, y: r.bottom, align: 'right', box: geo.box, lineTop: geo.lineTop, minLeft: geo.minLeft })
  }
  return (
    <>
      <button type="button" ref={btnRef} data-wheel-anchor className="chart-opts-btn" onClick={toggle}
        title={tr('Chart format: colours, labels, scale and sort. Tip: click or right-click any part of the chart')} aria-label={tr('Chart format')} aria-expanded={!!anchor}>
        <IconPalette size={13} />
      </button>
      {anchor && <BarhBar {...props} pick={{ obj: 'chart', mode: 'bar' }} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  )
}

/** The bar, guarded: an error closes it without touching the chart. */
export function BarhBar(props) {
  return <BarBoundary onClose={props.onClose}><BarhBarInner {...props} /></BarBoundary>
}
