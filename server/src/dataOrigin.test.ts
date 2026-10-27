import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generatedSignalOrigin } from './dataOrigin.js'

describe('procedência do sinal gerado', () => {
  it('cidade de demonstração nunca grava dado real', () => {
    const demo = { tenant: { operationMode: 'demo' } }
    assert.equal(generatedSignalOrigin(demo, 'manual'), 'simulado')
    assert.equal(generatedSignalOrigin(demo, 'real'), 'simulado')
    assert.equal(generatedSignalOrigin(demo), 'simulado')
  })

  it('cidade real mantém simulado só quando o ativo é simulado', () => {
    const real = { tenant: { operationMode: 'real' } }
    assert.equal(generatedSignalOrigin(real, 'simulado'), 'simulado')
    assert.equal(generatedSignalOrigin(real, 'manual'), 'real')
    assert.equal(generatedSignalOrigin(real), 'real')
  })
})
