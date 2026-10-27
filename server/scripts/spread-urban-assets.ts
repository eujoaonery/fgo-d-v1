import '../src/loadEnv.js'
import { createFogoClient } from '../src/supabase.js'
import { blankAssetLocation, formatAssetAddress, parseAssetLocation } from '../src/data/mariliaAddresses.js'
import {
  isUrbanMarilia,
  latLngToMapPercent,
  nearestNeighborhood,
  offsetMeters,
  roundCoord,
} from '../../src/lib/mariliaGeo.js'
import { pointAlongLine, type LatLng } from '../../src/lib/streetPlacement.js'
import { pickUrbanWay, spreadFraction, type UrbanWay } from '../../src/lib/urbanSpread.js'
import type { AssetLocation } from '../src/types.js'

const AVENUES = new Set(['primary', 'secondary', 'tertiary', 'trunk'])
const STREETS = new Set(['residential', 'unclassified', 'living_street'])

type OverpassWay = {
  tags?: { name?: string; highway?: string }
  geometry?: { lat: number; lon: number }[]
}

function lineOf(way: OverpassWay): LatLng[] {
  const line: LatLng[] = []
  for (const point of way.geometry ?? []) {
    if (isUrbanMarilia(point.lat, point.lon)) line.push({ lat: point.lat, lng: point.lon })
  }
  return line
}

function lengthMeters(line: LatLng[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const dLat = (line[i]!.lat - line[i - 1]!.lat) * 111_320
    const dLng = (line[i]!.lng - line[i - 1]!.lng) * 103_000
    total += Math.hypot(dLat, dLng)
  }
  return total
}

async function loadUrbanWays(): Promise<UrbanWay[]> {
  const query = `
[out:json][timeout:90];
way["highway"~"^(primary|secondary|tertiary|trunk|residential|unclassified|living_street)$"]["name"]( -22.29,-50.03,-22.14,-49.86 );
out geom;
`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'FOGO-CCO/1.0 (prefeitura-marilia)', 'Content-Type': 'text/plain' },
    body: query,
  })
  if (!res.ok) throw new Error(`Overpass respondeu ${res.status}`)
  const json = (await res.json()) as { elements?: OverpassWay[] }
  const ways: UrbanWay[] = []
  for (const way of json.elements ?? []) {
    const name = way.tags?.name?.trim()
    const highway = way.tags?.highway ?? ''
    if (!name || name.length < 4) continue
    const avenue = AVENUES.has(highway)
    if (!avenue && !STREETS.has(highway)) continue
    const line = lineOf(way)
    if (line.length < 2 || lengthMeters(line) < 120) continue
    ways.push({ name, avenue, line })
  }
  return ways
}

function beside(line: LatLng[], at: LatLng, sideM: number): LatLng {
  let nearest = 0
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const dLat = line[i]!.lat - at.lat
    const dLng = line[i]!.lng - at.lng
    const d = dLat * dLat + dLng * dLng
    if (d < best) {
      best = d
      nearest = i
    }
  }
  const a = line[Math.max(0, nearest - 1)]!
  const b = line[nearest]!
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const len = Math.hypot(dx, dy) || 1
  const east = (-dy / len) * sideM
  const north = (dx / len) * sideM
  return offsetMeters(at.lat, at.lng, east, north)
}

type Row = {
  id: string
  external_id: string
  name: string
  region: string
  location: unknown
}

function shouldMove(loc: AssetLocation | undefined): boolean {
  if (!loc) return true
  if (loc.coordOrigin === 'mapa' || loc.coordOrigin === 'gps' || loc.coordOrigin === 'importado') return false
  if (loc.numberConfirmed === true) return false
  return true
}

async function main() {
  const ways = await loadUrbanWays()
  const avenues = ways.filter((way) => way.avenue).length
  console.log(`vias urbanas: ${ways.length} (${avenues} avenidas)`)
  if (ways.length < 30) throw new Error('Malha urbana insuficiente para espalhar os ativos.')

  const { supabase } = await createFogoClient()
  const { data: org, error: orgErr } = await supabase.from('organizations').select('id').eq('slug', 'prefeitura-marilia').maybeSingle()
  if (orgErr || !org) throw orgErr ?? new Error('Cidade de demonstração não encontrada.')

  const rows: Row[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('assets')
      .select('id, external_id, name, region, location')
      .eq('organization_id', org.id)
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < pageSize) break
  }

  let moved = 0
  let kept = 0
  const used = new Set<string>()
  for (const row of rows) {
    const parsed = parseAssetLocation(row.location)
    if (!shouldMove(parsed)) {
      kept++
      continue
    }
    const loc = parsed ?? blankAssetLocation()
    const way = pickUrbanWay(row.external_id, ways, used)
    const at = way ? pointAlongLine(way.line, spreadFraction(row.external_id)) : null
    if (!way || !at) {
      kept++
      continue
    }
    const side = hashSide(row.external_id)
    const spot = beside(way.line, at, side)
    if (!isUrbanMarilia(spot.lat, spot.lng)) {
      kept++
      continue
    }
    const next: AssetLocation = {
      ...loc,
      street: way.name,
      neighborhood: nearestNeighborhood(spot.lat, spot.lng),
      city: 'Marília',
      uf: 'SP',
      lat: roundCoord(spot.lat),
      lng: roundCoord(spot.lng),
      coordOrigin: 'geocodificacao',
      coordPrecisionM: 40,
      numberConfirmed: false,
    }
    const perc = latLngToMapPercent(next.lat!, next.lng!)
    const previousStreet = loc.street
    const name =
      previousStreet && row.name.includes(previousStreet) ? row.name.replace(previousStreet, way.name) : row.name
    const { error: upErr } = await supabase
      .from('assets')
      .update({
        name,
        location: next,
        address: formatAssetAddress(next),
        map_x: perc.x,
        map_y: perc.y,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (upErr) throw upErr
    used.add(way.name)
    moved++
  }
  console.log(`espalhados ${moved} em ${used.size} vias, mantidos ${kept}`)
}

function hashSide(id: string): number {
  const n = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return n % 2 === 0 ? 12 : -12
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
