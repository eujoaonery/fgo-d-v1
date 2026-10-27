import { MARILIA_BOUNDS, MARILIA_CENTER } from './mariliaGeo'

export type MapBBox = {
  north: number
  south: number
  east: number
  west: number
}

/** Município escolhido no provisionamento. Ausente nas cidades já criadas. */
export type MapMunicipality = {
  ibgeId: number
  name: string
  uf: string
  lat: number
  lng: number
  bbox: MapBBox
}

export type MapFrame = {
  lat: number
  lng: number
  bounds: MapBBox
  zoom: number
  minZoom: number
  label: string
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function bboxOf(value: unknown): MapBBox | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const north = num(raw.north)
  const south = num(raw.south)
  const east = num(raw.east)
  const west = num(raw.west)
  if (north == null || south == null || east == null || west == null) return null
  if (south >= north || west >= east) return null
  const latSpan = north - south
  const lngSpan = east - west
  if (latSpan < 0.02 || lngSpan < 0.02 || latSpan > 12 || lngSpan > 12) return null
  return { north, south, east, west }
}

export function parseMapMunicipality(settings: unknown): MapMunicipality | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const raw = (settings as Record<string, unknown>).mapMunicipality
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const ibgeId = num(obj.ibgeId)
  const lat = num(obj.lat)
  const lng = num(obj.lng)
  const bbox = bboxOf(obj.bbox)
  const name = typeof obj.name === 'string' ? obj.name.trim() : ''
  const uf = typeof obj.uf === 'string' ? obj.uf.trim().toUpperCase() : ''
  if (ibgeId == null || !Number.isInteger(ibgeId) || ibgeId < 1_000_000 || ibgeId > 9_999_999) return null
  if (name.length < 2 || name.length > 80 || !/^[A-Z]{2}$/.test(uf)) return null
  if (lat == null || lng == null || lat < -34 || lat > 6 || lng < -74 || lng > -28) return null
  if (!bbox) return null
  if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return null
  return { ibgeId, name, uf, lat, lng, bbox }
}

/** Sem município gravado, o mapa continua no recorte de Marília. */
export function mapViewOf(home: MapMunicipality | null | undefined): MapFrame {
  if (!home) {
    return {
      lat: MARILIA_CENTER.lat,
      lng: MARILIA_CENTER.lng,
      bounds: MARILIA_BOUNDS,
      zoom: 12,
      minZoom: 12,
      label: 'Marília',
    }
  }
  const span = Math.max(home.bbox.north - home.bbox.south, home.bbox.east - home.bbox.west)
  const zoom = span > 1.5 ? 9 : span > 0.8 ? 10 : span > 0.4 ? 11 : 12
  return {
    lat: home.lat,
    lng: home.lng,
    bounds: home.bbox,
    zoom,
    minZoom: Math.min(zoom, Math.max(8, zoom - 1)),
    label: home.name,
  }
}
