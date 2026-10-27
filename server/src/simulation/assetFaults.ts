import { categoryHasOwnConnectivity } from '../../../src/lib/assetCatalog.js'
import type { CadastralStatus, UrbanAsset } from '../types.js'

const QUIET: CadastralStatus[] = ['nao_instalado', 'desativado', 'baixado', 'furtado', 'em_manutencao']
const OFFLINE_MS = 45 * 60_000
const ALREADY_OFFLINE_MS = 30 * 60_000

export type GeneratorAssetFault = 'alerta' | 'mau_funcionamento' | 'sem_comunicacao'

export function assetGeneratorMayTouch(asset: Pick<UrbanAsset, 'status' | 'cadastralStatus'>): boolean {
  if (asset.status === 'inativo') return false
  if (asset.cadastralStatus && QUIET.includes(asset.cadastralStatus)) return false
  return true
}

export function faultKindForRule(rule: string): GeneratorAssetFault {
  const r = rule.toLowerCase()
  if (r.includes('offline') || r.includes('wifi') || r.includes('camera') || r.includes('no_frame')) {
    return 'sem_comunicacao'
  }
  if (r.includes('radar') || r.includes('flood') || r.includes('maintenance')) return 'mau_funcionamento'
  return 'alerta'
}

/** Aplica um problema real no ativo. Inativo e cadastro quieto não mudam. */
export function applyGeneratorFault(
  asset: UrbanAsset,
  kind: GeneratorAssetFault,
  now = Date.now(),
): UrbanAsset | null {
  if (!assetGeneratorMayTouch(asset)) return null
  if (kind === 'alerta') {
    if (asset.status === 'alerta') return null
    return {
      ...asset,
      status: 'alerta',
      health: Math.max(20, asset.health - 12),
      lastSeen: new Date(now).toISOString(),
    }
  }
  if (kind === 'mau_funcionamento') {
    if (asset.cadastralStatus === 'mau_funcionamento') return null
    return {
      ...asset,
      cadastralStatus: 'mau_funcionamento',
      health: Math.max(15, asset.health - 18),
      lastSeen: new Date(now).toISOString(),
    }
  }
  if (!categoryHasOwnConnectivity(asset.category)) return null
  const seen = new Date(asset.lastSeen).getTime()
  if (Number.isFinite(seen) && now - seen > ALREADY_OFFLINE_MS) return null
  return {
    ...asset,
    lastSeen: new Date(now - OFFLINE_MS).toISOString(),
    health: Math.max(10, asset.health - 6),
  }
}

export function firstApplicableFault(
  asset: UrbanAsset,
  preferred: GeneratorAssetFault,
  now = Date.now(),
): { asset: UrbanAsset; kind: GeneratorAssetFault } | null {
  const order: GeneratorAssetFault[] = [preferred, 'sem_comunicacao', 'mau_funcionamento', 'alerta']
  const seen = new Set<GeneratorAssetFault>()
  for (const kind of order) {
    if (seen.has(kind)) continue
    seen.add(kind)
    const next = applyGeneratorFault(asset, kind, now)
    if (next) return { asset: next, kind }
  }
  return null
}

export function recoverGeneratorFault(asset: UrbanAsset, now = Date.now()): UrbanAsset | null {
  if (!assetGeneratorMayTouch(asset)) return null
  if (asset.status === 'alerta') {
    return {
      ...asset,
      status: 'operacional',
      health: Math.min(98, asset.health + 12),
      lastSeen: new Date(now).toISOString(),
    }
  }
  if (asset.cadastralStatus === 'mau_funcionamento') {
    return {
      ...asset,
      cadastralStatus: 'operacional',
      health: Math.min(98, asset.health + 10),
      lastSeen: new Date(now).toISOString(),
    }
  }
  const seen = new Date(asset.lastSeen).getTime()
  if (categoryHasOwnConnectivity(asset.category) && Number.isFinite(seen) && now - seen > ALREADY_OFFLINE_MS) {
    return { ...asset, lastSeen: new Date(now).toISOString(), health: Math.min(98, asset.health + 4) }
  }
  return null
}

export function assetHasGeneratorFault(asset: UrbanAsset, now = Date.now()): boolean {
  if (!assetGeneratorMayTouch(asset)) return false
  if (asset.status === 'alerta' || asset.cadastralStatus === 'mau_funcionamento') return true
  const seen = new Date(asset.lastSeen).getTime()
  return categoryHasOwnConnectivity(asset.category) && Number.isFinite(seen) && now - seen > ALREADY_OFFLINE_MS
}

export function pickGeneratorAsset(assets: UrbanAsset[], prefer?: UrbanAsset): UrbanAsset | null {
  if (prefer && assetGeneratorMayTouch(prefer)) return prefer
  const pool = assets.filter(assetGeneratorMayTouch)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]!
}
