import type { FogoDb } from './db.js'
import type { Incident, UrbanAsset } from './types.js'

export function categoryToMarkerKind(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('câmera') || c.includes('camera') || c.includes('vigilân') || c.includes('radar')) return 'camera'
  if (c.includes('semáforo') || c.includes('semaforo') || c.includes('painel')) return 'semaforo'
  if (c.includes('conectividade') || c.includes('wi-fi') || c.includes('wifi')) return 'conectividade'
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
  )
    return 'movel'
  if (c.includes('sensor') || c.includes('totem') || c.includes('cancela') || c.includes('balança')) return 'sensor'
  return 'sensor'
}

export async function upsertMapMarkerForAsset(
  db: FogoDb,
  asset: UrbanAsset,
  assetUuid: string,
  mapX: number,
  mapY: number,
) {
  const externalId = `mk-${asset.id}`
  const { error } = await db.supabase.from('map_markers').upsert(
    {
      organization_id: db.orgId,
      external_id: externalId,
      kind: categoryToMarkerKind(asset.category),
      name: asset.name,
      map_x: mapX,
      map_y: mapY,
      status: asset.status,
      region: asset.region,
      updated_at: new Date().toISOString(),
      asset_id: assetUuid,
    },
    { onConflict: 'organization_id,external_id' },
  )
  if (error) throw error
}

export async function syncMapMarkerStatusForAsset(db: FogoDb, assetUuid: string, status: string) {
  await db.supabase
    .from('map_markers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('organization_id', db.orgId)
    .eq('asset_id', assetUuid)
}

export async function upsertMapMarkerForIncident(db: FogoDb, incident: Incident, mapX: number, mapY: number) {
  const externalId = `ocr-${incident.id}`
  const { error } = await db.supabase.from('map_markers').upsert(
    {
      organization_id: db.orgId,
      external_id: externalId,
      kind: 'ocorrencia',
      name: incident.description.slice(0, 80),
      map_x: mapX,
      map_y: mapY,
      status: 'aberta',
      region: incident.region,
      updated_at: new Date().toISOString(),
      incident_protocol: incident.id,
      priority: incident.priority,
    },
    { onConflict: 'organization_id,external_id' },
  )
  if (error) throw error
}

export async function removeMapMarkersForAsset(db: FogoDb, assetUuid: string) {
  await db.supabase.from('map_markers').delete().eq('organization_id', db.orgId).eq('asset_id', assetUuid)
}
