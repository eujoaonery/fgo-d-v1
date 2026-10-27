import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSecrets } from '../connectors/store.js'
import { allowPrivateTargets, runAdapter } from '../connectors/registry.js'
import { sanitizeLogObject, sanitizeLogText } from '../connectors/sanitize.js'
import { clampTimeout } from '../connectors/timeout.js'
import type { CheckRecord, ConnectorRecord } from '../connectors/types.js'
import { computeMonitorState, type CheckOutcome } from './state.js'

export async function persistCheckRun(
  supabase: SupabaseClient,
  orgId: string,
  checkId: string,
  result: {
    ok: boolean
    result: string
    latencyMs?: number | null
    packetLoss?: number | null
    httpStatus?: number | null
    tlsOk?: boolean | null
    detail?: Record<string, unknown>
    error?: string | null
  },
) {
  const now = new Date().toISOString()
  await supabase.from('monitoring_check_runs').insert({
    organization_id: orgId,
    check_id: checkId,
    started_at: now,
    finished_at: now,
    ok: result.ok,
    result: result.result,
    latency_ms: result.latencyMs ?? null,
    packet_loss: result.packetLoss ?? null,
    http_status: result.httpStatus ?? null,
    tls_ok: result.tlsOk ?? null,
    detail: sanitizeLogObject(result.detail ?? {}),
    error: result.error ? sanitizeLogText(result.error) : null,
    data_origin: 'integracao',
  })
  await supabase.from('monitoring_checks').update({ last_run_at: now, updated_at: now }).eq('id', checkId)
}

export async function executeCheck(
  supabase: SupabaseClient,
  orgId: string,
  orgSlug: string,
  check: CheckRecord,
  connector: ConnectorRecord | null,
  actorIsPlatformAdmin: boolean,
) {
  const config = { ...(connector?.config ?? {}), ...check.config }
  const fakeConnector: ConnectorRecord = connector ?? {
    id: check.id,
    organizationId: orgId,
    kind: check.kind as ConnectorRecord['kind'],
    name: check.name,
    description: null,
    status: 'configured',
    health: 'unknown',
    config,
    secretId: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    metrics: {},
    adapterVersion: '1',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasSecret: false,
  }
  const secrets = await loadSecrets(supabase, orgId, fakeConnector.secretId)
  const result = await runAdapter('execute', { ...fakeConnector, config, kind: check.kind as ConnectorRecord['kind'] }, {
    organizationId: orgId,
    orgSlug,
    secrets,
    allowPrivate: check.kind === 'icmp' || allowPrivateTargets(actorIsPlatformAdmin, config),
  })
  await persistCheckRun(supabase, orgId, check.id, result)
  if (check.assetExternalId) {
    await recomputeAssetState(supabase, orgId, check.assetExternalId, {
      failThreshold: Number(config.failThreshold ?? (check.kind === 'icmp' ? 2 : 3)),
      staleAfterMs: Number(config.staleAfterMs ?? 15 * 60_000),
    })
    if (check.kind === 'icmp') {
      try {
        const { applyIcmpCheckOutcome } = await import('./icmpAvailability.js')
        await applyIcmpCheckOutcome(supabase, orgId, check.assetExternalId, config, result.ok)
      } catch (e) {
        console.error('[fogo] icmp alert', e instanceof Error ? e.message : e)
      }
    }
  }
  return result
}

export async function recomputeAssetState(
  supabase: SupabaseClient,
  orgId: string,
  assetExternalId: string,
  opts?: { failThreshold?: number; staleAfterMs?: number },
) {
  const { data: asset } = await supabase
    .from('assets')
    .select('external_id, cadastral_status')
    .eq('organization_id', orgId)
    .eq('external_id', assetExternalId)
    .maybeSingle()
  if (!asset) return

  const { data: checks } = await supabase
    .from('monitoring_checks')
    .select('id, kind')
    .eq('organization_id', orgId)
    .eq('asset_external_id', assetExternalId)

  const checkIds = (checks ?? []).map((c) => c.id as string)
  let runs: { ok: boolean; result: string; finished_at: string | null; kind?: string; check_id: string }[] = []
  if (checkIds.length) {
    const { data } = await supabase
      .from('monitoring_check_runs')
      .select('ok, result, finished_at, check_id')
      .eq('organization_id', orgId)
      .in('check_id', checkIds)
      .order('finished_at', { ascending: false })
      .limit(20)
    const kindByCheck = new Map((checks ?? []).map((c) => [c.id as string, String(c.kind)]))
    runs = (data ?? []).map((r) => ({
      ok: r.ok === true,
      result: String(r.result),
      finished_at: r.finished_at as string | null,
      check_id: String(r.check_id),
      kind: kindByCheck.get(String(r.check_id)),
    }))
  }

  const { data: samples } = await supabase
    .from('telemetry_samples')
    .select('occurred_at')
    .eq('organization_id', orgId)
    .eq('asset_external_id', assetExternalId)
    .order('occurred_at', { ascending: false })
    .limit(1)

  const recent: CheckOutcome[] = runs.slice(0, 8).map((r) => ({
    ok: r.ok,
    result: r.result,
    finishedAt: r.finished_at ?? new Date().toISOString(),
    kind: r.kind ?? 'unknown',
  }))
  let consecutive = 0
  for (const r of runs) {
    if (!r.ok) consecutive += 1
    else break
  }
  const lastCheckAt = runs[0]?.finished_at ?? samples?.[0]?.occurred_at ?? null
  const lastOkAt = runs.find((r) => r.ok)?.finished_at ?? null
  const computed = computeMonitorState({
    cadastral: (asset.cadastral_status as string | null) ?? null,
    consecutiveFailures: consecutive,
    failThreshold: opts?.failThreshold ?? 3,
    lastOkAt,
    lastCheckAt,
    staleAfterMs: opts?.staleAfterMs ?? 15 * 60_000,
    nowMs: Date.now(),
    recent,
  })
  await supabase.from('asset_monitor_states').upsert({
    organization_id: orgId,
    asset_external_id: assetExternalId,
    state: computed.state,
    reason: computed.reason,
    evidence: {
      lastCheckAt,
      lastOkAt,
      consecutiveFailures: consecutive,
      recent: recent.slice(0, 5),
    },
    last_check_at: lastCheckAt,
    last_ok_at: lastOkAt,
    consecutive_failures: consecutive,
    updated_at: new Date().toISOString(),
  })
  const onlyIcmpFailure = recent.length > 0 && recent.every((row) => row.ok || row.kind === 'icmp')
  if (computed.state === 'unavailable' || computed.state === 'degraded' || computed.state === 'stale') {
    try {
      const { loadOrgById } = await import('../tenant/orgs.js')
      const { dbForTenant } = await import('../supabase.js')
      const { getAssetByExternalId } = await import('../repository.js')
      const { monitorShouldRaiseOccurrence, openAssetProblemOccurrence } = await import('../assets/problemOccurrence.js')
      const tenant = await loadOrgById(supabase, orgId)
      if (!tenant) return
      const db = dbForTenant(supabase, tenant)
      const full = await getAssetByExternalId(db, assetExternalId)
      if (!full) return
      if (
        monitorShouldRaiseOccurrence({
          state: computed.state,
          status: full.status,
          cadastralStatus: full.cadastralStatus,
          onlyIcmpFailure,
        })
      ) {
        await openAssetProblemOccurrence(db, full, 'monitor', computed.reason)
      }
    } catch (e) {
      console.error('[fogo] ocorrência de monitoramento', e instanceof Error ? e.message : e)
    }
  }
}

export { clampTimeout }
