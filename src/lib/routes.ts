import { stripCityPrefix } from '@/lib/tenant'

export const ROUTES = {
  overview: '/',
  cameraMonitor: '/monitoramento-cameras',
  cityInventory: '/inventario-cidade',
  fleet: '/frota',
  incidents: '/ordens-servico',
  routes: '/rotas',
  agenda: '/agenda',
  forecasts: '/previsoes',
  alerts: '/alertas',
  acao: '/acao',
  assets: '/ativos',
  teams: '/equipes',
  techMonitor: '/monitoramento-tecnico',
  analytics: '/analises',
  regionVision: '/visao-regiao',
  predictiveIntel: '/inteligencia-preditiva',
  prometheusAlpha: '/prometheus-alpha',
  strategy: '/painel-estrategico',
  integrations: '/integracoes',
  settings: '/configuracoes',
  profile: '/perfil',
  operators: '/operadores',
  users: '/usuarios',
  login: '/login',
} as const

export type RouteKey = keyof typeof ROUTES

export const LEGACY_CCO_SEGMENTS = new Set(
  [...Object.values(ROUTES), '/mapa', '/ocorrencias', '/manutencao']
    .map((p) => p.replace(/^\//, '').split('/')[0])
    .filter(Boolean),
)

export interface NavItem {
  id: RouteKey
  label: string
  path: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    title: 'Operações',
    items: [
      { id: 'overview', label: 'Visão geral', path: ROUTES.overview },
      { id: 'cameraMonitor', label: 'Câmeras', path: ROUTES.cameraMonitor },
      { id: 'incidents', label: 'Ordens de serviço', path: ROUTES.incidents },
      { id: 'routes', label: 'Rotas', path: ROUTES.routes },
      { id: 'agenda', label: 'Agenda', path: ROUTES.agenda },
      { id: 'alerts', label: 'Alertas', path: ROUTES.alerts },
      { id: 'forecasts', label: 'Previsões', path: ROUTES.forecasts },
      { id: 'acao', label: 'Ação', path: ROUTES.acao },
      { id: 'operators', label: 'Operadores CCO', path: ROUTES.operators },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { id: 'cityInventory', label: 'Inventário da cidade', path: ROUTES.cityInventory },
      { id: 'fleet', label: 'Frota', path: ROUTES.fleet },
      { id: 'teams', label: 'Agentes', path: ROUTES.teams },
    ],
  },
  {
    title: 'Inteligência',
    items: [
      { id: 'predictiveIntel', label: 'Prevision Engine', path: ROUTES.predictiveIntel },
      { id: 'prometheusAlpha', label: 'Prometheus Alpha', path: ROUTES.prometheusAlpha },
      { id: 'analytics', label: 'Análises', path: ROUTES.analytics },
      { id: 'regionVision', label: 'Visão por Região', path: ROUTES.regionVision },
      { id: 'strategy', label: 'Painel estratégico', path: ROUTES.strategy },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { id: 'users', label: 'Usuários', path: ROUTES.users },
      { id: 'integrations', label: 'Integrações e dados', path: ROUTES.integrations },
      { id: 'settings', label: 'Configurações', path: ROUTES.settings },
    ],
  },
]

export function routeMeta(pathname: string): { title: string; breadcrumbs?: string[] } {
  const logical = stripCityPrefix(pathname)
  const found = navigation.flatMap((g) => g.items).find((i) => i.path === logical)
  if (logical === ROUTES.profile) {
    return { title: 'Meu perfil', breadcrumbs: ['Conta', 'Perfil'] }
  }
  if (found) {
    const group = navigation.find((g) => g.items.some((i) => i.id === found.id))
    return {
      title: found.label,
      breadcrumbs: group ? [group.title, found.label] : [found.label],
    }
  }
  return { title: 'F.O.G.O.' }
}
