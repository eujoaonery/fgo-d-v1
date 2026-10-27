import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canAccessModule,
  cityAdminPresetPermissions,
  emptyPermissions,
  fieldPresetPermissions,
  intersectPermissions,
  isCityAdminGroupName,
  isPlatformAdminGroupName,
  maintenancePresetPermissions,
  managerPresetPermissions,
  operatorPresetPermissions,
  parsePermissionsJson,
  parseRawPermissions,
  permissionsForRole,
  systemAdminPresetPermissions,
  viewOnlyPermissions,
} from '../../src/lib/ccoPermissions.js'
import { actorCan, resolveMemberPermissions } from './permissions.js'

describe('permissions §5 matrix', () => {
  it('só o superadministrador da plataforma ignora a matriz', () => {
    const empty = emptyPermissions()
    assert.equal(canAccessModule(empty, 'settings', 'manage', { memberRole: 'admin' }), false)
    assert.equal(canAccessModule(empty, 'users', 'manage', { memberRole: 'admin' }), false)
    assert.equal(canAccessModule(empty, 'assets', 'manage', { isPlatformSuperAdmin: true }), true)
  })

  it('administrador de cidade tem integrações; o do sistema não', () => {
    const cidade = cityAdminPresetPermissions()
    const sistema = systemAdminPresetPermissions()
    assert.equal(canAccessModule(cidade, 'integrations', 'manage'), true)
    assert.equal(canAccessModule(cidade, 'settings', 'manage'), true)
    assert.equal(canAccessModule(sistema, 'settings', 'manage'), true)
    assert.equal(canAccessModule(sistema, 'users', 'manage'), true)
    assert.equal(canAccessModule(sistema, 'integrations', 'view'), false)
    assert.equal(canAccessModule(sistema, 'integrations', 'manage'), false)
    assert.equal(isCityAdminGroupName('Administrador de cidade'), true)
    assert.equal(isCityAdminGroupName('Administrador do sistema'), true)
    assert.equal(isPlatformAdminGroupName('Administrador da plataforma'), true)
    assert.equal(isPlatformAdminGroupName('Administrador de cidade'), false)
  })

  it('grupo administrador do sistema restringe o teto admin', () => {
    const effective = resolveMemberPermissions('admin', null, systemAdminPresetPermissions())
    assert.equal(canAccessModule(effective, 'settings', 'manage'), true)
    assert.equal(canAccessModule(effective, 'integrations', 'manage'), false)
    const full = resolveMemberPermissions('admin', null, cityAdminPresetPermissions())
    assert.equal(canAccessModule(full, 'integrations', 'manage'), true)
  })

  it('auditor consulta sem alterar nem exportar', () => {
    const p = viewOnlyPermissions()
    assert.equal(canAccessModule(p, 'alerts', 'view'), true)
    assert.equal(canAccessModule(p, 'alerts', 'manage'), false)
    assert.equal(canAccessModule(p, 'assets', 'export'), false)
    assert.equal(canAccessModule(p, 'settings', 'view'), false)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'view'), true)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'manage'), false)
    assert.equal(canAccessModule(p, 'acao', 'view', { memberRole: 'auditor' }), false)
  })

  it('gestor: indicadores e relatórios, settings só leitura', () => {
    const p = managerPresetPermissions()
    assert.equal(canAccessModule(p, 'settings', 'view'), true)
    assert.equal(canAccessModule(p, 'settings', 'manage'), false)
    assert.equal(canAccessModule(p, 'incidents', 'manage'), true)
    assert.equal(canAccessModule(p, 'analytics', 'export'), true)
    assert.equal(canAccessModule(p, 'strategy', 'manage'), true)
    assert.equal(canAccessModule(p, 'operators', 'view'), true)
    assert.equal(canAccessModule(p, 'operators', 'manage'), false)
    assert.equal(canAccessModule(p, 'users', 'view'), false)
    assert.equal(canAccessModule(p, 'users', 'manage'), false)
    assert.equal(canAccessModule(p, 'techMonitor', 'manage'), true)
    assert.equal(canAccessModule(p, 'integrations', 'view'), true)
    assert.equal(canAccessModule(p, 'integrations', 'manage'), false)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'view'), true)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'manage'), true)
    assert.equal(canAccessModule(p, 'acao', 'view', { memberRole: 'manager' }), true)
    assert.equal(canAccessModule(p, 'acao', 'manage', { memberRole: 'manager' }), true)
  })

  it('Ação só para gestor, administrador de cidade e plataforma', () => {
    assert.equal(canAccessModule(emptyPermissions(), 'acao', 'view', { memberRole: 'manager' }), true)
    assert.equal(canAccessModule(emptyPermissions(), 'acao', 'view', { memberRole: 'admin' }), true)
    assert.equal(canAccessModule(emptyPermissions(), 'acao', 'view', { isPlatformSuperAdmin: true }), true)
    assert.equal(canAccessModule(managerPresetPermissions(), 'acao', 'view', { memberRole: 'field' }), false)
    assert.equal(canAccessModule(managerPresetPermissions(), 'acao', 'view', { memberRole: 'operator' }), false)
    assert.equal(canAccessModule(managerPresetPermissions(), 'acao', 'view', { memberRole: 'maintenance' }), false)
  })

  it('operador da central: mapa, alertas e ocorrências', () => {
    const p = operatorPresetPermissions()
    assert.equal(canAccessModule(p, 'overview', 'view'), true)
    assert.equal(canAccessModule(p, 'alerts', 'manage'), true)
    assert.equal(canAccessModule(p, 'incidents', 'manage'), true)
    assert.equal(canAccessModule(p, 'settings', 'view'), false)
    assert.equal(canAccessModule(p, 'operators', 'view'), true)
    assert.equal(canAccessModule(p, 'operators', 'manage'), false)
    assert.equal(canAccessModule(p, 'users', 'view'), false)
    assert.equal(canAccessModule(p, 'techMonitor', 'view'), true)
    assert.equal(canAccessModule(p, 'techMonitor', 'manage'), false)
    assert.equal(canAccessModule(p, 'integrations', 'view'), false)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'view'), true)
    assert.equal(canAccessModule(p, 'prometheusAlpha', 'manage'), false)
    assert.equal(canAccessModule(p, 'acao', 'view', { memberRole: 'operator' }), false)
    assert.equal(canAccessModule(p, 'acao', 'manage', { memberRole: 'operator' }), false)
    assert.equal(canAccessModule(p, 'cityInventory', 'view'), true)
    assert.equal(canAccessModule(p, 'assets', 'view'), true)
    assert.equal(canAccessModule(p, 'assets', 'manage'), false)
    assert.equal(canAccessModule(p, 'forecasts', 'view'), true)
    assert.equal(canAccessModule(p, 'forecasts', 'manage'), false)
    assert.equal(canAccessModule(p, 'predictiveIntel', 'view'), false)
  })

  it('grupo antigo de operador ganha Previsões e continua sem Prevision Engine', () => {
    const legado = {
      overview: { view: true, manage: true },
      alerts: { view: true, manage: true },
      predictiveIntel: { view: true, manage: false },
    }
    const efetivo = resolveMemberPermissions('operator', null, legado)
    assert.equal(canAccessModule(efetivo, 'forecasts', 'view'), true)
    assert.equal(canAccessModule(efetivo, 'predictiveIntel', 'view'), false)
  })

  it('equipe de manutenção: gerencia OS, sem configurações globais', () => {
    const p = maintenancePresetPermissions()
    assert.equal(canAccessModule(p, 'incidents', 'manage'), true)
    assert.equal(canAccessModule(p, 'settings', 'view'), false)
    assert.equal(canAccessModule(p, 'operators', 'view'), false)
    assert.equal(canAccessModule(p, 'users', 'view'), false)
  })

  it('blob legado maintenance concede ordens de serviço', () => {
    const p = parseRawPermissions({ maintenance: { view: true, manage: true } })
    assert.equal(canAccessModule(p, 'incidents', 'manage'), true)
  })

  it('rotas herdam de incidents quando o blob não declara routes', () => {
    const p = parseRawPermissions({ incidents: { view: true, manage: true } })
    assert.equal(canAccessModule(p, 'routes', 'view'), true)
    assert.equal(canAccessModule(p, 'routes', 'manage'), true)
  })

  it('blob legado operators.manage herda usuários', () => {
    const p = parseRawPermissions({ operators: { view: true, manage: true } })
    assert.equal(canAccessModule(p, 'users', 'view'), true)
    assert.equal(canAccessModule(p, 'users', 'manage'), true)
  })

  it('agente de campo: ocorrências e escala, sem cadastros globais', () => {
    const p = fieldPresetPermissions()
    assert.equal(canAccessModule(p, 'incidents', 'manage'), true)
    assert.equal(canAccessModule(p, 'teams', 'manage'), true)
    assert.equal(canAccessModule(p, 'assets', 'view'), false)
    assert.equal(canAccessModule(p, 'settings', 'view'), false)
    assert.equal(canAccessModule(p, 'acao', 'view', { memberRole: 'field' }), false)
  })

  it('grupo não amplia o teto do papel', () => {
    const escalated = managerPresetPermissions()
    const effective = resolveMemberPermissions('operator', null, escalated)
    assert.equal(canAccessModule(effective, 'analytics', 'view'), false)
    assert.equal(canAccessModule(effective, 'alerts', 'manage'), true)
    assert.equal(canAccessModule(effective, 'settings', 'view'), false)
  })

  it('grupo vazio cai no preset do papel', () => {
    const p = parsePermissionsJson({}, 'operator')
    assert.equal(canAccessModule(p, 'overview', 'view'), true)
    assert.deepEqual(p, permissionsForRole('operator'))
  })

  it('blob antigo herda monitoramento de ativos e integrações de settings', () => {
    const p = parsePermissionsJson({ assets: { view: true, manage: false }, settings: { view: true } }, 'manager')
    assert.equal(canAccessModule(p, 'techMonitor', 'view'), true)
    assert.equal(canAccessModule(p, 'integrations', 'view'), true)
    assert.equal(canAccessModule(p, 'integrations', 'manage'), false)
    assert.equal(canAccessModule(p, 'acao', 'view'), true)
    assert.equal(canAccessModule(p, 'acao', 'manage'), true)
  })

  it('intersect aplica menor privilégio', () => {
    const out = intersectPermissions(operatorPresetPermissions(), viewOnlyPermissions())
    assert.equal(out.alerts.view, true)
    assert.equal(out.alerts.manage, false)
  })

  it('actorCan respeita auditor', () => {
    assert.equal(
      actorCan(
        {
          userId: 'u1',
          email: 'a@b.c',
          role: 'auditor',
          permissions: viewOnlyPermissions(),
          isPlatformSuperAdmin: false,
          memberRole: 'auditor',
        },
        'teams',
        'manage',
      ),
      false,
    )
  })
})
