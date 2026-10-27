import { categoryHasOwnConnectivity } from '../../../src/lib/assetCatalog.js'
import type { CadastralStatus, ConnectivityStatus, DataOrigin, UrbanAsset } from '../types.js'

const CONNECTED_MS = 5 * 60_000
const LATE_MS = 30 * 60_000

const HISTORY_FIELDS: (keyof UrbanAsset)[] = [
  'name',
  'category',
  'region',
  'address',
  'location',
  'cadastralStatus',
  'patrimonyCode',
  'serialNumber',
  'manufacturer',
  'model',
  'criticality',
  'responsibleOrg',
  'responsibleTeam',
  'notes',
  'installedAt',
  'subtype',
  'acquiredAt',
  'lastVerifiedAt',
  'maintenanceIntervalDays',
  'maintenanceNextDue',
  'maintenanceLastDone',
  'maintenancePlanNotes',
  'usefulLifeMonths',
  'degradationLevel',
  'specs',
]

export function normalizeConnectivity(raw?: string | null): ConnectivityStatus {
  switch (raw) {
    case 'online':
    case 'conectado':
      return 'conectado'
    case 'degradado':
    case 'atrasado':
      return 'atrasado'
    case 'offline':
    case 'sem_comunicacao':
      return 'sem_comunicacao'
    case 'nao_aplicavel':
      return 'nao_aplicavel'
    default:
      return 'desconhecido'
  }
}

export function normalizeCadastral(raw?: string | null): CadastralStatus {
  switch (raw) {
    case 'ativo':
    case 'operacional':
      return 'operacional'
    case 'em_instalacao':
    case 'nao_instalado':
      return 'nao_instalado'
    case 'mau_funcionamento':
      return 'mau_funcionamento'
    case 'em_manutencao':
      return 'em_manutencao'
    case 'em_uso':
      return 'em_uso'
    case 'furtado':
      return 'furtado'
    case 'baixado':
      return 'baixado'
    case 'desativado':
      return 'desativado'
    default:
      return 'operacional'
  }
}

export function normalizeDataOrigin(raw?: string | null): DataOrigin {
  if (raw === 'simulado' || raw === 'real' || raw === 'integracao' || raw === 'importado' || raw === 'manual') {
    return raw
  }
  return 'manual'
}

const CAD_WITHOUT_LINK: CadastralStatus[] = ['nao_instalado', 'desativado', 'baixado', 'furtado']

/** Conectividade derivada do lastSeen — nunca altera a situação cadastral. */
export function deriveConnectivity(
  asset: Pick<UrbanAsset, 'lastSeen' | 'cadastralStatus'> & { category?: string },
): ConnectivityStatus {
  if (asset.category && !categoryHasOwnConnectivity(asset.category)) return 'nao_aplicavel'
  const cad = normalizeCadastral(asset.cadastralStatus)
  if (CAD_WITHOUT_LINK.includes(cad)) return 'nao_aplicavel'
  const t = new Date(asset.lastSeen).getTime()
  if (!Number.isFinite(t)) return 'desconhecido'
  const age = Date.now() - t
  if (age <= CONNECTED_MS) return 'conectado'
  if (age <= LATE_MS) return 'atrasado'
  return 'sem_comunicacao'
}

export const CADASTRAL_JUSTIFICATION_MIN = 8

export function cadastralStatusChanged(before?: CadastralStatus | null, after?: CadastralStatus | null): boolean {
  return normalizeCadastral(before) !== normalizeCadastral(after)
}

export function cadastralFieldDiff(before: UrbanAsset, after: UrbanAsset): string[] {
  const changed: string[] = []
  for (const key of HISTORY_FIELDS) {
    const a = JSON.stringify(before[key] ?? null)
    const b = JSON.stringify(after[key] ?? null)
    if (a !== b) changed.push(String(key))
  }
  const locA = JSON.stringify(before.location ?? null)
  const locB = JSON.stringify(after.location ?? null)
  if (locA !== locB && !changed.includes('location')) changed.push('location')
  return changed
}

export function snapshotAsset(asset: UrbanAsset): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of HISTORY_FIELDS) out[key] = asset[key] ?? null
  out.location = asset.location ?? null
  out.cadastralStatus = normalizeCadastral(asset.cadastralStatus)
  return out
}
