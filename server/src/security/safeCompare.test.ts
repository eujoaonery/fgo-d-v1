import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeEqualString } from './safeCompare.js'

describe('safeEqualString', () => {
  it('matches equal strings', () => {
    assert.equal(safeEqualString('abc', 'abc'), true)
  })
  it('rejects different lengths', () => {
    assert.equal(safeEqualString('abc', 'abcd'), false)
  })
  it('rejects undefined', () => {
    assert.equal(safeEqualString(undefined, 'x'), false)
  })
})
