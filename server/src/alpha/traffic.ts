import type { SourceMeta } from '../../../src/lib/strategy.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'

export type TrafficEvent = {
  id: string
  title: string
  kind: string
  lat?: number
  lng?: number
  region?: string
  observedAt: string
  speedKmh?: number
  confidence?: number | null
  provider: string
}

export type TrafficSnapshot = {
  events: TrafficEvent[]
  source: SourceMeta
}

export interface TrafficProvider {
  id: string
  label: string
  load(geo: AlphaCityGeo): Promise<TrafficSnapshot>
}

class UnavailableTrafficProvider implements TrafficProvider {
  id = 'none'
  label = 'Nenhum provedor de tráfego'
  async load(): Promise<TrafficSnapshot> {
    return {
      events: [],
      source: {
        key: 'traffic-external',
        label: 'Feed externo de trânsito',
        status: 'unavailable',
        origin: 'não integrada',
        lastUpdatedAt: null,
        note: 'Nenhum provedor de tráfego autorizado está configurado. Não há scraping nem endpoints privados. Análise de trânsito fica indisponível.',
      },
    }
  }
}

const registry = new Map<string, TrafficProvider>()
registry.set('none', new UnavailableTrafficProvider())

export function registerTrafficProvider(provider: TrafficProvider) {
  registry.set(provider.id, provider)
}

export function listTrafficProviders(): { id: string; label: string }[] {
  return [...registry.values()].map((p) => ({ id: p.id, label: p.label }))
}

export async function loadTraffic(geo: AlphaCityGeo): Promise<TrafficSnapshot> {
  const id = (process.env.FOGO_TRAFFIC_PROVIDER || 'none').trim() || 'none'
  const provider = registry.get(id) ?? registry.get('none')!
  return provider.load(geo)
}
