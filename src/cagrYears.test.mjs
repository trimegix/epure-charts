// CAGR arrows on category axes whose keys are short years ('22', 'FY24') or name no year.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, yearOfKey } from './scene.js'

const scene = (keys, ann) => buildScene(
  { id: 'r', version: 1, kind: 'cartesian', x: { grain: 'category' }, series: [{ id: 'v', ref: { metric: 'v', source: 'd' }, labels: 'all' }], annotations: [ann] },
  [{ label: 'v', points: keys.map((x, i) => ({ x, y: [6751, 7284, 8202, 8617][i] })) }],
  { width: 200, height: 170 })
const cagrs = sc => sc.annotations.filter(a => a.type === 'cagr')

test('yearOfKey: four digits, two digits, FY, apostrophe, A/E/B letters; nothing else', () => {
  assert.equal(yearOfKey('2018'), 2018)
  assert.equal(yearOfKey('Exit 2026'), 2026)
  assert.equal(yearOfKey('22'), 2022)
  assert.equal(yearOfKey('FY24'), 2024)
  assert.equal(yearOfKey("'23"), 2023)
  assert.equal(yearOfKey('24E'), 2024)
  assert.equal(yearOfKey('99'), 1999)
  assert.ok(Number.isNaN(yearOfKey('Q3')))
  assert.ok(Number.isNaN(yearOfKey('Paris')))
  assert.ok(Number.isNaN(yearOfKey('123')))
})

test('CAGR arrow between two-digit years: drawn, on three years', () => {
  const [a] = cagrs(scene(['22', '23', '24', '25'], { type: 'cagr', from: { key: '22' }, to: { key: '25' } }))
  assert.ok(a, 'the arrow is drawn')
  const four = cagrs(scene(['2022', '2023', '2024', '2025'], { type: 'cagr', from: { key: '2022' }, to: { key: '2025' } }))[0]
  assert.equal(a.text ?? a.label, four.text ?? four.label)
})

test('CAGR arrow between columns that name no year: one period per column', () => {
  const [a] = cagrs(scene(['H1', 'H2', 'H3', 'H4'], { type: 'cagr', from: { key: 'H1' }, to: { key: 'H4' } }))
  const [b] = cagrs(scene(['2022', '2023', '2024', '2025'], { type: 'cagr', from: { key: '2022' }, to: { key: '2025' } }))
  assert.ok(a)
  assert.equal(a.text ?? a.label, b.text ?? b.label)
})
