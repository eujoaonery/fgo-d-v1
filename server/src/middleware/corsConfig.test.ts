import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOriginAllowed } from './corsConfig.js'

describe('CORS allowlist', () => {
  const allowed = ['https://fgo.criativfy.com.br']

  it('aceita requisição same-origin sem cabeçalho Origin', () => {
    assert.equal(isOriginAllowed(undefined, allowed), true)
  })

  it('aceita origem da lista', () => {
    assert.equal(isOriginAllowed('https://fgo.criativfy.com.br', allowed), true)
  })

  it('recusa origem desconhecida sem lançar', () => {
    assert.equal(isOriginAllowed('https://evil.example', allowed), false)
  })
})
