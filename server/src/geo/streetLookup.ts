import { MARILIA_BOUNDS, isUrbanMarilia, validateCoordinates } from '../../../src/lib/mariliaGeo.js'
import { lineFromGeoJson, streetQueryName, streetsMatch, type LatLng } from '../../../src/lib/streetPlacement.js'

export type StreetHit = {
  road: string
  line: LatLng[]
}

const VIEWBOX = `${MARILIA_BOUNDS.west},${MARILIA_BOUNDS.north},${MARILIA_BOUNDS.east},${MARILIA_BOUNDS.south}`
const cache = new Map<string, StreetHit | null>()
let lastCall = 0

async function pause() {
  const wait = 1100 - (Date.now() - lastCall)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCall = Date.now()
}

type NominatimRow = {
  lat?: string
  lon?: string
  geojson?: unknown
  address?: { road?: string; pedestrian?: string; city?: string; town?: string; municipality?: string }
}

async function search(query: string, retry = true): Promise<NominatimRow[]> {
  await pause()
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('viewbox', VIEWBOX)
  url.searchParams.set('bounded', '1')
  url.searchParams.set('q', query)
  const res = await fetch(url, { headers: { 'User-Agent': 'FOGO-CCO/1.0 (prefeitura-marilia)' } })
  if (res.status === 429 && retry) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return search(query, false)
  }
  if (!res.ok) return []
  return (await res.json()) as NominatimRow[]
}

function hitFromRows(street: string, rows: NominatimRow[]): StreetHit | null {
  for (const row of rows) {
    const road = row.address?.road || row.address?.pedestrian
    if (!streetsMatch(street, road)) continue
    const place = row.address?.city || row.address?.town || row.address?.municipality || ''
    if (place && !place.toLowerCase().includes('mar')) continue
    const line = lineFromGeoJson(row.geojson)
    const lat = Number(row.lat)
    const lng = Number(row.lon)
    const trace = line.length >= 2 ? line : Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : []
    const inside = trace.filter((p) => validateCoordinates(p.lat, p.lng).ok && isUrbanMarilia(p.lat, p.lng))
    if (inside.length === 0 || !road) continue
    return { road, line: inside }
  }
  return null
}

/** Uma consulta por rua e bairro. Sem correspondência de nome, devolve nulo. */
export async function lookupStreet(street: string, neighborhood: string): Promise<StreetHit | null> {
  const key = `${street.trim().toLowerCase()}|${neighborhood.trim().toLowerCase()}`
  if (cache.has(key)) return cache.get(key) ?? null
  const name = streetQueryName(street)
  const specific = await search(`${name}, ${neighborhood}, Marília, SP`)
  let hit = hitFromRows(street, specific)
  if (!hit) {
    const broad = await search(`${name}, Marília, SP`)
    hit = hitFromRows(street, broad)
  }
  cache.set(key, hit)
  return hit
}
