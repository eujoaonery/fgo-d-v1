import type { CadastralStatus, UrbanAsset } from '../types.js'
import type { FogoDb } from '../db.js'
import { generatedSignalOrigin } from '../dataOrigin.js'
import { insertActivity, nextCounter, upsertAlert, MONITORING_ALERT_SOURCE } from '../repository.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'

const QUIET_CADASTRE = new Set<CadastralStatus>(['nao_instalado', 'desativado', 'baixado', 'furtado'])

export function assetMayRaiseOccurrence(asset: {
  status?: string | null
  cadastralStatus?: string | null
}): boolean {
  if (asset.status === 'inativo') return false
  if (asset.cadastralStatus && QUIET_CADASTRE.has(asset.cadastralStatus as CadastralStatus)) return false
  return true
}

/** Transição que deve abrir ocorrência. Inativo nunca entra. */
export function assetProblemTransition(
  before: Pick<UrbanAsset, 'status' | 'cadastralStatus' | 'connectivityStatus'> | undefined,
  after: Pick<UrbanAsset, 'status' | 'cadastralStatus' | 'connectivityStatus'>,
): 'alerta' | 'mau_funcionamento' | 'sem_comunicacao' | null {
  if (!assetMayRaiseOccurrence(after)) return null
  if (!before) return null
  if (before.status !== 'alerta' && after.status === 'alerta') return 'alerta'
  if (before.cadastralStatus !== 'mau_funcionamento' && after.cadastralStatus === 'mau_funcionamento') {
    return 'mau_funcionamento'
  }
  const prev = before.connectivityStatus
  const next = after.connectivityStatus
  if (prev !== 'sem_comunicacao' && next === 'sem_comunicacao') return 'sem_comunicacao'
  return null
}

export function monitorShouldRaiseOccurrence(opts: {
  state: string
  status?: string | null
  cadastralStatus?: string | null
  onlyIcmpFailure: boolean
}): boolean {
  if (!assetMayRaiseOccurrence(opts)) return false
  if (opts.state !== 'unavailable' && opts.state !== 'degraded' && opts.state !== 'stale') return false
  if (opts.state === 'unavailable' && opts.onlyIcmpFailure) return false
  return true
}

export function occurrenceCopy(kind: 'alerta' | 'mau_funcionamento' | 'sem_comunicacao' | 'monitor', name: string, detail?: string) {
  if (kind === 'alerta') {
    return {
      title: `Ocorrência: ${name} entrou em alerta`,
      description: `${name} passou a indicar falha. Alerta de ocorrência acionado.`,
      severity: 'alta' as const,
    }
  }
  if (kind === 'mau_funcionamento') {
    return {
      title: `Ocorrência: ${name} em mau funcionamento`,
      description: `${name} foi registrado em mau funcionamento. Alerta de ocorrência acionado.`,
      severity: 'alta' as const,
    }
  }
  if (kind === 'sem_comunicacao') {
    return {
      title: `Ocorrência: ${name} sem comunicação`,
      description: `${name} deixou de comunicar. Alerta de ocorrência acionado.`,
      severity: 'média' as const,
    }
  }
  return {
    title: `Ocorrência: ${name} com falha de monitoramento`,
    description: detail?.trim() || `${name} falhou na verificação. Alerta de ocorrência acionado.`,
    severity: 'alta' as const,
  }
}

const RULE: Record<'alerta' | 'mau_funcionamento' | 'sem_comunicacao' | 'monitor', (id: string) => string> = {
  alerta: (id) => `asset.status:${id}`,
  mau_funcionamento: (id) => `asset.cadastro:${id}`,
  sem_comunicacao: (id) => `asset.link:${id}`,
  monitor: (id) => `asset.monitor:${id}`,
}

export async function openAssetProblemOccurrence(
  db: FogoDb,
  asset: Pick<UrbanAsset, 'id' | 'name' | 'category' | 'region' | 'status' | 'cadastralStatus' | 'dataOrigin'>,
  kind: 'alerta' | 'mau_funcionamento' | 'sem_comunicacao' | 'monitor',
  detail?: string,
): Promise<boolean> {
  if (!assetMayRaiseOccurrence(asset)) return false
  const rule = RULE[kind](asset.id)
  const { data: assetRow } = await db.supabase
    .from('assets')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('external_id', asset.id)
    .maybeSingle()
  if (assetRow?.id) {
    const { data: open } = await db.supabase
      .from('alerts')
      .select('state, rule')
      .eq('organization_id', db.orgId)
      .eq('related_asset_id', assetRow.id)
      .eq('rule', rule)
      .limit(8)
    if ((open ?? []).some((row) => isOccurrencePending(String(row.state ?? '')))) return false
  }
  const copy = occurrenceCopy(kind, asset.name, detail)
  const n = await nextCounter(db, 'alert')
  const id = `ALT-${2800 + n}`
  await upsertAlert(db, {
    id,
    category: asset.category || 'Manutenção',
    severity: copy.severity,
    title: copy.title,
    description: copy.description,
    source: MONITORING_ALERT_SOURCE,
    dataOrigin: generatedSignalOrigin(db, asset.dataOrigin),
    relatedAssetId: asset.id,
    region: asset.region,
    detectedAt: new Date().toISOString(),
    state: 'novo',
    rule,
  })
  await insertActivity(db, {
    id: `EVT-${id}`,
    timestamp: new Date().toISOString(),
    message: `${copy.title}. Alerta de ocorrência acionado.`,
    kind: 'alert',
    dataOrigin: generatedSignalOrigin(db, asset.dataOrigin),
  })
  return true
}
