import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCitySuperAdminMember } from '../platform/cityAdmins.js'

describe('superadministrador de cidade', () => {
  it('aceita o grupo Administrador de cidade', () => {
    assert.equal(isCitySuperAdminMember({ role: 'admin', groupName: 'Administrador de cidade' }), true)
  })

  it('aceita admin legado sem grupo', () => {
    assert.equal(isCitySuperAdminMember({ role: 'admin', groupName: null }), true)
  })

  it('recusa Administrador do sistema e demais papéis', () => {
    assert.equal(isCitySuperAdminMember({ role: 'admin', groupName: 'Administrador do sistema' }), false)
    assert.equal(isCitySuperAdminMember({ role: 'operator', groupName: 'Operadores' }), false)
    assert.equal(isCitySuperAdminMember({ role: 'manager', groupName: null }), false)
  })
})
