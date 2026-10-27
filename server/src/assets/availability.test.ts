import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeAvailability, isExcludedFromAvailability } from '../../../src/lib/assetAvailability.js'

describe('disponibilidade §7.1.1', () => {
  it('exclui não instalado e baixado do denominador', () => {
    const stats = computeAvailability([
      { status: 'operacional', cadastralStatus: 'operacional' },
      { status: 'operacional', cadastralStatus: 'nao_instalado' },
      { status: 'alerta', cadastralStatus: 'baixado' },
      { status: 'alerta', cadastralStatus: 'operacional' },
    ])
    assert.equal(stats.total, 4)
    assert.equal(stats.excluded, 2)
    assert.equal(stats.eligible, 2)
    assert.equal(stats.operational, 1)
    assert.equal(stats.percent, 50)
  })

  it('trata em_instalacao como fora da conta', () => {
    assert.equal(isExcludedFromAvailability('em_instalacao'), true)
    assert.equal(isExcludedFromAvailability('operacional'), false)
  })
})
