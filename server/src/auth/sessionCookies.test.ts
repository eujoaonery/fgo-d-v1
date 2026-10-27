import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Response } from 'express'
import { accessReplacingStaleRefresh, noteRefreshRotation, setAuthCookies } from './sessionCookies.js'

function mockRes(): Response {
  return {
    cookie() {},
    clearCookie() {},
  } as unknown as Response
}

describe('accessReplacingStaleRefresh', () => {
  it('devolve o access só para o refresh que acabou de ser trocado', () => {
    noteRefreshRotation('refresh-a', 'access-a2')
    assert.equal(accessReplacingStaleRefresh('refresh-a'), 'access-a2')
    assert.equal(accessReplacingStaleRefresh('refresh-a2'), null)
  })

  it('não entrega a sessão de outro usuário para um refresh desconhecido', () => {
    noteRefreshRotation('refresh-a', 'access-a2')
    setAuthCookies(mockRes(), 'access-b', 'refresh-b', 3600)
    assert.equal(accessReplacingStaleRefresh('qualquer-coisa'), null)
    assert.equal(accessReplacingStaleRefresh('refresh-b'), null)
    assert.equal(accessReplacingStaleRefresh('refresh-a'), 'access-a2')
  })
})
