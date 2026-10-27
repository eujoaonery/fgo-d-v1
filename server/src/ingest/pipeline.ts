import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeLogObject, sanitizeLogText } from '../connectors/sanitize.js'
import type { IngestCandidate } from '../connectors/types.js'
import { enqueueJob } from './queue.js'
import { hashPayload, ignoreExternalTenantId, validateAndNormalize } from './normalize.js'

export type IngestSource = {
  organizationId: string
  connectorId: string | null
  sourceKind: string
  dataOrigin?: 'integracao' | 'real'
}

async function assetExists(supabase: SupabaseClient, orgId: string, externalId: string | null): Promise<boolean> {
  if (!externalId) return false
  const { data } = await supabase
    .from('assets')
    .select('id')
    .eq('organization_id', orgId)
    .eq('external_id', externalId)
    .maybeSingle()
  return Boolean(data?.id)
}

export async function ingestCandidates(
  supabase: SupabaseClient,
  source: IngestSource,
  candidates: IngestCandidate[],
): Promise<{ accepted: number; duplicate: number; rejected: number; ids: string[] }> {
  let accepted = 0
  let duplicate = 0
  let rejected = 0
  const ids: string[] = []
  for (const cand of candidates) {
    const payload = { ...cand.payload }
    ignoreExternalTenantId(payload)
    const known = await assetExists(supabase, source.organizationId, cand.assetExternalId ?? null)
    const validated = validateAndNormalize({
      payload,
      eventType: cand.eventType,
      assetExternalId: cand.assetExternalId,
      occurredAt: cand.occurredAt,
      metric: cand.metric,
      knownAsset: known,
    })
    if (!validated.ok) {
      rejected += 1
      await supabase.from('ingest_events').insert({
        organization_id: source.organizationId,
        connector_id: source.connectorId,
        idempotency_key: cand.idempotencyKey || hashPayload(payload),
        source_kind: source.sourceKind,
        status: 'rejected',
        payload: sanitizeLogObject(payload),
        payload_hash: hashPayload(payload),
        error: validated.error,
        data_origin: source.dataOrigin ?? 'integracao',
      })
      continue
    }
    const key = cand.idempotencyKey || validated.hash
    const insert = await supabase
      .from('ingest_events')
      .insert({
        organization_id: source.organizationId,
        connector_id: source.connectorId,
        idempotency_key: key,
        source_kind: source.sourceKind,
        status: 'queued',
        payload: sanitizeLogObject(validated.normalized.payload),
        payload_hash: validated.hash,
        data_origin: source.dataOrigin ?? 'integracao',
      })
      .select('id')
      .maybeSingle()
    if (insert.error) {
      if (insert.error.code === '23505') {
        duplicate += 1
        continue
      }
      rejected += 1
      continue
    }
    const ingestId = insert.data?.id as string
    ids.push(ingestId)
    accepted += 1
    await persistNormalized(supabase, source, ingestId, validated.normalized, known)
    await supabase.from('ingest_events').update({ status: 'processed' }).eq('id', ingestId)
  }
  return { accepted, duplicate, rejected, ids }
}

async function persistNormalized(
  supabase: SupabaseClient,
  source: IngestSource,
  ingestEventId: string,
  event: {
    eventType: string
    assetExternalId: string | null
    occurredAt: string
    payload: Record<string, unknown>
    quality: string
    metric?: { name: string; value: number | null; unit?: string | null }
  },
  knownAsset: boolean,
) {
  await supabase.from('normalized_events').insert({
    organization_id: source.organizationId,
    ingest_event_id: ingestEventId,
    asset_external_id: event.assetExternalId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    payload: event.payload,
    quality: event.quality,
    data_origin: source.dataOrigin ?? 'integracao',
    source: source.sourceKind,
  })
  if (event.metric?.name) {
    await supabase.from('telemetry_samples').insert({
      organization_id: source.organizationId,
      asset_external_id: event.assetExternalId,
      connector_id: source.connectorId,
      metric: event.metric.name,
      value: event.metric.value,
      unit: event.metric.unit ?? null,
      occurred_at: event.occurredAt,
      quality: event.quality,
      data_origin: source.dataOrigin ?? 'integracao',
      ingest_event_id: ingestEventId,
    })
  }
  if (knownAsset && event.assetExternalId) {
    await enqueueJob(supabase, {
      organizationId: source.organizationId,
      kind: 'recompute_state',
      refId: ingestEventId,
      payload: { assetExternalId: event.assetExternalId },
    })
    await enqueueJob(supabase, {
      organizationId: source.organizationId,
      kind: 'webhook_fanout',
      refId: ingestEventId,
      payload: { eventType: event.eventType, assetExternalId: event.assetExternalId },
    })
  }
}

export function idempotencyFromRequest(header: unknown, payload: unknown): string {
  const h = typeof header === 'string' ? header.trim() : Array.isArray(header) ? String(header[0] ?? '').trim() : ''
  if (h) return h.slice(0, 120)
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 40)
}

export function sanitizeIngestError(message: string): string {
  return sanitizeLogText(message)
}
