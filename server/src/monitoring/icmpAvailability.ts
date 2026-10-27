import { isSafeHostname } from '../connectors/timeout.js'
import { createCheck, listChecks, updateCheck } from '../connectors/store.js'
import { dbForTenant, type FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import { loadOrgById } from '../tenant/orgs.js'
import { getAlert, insertActivity, patchAlertState, upsertAlert } from '../repository.js'
import type { UrbanAsset } from '../types.js'

export function icmpAlertProtocol(assetExternalId: string): string {
  return `ICMP-${assetExternalId}`
}

export function icmpAlertDecision(opts: {
  ok: boolean
  consecutiveFailures: number
  failThreshold: number
  hasOpenAlert: boolean
}): 'open' | 'resolve' | 'noop' {
  if (!opts.ok && opts.consecutiveFailures >= opts.failThreshold && !opts.hasOpenAlert) return 'open'
  if (opts.ok && opts.hasOpenAlert) return 'resolve'
  return 'noop'
}

export async function applyIcmpFieldsFromBody(
  db: FogoDb,
  asset: { id: string; name: string },
  body: { icmpEnabled?: boolean; icmpHost?: string },
): Promise<void> {
  if (body.icmpEnabled === undefined && body.icmpHost === undefined) return
  const enabled = body.icmpEnabled === true
  if (enabled && !String(body.icmpHost ?? '').trim()) {
    throw new HttpError(400, 'Informe o IP ou o nome do host para o ping ICMP.')
  }
  try {
    await syncAssetIcmpMonitor(db, asset, { enabled, host: String(body.icmpHost ?? '') })
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, e instanceof Error ? e.message : 'Não foi possível configurar o ICMP.')
  }
}

export async function syncAssetIcmpMonitor(
  db: FogoDb,
  asset: { id: string; name: string },
  opts: { enabled: boolean; host: string },
): Promise<void> {
  const checks = await listChecks(db.supabase, db.orgId)
  const existing = checks.find((c) => c.kind === 'icmp' && c.assetExternalId === asset.id)
  if (!opts.enabled) {
    if (existing?.enabled) {
      await updateCheck(db.supabase, db.orgId, existing.id, { enabled: false })
    }
    return
  }
  const host = opts.host.trim()
  if (!isSafeHostname(host)) {
    throw new Error('Host ICMP inválido. Use um IP ou um nome de máquina (ex.: camera01-marilia.prefeitura.gov.br).')
  }
  const config = {
    host,
    intervalSec: 60,
    failThreshold: 2,
    timeoutMs: 4000,
    allowPrivate: true,
  }
  const name = `ICMP ${asset.name}`
  if (existing) {
    await updateCheck(db.supabase, db.orgId, existing.id, { name, enabled: true, config })
    return
  }
  await createCheck(db.supabase, db.orgId, {
    name,
    kind: 'icmp',
    assetExternalId: asset.id,
    enabled: true,
    config,
  })
}

export async function attachIcmpToAssets(db: FogoDb, assets: UrbanAsset[]): Promise<UrbanAsset[]> {
  const checks = await listChecks(db.supabase, db.orgId)
  const byAsset = new Map(
    checks
      .filter((c) => c.kind === 'icmp' && c.assetExternalId)
      .map((c) => [c.assetExternalId as string, c]),
  )
  return assets.map((a) => {
    const c = byAsset.get(a.id)
    return {
      ...a,
      icmpEnabled: c?.enabled === true,
      icmpHost: c ? String(c.config.host ?? '') : undefined,
    }
  })
}

export async function syncIcmpAvailabilityAlert(opts: {
  db: FogoDb
  assetExternalId: string
  assetName: string
  category?: string
  region?: string | null
  host: string
  ok: boolean
  consecutiveFailures: number
  failThreshold: number
}): Promise<'open' | 'resolve' | 'noop'> {
  const protocol = icmpAlertProtocol(opts.assetExternalId)
  const existing = await getAlert(opts.db, protocol)
  const hasOpenAlert = Boolean(
    existing && existing.state !== 'resolvido' && existing.state !== 'falso positivo' && existing.state !== 'os_aberta',
  )
  const action = icmpAlertDecision({
    ok: opts.ok,
    consecutiveFailures: opts.consecutiveFailures,
    failThreshold: opts.failThreshold,
    hasOpenAlert,
  })
  if (action === 'open') {
    const now = new Date().toISOString()
    await upsertAlert(opts.db, {
      id: protocol,
      category: opts.category?.trim() || 'Conectividade',
      severity: 'alta',
      title: `Ocorrência: ${opts.assetName} sem resposta ICMP`,
      description: `O equipamento ${opts.assetName} (${opts.assetExternalId}) perdeu resposta ao ping em ${opts.host}. Alerta de ocorrência acionado.`,
      source: 'Monitoramento ICMP',
      dataOrigin: 'integracao',
      relatedAssetId: opts.assetExternalId,
      region: opts.region ?? undefined,
      detectedAt: now,
      state: 'novo',
      rule: 'icmp.unavailable',
    })
    if (existing) {
      await opts.db.supabase
        .from('alerts')
        .update({
          completed_at: null,
          claimed_by: null,
          claimed_by_label: null,
          claimed_at: null,
          dispatched_at: null,
        })
        .eq('organization_id', opts.db.orgId)
        .eq('protocol', protocol)
    }
    await insertActivity(opts.db, {
      id: `EVT-${protocol}`,
      timestamp: now,
      message: `Ocorrência acionada: ${opts.assetName} perdeu resposta ICMP (${opts.host}).`,
      kind: 'alert',
      dataOrigin: 'integracao',
    })
  }
  if (action === 'resolve' && existing) {
    await patchAlertState(
      opts.db,
      protocol,
      'resolvido',
      `ICMP restabelecido em ${opts.host} — disponibilidade normalizada automaticamente.`,
      'monitoramento ICMP',
    )
    await insertActivity(opts.db, {
      id: `EVT-${protocol}-ok`,
      timestamp: new Date().toISOString(),
      message: `ICMP restabelecido: ${opts.assetName} (${opts.host}).`,
      kind: 'system',
      dataOrigin: 'integracao',
    })
  }
  return action
}

export async function applyIcmpCheckOutcome(
  supabase: FogoDb['supabase'],
  orgId: string,
  assetExternalId: string,
  checkConfig: Record<string, unknown>,
  lastOk: boolean,
): Promise<void> {
  const tenant = await loadOrgById(supabase, orgId)
  if (!tenant) return
  const db = dbForTenant(supabase, tenant)
  const { data: asset } = await supabase
    .from('assets')
    .select('external_id, name, category, region, status, cadastral_status')
    .eq('organization_id', orgId)
    .eq('external_id', assetExternalId)
    .maybeSingle()
  if (!asset) return
  if (String(asset.status ?? '') === 'inativo') return
  const cad = String(asset.cadastral_status ?? '')
  if (['nao_instalado', 'desativado', 'baixado', 'furtado'].includes(cad)) return
  const { data: state } = await supabase
    .from('asset_monitor_states')
    .select('consecutive_failures, state')
    .eq('organization_id', orgId)
    .eq('asset_external_id', assetExternalId)
    .maybeSingle()
  const failThreshold = Number(checkConfig.failThreshold ?? 2)
  const consecutive = Number(state?.consecutive_failures ?? (lastOk ? 0 : 1))
  const host = String(checkConfig.host ?? '')
  await syncIcmpAvailabilityAlert({
    db,
    assetExternalId,
    assetName: String(asset.name),
    category: String(asset.category ?? ''),
    region: (asset.region as string | null) ?? null,
    host,
    ok: lastOk,
    consecutiveFailures: consecutive,
    failThreshold: Number.isFinite(failThreshold) ? failThreshold : 2,
  })
  const canFlipStatus = cad === 'operacional' || cad === 'mau_funcionamento' || !cad
  const down = !lastOk && consecutive >= (Number.isFinite(failThreshold) ? failThreshold : 2)
  const nextStatus = lastOk ? 'operacional' : down ? 'alerta' : asset.status
  if (canFlipStatus && nextStatus && nextStatus !== asset.status) {
    await supabase
      .from('assets')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('external_id', assetExternalId)
  }
}
