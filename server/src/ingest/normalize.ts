import { createHash } from 'node:crypto'

export const MAX_INGEST_BYTES = 64 * 1024

export type NormalizedEvent = {
  eventType: string
  assetExternalId: string | null
  occurredAt: string
  payload: Record<string, unknown>
  quality: 'conhecida' | 'dispositivo_desconhecido' | 'invalida' | 'desatualizada'
  metric?: { name: string; value: number | null; unit?: string | null }
}

export type IngestValidation =
  | { ok: true; hash: string; normalized: NormalizedEvent }
  | { ok: false; error: string }

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v }
}

export function payloadSize(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function ignoreExternalTenantId(body: unknown): void {
  if (body && typeof body === 'object') {
    delete (body as Record<string, unknown>).tenant_id
    delete (body as Record<string, unknown>).tenantId
    delete (body as Record<string, unknown>).organizationId
    delete (body as Record<string, unknown>).organization_id
  }
}

export function validateAndNormalize(input: {
  payload: unknown
  eventType: string
  assetExternalId?: string | null
  occurredAt?: string | null
  metric?: { name: string; value: number | null; unit?: string | null }
  knownAsset: boolean
  staleAfterMs?: number
  nowMs?: number
}): IngestValidation {
  if (payloadSize(input.payload) > MAX_INGEST_BYTES) {
    return { ok: false, error: 'Payload excede o limite de 64 KiB.' }
  }
  const rec = asRecord(input.payload)
  ignoreExternalTenantId(rec)
  const occurredRaw = input.occurredAt ?? (typeof rec.occurredAt === 'string' ? rec.occurredAt : typeof rec.ts === 'string' ? rec.ts : null)
  const occurredAt = occurredRaw && !Number.isNaN(Date.parse(occurredRaw)) ? new Date(occurredRaw).toISOString() : new Date().toISOString()
  const nowMs = input.nowMs ?? Date.now()
  const staleAfterMs = input.staleAfterMs ?? 30 * 60_000
  let quality: NormalizedEvent['quality'] = 'conhecida'
  if (!input.knownAsset && (input.assetExternalId || rec.assetId || rec.deviceId)) {
    quality = 'dispositivo_desconhecido'
  }
  if (nowMs - Date.parse(occurredAt) > staleAfterMs) quality = 'desatualizada'
  if (input.metric && input.metric.value != null && !Number.isFinite(input.metric.value)) {
    return { ok: false, error: 'Valor numérico da métrica é inválido.' }
  }
  return {
    ok: true,
    hash: hashPayload(rec),
    normalized: {
      eventType: input.eventType || 'ingest.event',
      assetExternalId: input.assetExternalId ?? (typeof rec.assetId === 'string' ? rec.assetId : typeof rec.deviceId === 'string' ? rec.deviceId : null),
      occurredAt,
      payload: rec,
      quality,
      metric: input.metric,
    },
  }
}
