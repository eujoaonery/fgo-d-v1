import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findRainOnset } from './weather.js'

describe('findRainOnset', () => {
  it('pega a primeira hora futura com chuva', () => {
    const start = findRainOnset(
      ['2026-10-24T09:00', '2026-10-24T14:00', '2026-10-24T18:00'],
      [20, 70, 80],
      50,
      '2026-10-24T10:00',
    )
    assert.equal(start, '2026-10-24T14:00')
  })

  it('ignora horas já passadas mesmo com chuva', () => {
    const start = findRainOnset(
      ['2026-10-24T08:00', '2026-10-25T07:00'],
      [90, 60],
      50,
      '2026-10-24T11:00',
    )
    assert.equal(start, '2026-10-25T07:00')
  })
})
