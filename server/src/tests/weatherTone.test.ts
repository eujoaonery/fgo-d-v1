import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { weatherTone } from '../../../src/lib/weatherTone.js'

describe('weatherTone', () => {
  it('chuva vence vento e nuvem', () => {
    assert.equal(weatherTone({ code: 61, precipMm: 1.2, windKmh: 40, cloudPct: 90 }), 'chuva')
  })
  it('vento sem chuva', () => {
    assert.equal(weatherTone({ code: 2, precipMm: 0, windKmh: 30, cloudPct: 80 }), 'vento')
  })
  it('céu limpo', () => {
    assert.equal(weatherTone({ code: 0, precipMm: 0, windKmh: 8, cloudPct: 5 }), 'sol')
  })
  it('nublado', () => {
    assert.equal(weatherTone({ code: 3, precipMm: 0, windKmh: 10, cloudPct: 80 }), 'nublado')
  })
})
