import { stripCityPrefix } from './tenant'

/** Módulos alinhados às rotas do CCO. Permissões validadas no backend (§5.7). */
export type CcoModuleKey =
  | 'overview'
  | 'cameraMonitor'
  | 'cityInventory'
  | 'incidents'
  | 'routes'
  | 'alerts'
  | 'acao'
  | 'assets'
  | 'teams'
  | 'techMonitor'
  | 'forecasts'
  | 'predictiveIntel'
  | 'prometheusAlpha'
  | 'analytics'
  | 'strategy'
  | 'integrations'
  | 'operators'
  | 'users'
  | 'settings'

export type CcoAccessAction = 'view' | 'manage' | 'export'

export type CcoModuleAccess = {
  view: boolean
  manage: boolean
  export: boolean
}

export type CcoPermissions = Record<CcoModuleKey, CcoModuleAccess>

/** Papéis da especificação §5. `viewer` permanece como alias de auditor. */
export type CcoMemberRole =
  | 'admin'
  | 'manager'
  | 'operator'
  | 'maintenance'
  | 'field'
  | 'auditor'
  | 'viewer'

export const CCO_MODULE_DEFS: { key: CcoModuleKey; label: string; group: string }[] = [
  { key: 'overview', label: 'Visão geral (inclui mapa)', group: 'Operações' },
  { key: 'cameraMonitor', label: 'Monitoramento de câmeras', group: 'Operações' },
  { key: 'cityInventory', label: 'Inventário da cidade', group: 'Gestão' },
  { key: 'incidents', label: 'Ordens de serviço / Agenda', group: 'Operações' },
  { key: 'routes', label: 'Rotas', group: 'Operações' },
  { key: 'alerts', label: 'Alertas', group: 'Operações' },
  { key: 'acao', label: 'Ação', group: 'Operações' },
  { key: 'operators', label: 'Operadores CCO (expediente)', group: 'Operações' },
  { key: 'assets', label: 'Cadastro de ativos', group: 'Gestão' },
  { key: 'teams', label: 'Agentes', group: 'Gestão' },
  { key: 'techMonitor', label: 'Saúde de conectores', group: 'Sistema' },
  { key: 'forecasts', label: 'Previsões', group: 'Inteligência' },
  { key: 'predictiveIntel', label: 'Prevision Engine', group: 'Inteligência' },
  { key: 'prometheusAlpha', label: 'Prometheus Alpha', group: 'Inteligência' },
  { key: 'analytics', label: 'Análises', group: 'Inteligência' },
  { key: 'strategy', label: 'Painel estratégico', group: 'Inteligência' },
  { key: 'integrations', label: 'Integrações e dados', group: 'Sistema' },
  { key: 'users', label: 'Usuários, grupos e auditoria', group: 'Sistema' },
  { key: 'settings', label: 'Configurações', group: 'Sistema' },
]

export const CCO_ROLE_DEFS: {
  id: CcoMemberRole
  label: string
  spec: string
  summary: string
}[] = [
  {
    id: 'admin',
    label: 'Administrador de cidade',
    spec: '§5.1',
    summary:
      'Teto da administração municipal. Não é o superadministrador da plataforma. Atribua pelo grupo Administrador de cidade ou Administrador do sistema.',
  },
  {
    id: 'manager',
    label: 'Gestor de mobilidade',
    spec: '§5.2',
    summary: 'Indicadores, equipamentos, ordens de serviço e previsões da cidade/região autorizada.',
  },
  {
    id: 'operator',
    label: 'Operador da central',
    spec: '§5.3',
    summary: 'Mapa, fila de alertas, plantão do CCO (quem está em expediente), abertura de OS e agendamento nos agentes.',
  },
  {
    id: 'maintenance',
    label: 'Equipe de manutenção',
    spec: '§5.4',
    summary: 'Ordens atribuídas: diagnóstico, deslocamento, execução e evidências. Sem configurações globais.',
  },
  {
    id: 'field',
    label: 'Agente de campo',
    spec: '§5.5',
    summary: 'Escala, tarefas e ocorrências atribuídas. Localização só no período autorizado.',
  },
  {
    id: 'auditor',
    label: 'Auditor / consulta',
    spec: '§5.6',
    summary: 'Consulta registros e relatórios. Não altera cadastros. Exportação só com permissão explícita.',
  },
]

const MODULE_KEYS = CCO_MODULE_DEFS.map((m) => m.key)

function slot(view: boolean, manage = false, exp = false): CcoModuleAccess {
  return { view: view || manage, manage, export: exp }
}

function fill(builder: (p: CcoPermissions) => void): CcoPermissions {
  const p = emptyPermissions()
  builder(p)
  return p
}

export function emptyPermissions(): CcoPermissions {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, slot(false)])) as CcoPermissions
}

export function fullPermissions(): CcoPermissions {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, slot(true, true, true)])) as CcoPermissions
}

export const CITY_ADMIN_GROUP_CIDADE = 'Administrador de cidade'
export const CITY_ADMIN_GROUP_SISTEMA = 'Administrador do sistema'
const PLATFORM_ADMIN_GROUP_NAMES = ['administrador da plataforma', 'administrador de plataforma']

export function foldGroupName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function isPlatformAdminGroupName(name: string): boolean {
  const n = foldGroupName(name)
  return PLATFORM_ADMIN_GROUP_NAMES.some((label) => foldGroupName(label) === n)
}

export function isCityAdminGroupName(name: string): boolean {
  const n = foldGroupName(name)
  return n === foldGroupName(CITY_ADMIN_GROUP_CIDADE) || n === foldGroupName(CITY_ADMIN_GROUP_SISTEMA)
}

export function isSystemAdminGroupName(name: string): boolean {
  return foldGroupName(name) === foldGroupName(CITY_ADMIN_GROUP_SISTEMA)
}

/** Papel interno derivado do grupo da cidade — o grupo é a escolha do cadastro. */
export function roleFromGroupName(name: string | null | undefined): CcoMemberRole {
  if (!name?.trim()) return 'operator'
  if (isCityAdminGroupName(name)) return 'admin'
  const n = foldGroupName(name)
  if (n === 'gestores' || n.includes('gestor')) return 'manager'
  if (n === 'operadores' || n.includes('operador')) return 'operator'
  if (n === 'manutencao' || n.includes('manutencao')) return 'maintenance'
  if (n === 'campo' || n.includes('agente de campo')) return 'field'
  if (n === 'auditores' || n.includes('auditor')) return 'auditor'
  return 'operator'
}

/** Papéis que podem ser escolhidos no CCO da cidade (sem administrador de plataforma). */
export const CCO_CITY_ROLE_DEFS = CCO_ROLE_DEFS.filter((r) => r.id !== 'admin' && r.id !== 'viewer')

/** Administração da cidade: tudo naquele município, inclusive configs e integrações. */
export function cityAdminPresetPermissions(): CcoPermissions {
  return fullPermissions()
}

/** Administração do sistema da cidade: tudo, menos API e integrações de dados. */
export function systemAdminPresetPermissions(): CcoPermissions {
  const p = fullPermissions()
  p.integrations = slot(false)
  return p
}

export function permissionsForCityAdminGroup(name: string): CcoPermissions {
  return isSystemAdminGroupName(name) ? systemAdminPresetPermissions() : cityAdminPresetPermissions()
}

/** Auditor §5.6 — consulta ampla, sem alterar nem exportar por padrão. */
export function viewOnlyPermissions(): CcoPermissions {
  return fill((p) => {
    p.overview = slot(true)
    p.cameraMonitor = slot(true)
    p.cityInventory = slot(true)
    p.incidents = slot(true)
    p.routes = slot(true)
    p.alerts = slot(true)
    p.assets = slot(true)
    p.teams = slot(true)
    p.techMonitor = slot(true)
    p.forecasts = slot(true)
    p.predictiveIntel = slot(true)
    p.prometheusAlpha = slot(true)
    p.analytics = slot(true)
    p.strategy = slot(true)
    p.integrations = slot(true)
    p.operators = slot(true)
  })
}

/** Gestor §5.2 */
export function managerPresetPermissions(): CcoPermissions {
  return fill((p) => {
    p.overview = slot(true, true, true)
    p.cameraMonitor = slot(true)
    p.cityInventory = slot(true)
    p.incidents = slot(true, true, true)
    p.routes = slot(true, true, true)
    p.alerts = slot(true, true)
    p.acao = slot(true, true)
    p.assets = slot(true, false, true)
    p.teams = slot(true)
    p.techMonitor = slot(true, true, true)
    p.forecasts = slot(true)
    p.predictiveIntel = slot(true)
    p.prometheusAlpha = slot(true, true)
    p.analytics = slot(true, false, true)
    p.strategy = slot(true, true, true)
    p.integrations = slot(true)
    p.settings = slot(true)
    p.operators = slot(true)
  })
}

/** Operador da central §5.3 */
export function operatorPresetPermissions(): CcoPermissions {
  return fill((p) => {
    p.overview = slot(true, true)
    p.cameraMonitor = slot(true, true)
    p.cityInventory = slot(true)
    p.incidents = slot(true, true)
    p.routes = slot(true, true)
    p.alerts = slot(true, true)
    p.assets = slot(true)
    p.teams = slot(true)
    p.techMonitor = slot(true)
    p.forecasts = slot(true)
    p.strategy = slot(true, true)
    p.prometheusAlpha = slot(true)
    p.operators = slot(true)
  })
}

/** Equipe de manutenção §5.4 */
export function maintenancePresetPermissions(): CcoPermissions {
  return fill((p) => {
    p.overview = slot(true)
    p.cityInventory = slot(true)
    p.incidents = slot(true, true)
    p.routes = slot(true, true)
    p.alerts = slot(true)
    p.assets = slot(true)
    p.teams = slot(true)
    p.techMonitor = slot(true)
  })
}

/** Agente de campo §5.5 */
export function fieldPresetPermissions(): CcoPermissions {
  return fill((p) => {
    p.overview = slot(true)
    p.incidents = slot(true, true)
    p.routes = slot(true)
    p.alerts = slot(true)
    p.teams = slot(true, true)
  })
}

export function normalizeMemberRole(role: string | undefined | null): CcoMemberRole {
  if (role === 'viewer') return 'auditor'
  if (
    role === 'admin' ||
    role === 'manager' ||
    role === 'operator' ||
    role === 'maintenance' ||
    role === 'field' ||
    role === 'auditor'
  ) {
    return role
  }
  return 'operator'
}

export function permissionsForRole(role: CcoMemberRole): CcoPermissions {
  switch (normalizeMemberRole(role)) {
    case 'admin':
      return fullPermissions()
    case 'manager':
      return managerPresetPermissions()
    case 'operator':
      return operatorPresetPermissions()
    case 'maintenance':
      return maintenancePresetPermissions()
    case 'field':
      return fieldPresetPermissions()
    case 'auditor':
    case 'viewer':
      return viewOnlyPermissions()
    default:
      return emptyPermissions()
  }
}

function readSlice(raw: unknown): Partial<CcoModuleAccess> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    view: o.view === true,
    manage: o.manage === true,
    export: o.export === true,
  }
}

export function parseRawPermissions(
  raw: unknown,
  opts?: { inheritMissingExport?: boolean },
): CcoPermissions {
  const base = emptyPermissions()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  for (const key of MODULE_KEYS) {
    const rec = o[key]
    const slice = readSlice(rec)
    if (!slice) continue
    const manage = !!slice.manage
    const view = !!slice.view || manage
    const hasExport = !!rec && typeof rec === 'object' && 'export' in rec
    const exp = hasExport ? slice.export === true : opts?.inheritMissingExport === true
    base[key] = { view, manage, export: exp }
  }
  const legacyMaint = readSlice(o.maintenance)
  if (legacyMaint) {
    base.incidents = {
      view: base.incidents.view || !!legacyMaint.view || !!legacyMaint.manage,
      manage: base.incidents.manage || !!legacyMaint.manage,
      export: base.incidents.export || !!legacyMaint.export,
    }
  }
  if (!readSlice(o.routes) && base.incidents.view) {
    base.routes = {
      view: base.incidents.view,
      manage: base.incidents.manage,
      export: base.incidents.export,
    }
  }
  if (!readSlice(o.users) && base.operators.manage) {
    base.users = {
      view: true,
      manage: true,
      export: base.operators.export,
    }
  }
  return base
}

export function permissionsAreEmpty(p: CcoPermissions): boolean {
  return MODULE_KEYS.every((k) => !p[k].view && !p[k].manage && !p[k].export)
}

export function intersectPermissions(cap: CcoPermissions, granted: CcoPermissions): CcoPermissions {
  const out = emptyPermissions()
  for (const key of MODULE_KEYS) {
    out[key] = {
      view: cap[key].view && granted[key].view,
      manage: cap[key].manage && granted[key].manage,
      export: cap[key].export && granted[key].export,
    }
  }
  return out
}

export function parsePermissionsJson(raw: unknown, role: CcoMemberRole): CcoPermissions {
  const normalized = normalizeMemberRole(role)
  if (normalized === 'admin') return fullPermissions()
  const preset = permissionsForRole(normalized)
  const overlay = parseRawPermissions(raw)
  if (permissionsAreEmpty(overlay)) return preset
  const merged = intersectPermissions(preset, overlay)
  const rawHadOperators = !!raw && typeof raw === 'object' && 'operators' in raw
  if (!rawHadOperators && preset.operators.view) {
    merged.operators = { view: true, manage: false, export: false }
  }
  const rawHadStrategy = !!raw && typeof raw === 'object' && 'strategy' in raw
  if (!rawHadStrategy && preset.strategy.view) {
    merged.strategy = { ...preset.strategy }
  }
  const rawHadAlpha = !!raw && typeof raw === 'object' && 'prometheusAlpha' in raw
  if (!rawHadAlpha && preset.prometheusAlpha.view) {
    merged.prometheusAlpha = { ...preset.prometheusAlpha }
  }
  const rawHadAcao = !!raw && typeof raw === 'object' && 'acao' in raw
  if (!rawHadAcao && preset.acao.view) {
    merged.acao = { ...preset.acao }
  }
  const rawHadTech = !!raw && typeof raw === 'object' && 'techMonitor' in raw
  if (!rawHadTech && preset.techMonitor.view) {
    merged.techMonitor = {
      view: merged.assets.view || preset.techMonitor.view,
      manage: merged.assets.manage && preset.techMonitor.manage,
      export: merged.assets.export && preset.techMonitor.export,
    }
  }
  const rawHadIntegrations = !!raw && typeof raw === 'object' && 'integrations' in raw
  if (!rawHadIntegrations && preset.integrations.view) {
    merged.integrations = {
      view: merged.settings.view || preset.integrations.view,
      manage: merged.settings.manage && preset.integrations.manage,
      export: false,
    }
  }
  const rawHadInventory = !!raw && typeof raw === 'object' && 'cityInventory' in raw
  if (!rawHadInventory && preset.cityInventory.view) {
    merged.cityInventory = { ...preset.cityInventory }
  }
  const rawHadAssets = !!raw && typeof raw === 'object' && 'assets' in raw
  if (!rawHadAssets && preset.assets.view) {
    merged.assets = { ...preset.assets }
  }
  const rawHadRoutes = !!raw && typeof raw === 'object' && 'routes' in raw
  if (!rawHadRoutes && (preset.routes.view || merged.incidents.view)) {
    merged.routes = {
      view: merged.incidents.view || preset.routes.view,
      manage: merged.incidents.manage || preset.routes.manage,
      export: merged.incidents.export || preset.routes.export,
    }
  }
  const rawHadForecasts = !!raw && typeof raw === 'object' && 'forecasts' in raw
  if (!rawHadForecasts && preset.forecasts.view) {
    merged.forecasts = { ...preset.forecasts }
  }
  const rawHadUsers = !!raw && typeof raw === 'object' && 'users' in raw
  if (!rawHadUsers) {
    merged.users = {
      view: preset.users.view || merged.operators.manage,
      manage: preset.users.manage || merged.operators.manage,
      export: merged.operators.export,
    }
  }
  return merged
}

export function serializePermissions(p: CcoPermissions): Record<string, CcoModuleAccess> {
  const out: Record<string, CcoModuleAccess> = {}
  for (const key of MODULE_KEYS) {
    out[key] = {
      view: !!p[key].view,
      manage: !!p[key].manage,
      export: !!p[key].export,
    }
  }
  return out
}

export function canAccessModule(
  permissions: CcoPermissions,
  module: CcoModuleKey,
  action: CcoAccessAction,
  opts?: { isPlatformSuperAdmin?: boolean; memberRole?: CcoMemberRole },
): boolean {
  if (opts?.isPlatformSuperAdmin) return true
  if (module === 'acao') {
    const role = opts?.memberRole != null ? normalizeMemberRole(opts.memberRole) : null
    if (role === 'admin' || role === 'manager') {
      if (action === 'export') return permissions.acao?.export === true || role === 'admin'
      return true
    }
    if (role != null) return false
  }
  const slice = permissions[module]
  if (!slice) return false
  if (action === 'view') return slice.view || slice.manage
  if (action === 'manage') return slice.manage
  return slice.export === true
}

export function moduleToPath(module: CcoModuleKey): string {
  const map: Record<CcoModuleKey, string> = {
    overview: '/',
    cameraMonitor: '/monitoramento-cameras',
    cityInventory: '/inventario-cidade',
    incidents: '/ordens-servico',
    routes: '/rotas',
    alerts: '/alertas',
    acao: '/acao',
    assets: '/ativos',
    teams: '/equipes',
    techMonitor: '/monitoramento-tecnico',
    forecasts: '/previsoes',
    predictiveIntel: '/inteligencia-preditiva',
    prometheusAlpha: '/prometheus-alpha',
    analytics: '/analises',
    strategy: '/painel-estrategico',
    integrations: '/integracoes',
    operators: '/operadores',
    users: '/usuarios',
    settings: '/configuracoes',
  }
  return map[module]
}

export function routeToModule(pathname: string): CcoModuleKey | null {
  const logical = stripCityPrefix(pathname)
  if (logical === '/') return 'overview'
  const map: Record<string, CcoModuleKey> = {
    '/monitoramento-cameras': 'cameraMonitor',
    '/inventario-cidade': 'cityInventory',
    '/ocorrencias': 'incidents',
    '/ordens-servico': 'incidents',
    '/rotas': 'routes',
    '/agenda': 'incidents',
    '/alertas': 'alerts',
    '/previsoes': 'forecasts',
    '/acao': 'acao',
    '/ativos': 'assets',
    '/equipes': 'teams',
    '/manutencao': 'incidents',
    '/monitoramento-tecnico': 'alerts',
    '/inteligencia-preditiva': 'predictiveIntel',
    '/prometheus-alpha': 'prometheusAlpha',
    '/analises': 'analytics',
    '/visao-regiao': 'analytics',
    '/painel-estrategico': 'strategy',
    '/integracoes': 'integrations',
    '/operadores': 'operators',
    '/usuarios': 'users',
    '/configuracoes': 'settings',
  }
  return map[logical] ?? null
}
