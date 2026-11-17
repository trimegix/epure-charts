// ─── epure-charts · formatting for a bridge (waterfall) ──────────────────────
// Same model as the other charts (ChartWheel), with the same building blocks:
//   · right-click on a bar, on the values or on the background → that object's
//     ACTION MENU (subtotal after, group into "Other levers",
//     difference arrow from / to here, steps table…);
//   · click on a bar (when the host gives it no gesture of its own), on
//     the values, the axis or the legend → its one-row FORMAT BAR;
//   · the header settings button → the same format bar, for the whole bridge;
//     its first control switches to another object (the values, a bar).
// View preferences (useWaterfallPrefs), per browser: the numbers never
// change, the bridge always closes.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconPalette, IconChevronDown, IconPlus, IconX, IconCheck, IconChartBar, IconTag, IconLayoutColumns, IconArrowsVertical, IconRuler2, IconEye, IconLink } from '@tabler/icons-react'
import { Seg, Check, Line, Swatches, ActionMenu, Pop, Field, NumberFormatFields } from './ChartWheel'
import { separatorOf } from './numberStyle'
import { useWheelPlacement } from './useWheelPlacement'
import { cardGeometry } from './cardGeometry'
import { undoLast, canUndo } from './chartPrefs'
import { useCompactLevel, compactList, compactValue } from './compactBar.jsx'
import BarBoundary from './BarBoundary.jsx'
import { tok, schemeMap, styleSummary, baseToken } from './customStyle.js'
import { SchemeTools, TextStyle } from './CustomStyle.jsx'
import { TONE_TOKEN } from './waterfallScene.js'

const TONE_NAMES = { anchor: 'Anchors', positive: 'Value created', negative: 'Drag', upside: 'Upside to exit' }

/**
 * api    : the useWaterfallPrefs API
 * pick   : { mode: 'menu' | 'bar', obj: 'bridge' | 'step' | 'values' | 'axis' | 'connector', stepKey, connTo, color }
 *          (connector: stepKey = the bar it starts from, connTo = the bar it reaches)
 * anchor : as in ChartWheel (x, y, align, box, lineTop, minLeft, marks)
 * axisPreview(v) / axisSample : preview of the value-axis format
 */
function BridgeBarInner({ api, pick = {}, anchor, onClose, axisPreview, axisSample }) {
  const ref = useRef(null)
  const [mode, setMode] = useState(pick.mode === 'menu' ? 'menu' : 'bar')
  const [obj, setObj] = useState(pick.obj ?? 'bridge')
  const [stepKey, setStepKey] = useState(pick.stepKey ?? null)
  const [scope, setScope] = useState('bar')
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
  const steps = api.edited?.steps ?? []
  const step = steps.find(s => s.key === stepKey)
  const lever = api.levers.find(l => l.key === stepKey)
  const isLevel = step && step.kind !== 'delta'
  const lastDelta = steps.filter(s => s.kind === 'delta').at(-1)?.key
  const hidden = new Set(p.hiddenSteps ?? [])
  const subtotals = new Set(p.subtotals ?? [])
  const resetAll = () => { setUndo({ ...p }); api.reset(); setObj('bridge'); setMode('bar') }
  const restore = () => { for (const [k, v] of Object.entries(undo ?? {})) api.setPref(k, v); setUndo(null) }
  const dot = c => <span className="chart-bar__dot" style={{ background: tok(c ?? 'gray-400') }} />
  const format = name => ({ label: `Format ${name}…`, onSelect: () => setMode('bar'), keepOpen: true })
  const sheet = { label: 'Open data sheet', onSelect: () => api.setSheetOpen(true), shortcut: 'Double-click' }
  // Value axis: scale, ticks, gridlines, format (as for columns).
  const ya = p.yAxis ?? {}
  const manual = Number.isFinite(ya.min) || Number.isFinite(ya.max) || Number.isFinite(ya.step)
  const tickOn = ya.labels !== false
  const gridOn = ya.grid !== 'none'
  const axisPrev = axisSample != null && axisPreview ? axisPreview(axisSample) : '—'
  // Selected connector: from bar stepKey to bar connTo (or rerouted from an earlier bar).
  const connTo = pick.connTo ?? null
  const connOn = !(p.connectorsOff ?? []).includes(stepKey)
  const connLinked = connTo && (p.links ?? {})[connTo]
  const toIdx = steps.findIndex(s => s.key === connTo)
  const earlier = toIdx > 1 ? steps.slice(0, toIdx - 1) : []

  // ── Actions (right-click): add, remove, group ──
  const partName = pick.part != null ? (step?.parts ?? []).find(q => String(q.key) === String(pick.part))?.label ?? pick.part : ''
  const diffItems = api.canDiff ? [
    { label: p.diff ? 'Remove difference arrow' : 'Add difference arrow', onSelect: () => api.toggle('diff') },
  ] : []
  const menus = {
    bridge: [
      ...diffItems,
      { label: 'Value labels', checked: !!p.labels, onSelect: () => api.toggle('labels') },
      { label: 'Connector lines', checked: !!p.connectors, onSelect: () => api.toggle('connectors') },
      { label: p.table ? 'Move values to chart' : 'Move values to table', onSelect: () => api.setPref('table', p.table ? null : 'values') },
      { label: p.valueLine != null ? 'Remove value line' : 'Add value line', onSelect: () => api.setPref('valueLine', p.valueLine != null ? null : true) },
      typeof p.valueLine === 'number' && { label: 'Value line back to the start level', onSelect: () => api.setPref('valueLine', true) },
      Object.keys(p.links ?? {}).length > 0 && { label: 'Reconnect all bars in order', onSelect: () => api.setPref('links', {}) },
      (p.netLines ?? []).length > 0 && { label: `Show net lines as segments (${p.netLines.length})`, onSelect: () => api.setPref('netLines', []) },
      api.canWhisker && { label: 'High scenario', checked: !!p.whiskers, onSelect: () => api.toggle('whiskers') },
      '-', canUndo() && { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => undoLast() }, sheet, format('bridge'), '-',
      { label: 'Reset formatting', onSelect: resetAll, keepOpen: true },
    ],
    step: step ? [
      pick.onDetail && { label: `Show breakdown of ${step.label}`, onSelect: () => pick.onDetail(), shortcut: 'Double-click' },
      // Multi-series waterfall: one series as a net line, or back to segments.
      pick.part != null && api.toggleNetLine && { label: pick.net ? `Show ${partName} as segments` : `Show ${partName} as net line`, onSelect: () => api.toggleNetLine(pick.part) },
      step.kind === 'delta' && step.key !== lastDelta && { label: subtotals.has(step.key) ? 'Remove subtotal after' : 'Add subtotal after', onSelect: () => api.toggleSubtotal(step.key) },
      lever?.hideable && { label: hidden.has(step.key) ? 'Show separately' : 'Group into “Other levers”', onSelect: () => api.toggleHidden(step.key) },
      (p.links ?? {})[step.key] && { label: 'Reconnect to the previous bar', onSelect: () => api.setLink(step.key, null) },
      steps.indexOf(step) < steps.length - 1 && { label: (p.connectorsOff ?? []).includes(step.key) ? 'Add connector after this bar' : 'Remove connector after this bar', onSelect: () => api.toggleConnector(step.key) },
      isLevel && api.canDiff && { label: 'Difference arrow from here', onSelect: () => api.setDiffEnd('from', step.key) },
      isLevel && api.canDiff && { label: 'Difference arrow to here', onSelect: () => api.setDiffEnd('to', step.key) },
      '-', format('bar'), sheet,
    ] : [],
    values: [
      { label: p.labels ? 'Remove value labels' : 'Add value labels', onSelect: () => api.toggle('labels') },
      { label: p.table ? 'Move values to chart' : 'Move values to table', onSelect: () => api.setPref('table', p.table ? null : 'values') },
      '-', format('values'),
    ],
    axis: [
      { label: tickOn ? 'Remove tick labels' : 'Add tick labels', onSelect: () => api.setAxis('labels', tickOn ? false : null) },
      { label: gridOn ? 'Remove gridlines' : 'Add gridlines', onSelect: () => api.setAxis('grid', gridOn ? 'none' : null) },
      manual && { label: 'Fit scale to data', onSelect: () => api.autoScale() },
      '-', format('axis'),
    ],
    connector: [
      { label: connOn ? 'Remove connector' : 'Add connector', onSelect: () => api.toggleConnector(stepKey) },
      connLinked && { label: 'Reconnect to the previous bar', onSelect: () => api.setLink(connTo, null) },
      '-', format('connector'),
    ],
  }

  // ── Format-bar controls: [id, icon, value, name, menu] ──
  const levelName = k => api.levelOptions.find(o => o.value === k)?.label ?? k
  const shownCount = api.levers.filter(l => !hidden.has(l.key)).length
  const showSummary = [p.labels && !p.table && 'values', p.table && 'table', p.valueLine != null && 'value line', p.connectors && 'connectors', api.canWhisker && p.whiskers && 'high scenario'].filter(Boolean).join(', ') || 'nothing'
  const tableSeg = <Line label="Table"><Seg label="Data table under the axis" value={p.table ?? null} onPick={v => api.setPref('table', v)} items={[[null, 'Off'], ['values', 'Values'], ['running', 'Values + running total']]} /></Line>
  const controls = {
    bridge: [
      ['show', null, `Show: ${showSummary}`, 'What the bridge shows', (
        <Line label="">
          <div className="chart-pop__stack">
            <Check on={!!p.labels} onClick={() => api.toggle('labels')}>Value labels</Check>
            <Check on={!!p.connectors} onClick={() => api.toggle('connectors')}>Connector lines</Check>
            {api.canWhisker && <Check on={!!p.whiskers} onClick={() => api.toggle('whiskers')}>High scenario</Check>}
          </div>
        </Line>
      )],
      ['table', null, `Table: ${{ values: 'values', running: 'values + running total' }[p.table] ?? 'off'}${p.valueLine != null ? ' · value line' : ''}`, 'Data table and value line', (
        <>
          {tableSeg}
          <Line label=""><Check on={p.valueLine != null} onClick={() => api.setPref('valueLine', p.valueLine != null ? null : true)}>Value line (drag to move)</Check></Line>
          <div className="chart-pop__note">Drag a connector onto an earlier bar to start a bar from that level.</div>
        </>
      )],
      api.canDiff && ['diff', null, p.diff ? `Difference: ${levelName(api.diffFrom)} → ${levelName(api.diffTo)}` : 'Difference: off', 'Difference arrow between two levels', (
        <>
          <Line label=""><Check on={!!p.diff} onClick={() => api.toggle('diff')}>Difference arrow</Check></Line>
          {p.diff && <>
            <Line label="From"><Seg label="From" value={api.diffFrom} onPick={v => api.setPref('diffFrom', v)} items={api.levelOptions.map(o => [o.value, o.label])} /></Line>
            <Line label="To"><Seg label="To" value={api.diffTo} onPick={v => api.setPref('diffTo', v)} items={api.levelOptions.filter(o => o.value !== api.diffFrom).map(o => [o.value, o.label])} /></Line>
          </>}
          <div className="chart-pop__note">Or right-click a level bar: “Difference arrow from / to here”.</div>
        </>
      )],
      ['dir', null, `Direction: ${p.direction === 'down' ? 'down' : 'up'}${p.backCalc ? ' · start computed' : ''}`, 'Direction and start of the bridge', (
        <>
          <Line label="Direction"><Seg label="Bridge direction" value={p.direction === 'down' ? 'down' : 'up'} onPick={v => api.setPref('direction', v === 'down' ? 'down' : null)} items={[['up', 'Up (build)'], ['down', 'Down (break down)']]} /></Line>
          <Line label=""><Check on={!!p.backCalc} onClick={() => api.toggle('backCalc')} title="The first column is computed back from the last one">Compute the start from the end</Check></Line>
          {api.hasParts && <Line label="Segments"><Seg label="Segment order in a step" value={p.partOrder ?? null} onPick={v => api.setPref('partOrder', v)} items={[[null, 'Sheet'], ['posFirst', 'Positives first'], ['negFirst', 'Negatives first']]} /></Line>}
          {api.canDiff && p.diff && <Line label="Diff %"><Seg label="Difference percentage of" value={p.diffBase ?? null} onPick={v => api.setPref('diffBase', v)} items={[[null, 'Its start'], ['start', 'First column (100%)'], ...(p.labelContent && p.pctBase ? [['pctBase', 'Label 100%']] : []), ...api.levelOptions.slice(1).map(o => [o.value, `${o.label} (100%)`])]} /></Line>}
        </>
      )],
      api.levers.length > 0 && ['levers', null, `Levers: ${shownCount}/${api.levers.length} shown`, 'Levers shown and subtotals', (
        <table className="chart-pop__table">
          <thead><tr><th />{api.levers.some(l => l.hideable) && <th title="Unticked levers are grouped into “Other levers”; the total does not move">Shown</th>}<th>Subtotal after</th></tr></thead>
          <tbody>
            {api.levers.map(l => (
              <tr key={l.key}>
                <td>{l.label}</td>
                {api.levers.some(x => x.hideable) && <td>{l.hideable && <Check on={!hidden.has(l.key)} onClick={() => api.toggleHidden(l.key)} title={`Show ${l.label} separately`} />}</td>}
                <td><Check on={subtotals.has(l.key)} onClick={() => api.toggleSubtotal(l.key)} title={`Subtotal after ${l.label}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )],
      api.tones.length > 0 && ['colors', <>{api.tones.slice(0, 3).map(([t]) => <span key={t}>{dot(p.toneColors?.[t] ?? null)}</span>)}</>, 'Colors', 'Color of each family', (
        <>
          {api.tones.map(([t, l]) => (
            <Line key={t} label={l}><Swatches palette={api.palette} value={p.toneColors?.[t]} onPick={c => api.setToneColor(t, c)} /></Line>
          ))}
          {/* Named fill schemes: one color per family, in order. */}
          {/* The scheme editor resolves palette tokens to hex: a semantic tone token goes in as its palette fallback. */}
          <SchemeTools current={api.tones.map(([t]) => p.toneColors?.[t] ?? baseToken(TONE_TOKEN[t]) ?? 'gray-400')} active={p.schemeName}
            onApply={sc => { if (sc) api.setPref('toneColors', schemeMap(api.tones.map(([t]) => t), sc.colors)); api.setPref('schemeName', sc?.name ?? null) }} />
        </>
      )],
    ],
    step: step ? [
      ['fill', dot(p.stepColors?.[step.key] ?? p.toneColors?.[step.tone] ?? pick.color), `Fill: ${scope === 'bar' ? 'this bar' : TONE_NAMES[step.tone]?.toLowerCase() ?? 'family'}`, 'Fill color', (
        <>
          <Line label="Apply to"><Seg label="Fill scope" value={scope} onPick={setScope} items={[['bar', `${step.label} only`], ['tone', `All “${TONE_NAMES[step.tone] ?? step.tone}”`]]} /></Line>
          <Swatches palette={api.palette} value={scope === 'bar' ? p.stepColors?.[step.key] : p.toneColors?.[step.tone]}
            onPick={c => (scope === 'bar' ? api.setStepColor(step.key, c) : api.setToneColor(step.tone, c))} />
        </>
      )],
      step.kind === 'delta' && step.key !== lastDelta && ['subtotal', null, `Subtotal after: ${subtotals.has(step.key) ? 'on' : 'off'}`, 'Subtotal after this lever', (
        <Line label=""><Check on={subtotals.has(step.key)} onClick={() => api.toggleSubtotal(step.key)}>Subtotal after {step.label}</Check></Line>
      )],
      lever?.hideable && ['shown', null, hidden.has(step.key) ? 'In “Other levers”' : 'Shown separately', 'Show this lever or group it', (
        <Line label=""><Check on={!hidden.has(step.key)} onClick={() => api.toggleHidden(step.key)} title="Unticked: grouped into “Other levers”; the total does not move">Show separately</Check></Line>
      )],
      steps.indexOf(step) < steps.length - 1 && ['connector', null, `Connector after: ${(p.connectorsOff ?? []).includes(step.key) ? 'off' : 'on'}`, 'Connector line after this bar', (
        <>
          <Line label=""><Check on={!(p.connectorsOff ?? []).includes(step.key)} onClick={() => api.toggleConnector(step.key)}>Connector after this bar</Check></Line>
          {(p.links ?? {})[step.key] && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.setLink(step.key, null)}>Reconnect to the previous bar</button></Line>}
          {step.kind === 'delta' && <Line label=""><Check on={(p.toBaseline ?? []).includes(step.key)} onClick={() => api.toggleBaseline(step.key)} title="Drawn from zero; the running total still adds it">Draw from the baseline</Check></Line>}
          {step.kind === 'delta' && <Line label=""><Check on={(p.toBaselineTop ?? []).includes(step.key)} onClick={() => api.toggleBaselineTop(step.key)} title="The top of the bar sits on the baseline; the running total still adds it">Hang from the baseline</Check></Line>}
        </>
      )],
      isLevel && api.canDiff && ['diff', null, p.diff && (api.diffFrom === step.key || api.diffTo === step.key) ? `Difference: ${api.diffFrom === step.key ? 'from here' : 'to here'}` : 'Difference: off', 'Difference arrow', (
        <Line label="Arrow"><Seg label="Difference arrow" value={p.diff ? (api.diffFrom === step.key ? 'from' : api.diffTo === step.key ? 'to' : null) : null}
          onPick={v => (v ? api.setDiffEnd(v, step.key) : api.setPref('diff', false))} items={[[null, 'Off'], ['from', 'From here'], ['to', 'To here']]} /></Line>
      )],
    ] : [],
    values: [
      ['textstyle', null, styleSummary(p), 'Label color, font and size', <TextStyle font={p.labelFont} pt={p.labelPt} color={p.labelColor} onFont={v => api.setPref('labelFont', v)} onPt={v => api.setPref('labelPt', v)} onColor={v => api.setPref('labelColor', v)} />],
      ['show', null, `Values: ${p.table ? 'in table' : p.labels ? 'on' : 'off'}`, 'Value labels', (
        <>
          <Line label=""><Check on={!!p.labels} onClick={() => api.toggle('labels')}>Value labels</Check></Line>
          {tableSeg}
        </>
      )],
      p.labels && ['content', null, `Content: ${{ pct: '% of base', both: 'value + %' }[p.labelContent] ?? 'value'}`, 'Label content', (
        <>
          <Line label="Content"><Seg label="Label content" value={p.labelContent ?? null} onPick={v => api.setPref('labelContent', v)}
            items={[[null, 'Value'], ['pct', '% of base'], ['both', 'Value + %']]} /></Line>
          {p.labelContent && <Line label="100% is"><Seg label="Percent base" value={p.pctBase ?? null} onPick={v => api.setPref('pctBase', v)} items={[[null, 'First column'], ...api.levelOptions.slice(1).map(o => [o.value, o.label])]} /></Line>}
        </>
      )],
    ],
    axis: [
      ['scale', IconRuler2, manual ? `Scale: ${Number.isFinite(ya.min) ? ya.min : 'auto'} – ${Number.isFinite(ya.max) ? ya.max : 'auto'}` : 'Scale: auto', 'Scale', (
        <>
          <Line label="Range">
            <Field label="Min" numeric value={ya.min ?? ''} placeholder="Auto" onCommit={v => api.setAxis('min', v)} />
            <Field label="Max" numeric value={ya.max ?? ''} placeholder="Auto" onCommit={v => api.setAxis('max', v)} />
            <Field label="Step" numeric value={ya.step ?? ''} placeholder="Auto" onCommit={v => api.setAxis('step', v != null && v > 0 ? v : null)} />
          </Line>
          {manual && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.autoScale()}>Reset to automatic scale</button></Line>}
        </>
      )],
      ['show', IconEye, `Tick labels: ${tickOn ? 'on' : 'off'} · gridlines: ${gridOn ? 'on' : 'off'}`, 'Tick labels and gridlines', (
        <Line label="">
          <Check on={tickOn} onClick={() => api.setAxis('labels', tickOn ? false : null)}>Tick labels</Check>
          <Check on={gridOn} onClick={() => api.setAxis('grid', gridOn ? 'none' : null)}>Gridlines</Check>
        </Line>
      )],
      ['numbers', null, `Format: ${axisPrev}`, 'Number format of the axis', (
        <NumberFormatFields preview={axisPrev} decimals={p.axisDec ?? null} magnitude={p.axisMag ?? null} num={p.axisNum ?? {}} sep={separatorOf(p.axisNum)}
          setDec={v => api.setPref('axisDec', v)} setMag={v => api.setPref('axisMag', v)} setNum={api.setAxisNum} showMagnitude money />
      )],
    ],
    connector: [
      ['conn', null, `Connector: ${connOn ? 'on' : 'off'}`, 'Connector line', (
        <Line label=""><Check on={connOn} onClick={() => api.toggleConnector(stepKey)}>Connector after {step?.label ?? 'this bar'}</Check></Line>
      )],
      connTo && earlier.length > 0 && ['from', null, `Starts from: ${connLinked ? steps.find(s => s.key === connLinked)?.label ?? connLinked : 'previous bar'}`, 'Bar the next column starts from', (
        <>
          <Line label="From"><Seg label="Starts from" value={connLinked || null} onPick={v => api.setLink(connTo, v)} items={[[null, 'Previous bar'], ...earlier.map(s => [s.key, s.label])]} /></Line>
          <div className="chart-pop__note">Or drag the connector onto an earlier bar.</div>
        </>
      )],
    ],
  }

  const NAMES = { step: step?.label ?? 'Bar', values: 'Values', axis: 'Value axis', connector: 'Connector', bridge: 'Bridge' }
  const objName = NAMES[obj] ?? 'Bridge'
  const objIcon = { step: IconChartBar, values: IconTag, axis: IconArrowsVertical, connector: IconLink }[obj] ?? IconLayoutColumns
  const objectCtl = ['object', objIcon, objName, 'Object being formatted (click to switch)', (
    <div className="chart-pop__objects" role="menu">
      {[['bridge', 'Bridge'], ['values', 'Values'], ['axis', 'Value axis'], ...(connTo ? [['connector', 'Connector']] : []), ...steps.map(s => [`step:${s.key}`, s.label])].map(([v, l]) => {
        const on = v === obj || v === `step:${stepKey}` && obj === 'step'
        return (
          <button key={v} type="button" role="menuitemradio" aria-checked={on} className="chart-menu__item"
            onClick={() => { if (v.startsWith('step:')) { setObj('step'); setStepKey(v.slice(5)) } else setObj(v); setOpenCtl(null) }}>
            <span className="chart-menu__icon">{on ? <IconCheck size={13} /> : null}</span><span className="chart-menu__text">{l}</span>
          </button>
        )
      })}
    </div>
  )]
  const addItems = (menus[obj] ?? []).filter(it => it && it !== '-' && !String(it.label).startsWith('Format ') && it.label !== 'Reset formatting')
  const fullList = [objectCtl, ...(controls[obj] ?? []).filter(Boolean), ...(addItems.length ? [['more', IconPlus, '', 'Add or remove an element (also on right-click)', <ActionMenu items={addItems} onClose={() => setOpenCtl(null)} />]] : [])]
  // Width is measured: values only, then controls folded behind "⋯" (never a cut word).
  const level = useCompactLevel(ref, String(obj))
  const list = compactList(fullList, level, { head: 1, tail: addItems.length ? 1 : 0, display: (t, v) => v, pin: openCtl })

  const onBarKey = e => {
    if (!e.target.classList?.contains('chart-bar__ctl')) return
    const all = [...ref.current.querySelectorAll('.chart-bar__ctl')]
    const i = all.indexOf(e.target)
    if (e.key === 'ArrowRight') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpenCtl(list[i]?.[0]) }
  }
  const isComp = I => typeof I === 'function' || I?.$$typeof === Symbol.for('react.forward_ref')

  const bar = (
    <div className="chart-bar" role="toolbar" aria-label={`Format: ${objName}`} onKeyDown={onBarKey}>
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
      {obj === 'bridge' && <>
        <button type="button" className="chart-bar__text" onClick={() => { api.setSheetOpen(true); onClose() }} title="Open the data sheet (or double-click the bridge)">Data</button>
        <span className="chart-wheel__sep" aria-hidden="true" />
        {undo
          ? <button type="button" className="chart-bar__undo" onClick={restore}>Undo reset</button>
          : <button type="button" className="chart-bar__text" onClick={resetAll} title="Remove every format change on this bridge (you can undo)">Reset</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label="Close" title="Close (Esc)"><IconX size={13} /></button>
    </div>
  )

  return createPortal(
    <div ref={ref} className={`chart-wheel chart-wheel--${mode}`} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onContextMenu={e => e.preventDefault()}>
      {mode === 'menu' ? <ActionMenu items={menus[obj] ?? menus.bridge} onClose={onClose} /> : bar}
    </div>,
    document.body,
  )
}

/** The header settings button: the format bar for the whole bridge. */
export function BridgeBarButton({ api }) {
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
        title="Bridge format: colours, labels, subtotals and sort. Tip: click or right-click any part of the bridge" aria-label="Bridge format" aria-expanded={!!anchor}>
        <IconPalette size={13} />
      </button>
      {anchor && <BridgeBar api={api} pick={{ obj: 'bridge', mode: 'bar' }} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  )
}

/** The bar, guarded: an error closes it without touching the chart. */
export function BridgeBar(props) {
  return <BarBoundary onClose={props.onClose}><BridgeBarInner {...props} /></BarBoundary>
}
