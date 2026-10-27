import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generatorMayCreateWorkOrders } from './policy.js'

describe('gerador de ocorrências', () => {
  it('não cria ordens de serviço automaticamente', () => {
    assert.equal(generatorMayCreateWorkOrders(), false)
  })
})
