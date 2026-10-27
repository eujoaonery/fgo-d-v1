import { hash32 } from './mariliaGeo'
import type { LatLng } from './streetPlacement'

export type UrbanWay = {
  name: string
  avenue: boolean
  line: LatLng[]
}

function firstFree(assetId: string, pool: UrbanWay[], used?: ReadonlySet<string>): UrbanWay | null {
  if (pool.length === 0) return null
  const start = hash32(`${assetId}|rua`) % pool.length
  if (!used) return pool[start] ?? null
  for (let i = 0; i < pool.length; i++) {
    const way = pool[(start + i) % pool.length]
    if (way && !used.has(way.name)) return way
  }
  return null
}

/** Um ativo por via, misturando avenida e rua, sem repetir o logradouro enquanto houver outro livre. */
export function pickUrbanWay(assetId: string, ways: UrbanWay[], used?: ReadonlySet<string>): UrbanWay | null {
  if (ways.length === 0) return null
  const avenues = ways.filter((way) => way.avenue)
  const streets = ways.filter((way) => !way.avenue)
  const preferAvenue = hash32(`${assetId}|via`) % 3 === 0
  const primary = preferAvenue && avenues.length > 0 ? avenues : streets.length > 0 ? streets : ways
  const secondary = primary === avenues ? streets : avenues
  return (
    firstFree(assetId, primary, used) ??
    firstFree(assetId, secondary, used) ??
    firstFree(assetId, primary)
  )
}

export function spreadFraction(assetId: string): number {
  return 0.08 + 0.84 * ((hash32(`${assetId}|trecho`) % 1000) / 1000)
}
