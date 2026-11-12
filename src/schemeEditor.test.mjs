// Scheme editor: an applied preview does not reset the draft (draftFollows).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftFollows, PREVIEW_SCHEME, schemeMap } from './customStyle.js'

const H = s => ['#', s].join('')

test('series following the draft (repeated, case-insensitive): the draft is kept', () => {
  const draft = [H('aa0000'), H('00BB00'), H('0000cc'), H('111111')]
  // Three series: the first three colors.
  assert.equal(draftFollows([H('AA0000'), H('00bb00'), H('0000cc')], draft), true)
  // Five series: the draft repeats, as schemeMap applies it.
  const keys = ['a', 'b', 'c', 'd', 'e']
  assert.equal(draftFollows(Object.values(schemeMap(keys, draft)), draft), true)
})

test('another scheme applied elsewhere: the draft restarts from the current colors', () => {
  assert.equal(draftFollows([H('aa0000'), H('222222')], [H('aa0000'), H('00bb00')]), false)
  assert.equal(draftFollows([], [H('aa0000')]), false)
  assert.equal(draftFollows([H('aa0000')], []), false)
  assert.equal(typeof PREVIEW_SCHEME, 'string')
})
