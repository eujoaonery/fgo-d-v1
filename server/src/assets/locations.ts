import { latLngToMapPercent, roundCoord, validateCoordinates } from '../../../src/lib/mariliaGeo.js'
import { parseMapMunicipality, type MapBBox, type MapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { enrichAssetLocation, parseAssetLocation } from '../../../src/lib/mariliaAddresses.js'
import type { FogoDb } from '../supabase.js'
import type { AssetLiveLocation, AssetLocation, UrbanAsset } from '../types.js'

export function locationForUpsert(asset: UrbanAsset, area?: MapMunicipality | null): AssetLocation {
  const parsed = parseAssetLocation(asset.location)
  const loc = enrichAssetLocation(parsed ?? { cep: '', neighborhood: '', city: 'Marília', uf: 'SP', street: '', number: '' }, {
    id: asset.id,
    category: asset.category,
    region: asset.region,
    placeMissing: false,
  })
  if (loc.lat != null && loc.lng != null) {
    const check = validateCoordinates(loc.lat, loc.lng, area?.bbox, area ? `${area.name}/${area.uf}` : undefined)
    if (!check.ok) throw new Error(check.error)
  }
  return loc
}

export function percentsFromLocation(loc: AssetLocation, bbox?: MapBBox): { x: number; y: number } | null {
  if (loc.lat == null || loc.lng == null) return null
  return latLngToMapPercent(loc.lat, loc.lng, bbox)
}

export async function listLatestLiveLocations(db: FogoDb): Promise<Record<string, AssetLiveLocation>> {
  const { data, error } = await db.supabase
    .from('asset_location_events')
    .select('asset_external_id, lat, lng, recorded_at, source, accuracy_m')
    .eq('organization_id', db.orgId)
    .order('recorded_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  const out: Record<string, AssetLiveLocation> = {}
  for (const row of data ?? []) {
    const id = row.asset_external_id as string
    if (out[id]) continue
    out[id] = {
      lat: Number(row.lat),
      lng: Number(row.lng),
      recordedAt: row.recorded_at,
      source: row.source ?? 'gps',
      accuracyM: row.accuracy_m != null ? Number(row.accuracy_m) : undefined,
    }
  }
  return out
}

export async function insertLocationEvent(
  db: FogoDb,
  assetId: string,
  body: { lat: number; lng: number; source?: string; accuracyM?: number },
): Promise<AssetLiveLocation> {
  const area = parseMapMunicipality(db.tenant?.settings)
  const check = validateCoordinates(body.lat, body.lng, area?.bbox, area ? `${area.name}/${area.uf}` : undefined)
  if (!check.ok) throw new Error(check.error)
  const { data, error } = await db.supabase
    .from('asset_location_events')
    .insert({
      organization_id: db.orgId,
      asset_external_id: assetId,
      lat: roundCoord(body.lat),
      lng: roundCoord(body.lng),
      source: body.source ?? 'gps',
      accuracy_m: body.accuracyM ?? null,
    })
    .select('lat, lng, recorded_at, source, accuracy_m')
    .single()
  if (error) throw error
  return {
    lat: Number(data.lat),
    lng: Number(data.lng),
    recordedAt: data.recorded_at,
    source: data.source,
    accuracyM: data.accuracy_m != null ? Number(data.accuracy_m) : undefined,
  }
}

export async function listLocationEvents(db: FogoDb, assetId: string): Promise<AssetLiveLocation[]> {
  const { data, error } = await db.supabase
    .from('asset_location_events')
    .select('lat, lng, recorded_at, source, accuracy_m')
    .eq('organization_id', db.orgId)
    .eq('asset_external_id', assetId)
    .order('recorded_at', { ascending: false })
    .limit(40)
  if (error) throw error
  return (data ?? []).map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    recordedAt: row.recorded_at,
    source: row.source ?? 'gps',
    accuracyM: row.accuracy_m != null ? Number(row.accuracy_m) : undefined,
  }))
}

/** Não grava coordenada estimada. Ativo sem latitude e longitude permanece sem ponto no mapa. */
export async function ensureAssetGeocodes(_db: FogoDb) {
  return
}
