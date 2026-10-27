/** Georreferência de Marília/SP para cadastro e mapa operacional (§6.1.2). */

export const MARILIA_CENTER = { lat: -22.2139, lng: -49.9456 }

/** Envelope municipal para validar coordenadas, incluindo o norte urbano (Dirceu). */
export const MARILIA_BOUNDS = {
  south: -22.36,
  north: -22.08,
  west: -50.10,
  east: -49.80,
}

export type LocationType = 'ponto_fixo' | 'base' | 'trecho' | 'area' | 'recurso_movel'
export type CoordOrigin = 'cadastro' | 'mapa' | 'geocodificacao' | 'gps' | 'importado'
export type LocationReferenceKind = 'numero' | 'oposto_numero' | 'quilometro' | 'sem_numero' | 'ponto_conhecido'

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  ponto_fixo: 'Ponto fixo',
  base: 'Base',
  trecho: 'Trecho',
  area: 'Área',
  recurso_movel: 'Recurso móvel',
}

export const COORD_ORIGIN_LABELS: Record<CoordOrigin, string> = {
  cadastro: 'Cadastro (endereço)',
  mapa: 'Ponto no mapa',
  geocodificacao: 'Geocodificação sugerida',
  gps: 'GPS',
  importado: 'Importado',
}

export const REFERENCE_KIND_LABELS: Record<LocationReferenceKind, string> = {
  numero: 'Número',
  oposto_numero: 'Oposto ao número',
  quilometro: 'Quilômetro',
  sem_numero: 'Sem número',
  ponto_conhecido: 'Ponto conhecido',
}

type Anchor = { lat: number; lng: number; headingDeg: number }

/** Âncoras reais de logradouros de Marília (WGS84). Heading aproxima o eixo da via. */
const STREET_ANCHORS: Record<string, Anchor> = {
  'Av. Sampaio Vidal': { lat: -22.2132, lng: -49.9478, headingDeg: 82 },
  'R. Nove de Julho': { lat: -22.2172, lng: -49.9464, headingDeg: 175 },
  'Av. Brasil': { lat: -22.2208, lng: -49.9472, headingDeg: 95 },
  'R. São Luiz': { lat: -22.2156, lng: -49.9448, headingDeg: 10 },
  'Praça da República': { lat: -22.2139, lng: -49.9456, headingDeg: 0 },
  'R. San Francisco': { lat: -22.2148, lng: -49.9432, headingDeg: 90 },
  'Av. República': { lat: -22.2124, lng: -49.9441, headingDeg: 70 },
  'R. Coroados': { lat: -22.2164, lng: -49.9496, headingDeg: 100 },
  'R. Dona Maria Ortiz': { lat: -22.2196, lng: -49.9492, headingDeg: 95 },
  'Av. Nelson Garla': { lat: -22.2214, lng: -49.9508, headingDeg: 15 },
  'R. Bahia': { lat: -22.2188, lng: -49.9516, headingDeg: 175 },
  'R. Ceará': { lat: -22.2202, lng: -49.9524, headingDeg: 175 },
  'Av. Castro Alves': { lat: -22.1978, lng: -49.9396, headingDeg: 40 },
  'Av. Santo Antônio': { lat: -22.2046, lng: -49.9312, headingDeg: 55 },
  'R. Cândido de Almeida': { lat: -22.1934, lng: -49.9418, headingDeg: 120 },
  'Av. das Esmeraldas': { lat: -22.2012, lng: -49.9248, headingDeg: 75 },
  'Av. Tiradentes': { lat: -22.1896, lng: -49.9482, headingDeg: 8 },
  'R. das Acácias': { lat: -22.1868, lng: -49.9526, headingDeg: 95 },
  'R. dos Ipês': { lat: -22.1884, lng: -49.9558, headingDeg: 95 },
  'Av. Eliezer Rocha': { lat: -22.170175, lng: -49.974919, headingDeg: 35 },
  'R. das Magnólias': { lat: -22.1664, lng: -49.9772, headingDeg: 100 },
  'R. das Hortências Norte': { lat: -22.1678, lng: -49.9734, headingDeg: 12 },
  'Av. Oswaldo Fanceli': { lat: -22.16022, lng: -49.97498, headingDeg: 80 },
  'R. dos Cravos': { lat: -22.1594, lng: -49.9731, headingDeg: 15 },
  'R. Santa Antonieta': { lat: -22.16233, lng: -49.96547, headingDeg: 95 },
  'Av. Padre Nóbrega': { lat: -22.1576, lng: -49.9718, headingDeg: 70 },
  'Rod. Comandante João Ribeiro de Barros': { lat: -22.1618, lng: -49.9684, headingDeg: 85 },
  'R. Jardim Ohara': { lat: -22.19717, lng: -49.96342, headingDeg: 100 },
  'Av. Rio Branco': { lat: -22.2324, lng: -49.9486, headingDeg: 170 },
  'R. das Palmeiras': { lat: -22.2348, lng: -49.9512, headingDeg: 95 },
  'R. Amazonas': { lat: -22.2108, lng: -49.9214, headingDeg: 15 },
  'Av. das Indústrias': { lat: -22.2416, lng: -49.9568, headingDeg: 130 },
  'R. dos Metalúrgicos': { lat: -22.2442, lng: -49.9594, headingDeg: 40 },
  'R. do Túnel': { lat: -22.2388, lng: -49.9532, headingDeg: 80 },
  'Av. Lácio': { lat: -22.2074, lng: -49.9168, headingDeg: 70 },
  'R. das Hortênsias': { lat: -22.2096, lng: -49.9118, headingDeg: 100 },
  'R. Projetada Leste': { lat: -22.2118, lng: -49.9086, headingDeg: 15 },
  'Av. Campos Sales': { lat: -22.2176, lng: -49.9684, headingDeg: 100 },
  'R. das Flores': { lat: -22.2162, lng: -49.9722, headingDeg: 8 },
  'R. Campos Salles': { lat: -22.2194, lng: -49.9706, headingDeg: 95 },
  'Av. Oeste': { lat: -22.2148, lng: -49.9784, headingDeg: 175 },
  'R. da Cascata': { lat: -22.2268, lng: -49.9762, headingDeg: 40 },
  'R. São Paulo': { lat: -22.2234, lng: -49.9738, headingDeg: 95 },
  'Terminal Urbano': { lat: -22.2186, lng: -49.9438, headingDeg: 0 },
  'Parque das Esmeraldas': { lat: -22.2032, lng: -49.9224, headingDeg: 0 },
  'Parque Linear': { lat: -22.2062, lng: -49.9146, headingDeg: 70 },
  'Orla Leste': { lat: -22.2088, lng: -49.9054, headingDeg: 20 },
  'Distrito Industrial': { lat: -22.2438, lng: -49.9582, headingDeg: 0 },
  'Túnel Rio Verde': { lat: -22.2372, lng: -49.9524, headingDeg: 80 },
  'Cruzamento escolar': { lat: -22.2218, lng: -49.9746, headingDeg: 0 },
  'Ponte Oeste': { lat: -22.2154, lng: -49.9822, headingDeg: 95 },
}

const NEIGHBORHOOD_ANCHORS: Record<string, Anchor> = {
  Centro: { lat: -22.2139, lng: -49.9456, headingDeg: 0 },
  'Alto Cafezal': { lat: -22.2204, lng: -49.9502, headingDeg: 0 },
  Fragata: { lat: -22.1964, lng: -49.9368, headingDeg: 0 },
  'Jardim Araxá': { lat: -22.1882, lng: -49.9524, headingDeg: 0 },
  'Jardim Julieta': { lat: -22.16599, lng: -49.97564, headingDeg: 0 },
  'Oswaldo Fanceli': { lat: -22.16022, lng: -49.97498, headingDeg: 0 },
  'Vila Santa Antonieta': { lat: -22.16233, lng: -49.96547, headingDeg: 0 },
  'Padre Nóbrega': { lat: -22.1558, lng: -49.9712, headingDeg: 0 },
  'Jardim Ohara': { lat: -22.19717, lng: -49.96342, headingDeg: 0 },
  'Jardim América': { lat: -22.2346, lng: -49.9498, headingDeg: 0 },
  'Distrito Industrial': { lat: -22.2438, lng: -49.9582, headingDeg: 0 },
  'Parque das Esmeraldas': { lat: -22.2032, lng: -49.9224, headingDeg: 0 },
  'Nova Marília': { lat: -22.2094, lng: -49.9108, headingDeg: 0 },
  'São Paulo': { lat: -22.2168, lng: -49.9716, headingDeg: 0 },
  Cascata: { lat: -22.2258, lng: -49.9754, headingDeg: 0 },
}

const REGION_ANCHORS: Record<string, Anchor> = {
  Centro: NEIGHBORHOOD_ANCHORS.Centro!,
  'Zona Norte': NEIGHBORHOOD_ANCHORS.Fragata!,
  'Zona Sul': NEIGHBORHOOD_ANCHORS['Jardim América']!,
  Leste: NEIGHBORHOOD_ANCHORS['Parque das Esmeraldas']!,
  Oeste: NEIGHBORHOOD_ANCHORS['São Paulo']!,
}

export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Malha contínua da cidade. Fora disso o pino cai em sítio ou em outro município. */
export const MARILIA_URBAN_RADIUS_M = 8_000

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111_320
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

export function isUrbanMarilia(lat: number, lng: number): boolean {
  return distanceMeters(MARILIA_CENTER, { lat, lng }) <= MARILIA_URBAN_RADIUS_M
}

export function nearestNeighborhood(lat: number, lng: number): string {
  let best = 'Centro'
  let bestD = Infinity
  for (const [name, anchor] of Object.entries(NEIGHBORHOOD_ANCHORS)) {
    const d = distanceMeters({ lat, lng }, anchor)
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  return best
}

export function offsetMeters(lat: number, lng: number, eastM: number, northM: number): { lat: number; lng: number } {
  const dLat = northM / 111_320
  const dLng = eastM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

function alongStreet(anchor: Anchor, meters: number): { lat: number; lng: number } {
  const rad = (anchor.headingDeg * Math.PI) / 180
  return offsetMeters(anchor.lat, anchor.lng, Math.sin(rad) * meters, Math.cos(rad) * meters)
}

export function findStreetAnchor(street: string | undefined | null): Anchor | undefined {
  if (!street) return undefined
  const f = street
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  return Object.entries(STREET_ANCHORS).find(([name]) => {
    const n = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    return f.includes(n) || n.includes(f)
  })?.[1]
}

function clampToCity(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.min(MARILIA_BOUNDS.north - 0.002, Math.max(MARILIA_BOUNDS.south + 0.002, lat)),
    lng: Math.min(MARILIA_BOUNDS.east - 0.002, Math.max(MARILIA_BOUNDS.west + 0.002, lng)),
  }
}

export function coordsForCadastro(input: {
  id?: string
  street?: string
  number?: string
  neighborhood?: string
  region?: string
}): { lat: number; lng: number } {
  const n = Number.parseInt(String(input.number ?? '').replace(/\D/g, ''), 10)
  const jitter = hash32(`${input.id ?? ''}|${input.street ?? ''}|${input.number ?? ''}`)
  const along = (Number.isFinite(n) ? ((n % 2400) - 200) * 1.15 : 0) + (jitter % 260) - 130
  const side = ((jitter % 23) - 11) * 9
  const street = findStreetAnchor(input.street)
  const base =
    street ??
    NEIGHBORHOOD_ANCHORS[input.neighborhood ?? ''] ??
    REGION_ANCHORS[input.region ?? ''] ??
    STREET_ANCHORS['Praça da República']!
  const alongPt = alongStreet(base, along)
  const raw = offsetMeters(alongPt.lat, alongPt.lng, side, 0)
  return clampToCity(raw.lat, raw.lng)
}

export function validateCoordinates(
  lat: number,
  lng: number,
  bounds?: { south: number; north: number; west: number; east: number },
  place?: string,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Latitude e longitude precisam ser números.' }
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: 'Coordenada fora do intervalo geodésico (WGS84).' }
  }
  const box = bounds ?? MARILIA_BOUNDS
  if (lat < box.south || lat > box.north || lng < box.west || lng > box.east) {
    if (!bounds) return { ok: false, error: 'A coordenada fica fora do município de Marília/SP.' }
    const where = place ? `de ${place}` : 'do município do mapa'
    return { ok: false, error: `A coordenada fica fora ${where}.` }
  }
  return { ok: true }
}

export function mapPercentToLatLng(x: number, y: number): { lat: number; lng: number } {
  const { south, north, west, east } = MARILIA_BOUNDS
  return {
    lat: north - (y / 100) * (north - south),
    lng: west + (x / 100) * (east - west),
  }
}

export function latLngToMapPercent(
  lat: number,
  lng: number,
  bounds?: { south: number; north: number; west: number; east: number },
): { x: number; y: number } {
  const { south, north, west, east } = bounds ?? MARILIA_BOUNDS
  const x = ((lng - west) / (east - west)) * 100
  const y = ((north - lat) / (north - south)) * 100
  return {
    x: Math.round(Math.min(96, Math.max(4, x)) * 10) / 10,
    y: Math.round(Math.min(96, Math.max(4, y)) * 10) / 10,
  }
}

export function defaultLocationType(category: string): LocationType {
  const c = category.toLowerCase()
  if (
    c.includes('viatura') ||
    c.includes('patinete') ||
    c.includes('motocicleta') ||
    c.includes('autônomo') ||
    c.includes('autonomo') ||
    c.includes('transporte') ||
    c.includes('ônibus') ||
    c.includes('onibus') ||
    c.includes('frota')
  ) {
    return 'recurso_movel'
  }
  return 'ponto_fixo'
}

export function isMobileLocationType(t: LocationType | undefined): boolean {
  return t === 'recurso_movel'
}

export function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
