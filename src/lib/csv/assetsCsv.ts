import type { UrbanAsset } from '@/types'
import { escapeCsv } from '@/lib/csv/escape'

const HEADERS = [
  'id',
  'name',
  'category',
  'region',
  'status',
  'health',
  'mapX',
  'mapY',
  'patrimonyCode',
  'serialNumber',
  'manufacturer',
  'model',
  'address',
  'connectivityStatus',
  'cadastralStatus',
  'criticality',
  'responsibleOrg',
  'responsibleTeam',
  'notes',
  'subtype',
  'acquiredAt',
  'installedAt',
  'lastVerifiedAt',
  'maintenanceIntervalDays',
  'maintenanceNextDue',
  'maintenanceLastDone',
  'usefulLifeMonths',
  'degradationLevel',
] as const

export function assetsToCsv(assets: UrbanAsset[]): string {
  const lines = [HEADERS.join(',')]
  for (const a of assets) {
    lines.push(
      [
        a.id,
        a.name,
        a.category,
        a.region,
        a.status,
        String(a.health),
        a.mapX != null ? String(a.mapX) : '',
        a.mapY != null ? String(a.mapY) : '',
        a.patrimonyCode ?? '',
        a.serialNumber ?? '',
        a.manufacturer ?? '',
        a.model ?? '',
        a.address ?? '',
        a.connectivityStatus ?? '',
        a.cadastralStatus ?? '',
        a.criticality ?? '',
        a.responsibleOrg ?? '',
        a.responsibleTeam ?? '',
        a.notes ?? '',
        a.subtype ?? '',
        a.acquiredAt ?? '',
        a.installedAt ?? '',
        a.lastVerifiedAt ?? '',
        a.maintenanceIntervalDays != null ? String(a.maintenanceIntervalDays) : '',
        a.maintenanceNextDue ?? '',
        a.maintenanceLastDone ?? '',
        a.usefulLifeMonths != null ? String(a.usefulLifeMonths) : '',
        a.degradationLevel ?? '',
      ]
        .map((v) => escapeCsv(String(v)))
        .join(','),
    )
  }
  return lines.join('\n')
}

export function assetCsvTemplateRow(): string {
  return assetsToCsv([
    {
      id: 'CAM-9001',
      name: 'Exemplo câmera',
      category: 'Câmera de vigilância',
      region: 'Centro',
      status: 'operacional',
      health: 100,
      lastSeen: new Date().toISOString(),
      mapX: 50,
      mapY: 40,
    },
  ])
}
