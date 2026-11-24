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
import { useT } from './uiLocale.js'

const toneNames = tr => ({ anchor: tr('Anchors'), positive: tr('Value created'), negative: tr('Drag'), upside: tr('Upside to exit') })

/**
 * api    : the useWaterfallPrefs API
 * pick   : { mode: 'menu' | 'bar', obj: 'bridge' | 'step' | 'values' | 'axis' | 'connector', stepKey, connTo, color }
 *          (connector: stepKey = the bar it starts from, connTo = the bar it reaches)
 * anchor : as in ChartWheel (x, y, align, box, lineTop, minLeft, marks)
 * axisPreview(v) / axisSample : preview of the value-axis format
 */
function BridgeBarInner({ api, pick = {}, anchor, onClose, axisPreview, axisSample }) {
  const tr = useT()
  const TONE_NAMES = toneNames(tr)
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
  const format = label => ({ label, format: true, onSelect: () => setMode('bar'), keepOpen: true })
  const sheet = { label: tr('Open data sheet'), onSelect: () => api.setSheetOpen(true), shortcut: tr('Double-click') }
  // Value axis: scale, ticks, gridlines, format (as for columns).
  const ya = p.yAxis ?? {}
  const manual = Number.isFinite(ya.min) || Number.isFinite(ya.max) || Number.isFinite(ya.step)
  // Figures on every bar: no axis nor gridlines by default (waterfallScene); explicit otherwise.
  const figures = p.labels !== false
  const tickOn = ya.labels ?? !figures
  const gridOn = ya.grid != null ? ya.grid !== 'none' : !figures
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
    { label: p.diff ? tr('Remove difference arrow') : tr('Add difference arrow'), onSelect: () => api.toggle('diff') },
  ] : []
  const menus = {
    bridge: [
      ...diffItems,
      { label: tr('Value labels'), checked: !!p.labels, onSelect: () => api.toggle('labels') },
      { label: tr('Connector lines'), checked: !!p.connectors, onSelect: () => api.toggle('connectors') },
      { label: p.table ? tr('Move values to chart') : tr('Move values to table'), onSelect: () => api.setPref('table', p.table ? null : 'values') },
      { label: p.valueLine != null ? tr('Remove value line') : tr('Add value line'), onSelect: () => api.setPref('valueLine', p.valueLine != null ? null : true) },
      typeof p.valueLine === 'number' && { label: tr('Value line back to the start level'), onSelect: () => api.setPref('valueLine', true) },
      Object.keys(p.links ?? {}).length > 0 && { label: tr('Reconnect all bars in order'), onSelect: () => api.setPref('links', {}) },
      (p.netLines ?? []).length > 0 && { label: tr('Show net lines as segments ({n})', { n: p.netLines.length }), onSelect: () => api.setPref('netLines', []) },
      api.canWhisker && { label: tr('High scenario'), checked: !!p.whiskers, onSelect: () => api.toggle('whiskers') },
      '-', canUndo() && { label: tr('Undo'), shortcut: 'Ctrl+Z', onSelect: () => undoLast() }, sheet, format(tr('Format bridge…')), '-',
      { label: tr('Reset formatting'), reset: true, onSelect: resetAll, keepOpen: true },
    ],
    step: step ? [
      pick.onDetail && { label: tr('Show breakdown of {name}', { name: step.label }), onSelect: () => pick.onDetail(), shortcut: tr('Double-click') },
      // Multi-series waterfall: one series as a net line, or back to segments.
      pick.part != null && api.toggleNetLine && { label: pick.net ? tr('Show {name} as segments', { name: partName }) : tr('Show {name} as net line', { name: partName }), onSelect: () => api.toggleNetLine(pick.part) },
      step.kind === 'delta' && step.key !== lastDelta && { label: subtotals.has(step.key) ? tr('Remove subtotal after') : tr('Add subtotal after'), onSelect: () => api.toggleSubtotal(step.key) },
      lever?.hideable && { label: hidden.has(step.key) ? tr('Show separately') : tr('Group into “Other levers”'), onSelect: () => api.toggleHidden(step.key) },
      (p.links ?? {})[step.key] && { label: tr('Reconnect to the previous bar'), onSelect: () => api.setLink(step.key, null) },
      steps.indexOf(step) < steps.length - 1 && { label: (p.connectorsOff ?? []).includes(step.key) ? tr('Add connector after this bar') : tr('Remove connector after this bar'), onSelect: () => api.toggleConnector(step.key) },
      isLevel && api.canDiff && { label: tr('Difference arrow from here'), onSelect: () => api.setDiffEnd('from', step.key) },
      isLevel && api.canDiff && { label: tr('Difference arrow to here'), onSelect: () => api.setDiffEnd('to', step.key) },
      '-', format(tr('Format bar…')), sheet,
    ] : [],
    values: [
      { label: p.labels ? tr('Remove value labels') : tr('Add value labels'), onSelect: () => api.toggle('labels') },
      { label: p.table ? tr('Move values to chart') : tr('Move values to table'), onSelect: () => api.setPref('table', p.table ? null : 'values') },
      '-', format(tr('Format values…')),
    ],
    axis: [
      { label: tickOn ? tr('Remove tick labels') : tr('Add tick labels'), onSelect: () => api.setAxis('labels', !tickOn) },
      { label: gridOn ? tr('Remove gridlines') : tr('Add gridlines'), onSelect: () => api.setAxis('grid', gridOn ? 'none' : 'solid') },
      manual && { label: tr('Fit scale to data'), onSelect: () => api.autoScale() },
      '-', format(tr('Format axis…')),
    ],
    connector: [
      { label: connOn ? tr('Remove connector') : tr('Add connector'), onSelect: () => api.toggleConnector(stepKey) },
      connLinked && { label: tr('Reconnect to the previous bar'), onSelect: () => api.setLink(connTo, null) },
      '-', format(tr('Format connector…')),
    ],
  }

  // ── Format-bar controls: [id, icon, value, name, menu] ──
  const levelName = k => api.levelOptions.find(o => o.value === k)?.label ?? k
  const shownCount = api.levers.filter(l => !hidden.has(l.key)).length
  const showSummary = [p.labels && !p.table && tr('values'), p.table && tr('table'), p.valueLine != null && tr('value line'), p.connectors && tr('connectors'), api.canWhisker && p.whiskers && tr('high scenario')].filter(Boolean).join(', ') || tr('nothing')
  const tableSeg = <Line label={tr('Table')}><Seg label={tr('Data table under the axis')} value={p.table ?? null} onPick={v => api.setPref('table', v)} items={[[null, tr('Off')], ['values', tr('Values')], ['running', tr('Values + running total')]]} /></Line>
  const controls = {
    bridge: [
      ['show', null, tr('Show: {list}', { list: showSummary }), tr('What the bridge shows'), (
        <Line label="">
          <div className="chart-pop__stack">
            <Check on={!!p.labels} onClick={() => api.toggle('labels')}>{tr('Value labels')}</Check>
            <Check on={!!p.connectors} onClick={() => api.toggle('connectors')}>{tr('Connector lines')}</Check>
            {api.canWhisker && <Check on={!!p.whiskers} onClick={() => api.toggle('whiskers')}>{tr('High scenario')}</Check>}
          </div>
        </Line>
      )],
      ['table', null, `${tr('Table: {state}', { state: { values: tr('values'), running: tr('values + running total') }[p.table] ?? tr('off') })}${p.valueLine != null ? ` · ${tr('value line')}` : ''}`, tr('Data table and value line'), (
        <>
          {tableSeg}
          <Line label=""><Check on={p.valueLine != null} onClick={() => api.setPref('valueLine', p.valueLine != null ? null : true)}>{tr('Value line (drag to move)')}</Check></Line>
          <div className="chart-pop__note">{tr('Drag a connector onto an earlier bar to start a bar from that level.')}</div>
        </>
      )],
      api.canDiff && ['diff', null, p.diff ? tr('Difference: {from} → {to}', { from: levelName(api.diffFrom), to: levelName(api.diffTo) }) : tr('Difference: off'), tr('Difference arrow between two levels'), (
        <>
          <Line label=""><Check on={!!p.diff} onClick={() => api.toggle('diff')}>{tr('Difference arrow')}</Check></Line>
          {p.diff && <>
            <Line label={tr('From')}><Seg label={tr('From')} value={api.diffFrom} onPick={v => api.setPref('diffFrom', v)} items={api.levelOptions.map(o => [o.value, o.label])} /></Line>
            <Line label={tr('To')}><Seg label={tr('To')} value={api.diffTo} onPick={v => api.setPref('diffTo', v)} items={api.levelOptions.filter(o => o.value !== api.diffFrom).map(o => [o.value, o.label])} /></Line>
          </>}
          <div className="chart-pop__note">{tr('Or right-click a level bar: “Difference arrow from / to here”.')}</div>
        </>
      )],
      ['dir', null, `${tr('Direction: {dir}', { dir: p.direction === 'down' ? tr('down') : tr('up') })}${p.backCalc ? ` · ${tr('start computed')}` : ''}`, tr('Direction and start of the bridge'), (
        <>
          <Line label={tr('Direction')}><Seg label={tr('Bridge direction')} value={p.direction === 'down' ? 'down' : 'up'} onPick={v => api.setPref('direction', v === 'down' ? 'down' : null)} items={[['up', tr('Up (build)')], ['down', tr('Down (break down)')]]} /></Line>
          <Line label=""><Check on={!!p.backCalc} onClick={() => api.toggle('backCalc')} title={tr('The first column is computed back from the last one')}>{tr('Compute the start from the end')}</Check></Line>
          {api.hasParts && <Line label={tr('Segments')}><Seg label={tr('Segment order in a step')} value={p.partOrder ?? null} onPick={v => api.setPref('partOrder', v)} items={[[null, tr('Sheet')], ['posFirst', tr('Positives first')], ['negFirst', tr('Negatives first')]]} /></Line>}
          {api.canDiff && p.diff && <Line label={tr('Diff %')}><Seg label={tr('Difference percentage of')} value={p.diffBase ?? null} onPick={v => api.setPref('diffBase', v)} items={[[null, tr('Its start')], ['start', tr('First column (100%)')], ...(p.labelContent && p.pctBase ? [['pctBase', tr('Label 100%')]] : []), ...api.levelOptions.slice(1).map(o => [o.value, `${o.label} (100%)`])]} /></Line>}
        </>
      )],
      api.levers.length > 0 && ['levers', null, tr('Levers: {shown}/{total} shown', { shown: shownCount, total: api.levers.length }), tr('Levers shown and subtotals'), (
        <table className="chart-pop__table">
          <thead><tr><th />{api.levers.some(l => l.hideable) && <th title={tr('Unticked levers are grouped into “Other levers”; the total does not move')}>{tr('Shown')}</th>}<th>{tr('Subtotal after')}</th></tr></thead>
          <tbody>
            {api.levers.map(l => (
              <tr key={l.key}>
                <td>{l.label}</td>
                {api.levers.some(x => x.hideable) && <td>{l.hideable && <Check on={!hidden.has(l.key)} onClick={() => api.toggleHidden(l.key)} title={tr('Show {name} separately', { name: l.label })} />}</td>}
                <td><Check on={subtotals.has(l.key)} onClick={() => api.toggleSubtotal(l.key)} title={tr('Subtotal after {name}', { name: l.label })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )],
      api.tones.length > 0 && ['colors', <>{api.tones.slice(0, 3).map(([t]) => <span key={t}>{dot(p.toneColors?.[t] ?? null)}</span>)}</>, tr('Colors'), tr('Color of each family'), (
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
      ['fill', dot(p.stepColors?.[step.key] ?? p.toneColors?.[step.tone] ?? pick.color), tr('Fill: {what}', { what: scope === 'bar' ? tr('this bar') : TONE_NAMES[step.tone]?.toLowerCase() ?? tr('family') }), tr('Fill color'), (
        <>
          <Line label={tr('Apply to')}><Seg label={tr('Fill scope')} value={scope} onPick={setScope} items={[['bar', tr('{name} only', { name: step.label })], ['tone', tr('All “{name}”', { name: TONE_NAMES[step.tone] ?? step.tone })]]} /></Line>
          <Swatches palette={api.palette} value={scope === 'bar' ? p.stepColors?.[step.key] : p.toneColors?.[step.tone]}
            onPick={c => (scope === 'bar' ? api.setStepColor(step.key, c) : api.setToneColor(step.tone, c))} />
        </>
      )],
      step.kind === 'delta' && step.key !== lastDelta && ['subtotal', null, tr('Subtotal after: {state}', { state: subtotals.has(step.key) ? tr('on') : tr('off') }), tr('Subtotal after this lever'), (
        <Line label=""><Check on={subtotals.has(step.key)} onClick={() => api.toggleSubtotal(step.key)}>{tr('Subtotal after {name}', { name: step.label })}</Check></Line>
      )],
      lever?.hideable && ['shown', null, hidden.has(step.key) ? tr('In “Other levers”') : tr('Shown separately'), tr('Show this lever or group it'), (
        <Line label=""><Check on={!hidden.has(step.key)} onClick={() => api.toggleHidden(step.key)} title={tr('Unticked: grouped into “Other levers”; the total does not move')}>{tr('Show separately')}</Check></Line>
      )],
      steps.indexOf(step) < steps.length - 1 && ['connector', null, tr('Connector after: {state}', { state: (p.connectorsOff ?? []).includes(step.key) ? tr('off') : tr('on') }), tr('Connector line after this bar'), (
        <>
          <Line label=""><Check on={!(p.connectorsOff ?? []).includes(step.key)} onClick={() => api.toggleConnector(step.key)}>{tr('Connector after this bar')}</Check></Line>
          {(p.links ?? {})[step.key] && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.setLink(step.key, null)}>{tr('Reconnect to the previous bar')}</button></Line>}
          {step.kind === 'delta' && <Line label=""><Check on={(p.toBaseline ?? []).includes(step.key)} onClick={() => api.toggleBaseline(step.key)} title={tr('Drawn from zero; the running total still adds it')}>{tr('Draw from the baseline')}</Check></Line>}
          {step.kind === 'delta' && <Line label=""><Check on={(p.toBaselineTop ?? []).includes(step.key)} onClick={() => api.toggleBaselineTop(step.key)} title={tr('The top of the bar sits on the baseline; the running total still adds it')}>{tr('Hang from the baseline')}</Check></Line>}
        </>
      )],
      isLevel && api.canDiff && ['diff', null, p.diff && (api.diffFrom === step.key || api.diffTo === step.key) ? tr('Difference: {end}', { end: api.diffFrom === step.key ? tr('from here') : tr('to here') }) : tr('Difference: off'), tr('Difference arrow'), (
        <Line label={tr('Arrow')}><Seg label={tr('Difference arrow')} value={p.diff ? (api.diffFrom === step.key ? 'from' : api.diffTo === step.key ? 'to' : null) : null}
          onPick={v => (v ? api.setDiffEnd(v, step.key) : api.setPref('diff', false))} items={[[null, tr('Off')], ['from', tr('From here')], ['to', tr('To here')]]} /></Line>
      )],
    ] : [],
    values: [
      ['textstyle', null, styleSummary(p), tr('Label color, font and size'), <TextStyle font={p.labelFont} pt={p.labelPt} color={p.labelColor} onFont={v => api.setPref('labelFont', v)} onPt={v => api.setPref('labelPt', v)} onColor={v => api.setPref('labelColor', v)} />],
      ['show', null, tr('Values: {state}', { state: p.table ? tr('in table') : p.labels ? tr('on') : tr('off') }), tr('Value labels'), (
        <>
          <Line label=""><Check on={!!p.labels} onClick={() => api.toggle('labels')}>{tr('Value labels')}</Check></Line>
          {tableSeg}
        </>
      )],
      p.labels && ['content', null, tr('Content: {what}', { what: { pct: tr('% of base'), both: tr('value + %') }[p.labelContent] ?? tr('value') }), tr('Label content'), (
        <>
          <Line label={tr('Content')}><Seg label={tr('Label content')} value={p.labelContent ?? null} onPick={v => api.setPref('labelContent', v)}
            items={[[null, tr('Value')], ['pct', tr('% of base')], ['both', tr('Value + %')]]} /></Line>
          {p.labelContent && <Line label={tr('100% is')}><Seg label={tr('Percent base')} value={p.pctBase ?? null} onPick={v => api.setPref('pctBase', v)} items={[[null, tr('First column')], ...api.levelOptions.slice(1).map(o => [o.value, o.label])]} /></Line>}
        </>
      )],
    ],
    axis: [
      ['scale', IconRuler2, manual ? tr('Scale: {min} – {max}', { min: Number.isFinite(ya.min) ? ya.min : tr('auto'), max: Number.isFinite(ya.max) ? ya.max : tr('auto') }) : tr('Scale: auto'), tr('Scale'), (
        <>
          <Line label={tr('Range')}>
            <Field label={tr('Min')} numeric value={ya.min ?? ''} placeholder={tr('Auto')} onCommit={v => api.setAxis('min', v)} />
            <Field label={tr('Max')} numeric value={ya.max ?? ''} placeholder={tr('Auto')} onCommit={v => api.setAxis('max', v)} />
            <Field label={tr('Step')} numeric value={ya.step ?? ''} placeholder={tr('Auto')} onCommit={v => api.setAxis('step', v != null && v > 0 ? v : null)} />
          </Line>
          {manual && <Line label=""><button type="button" className="chart-pop__link" onClick={() => api.autoScale()}>{tr('Reset to automatic scale')}</button></Line>}
        </>
      )],
      ['show', IconEye, tr('Tick labels: {ticks} · gridlines: {grid}', { ticks: tickOn ? tr('on') : tr('off'), grid: gridOn ? tr('on') : tr('off') }), tr('Tick labels and gridlines'), (
        <Line label="">
          <Check on={tickOn} onClick={() => api.setAxis('labels', !tickOn)}>{tr('Tick labels')}</Check>
          <Check on={gridOn} onClick={() => api.setAxis('grid', gridOn ? 'none' : 'solid')}>{tr('Gridlines')}</Check>
        </Line>
      )],
      ['numbers', null, tr('Format: {value}', { value: axisPrev }), tr('Number format of the axis'), (
        <NumberFormatFields preview={axisPrev} decimals={p.axisDec ?? null} magnitude={p.axisMag ?? null} num={p.axisNum ?? {}} sep={separatorOf(p.axisNum)}
          setDec={v => api.setPref('axisDec', v)} setMag={v => api.setPref('axisMag', v)} setNum={api.setAxisNum} showMagnitude money />
      )],
    ],
    connector: [
      ['conn', null, tr('Connector: {state}', { state: connOn ? tr('on') : tr('off') }), tr('Connector line'), (
        <Line label=""><Check on={connOn} onClick={() => api.toggleConnector(stepKey)}>{tr('Connector after {name}', { name: step?.label ?? tr('this bar') })}</Check></Line>
      )],
      connTo && earlier.length > 0 && ['from', null, tr('Starts from: {bar}', { bar: connLinked ? steps.find(s => s.key === connLinked)?.label ?? connLinked : tr('previous bar') }), tr('Bar the next column starts from'), (
        <>
          <Line label={tr('From')}><Seg label={tr('Starts from')} value={connLinked || null} onPick={v => api.setLink(connTo, v)} items={[[null, tr('Previous bar')], ...earlier.map(s => [s.key, s.label])]} /></Line>
          <div className="chart-pop__note">{tr('Or drag the connector onto an earlier bar.')}</div>
        </>
      )],
    ],
  }

  const NAMES = { step: step?.label ?? tr('Bar'), values: tr('Values'), axis: tr('Value axis'), connector: tr('Connector'), bridge: tr('Bridge') }
  const objName = NAMES[obj] ?? tr('Bridge')
  const objIcon = { step: IconChartBar, values: IconTag, axis: IconArrowsVertical, connector: IconLink }[obj] ?? IconLayoutColumns
  const objectCtl = ['object', objIcon, objName, tr('Object being formatted (click to switch)'), (
    <div className="chart-pop__objects" role="menu">
      {[['bridge', tr('Bridge')], ['values', tr('Values')], ['axis', tr('Value axis')], ...(connTo ? [['connector', tr('Connector')]] : []), ...steps.map(s => [`step:${s.key}`, s.label])].map(([v, l]) => {
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
  const addItems = (menus[obj] ?? []).filter(it => it && it !== '-' && !it.format && !it.reset)
  const fullList = [objectCtl, ...(controls[obj] ?? []).filter(Boolean), ...(addItems.length ? [['more', IconPlus, '', tr('Add or remove an element (also on right-click)'), <ActionMenu items={addItems} onClose={() => setOpenCtl(null)} />]] : [])]
  // Width is measured: values only, then controls folded behind "⋯" (never a cut word).
  const level = useCompactLevel(ref, String(obj))
  const list = compactList(fullList, level, { head: 1, tail: addItems.length ? 1 : 0, display: (t, v) => v, pin: openCtl, tr })

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
    <div className="chart-bar" role="toolbar" aria-label={tr('Format: {name}', { name: objName })} onKeyDown={onBarKey}>
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
        <button type="button" className="chart-bar__text" onClick={() => { api.setSheetOpen(true); onClose() }} title={tr('Open the data sheet (or double-click the bridge)')}>{tr('Data')}</button>
        <span className="chart-wheel__sep" aria-hidden="true" />
        {undo
          ? <button type="button" className="chart-bar__undo" onClick={restore}>{tr('Undo reset')}</button>
          : <button type="button" className="chart-bar__text" onClick={resetAll} title={tr('Remove every format change on this bridge (you can undo)')}>{tr('Reset')}</button>}
      </>}
      <button type="button" className="chart-bar__icon" onClick={onClose} aria-label={tr('Close')} title={tr('Close (Esc)')}><IconX size={13} /></button>
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
        title={tr('Bridge format: colours, labels, subtotals and sort. Tip: click or right-click any part of the bridge')} aria-label={tr('Bridge format')} aria-expanded={!!anchor}>
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
