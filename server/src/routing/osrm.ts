export type LatLng = { lat: number; lng: number }

export type RouteLeg = {
  distanceMeters: number
  durationSeconds: number
  steps: { instruction: string; distanceMeters: number; durationSeconds: number }[]
}

export type StreetRoute = {
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distanceMeters: number
  durationSeconds: number
  legs: RouteLeg[]
  waypointOrder: number[]
  optimized: boolean
  provider: string
  providerVersion: string
}

const DEFAULT_OSRM = process.env.FOGO_OSRM_URL || 'https://router.project-osrm.org'
let lastOsrmAt = 0

async function throttleOsrm() {
  const wait = Math.max(0, 280 - (Date.now() - lastOsrmAt))
  if (wait) await new Promise((r) => setTimeout(r, wait))
  lastOsrmAt = Date.now()
}

function coordPath(points: LatLng[]) {
  return points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
}

async function osrmGet(path: string): Promise<unknown> {
  await throttleOsrm()
  const url = `${DEFAULT_OSRM.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FOGO-CCO/1.0 (rotas-operacionais)' },
  })
  if (!res.ok) {
    throw new Error(`Serviço de roteamento indisponível (HTTP ${res.status}).`)
  }
  return res.json()
}

type OsrmRoute = {
  distance: number
  duration: number
  geometry?: { type: string; coordinates?: [number, number][] }
  legs?: Array<{
    distance: number
    duration: number
    steps?: Array<{ name?: string; maneuver?: { modifier?: string; type?: string }; distance?: number; duration?: number }>
  }>
}

function mapRoute(row: OsrmRoute, waypointOrder: number[], optimized: boolean): StreetRoute {
  const coords = (row.geometry?.coordinates ?? []).filter((c) => Array.isArray(c) && c.length >= 2) as [number, number][]
  if (coords.length < 2) {
    throw new Error('O serviço de roteamento não devolveu geometria viária.')
  }
  return {
    geometry: { type: 'LineString', coordinates: coords },
    distanceMeters: Math.round(row.distance),
    durationSeconds: Math.round(row.duration),
    legs: (row.legs ?? []).map((leg) => ({
      distanceMeters: Math.round(leg.distance),
      durationSeconds: Math.round(leg.duration),
      steps: (leg.steps ?? []).slice(0, 40).map((s) => ({
        instruction: [s.maneuver?.type, s.maneuver?.modifier, s.name].filter(Boolean).join(' ') || 'seguir',
        distanceMeters: Math.round(s.distance ?? 0),
        durationSeconds: Math.round(s.duration ?? 0),
      })),
    })),
    waypointOrder,
    optimized,
    provider: 'osrm',
    providerVersion: DEFAULT_OSRM.includes('project-osrm') ? 'public-demo' : 'self-host',
  }
}

export async function routeAlongStreets(points: LatLng[]): Promise<StreetRoute> {
  if (points.length < 2) throw new Error('São necessários origem e ao menos um destino.')
  const json = (await osrmGet(
    `/route/v1/driving/${coordPath(points)}?overview=full&geometries=geojson&steps=true`,
  )) as { code?: string; routes?: OsrmRoute[] }
  if (json.code !== 'Ok' || !json.routes?.[0]) {
    throw new Error('Não foi possível calcular o trajeto pelas ruas.')
  }
  return mapRoute(json.routes[0], points.map((_, i) => i), false)
}

export async function tripOptimize(points: LatLng[]): Promise<StreetRoute> {
  if (points.length < 2) throw new Error('São necessários origem e ao menos um destino.')
  if (points.length === 2) return routeAlongStreets(points)
  const json = (await osrmGet(
    `/trip/v1/driving/${coordPath(points)}?source=first&roundtrip=false&overview=full&geometries=geojson&steps=true`,
  )) as { code?: string; trips?: OsrmRoute[]; waypoints?: Array<{ waypoint_index?: number }> }
  if (json.code !== 'Ok' || !json.trips?.[0]) {
    throw new Error('Não foi possível otimizar a sequência de paradas.')
  }
  const order = (json.waypoints ?? []).map((w) => Number(w.waypoint_index ?? 0))
  return mapRoute(json.trips[0], order, true)
}
