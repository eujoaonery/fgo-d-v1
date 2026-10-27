import type { SourceMeta } from '../../../src/lib/strategy.js'
import type { AlphaCityGeo } from '../../../src/lib/prometheusAlpha.js'
import { cacheWrap } from './cache.js'
import { asArray, asNum, asRecord, asStr, fetchJson } from './httpFetch.js'

export type OsmWay = {
  id: string
  name: string
  highway: string
  lat?: number
  lng?: number
}

export type OsmSnapshot = {
  ways: OsmWay[]
  source: SourceMeta
  attribution: string
}

const ATTRIBUTION = '© colaboradores do OpenStreetMap (ODbL).'

export async function loadNamedWays(geo: AlphaCityGeo, limit = 40): Promise<OsmSnapshot> {
  const { south, west, north, east } = geo.bbox
  const cap = Math.min(80, Math.max(8, limit))
  const query = `[out:json][timeout:8];way["highway"~"primary|secondary|tertiary"]["name"](${south},${west},${north},${east});out tags center ${cap};`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  return cacheWrap(`osm:${south}:${west}:${north}:${east}:${limit}`, 24 * 3600_000, async () => {
    const res = await fetchJson(url, { timeoutMs: 10_000 })
    if (!res.ok) {
      return {
        ways: [],
        source: {
          key: 'osm-overpass',
          label: 'OpenStreetMap',
          status: 'unavailable',
          origin: 'Overpass API',
          lastUpdatedAt: null,
          note: `Consulta geográfica indisponível (${res.error}). Vias do cadastro FOGO continuam válidas. ${ATTRIBUTION}`,
        },
        attribution: ATTRIBUTION,
      }
    }
    const elements = asArray(asRecord(res.data)?.elements)
    const ways: OsmWay[] = []
    for (const el of elements) {
      const rec = asRecord(el)
      if (!rec) continue
      const tags = asRecord(rec.tags) ?? {}
      const name = asStr(tags.name)
      if (!name) continue
      const center = asRecord(rec.center)
      ways.push({
        id: `way/${asStr(rec.id)}`,
        name,
        highway: asStr(tags.highway),
        lat: asNum(center?.lat) ?? undefined,
        lng: asNum(center?.lon) ?? undefined,
      })
      if (ways.length >= limit) break
    }
    return {
      ways,
      source: {
        key: 'osm-overpass',
        label: 'OpenStreetMap',
        status: ways.length ? 'ok' : 'empty',
        origin: 'Overpass API / OSM',
        lastUpdatedAt: new Date().toISOString(),
        note: `Nomes de vias para contexto geográfico — não evidência de tráfego. ${ATTRIBUTION}`,
      },
      attribution: ATTRIBUTION,
    }
  })
}
