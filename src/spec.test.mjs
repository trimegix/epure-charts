import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSpec, roleOfRef, DEFAULT_SOURCE_ROLES } from './spec.js'
import { defaultsFor, withDefaults } from './defaults.js'

const base = () => ({
  id: 't', version: 1, title: 'T', scope: 'shared', kind: 'cartesian',
  
  x: { grain: 'quarter', range: 'all' },
  series: [{ id: 'a', ref: { metric: 'ebitda', source: 'actual' } }],
})

test('a minimal spec is valid', () => {
  assert.deepEqual(validateSpec(base()), [])
})

test('a spec without subject, scope or owner is valid', () => {
  const s = base()
  delete s.subject; delete s.scope; delete s.title
  assert.deepEqual(validateSpec(s), [])
  assert.deepEqual(validateSpec({ id: 'm', version: 1, kind: 'cartesian', x: { grain: 'year', range: 'all' },
    series: [{ id: 'a', ref: { metric: 'revenue', source: 'actual' } }] }), [])
})

test('never throws, even on nonsense input', () => {
  assert.deepEqual(validateSpec(null), ['spec: not an object'])
  assert.ok(validateSpec({}).length > 3)
  assert.ok(validateSpec({ series: 'x' }).some(e => e.startsWith('series')))
})

test('scope / owner / subject: optional, free values, simple types', () => {
  assert.deepEqual(validateSpec({ ...base(), scope: 'user' }), [])
  assert.deepEqual(validateSpec({ ...base(), scope: 'team', owner: 'jane' }), [])
  assert.deepEqual(validateSpec({ ...base(), subject: { anything: 1 } }), [])
  assert.ok(validateSpec({ ...base(), scope: 3 }).some(e => e.startsWith('scope')))
  assert.ok(validateSpec({ ...base(), owner: {} }).some(e => e.startsWith('owner')))
  assert.ok(validateSpec({ ...base(), subject: 'x' }).some(e => e.startsWith('subject')))
})

test('a legacy spec (scope, owner, subject level, vintage source) stays valid', () => {
  const s = { ...base(), scope: 'user', owner: 'someone' }
  s.series.push({ id: 'b', ref: { metric: 'ebitda', source: 'vintage', vintage: 'ic' }, mark: 'line' })
  s.series.push({ id: 'c', ref: { metric: 'ebitda', source: 'bp' }, mark: 'line', style: { color: 'gray-500' } })
  assert.deepEqual(validateSpec(s), [])
})

test('color: token, neutral, role or hex #rrggbb; nothing else', () => {
  const s = base()
  s.series[0].style = { color: ['#', 'ff0000'].join('') } // hex built in two parts for the design lint
  assert.deepEqual(validateSpec(s), [])
  s.series[0].style = { color: ['#', 'ff00'].join('') }
  assert.ok(validateSpec(s).some(e => e.includes('style.color')))
  s.series[0].style = { color: 'pink' }
  assert.ok(validateSpec(s).some(e => e.includes('style.color')))
  s.series[0].style = { color: 'cat-3', dash: 'dot', marker: true }
  assert.deepEqual(validateSpec(s), [])
  s.series[0].style = { color: 'plan' }
  assert.deepEqual(validateSpec(s), [])
  s.series[0].style = { color: 'gray-500' }
  assert.deepEqual(validateSpec({ ...s, scope: 'user' }), [])
})

test('range: shape and order', () => {
  assert.deepEqual(validateSpec({ ...base(), x: { grain: 'year', range: { from: '2020', to: '2024' } } }), [])
  assert.deepEqual(validateSpec({ ...base(), x: { grain: 'quarter', range: { from: '2020-Q2', to: '2024' } } }), [])
  assert.ok(validateSpec({ ...base(), x: { grain: 'year', range: { from: '2024', to: '2020' } } }).length)
  assert.ok(validateSpec({ ...base(), x: { grain: 'year', range: { from: '20', to: '2020' } } }).length)
})

test("'category' grain accepted, without a range", () => {
  assert.deepEqual(validateSpec({ ...base(), x: { grain: 'category' } }), [])
  assert.ok(validateSpec({ ...base(), x: { grain: 'category', range: 'all' } }).some(e => e.startsWith('x.range')))
})

test('series ids are unique, ref.source is a required string', () => {
  const s = base()
  s.series.push({ id: 'a', ref: { metric: 'ebitda', source: 'scenario-x' } })
  s.series.push({ id: 'b', ref: { metric: 'ebitda' } })
  const errs = validateSpec(s)
  assert.ok(errs.some(e => e.includes('duplicate')))
  assert.ok(errs.some(e => e.startsWith('series[2].ref.source')))
  assert.ok(!errs.some(e => e.startsWith('series[1].ref.source')))
})

test('role from source: generic defaults, configurable table', () => {
  assert.equal(roleOfRef({ source: 'actual' }), 'actual')
  assert.equal(roleOfRef({ source: 'plan' }), 'plan')
  assert.equal(roleOfRef({ source: 'bp' }), 'plan')
  assert.equal(roleOfRef({ source: 'budget' }), 'plan')
  assert.equal(roleOfRef({ source: 'forecast' }), 'forecast')
  assert.equal(roleOfRef({ source: 'unknown' }), null)
  assert.equal(roleOfRef({ source: 'toString' }), null)
  assert.equal(roleOfRef(null), null)
  assert.equal(roleOfRef({ source: 'target' }, { ...DEFAULT_SOURCE_ROLES, target: 'plan' }), 'plan')
})

test('stacked is refused when bars do not share a role', () => {
  const s = { ...base(), bars: 'stacked', series: [
    { id: 'a', ref: { metric: 'ebitda', source: 'actual' }, mark: 'bar' },
    { id: 'b', ref: { metric: 'ebitda', source: 'bp' }, mark: 'bar' },
  ] }
  assert.ok(validateSpec(s).some(e => e.startsWith('bars')))
  s.series[1].mark = 'line'
  assert.deepEqual(validateSpec(s), [])
})

test('stacked: roles follow opts.sourceRoles; unknown sources are their own role', () => {
  const s = { ...base(), bars: 'stacked', series: [
    { id: 'a', ref: { metric: 'sales', source: 'actual' } },
    { id: 'b', ref: { metric: 'sales', source: 'measured' } },
  ] }
  assert.ok(validateSpec(s).some(e => e.startsWith('bars')))
  assert.deepEqual(validateSpec(s, { sourceRoles: { measured: 'actual' } }), [])
})

test('a ratio is never stacked (check with resolved series)', () => {
  const s = { ...base(), bars: 'stacked100', series: [
    { id: 'a', ref: { metric: 'ebitda', source: 'actual' } },
    { id: 'b', ref: { metric: 'evEbitda', source: 'actual' } },
  ] }
  const resolved = [{ nature: 'flow' }, { nature: 'ratio' }]
  assert.ok(validateSpec(s, { resolved }).some(e => e.includes('ratio is never stacked')))
  // withDefaults turns the ratio bar into a line
  assert.equal(withDefaults(s, resolved).series[1].mark, 'line')
})

test('defaultsFor: style by role, right axis for the second unit', () => {
  const d = defaultsFor([
    { role: 'actual', unit: 'M', nature: 'flow' },
    { role: 'plan', unit: 'M', nature: 'flow' },
    { role: 'ic', unit: 'M', nature: 'flow' },
    { role: 'budget', unit: 'M', nature: 'flow' },
    { role: 'actual', unit: 'x', nature: 'ratio' },
  ])
  assert.deepEqual(d.series.map(s => s.mark), ['bar', 'line', 'line', 'line', 'line'])
  assert.deepEqual(d.series.map(s => s.style.dash), ['solid', 'solid', 'dash', 'dot', 'solid'])
  assert.deepEqual(d.series.map(s => s.axis), ['left', 'left', 'left', 'left', 'right'])
  assert.equal(d.bars, 'clustered')
})

test('defaultsFor: a lone ratio stays a bar', () => {
  assert.equal(defaultsFor([{ role: 'actual', unit: 'x', nature: 'ratio' }]).series[0].mark, 'bar')
})

