// Smaller rendering defaults: number format, barh gridlines, accessible description, legend,
// single accent (distinct grays, a category put forward).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScene, defaultFormat } from './scene.js'
import { buildBarhScene } from './barhScene.js'
import { describe } from './figureMeta.js'

const res = (label, ys, keys = ['2023', '2024', '2025']) => ({ label, unit: 'M', points: keys.map((x, i) => ({ x, y: ys[i], type: 'actual' })) })
const S = (id, extra = {}) => ({ id, mark: 'bar', ...extra })
const chart = (series, extra = {}) => ({ id: 'r', x: { grain: 'year' }, series, ...extra })

test('without format: the number alone, with the locale\'s thousands separator', () => {
  assert.equal(defaultFormat(8617, 'M'), '8,617')
  assert.equal(defaultFormat(12.5, 'M'), '12.5')
  assert.equal(defaultFormat(0.125, 'pct'), '13%')
  const fr = buildScene(chart([S('a', { labels: 'all' })], { locale: 'fr' }), [res('A', [8617, 9100, 12.5])], { width: 600, height: 300 })
  assert.ok(fr.labels.some(l => l.text === '8 617'), fr.labels.map(l => l.text).join('|'))
  assert.ok(!fr.labels.some(l => /€|M\b/.test(l.text)), 'no unit by default')
})

test('horizontal bars: axis: false removes the gridlines too (unless grid asks for them)', () => {
  const rows = [{ key: 'a', label: 'A', values: { v: 5 } }, { key: 'b', label: 'B', values: { v: 12 } }]
  const s = { series: [{ id: 'v', label: 'V' }] }
  assert.ok(buildBarhScene(s, rows, { width: 600 }).gridlines.length > 1)
  const bare = buildBarhScene({ ...s, axis: false }, rows, { width: 600 })
  assert.equal(bare.axis, null)
  assert.deepEqual(bare.gridlines, [])
  assert.ok(buildBarhScene({ ...s, axis: false, grid: 'dash' }, rows, { width: 600 }).gridlines.length > 1)
  const twoWays = buildBarhScene({ ...s, axis: false }, [{ key: 'a', label: 'A', values: { v: -4 } }, rows[1]], { width: 600 })
  assert.deepEqual(twoWays.gridlines.map(g => g.zero), [true], 'bars both ways: the zero line only')
})

test('accessible description in the chart\'s language', () => {
  assert.equal(describe({ source: 'INSEE', locale: 'fr' }), 'Source : INSEE')
  assert.equal(describe({ source: 'INSEE' }), 'Source: INSEE')
})

test('a single series: no legend by default; format.legend brings it back', () => {
  const one = buildScene(chart([S('a')]), [res('A', [1, 2, 3])], { width: 600, height: 300 })
  assert.deepEqual(one.legend, [])
  assert.equal(buildScene(chart([S('a')], { format: { legend: 'top' } }), [res('A', [1, 2, 3])], { width: 600, height: 300 }).legend.length, 1)
  assert.equal(buildScene(chart([S('a'), S('b')]), [res('A', [1, 2, 3]), res('B', [1, 2, 3])], { width: 600, height: 300 }).legend.length, 2)
})

test('single accent: de-emphasized series keep their own grays', () => {
  const sc = buildScene(chart([S('a'), S('b', { style: { color: 'gray-500' } }), S('c', { style: { color: 'gray-300' } }), S('d', { style: { color: 'blue' } })],
    { accent: 'single', emphasis: ['a'] }), ['A', 'B', 'C', 'D'].map(n => res(n, [1, 2, 3])), { width: 600, height: 300 })
  const col = id => sc.bars.find(b => b.seriesId === id).color
  assert.deepEqual(['a', 'b', 'c', 'd'].map(col), ['chart-accent', 'gray-500', 'gray-300', 'chart-neutral'])
})

test('single accent: emphasis on a category puts that column forward', () => {
  const sc = buildScene(chart([S('a')], { accent: 'single', emphasis: ['2024'] }), [res('A', [1, 2, 3])], { width: 600, height: 300 })
  assert.deepEqual(sc.bars.map(b => [b.key, b.color]), [['2023', 'chart-neutral'], ['2024', 'chart-accent'], ['2025', 'chart-neutral']])
})
