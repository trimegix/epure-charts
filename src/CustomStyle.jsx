// ─── epure-charts · the free-style controls ─────────────────────────────────
// Slotted into the existing menus, never a separate surface:
//   <CustomColor>  under each row of swatches: native picker (hue, saturation,
//                  RGB), hex field, recent custom colors;
//   <FontPick>     the font family of a text (system stacks + bundled fonts);
//   <PtField>      a free size in points, next to the XS–XL steps;
//   <SchemeTools>  named schemes: save, apply, export / import (local JSON).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconPlus, IconMinus } from '@tabler/icons-react'
import {
  isHex, tok, pushRecent, recentColors, subscribeStyle, PT_MIN, PT_MAX, isPt, parsePt, parseColorInput,
  customSchemes, saveScheme, deleteScheme, exportStyleFile, importStyleFile, resolveColors, styleFileName, draftFollows, PREVIEW_SCHEME, fontOptions,
} from './customStyle.js'
import { useT } from './uiLocale.js'

// Starting point of the native picker when the current color is a token (mid gray).
const NEUTRAL_PICK = ['#', '808080'].join('')
const useRecent = () => useSyncExternalStore(subscribeStyle, recentColors, recentColors)
const useCustomSchemes = () => useSyncExternalStore(subscribeStyle, customSchemes, customSchemes)

// The computed value of a theme token, read on a probe element (nested var() are resolved).
function readToken(t) {
  if (typeof document === 'undefined') return null
  const probe = document.createElement('span')
  probe.style.color = tok(t) // semantic tokens keep their palette fallback
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const v = getComputedStyle(probe).color
  probe.remove()
  return v
}

// The last import message: it survives the menu closing (the file picker may close it).
let lastNotice = null

/** A free color: native picker + hex + recent colors. `value` = token or hex. */
export function CustomColor({ value, onPick }) {
  const tr = useT()
  const recent = useRecent()
  const hex = isHex(value) ? value : ''
  const [draft, setDraft] = useState(null)
  const [err, setErr] = useState(null)
  const picker = useRef(null)
  // Unreadable input applies nothing and says so; empty = keep the current color.
  const commit = raw => {
    const r = parseColorInput(raw)
    if (r.error) return setErr(tr(r.error))
    setErr(null)
    if (r.hex) { pushRecent(r.hex); onPick(r.hex) }
  }
  // The native "change" event (picker closed): the chosen color enters the recent colors.
  useEffect(() => {
    const el = picker.current
    const keep = () => pushRecent(el.value)
    el?.addEventListener('change', keep)
    return () => el?.removeEventListener('change', keep)
  }, [])
  return (
    <div className="chart-pop__custom">
      {/* The native picker applies live; the color enters the recent colors on release. */}
      <input ref={picker} type="color" className="chart-pop__color" aria-label={tr('Custom color')} title={tr('Custom color (hue, saturation, RGB)')}
        value={hex || NEUTRAL_PICK} onChange={e => onPick(e.target.value)} />
      <input type="text" className={`chart-opts-input chart-pop__hex${err ? ' is-invalid' : ''}`} aria-label={tr('Hex color')} placeholder={tr('#hex or r,g,b')} spellCheck={false}
        aria-invalid={err ? true : undefined} title={err ?? undefined}
        value={draft ?? hex} onFocus={() => setDraft(hex)}
        onChange={e => { setDraft(e.target.value); if (err) setErr(null) }}
        onBlur={() => { if (draft != null && draft !== hex) commit(draft); setDraft(null) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
      {recent.map(c => (
        <button key={c} type="button" className={`chart-editor-swatch${value === c ? ' is-on' : ''}`} style={{ background: c }}
          aria-label={tr('Recent color {color}', { color: c })} aria-pressed={value === c} title={c} onClick={() => commit(c)} />
      ))}
      {err && <div className="chart-pop__error" role="alert">{err}</div>}
    </div>
  )
}

/** The font family of a text: null = the engine's figure font. */
export function FontPick({ value, onPick, label, defaultLabel = null }) {
  const tr = useT()
  return (
    <select className="chart-opts-input chart-pop__font" aria-label={label ?? tr('Font')} value={value ?? ''} onChange={e => onPick(e.target.value || null)}>
      {fontOptions(defaultLabel).map(([k, l]) => <option key={k ?? ''} value={k ?? ''}>{tr(l)}</option>)}
    </select>
  )
}

/** A free size in points (4–72); empty = the step chosen next to it. */
// The last message of a pt field (per label): it survives the remount of the mini toolbar
// caused by the chart's re-render ("Limited to 72 pt" stays readable for a few seconds).
const ptNotes = new Map()
export function PtField({ value, onPick, label: labelIn }) {
  const tr = useT()
  const label = labelIn ?? tr('Size in points')
  const [draft, setDraft] = useState(null)
  // { error }: nothing applied; { note }: value clamped, and said so.
  const [msg, setMsg0] = useState(() => { const n = ptNotes.get(label); return n && Date.now() - n.at < 8000 ? n.msg : null })
  const setMsg = m => { if (m) ptNotes.set(label, { msg: m, at: Date.now() }); else ptNotes.delete(label); setMsg0(m) }
  const shown = isPt(value) ? String(value) : ''
  const commit = raw => {
    if (raw === shown) return
    const r = parsePt(raw)
    if (r.error) return setMsg({ error: tr('Expected a number, {min} to {max}', { min: PT_MIN, max: PT_MAX }) })
    setMsg(r.note ? { note: tr('Limited to {n} pt', { n: r.value }) } : null)
    onPick(r.empty ? null : r.value)
  }
  return (
    <label className="chart-pop__pt" title={tr('Free size, {min} to {max} pt', { min: PT_MIN, max: PT_MAX })}>
      <input type="text" inputMode="decimal" className={`chart-opts-input${msg?.error ? ' is-invalid' : ''}`} aria-label={label} placeholder="pt" value={draft ?? shown}
        aria-invalid={msg?.error ? true : undefined}
        onFocus={() => setDraft(shown)} onChange={e => { setDraft(e.target.value); if (msg) setMsg(null) }}
        onBlur={() => { if (draft != null) commit(draft); setDraft(null) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
      <span>pt</span>
      {msg && <span className={msg.error ? 'chart-pop__error' : 'chart-pop__note'} role={msg.error ? 'alert' : 'status'}>{msg.error ?? msg.note}</span>}
    </label>
  )
}

/**
 * The user's named schemes, under the engine's schemes.
 * current = the current series colors; active = name of the applied scheme; onApply(scheme | null).
 */
export function SchemeTools({ current, active, onApply }) {
  const tr = useT()
  const schemes = useCustomSchemes()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(() => (lastNotice && Date.now() - lastNotice.at < 60000 ? lastNotice.msg : null))
  const fileRef = useRef(null)
  // The scheme editor: the current colors, resolved to hex (portable), editable one by one.
  const currentKey = (current ?? []).join('|')
  const [draft, setDraft] = useState(() => resolveColors(current, readToken))
  const [sel, setSel] = useState(0)
  // The current colors change (scheme applied elsewhere): the editor restarts from them (adjusted to
  // the render), unless it is the draft's own preview (the series already follow the draft).
  const [seenKey, setSeenKey] = useState(currentKey)
  if (seenKey !== currentKey) {
    setSeenKey(currentKey)
    const now = resolveColors(current, readToken)
    if (!draftFollows(now, draft)) { setDraft(now); setSel(0) }
  }
  // { text, error }: the message shown under the tools.
  const note = m => { lastNotice = m ? { msg: m, at: Date.now() } : null; setMsg(m) }
  // Live preview: each edit of the draft applies to the chart (a "custom" scheme, not
  // saved); "Save colors" names it, saves it and keeps it applied.
  const edit = next => { setDraft(next); if (next.length) onApply({ name: PREVIEW_SCHEME, colors: next }) }
  const save = () => {
    const n = name.trim()
    if (!n || !draft.length) return
    onApply({ name: n, colors: draft })
    saveScheme(n, draft)
    setName(''); note(null)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportStyleFile()], { type: 'application/json' }))
    const a = document.createElement('a')
    // The file carries the name of the applied scheme (or of the only scheme): "Fund-A.chart-style.json".
    const own = schemes.find(s => s.name === active)?.name ?? (schemes.length === 1 ? schemes[0].name : 'chart')
    a.href = url; a.download = styleFileName(own); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const load = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { const n = importStyleFile(await f.text()).length; note({ text: n > 1 ? tr('{n} schemes available', { n }) : tr('{n} scheme available', { n }) }) } catch (err) { note({ text: tr(err.message), error: true }) }
  }
  const setAt = (i, c) => edit(draft.map((x, j) => (j === i ? c : x)))
  const remove = () => { edit(draft.filter((_, j) => j !== sel)); setSel(i => Math.max(0, i - 1)) }
  const add = () => { edit([...draft, draft[draft.length - 1] ?? NEUTRAL_PICK]); setSel(draft.length) }
  // Arrow keys stay in the editor (the mini toolbar does not take them to move between controls).
  const keepArrows = e => { if (e.key.startsWith('Arrow')) e.stopPropagation() }
  return (
    <>
      {schemes.map(s => (
        <div key={s.name} className="chart-pop__scheme-row">
          <button type="button" role="radio" aria-checked={active === s.name}
            className={`chart-wheel__scheme${active === s.name ? ' is-on' : ''}`} onClick={() => onApply(s)}>
            <span className="chart-wheel__scheme-dots">{s.colors.slice(0, 4).map((c, i) => <span key={i} style={{ background: tok(c) }} />)}</span>
            {s.name}
          </button>
          <button type="button" className="chart-pop__more" aria-label={tr('Delete scheme {name}', { name: s.name })} title={tr('Delete this scheme')}
            onClick={() => { deleteScheme(s.name); if (active === s.name) onApply(null) }}>×</button>
        </div>
      ))}
      <div className="chart-pop__swatches chart-pop__scheme-edit" role="group" aria-label={tr('Colors of the new scheme')} onKeyDown={keepArrows}>
        {draft.map((c, i) => (
          <button key={i} type="button" className={`chart-editor-swatch${sel === i ? ' is-on' : ''}`} style={{ background: tok(c) }}
            aria-label={tr('Scheme color {n}: {color}', { n: i + 1, color: c })} aria-pressed={sel === i} title={c} onClick={() => setSel(i)} />
        ))}
        <button type="button" className="chart-bar__ctl" onClick={add} disabled={draft.length >= 24} title={tr('Add a color to the scheme')}><IconPlus size={13} aria-hidden="true" />{tr('Add')}</button>
        <button type="button" className="chart-bar__ctl" onClick={remove} disabled={draft.length <= 1} aria-label={tr('Remove the selected color')} title={tr('Remove the selected color')}><IconMinus size={13} aria-hidden="true" />{tr('Remove')}</button>
        {draft[sel] != null && <CustomColor value={draft[sel]} onPick={c => setAt(sel, c)} />}
      </div>
      <div className="chart-pop__custom">
        <input type="text" className="chart-opts-input" aria-label={tr('New scheme name')} placeholder={tr('Name')} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
        <button type="button" className="chart-pop__more" disabled={!name.trim() || !draft.length} onClick={save} title={tr('Save these colors (as hex) as a named scheme')}>{tr('Save colors')}</button>
        <button type="button" className="chart-pop__more" disabled={!schemes.length} onClick={download} title={tr('Download the schemes as a style file (JSON)')}>{tr('Export')}</button>
        <button type="button" className="chart-pop__more" onClick={() => fileRef.current?.click()} title={tr('Load schemes from a style file (JSON)')}>{tr('Import')}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={load} />
      </div>
      {msg && <div className={msg.error ? 'chart-pop__error' : 'chart-pop__note'} role="status">{msg.text}</div>}
    </>
  )
}

/** The "Style" control of a chart's labels: free color, font and free size (the same building blocks as ChartWheel). */
export function TextStyle({ font, pt, onFont, onPt, color, onColor, defaultFont = null }) {
  const tr = useT()
  return (
    <>
      {onColor && <div className="chart-pop__row"><span className="chart-pop__label">{tr('Color')}</span><div className="chart-pop__tools">
        <button type="button" className="chart-pop__more" aria-pressed={!isHex(color)} onClick={() => onColor(null)} title={tr('The default label colors')}>{tr('Auto')}</button>
        <CustomColor value={color} onPick={onColor} />
      </div></div>}
      <div className="chart-pop__row"><span className="chart-pop__label">{tr('Font')}</span><div className="chart-pop__tools"><FontPick label={tr('Label font')} value={font} onPick={onFont} defaultLabel={defaultFont} /></div></div>
      <div className="chart-pop__row"><span className="chart-pop__label">{tr('Size')}</span><div className="chart-pop__tools"><PtField label={tr('Label size in points')} value={pt} onPick={onPt} /></div></div>
    </>
  )
}
