import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canMutatePlatformAdmin } from '../platform/platformAdmins.js'

describe('superadministrador da plataforma', () => {
  it('protege o ADM original contra inativar e excluir', () => {
    const gate = canMutatePlatformAdmin({
      targetIsOriginal: true,
      targetUserId: 'original',
      actorUserId: 'replica',
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.code, 'PLATFORM_ADMIN_PROTECTED')
  })

  it('impede a própria conta', () => {
    const gate = canMutatePlatformAdmin({
      targetIsOriginal: false,
      targetUserId: 'replica',
      actorUserId: 'replica',
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.code, 'PLATFORM_ADMIN_SELF')
  })

  it('permite mutar outro superADM que não é o original', () => {
    const gate = canMutatePlatformAdmin({
      targetIsOriginal: false,
      targetUserId: 'replica-2',
      actorUserId: 'replica-1',
    })
    assert.equal(gate.ok, true)
  })
})
