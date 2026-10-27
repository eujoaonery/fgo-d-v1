import type { AlertSeverity, IncidentPriority, UrbanAsset } from '../types.js'

export const REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste'] as const

export const TEAMS = [
  'Equipe Sinalização A',
  'Equipe Sinalização B',
  'Equipe CFTV Norte',
  'Equipe CFTV Sul',
  'Equipe Conectividade',
  'Equipe Sensores Ambientais',
  'Plantão CCO',
] as const

export const STREETS = [
  'Av. Central',
  'Av. Norte',
  'Av. Rio Verde',
  'R. das Flores',
  'Terminal Rodoviário',
  'Parque Linear',
  'Praça da República',
  'Viaduto Sul',
  'Cruzamento escolar Oeste',
  'Túnel Rio Verde',
] as const

interface AlertTemplate {
  category: string
  severity: AlertSeverity
  title: string
  description: (ctx: TemplateCtx) => string
  rule: string
  weight: number
  /** Só amarra equipamento quando o alerta é do ativo. Via, chuva e trânsito ficam sem ativo. */
  bindsAsset: boolean
}

interface IncidentTemplate {
  type: string
  description: (ctx: TemplateCtx) => string
  priority: IncidentPriority
  location: (ctx: TemplateCtx) => string
  weight: number
}

export interface TemplateCtx {
  region: string
  street: string
  asset?: UrbanAsset
  hour: number
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function buildCtx(assets: UrbanAsset[]): TemplateCtx {
  const region = pick(REGIONS)
  const street = pick(STREETS)
  const regionalAssets = assets.filter((a) => a.region === region)
  const asset = regionalAssets.length ? pick(regionalAssets) : pick(assets)
  return { region, street, asset, hour: new Date().getHours() }
}

export const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    category: 'Comunicação',
    severity: 'alta',
    title: 'Devido à perda de comunicação, semáforo sem resposta',
    description: (c) =>
      `Devido à perda de comunicação, semáforo ${c.asset?.id ?? ''} sem resposta em ${c.street} (${c.region}).`,
    rule: 'asset.offline_threshold',
    weight: 3,
    bindsAsset: true,
  },
  {
    category: 'CFTV',
    severity: 'média',
    title: 'Devido à falha de stream, câmera sem imagem',
    description: (c) =>
      `Devido à falha de stream, câmera ${c.asset?.name ?? ''} sem imagem (${c.region}).`,
    rule: 'camera.no_frame',
    weight: 4,
    bindsAsset: true,
  },
  {
    category: 'Trânsito',
    severity: 'crítica',
    title: 'Devido a acidente, obstrução de via',
    description: (c) =>
      `Devido a acidente, obstrução de via em ${c.street} (${c.region}). Encaminhar equipe de trânsito.`,
    rule: 'traffic.road_obstruction',
    weight: 2,
    bindsAsset: false,
  },
  {
    category: 'Trânsito',
    severity: 'alta',
    title: 'Devido a cabos na pista, obstrução de via',
    description: (c) => `Devido a cabos na pista, obstrução de via em ${c.street} (${c.region}). Encaminhar equipe de trânsito.`,
    rule: 'traffic.cables_on_road',
    weight: 2,
    bindsAsset: false,
  },
  {
    category: 'Trânsito',
    severity: 'alta',
    title: 'Devido a congestionamento, via lenta',
    description: (c) => `Devido a congestionamento, via lenta em ${c.street} (${c.region}). Encaminhar equipe de trânsito.`,
    rule: 'traffic.jam',
    weight: 2,
    bindsAsset: false,
  },
  {
    category: 'Trânsito',
    severity: 'alta',
    title: 'Guarda de trânsito em ocorrência de via',
    description: (c) =>
      `Guarda de trânsito acionada em ${c.street} (${c.region}) por bloqueio parcial da pista.`,
    rule: 'traffic.guard',
    weight: 3,
    bindsAsset: false,
  },
  {
    category: 'Guarda municipal',
    severity: 'média',
    title: 'Guarda municipal em ocorrência',
    description: (c) =>
      `Guarda municipal acionada em ${c.street} (${c.region}) para apoio à ordem pública.`,
    rule: 'guard.municipal',
    weight: 3,
    bindsAsset: false,
  },
  {
    category: 'Polícia',
    severity: 'alta',
    title: 'Polícia militar em ocorrência',
    description: (c) =>
      `Polícia militar acionada em ${c.street} (${c.region}) para ocorrência em via pública.`,
    rule: 'police.support',
    weight: 3,
    bindsAsset: false,
  },
  {
    category: 'Sensores',
    severity: 'alta',
    title: 'Devido a falha no equipamento, radar sem leitura',
    description: (c) =>
      `Devido a falha no equipamento, radar ${c.asset?.name ?? c.asset?.id ?? ''} sem leitura em ${c.region}.`,
    rule: 'radar.fault',
    weight: 2,
    bindsAsset: true,
  },
  {
    category: 'Ambiental',
    severity: 'alta',
    title: 'Devido a nível crítico no sensor, risco de alagamento',
    description: (c) =>
      `Devido a nível crítico no sensor ${c.asset?.id ?? ''}, risco de alagamento próximo a ${c.street} (${c.region}).`,
    rule: 'flood.sensor_threshold',
    weight: 1.5,
    bindsAsset: true,
  },
  {
    category: 'Conectividade',
    severity: 'baixa',
    title: 'Devido à latência alta, o Wi-Fi público ficou instável',
    description: (c) =>
      `Devido à latência alta, o ponto ${c.asset?.id ?? ''} ficou instável (${c.region}).`,
    rule: 'wifi.latency_sla',
    weight: 3,
    bindsAsset: true,
  },
  {
    category: 'Operação',
    severity: 'informativa',
    title: 'Devido ao aumento de eventos, a região pode sobrecarregar',
    description: (c) => `Devido ao aumento de eventos, ${c.region} pode sobrecarregar na última hora.`,
    rule: 'region.event_burst',
    weight: 2,
    bindsAsset: false,
  },
  {
    category: 'Manutenção',
    severity: 'média',
    title: 'Devido ao vencimento próximo, a preventiva pode atrasar',
    description: (c) =>
      `Devido ao vencimento próximo, a preventiva de ${c.asset?.name ?? 'ativo'} pode atrasar.`,
    rule: 'maintenance.due_soon',
    weight: 2,
    bindsAsset: true,
  },
]

export const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  {
    type: 'Semáforos',
    description: (c) => `Semáforo intermitente — ${c.street}`,
    priority: 'alta',
    location: (c) => `${c.street} × entorno`,
    weight: 2,
  },
  {
    type: 'Câmeras',
    description: (c) => `Câmera sem imagem — ${c.asset?.name ?? c.street}`,
    priority: 'média',
    location: (c) => c.street,
    weight: 3,
  },
  {
    type: 'Sensores',
    description: (c) => `Sensor offline ou leitura inválida (${c.region})`,
    priority: 'crítica',
    location: (c) => c.street,
    weight: 1.5,
  },
  {
    type: 'Conectividade',
    description: (c) => `Queda parcial de conectividade — ${c.region}`,
    priority: 'média',
    location: (c) => c.street,
    weight: 2,
  },
  {
    type: 'Painéis',
    description: (c) => `Painel LED com falha de segmento (${c.street})`,
    priority: 'baixa',
    location: (c) => c.street,
    weight: 1,
  },
  {
    type: 'Trânsito',
    description: (c) => `Congestionamento atípico reportado — ${c.street}`,
    priority: 'média',
    location: (c) => `${c.street}, ${c.region}`,
    weight: 2.5,
  },
]

export function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]!
}

/** Rush hours slightly increase traffic/signal events */
export function rushMultiplier(hour: number): number {
  if (hour >= 7 && hour <= 9) return 1.4
  if (hour >= 17 && hour <= 19) return 1.5
  if (hour >= 22 || hour <= 5) return 0.6
  return 1
}
