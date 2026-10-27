import { coordsForCadastro } from './mariliaGeo'

export type LatLng = { lat: number; lng: number }

const PROTECTED = new Set(['mapa', 'gps', 'geocodificacao', 'importado'])

const STREET_PREFIX =
  /^(rua|r|avenida|av|rodovia|rod|praca|pca|pc|travessa|tv|alameda|al|estrada|est)\s+/

/** O OpenStreetMap não acha "R." nem "Av.". A consulta usa o nome por extenso. */
export function streetQueryName(street: string): string {
  return street
    .replace(/\br\.\s*/gi, 'Rua ')
    .replace(/\bav\.\s*/gi, 'Avenida ')
    .replace(/\brod\.\s*/gi, 'Rodovia ')
    .replace(/\bpça\.?\s*/gi, 'Praça ')
    .replace(/\bal\.\s*/gi, 'Alameda ')
    .replace(/\btv\.\s*/gi, 'Travessa ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function streetKey(value: string): string {
  const folded = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(STREET_PREFIX, '')
    .trim()
    .replace(/z\b/g, 's')
  return folded
}

export function streetsMatch(stored: string, returned: string | undefined | null): boolean {
  if (!returned) return false
  const a = streetKey(stored)
  const b = streetKey(returned)
  if (a.length < 3 || b.length < 3) return false
  return a === b || a.includes(b) || b.includes(a)
}

/** O número inventado só espalha o pino ao longo da via. Não é a porta real. */
export function fractionForNumber(number: string | undefined): number {
  const n = Number.parseInt(String(number ?? '').replace(/\D/g, ''), 10)
  if (!Number.isFinite(n)) return 0.5
  return 0.04 + 0.92 * ((Math.abs(n) % 4000) / 4000)
}

function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * 111_320
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

export function pointAlongLine(line: LatLng[], fraction: number): LatLng | null {
  if (line.length === 0) return null
  if (line.length === 1) return line[0]!
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const d = metersBetween(line[i - 1]!, line[i]!)
    lengths.push(d)
    total += d
  }
  if (total <= 0) return line[0]!
  let remain = Math.min(1, Math.max(0, fraction)) * total
  for (let i = 1; i < line.length; i++) {
    const d = lengths[i - 1]!
    if (remain <= d || i === line.length - 1) {
      const f = d === 0 ? 0 : Math.min(1, remain / d)
      const prev = line[i - 1]!
      const next = line[i]!
      return { lat: prev.lat + (next.lat - prev.lat) * f, lng: prev.lng + (next.lng - prev.lng) * f }
    }
    remain -= d
  }
  return line[line.length - 1]!
}

type GeoJson = { type?: string; coordinates?: unknown }

function pushPairs(out: LatLng[], coords: unknown) {
  if (!Array.isArray(coords)) return
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const lng = Number(pair[0])
    const lat = Number(pair[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng })
  }
}

export function lineFromGeoJson(geo: unknown): LatLng[] {
  if (!geo || typeof geo !== 'object') return []
  const g = geo as GeoJson
  if (g.type === 'LineString') {
    const out: LatLng[] = []
    pushPairs(out, g.coordinates)
    return out
  }
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
    const out: LatLng[] = []
    for (const line of g.coordinates) pushPairs(out, line)
    return out
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const out: LatLng[] = []
    pushPairs(out, g.coordinates[0])
    return out
  }
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    const out: LatLng[] = []
    const first = (g.coordinates[0] as unknown[] | undefined)?.[0]
    pushPairs(out, first)
    return out
  }
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const out: LatLng[] = []
    pushPairs(out, [g.coordinates])
    return out
  }
  return []
}

export function isProtectedCoord(origin: string | undefined): boolean {
  return origin != null && PROTECTED.has(origin)
}

export function matchesGuess(
  id: string,
  region: string,
  loc: { street?: string; number?: string; neighborhood?: string; lat?: number; lng?: number },
): boolean {
  if (loc.lat == null || loc.lng == null) return false
  const guess = coordsForCadastro({
    id,
    street: loc.street,
    number: loc.number,
    neighborhood: loc.neighborhood,
    region,
  })
  return Math.abs(guess.lat - loc.lat) < 0.00005 && Math.abs(guess.lng - loc.lng) < 0.00005
}

/** Coordenada chutada ou ausente, com rua gravada. Ponto de mapa, GPS ou geocodificação fica quieto. */
export function needsStreetPlacement(
  id: string,
  region: string,
  loc: { street?: string; number?: string; neighborhood?: string; lat?: number; lng?: number; coordOrigin?: string; coordPrecisionM?: number } | null | undefined,
): boolean {
  if (!loc?.street?.trim()) return false
  if (isProtectedCoord(loc.coordOrigin)) return false
  if (loc.lat == null || loc.lng == null) return true
  if (loc.coordOrigin === 'cadastro' && loc.coordPrecisionM === 25) return true
  return matchesGuess(id, region, loc)
}
