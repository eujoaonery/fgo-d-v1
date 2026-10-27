import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { slaPercent, slaMinutesForCategory, parseSlaByCategory } from '../../../src/lib/categorySla.js'

describe('slaPercent', () => {
  const hour = 60 * 60_000

  it('mantém 100% até o último minuto da janela', () => {
    assert.equal(slaPercent(hour, 0), 100)
    assert.equal(slaPercent(hour, 58 * 60_000), 100)
    assert.equal(slaPercent(hour, 59 * 60_000), 100)
  })

  it('cai de 100% a 0% no último minuto', () => {
    assert.equal(slaPercent(hour, 59.5 * 60_000), 50)
    assert.equal(slaPercent(hour, hour), 0)
  })

  it('fica negativo depois do prazo', () => {
    assert.equal(slaPercent(hour, 61 * 60_000), -100)
    assert.equal(slaPercent(hour, 62 * 60_000), -200)
  })
})

describe('parseSlaByCategory', () => {
  it('ignora valores inválidos e aceita minutos positivos', () => {
    const parsed = parseSlaByCategory({
      slaByCategory: { CFTV: 45, Tráfego: '90', x: -1, y: 0, z: 'nope' },
    })
    assert.equal(parsed.CFTV, 45)
    assert.equal(parsed.Tráfego, 90)
    assert.equal(parsed.x, undefined)
  })
})

describe('slaMinutesForCategory', () => {
  it('usa o mapa da organização e cai no padrão', () => {
    const settings = { slaByCategory: { CFTV: 30 } }
    assert.equal(slaMinutesForCategory('CFTV', settings), 30)
    assert.equal(slaMinutesForCategory('cftv', settings), 30)
    assert.equal(slaMinutesForCategory('Ambiental', settings, 60), 60)
  })
})
