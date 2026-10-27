import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cityPath,
  DEFAULT_DUPLICATE_COPY,
  sanitizeTenantSettings,
  simulationAllowed,
  stripCityPrefix,
  validateTenantSlug,
} from '../../../src/lib/tenant.js'
import { authorizeTenantAccess, operationalAccessForStatus, throwIfCrossTenantBody } from './access.js'
import { HttpError } from '../httpError.js'

describe('tenant slug', () => {
  it('aceita identificadores válidos', () => {
    assert.equal(validateTenantSlug('prefeitura-marilia').ok, true)
    assert.equal(validateTenantSlug('Marilia-Real').ok, true)
    if (validateTenantSlug('Marilia-Real').ok) {
      assert.equal(validateTenantSlug('Marilia-Real').slug, 'marilia-real')
    }
  })

  it('rejeita reservados, curtos e inválidos', () => {
    assert.equal(validateTenantSlug('mng').ok, false)
    assert.equal(validateTenantSlug('login').ok, false)
    assert.equal(validateTenantSlug('a').ok, false)
    assert.equal(validateTenantSlug('-abc').ok, false)
    assert.equal(validateTenantSlug('abc-').ok, false)
    assert.equal(validateTenantSlug('cidade_1').ok, false)
  })
})

describe('rotas da cidade', () => {
  it('prefixa e remove o slug da URL', () => {
    assert.equal(cityPath('prefeitura-marilia', '/'), '/prefeitura-marilia')
    assert.equal(cityPath('prefeitura-marilia', '/login'), '/prefeitura-marilia/login')
    assert.equal(cityPath('assis', '/alertas?q=1'), '/assis/alertas?q=1')
    assert.equal(stripCityPrefix('/prefeitura-marilia/alertas'), '/alertas')
    assert.equal(stripCityPrefix('/prefeitura-marilia'), '/')
    assert.equal(stripCityPrefix('/mng/cidades'), '/mng/cidades')
  })
})

describe('isolamento de acesso', () => {
  it('membro acessa cidade ativa', () => {
    const d = authorizeTenantAccess({ hasMembership: true, isPlatformAdmin: false, orgStatus: 'active' })
    assert.equal(d.ok, true)
  })

  it('usuário municipal não atravessa tenant', () => {
    const d = authorizeTenantAccess({ hasMembership: false, isPlatformAdmin: false, orgStatus: 'active' })
    assert.equal(d.ok, false)
    if (!d.ok) {
      assert.equal(d.code, 'CROSS_TENANT')
      assert.equal(d.status, 403)
    }
  })

  it('superadmin também é bloqueado no CCO de cidade suspensa', () => {
    const d = authorizeTenantAccess({ hasMembership: false, isPlatformAdmin: true, orgStatus: 'suspended' })
    assert.equal(d.ok, false)
    if (!d.ok) assert.equal(d.code, 'TENANT_SUSPENDED')
  })

  it('arquivada e em provisionamento bloqueiam operação', () => {
    assert.equal(operationalAccessForStatus('archived').ok, false)
    assert.equal(operationalAccessForStatus('provisioning').ok, false)
    assert.equal(operationalAccessForStatus('active').ok, true)
  })

  it('rejeita tenant_id enviado pelo cliente', () => {
    assert.throws(
      () => throwIfCrossTenantBody({ tenantId: 'abc' }),
      (err: unknown) => err instanceof HttpError && err.code === 'TENANT_INJECTION',
    )
    assert.throws(
      () => throwIfCrossTenantBody({ organization_id: 'x' }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
    throwIfCrossTenantBody({ name: 'ok' })
  })
})

describe('modo demonstração vs real', () => {
  it('só autoriza simulação em demonstração', () => {
    assert.equal(simulationAllowed('demo'), true)
    assert.equal(simulationAllowed('real'), false)
  })
})

describe('duplicação seletiva', () => {
  it('não copia histórico por padrão e remove segredos', () => {
    assert.equal(DEFAULT_DUPLICATE_COPY.history, false)
    assert.equal(DEFAULT_DUPLICATE_COPY.users, false)
    const clean = sanitizeTenantSettings({
      ui: { theme: 'dark' },
      openai_api_key: 'sk-secret',
      webhookToken: 'abc',
      nested: { password: 'x', label: 'ok' },
    })
    assert.deepEqual(clean.ui, { theme: 'dark' })
    assert.equal('openai_api_key' in clean, false)
    assert.equal('webhookToken' in clean, false)
    assert.deepEqual(clean.nested, { label: 'ok' })
  })

  it('mantém o ponteiro secretId do cofre PROMETHEUS', () => {
    const clean = sanitizeTenantSettings({
      prometheus: { model: 'gpt-4o-mini', secretId: '2a96d1f0-6e78-40b2-9e77-1e8b89a18af4' },
      openai_api_key: 'sk-secret',
    })
    const prometheus = clean.prometheus as { model?: string; secretId?: string }
    assert.equal(prometheus.model, 'gpt-4o-mini')
    assert.equal(prometheus.secretId, '2a96d1f0-6e78-40b2-9e77-1e8b89a18af4')
    assert.equal('openai_api_key' in clean, false)
  })
})
