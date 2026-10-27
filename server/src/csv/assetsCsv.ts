import { isDegradationLevel } from '../../../src/lib/assetLifecycle.js'
import type { UrbanAsset } from '../types.js'

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

function escapeCsv(val: string): string {
  if (val.includes('"') || val.includes(',') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

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
        .map((v) => escapeCsv(v))
        .join(','),
    )
  }
  return lines.join('\n')
}

function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export type AssetCsvRow = Partial<UrbanAsset> & { name: string; category: string; region: string }

export function parseAssetsCsv(text: string): AssetCsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = parseLine(lines[0]!).map((h) => h.trim())
  const rows: AssetCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]!)
    const rec: Record<string, string> = {}
    header.forEach((h, idx) => {
      rec[h] = cols[idx]?.trim() ?? ''
    })
    if (!rec.name || !rec.category || !rec.region) continue
    rows.push({
      id: rec.id || undefined,
      name: rec.name,
      category: rec.category,
      region: rec.region,
      status: (rec.status as UrbanAsset['status']) || 'operacional',
      health: rec.health ? Number(rec.health) : 100,
      mapX: rec.mapX ? Number(rec.mapX) : undefined,
      mapY: rec.mapY ? Number(rec.mapY) : undefined,
      patrimonyCode: rec.patrimonyCode || undefined,
      serialNumber: rec.serialNumber || undefined,
      manufacturer: rec.manufacturer || undefined,
      model: rec.model || undefined,
      address: rec.address || undefined,
      connectivityStatus: (rec.connectivityStatus as UrbanAsset['connectivityStatus']) || undefined,
      cadastralStatus: (rec.cadastralStatus as UrbanAsset['cadastralStatus']) || undefined,
      criticality: (rec.criticality as UrbanAsset['criticality']) || undefined,
      responsibleOrg: rec.responsibleOrg || undefined,
      responsibleTeam: rec.responsibleTeam || undefined,
      notes: rec.notes || undefined,
      subtype: rec.subtype || undefined,
      acquiredAt: rec.acquiredAt || undefined,
      installedAt: rec.installedAt || undefined,
      lastVerifiedAt: rec.lastVerifiedAt || undefined,
      maintenanceIntervalDays: rec.maintenanceIntervalDays ? Number(rec.maintenanceIntervalDays) : undefined,
      maintenanceNextDue: rec.maintenanceNextDue || undefined,
      maintenanceLastDone: rec.maintenanceLastDone || undefined,
      usefulLifeMonths:
        rec.usefulLifeMonths && Number.isFinite(Number(rec.usefulLifeMonths)) && Number(rec.usefulLifeMonths) > 0
          ? Number(rec.usefulLifeMonths)
          : undefined,
      degradationLevel: isDegradationLevel(rec.degradationLevel) ? rec.degradationLevel : undefined,
    })
  }
  return rows
}

export function assetCsvTemplate(): string {
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
