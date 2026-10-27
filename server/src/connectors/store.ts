import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from '../httpError.js'
import { sanitizeLogText } from './sanitize.js'
import { decryptSecret, encryptSecret, secretsConfigured } from './secrets.js'
import {
  CONNECTOR_KINDS,
  type ConnectorKind,
  type ConnectorRecord,
  type CheckRecord,
  type ConnectorHealth,
} from './types.js'

type Row = Record<string, unknown>

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function mapConnector(row: Row): ConnectorRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    kind: row.kind as ConnectorKind,
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    status: (row.status as ConnectorRecord['status']) ?? 'draft',
    health: (row.health as ConnectorHealth) ?? 'unknown',
    config: asObj(row.config),
    secretId: (row.secret_id as string | null) ?? null,
    lastAttemptAt: (row.last_attempt_at as string | null) ?? null,
    lastSuccessAt: (row.last_success_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    metrics: asObj(row.metrics),
    adapterVersion: String(row.adapter_version ?? '1'),
    enabled: row.enabled === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasSecret: Boolean(row.secret_id),
  }
}

export function mapCheck(row: Row): CheckRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    assetExternalId: (row.asset_external_id as string | null) ?? null,
    connectorId: (row.connector_id as string | null) ?? null,
    kind: String(row.kind),
    name: String(row.name),
    config: asObj(row.config),
    enabled: row.enabled === true,
    lastRunAt: (row.last_run_at as string | null) ?? null,
  }
}

export async function listConnectors(supabase: SupabaseClient, orgId: string): Promise<ConnectorRecord[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((r) => mapConnector(r as Row))
}

export async function getConnector(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
): Promise<ConnectorRecord | null> {
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  return data ? mapConnector(data as Row) : null
}

export async function findWebhookByPublicId(
  supabase: SupabaseClient,
  publicId: string,
): Promise<ConnectorRecord | null> {
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('kind', 'webhook_in')
    .eq('enabled', true)
    .filter('config->>publicId', 'eq', publicId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  return data ? mapConnector(data as Row) : null
}

export async function loadSecrets(
  supabase: SupabaseClient,
  orgId: string,
  secretId: string | null,
): Promise<Record<string, string>> {
  if (!secretId) return {}
  const { data, error } = await supabase
    .from('connector_secrets')
    .select('id, ciphertext, organization_id')
    .eq('id', secretId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data?.ciphertext) return {}
  try {
    return decryptSecret(String(data.ciphertext))
  } catch {
    throw new HttpError(500, 'Não foi possível abrir o cofre de credenciais deste conector.', 'SECRET_DECRYPT')
  }
}

export async function saveSecrets(
  supabase: SupabaseClient,
  orgId: string,
  secretId: string | null,
  secrets: Record<string, string>,
): Promise<string> {
  if (!secretsConfigured()) {
    throw new HttpError(
      503,
      'Defina FOGO_CONNECTOR_SECRET_KEY para gravar credenciais de conectores.',
      'SECRETS_KEY_MISSING',
    )
  }
  const ciphertext = encryptSecret(secrets)
  if (secretId) {
    const { error } = await supabase
      .from('connector_secrets')
      .update({ ciphertext, updated_at: new Date().toISOString() })
      .eq('id', secretId)
      .eq('organization_id', orgId)
    if (error) throw new HttpError(500, error.message)
    return secretId
  }
  const id = randomUUID()
  const { error } = await supabase.from('connector_secrets').insert({
    id,
    organization_id: orgId,
    ciphertext,
  })
  if (error) throw new HttpError(500, error.message)
  return id
}

function defaultConfigFor(kind: ConnectorKind): Record<string, unknown> {
  if (kind === 'webhook_in') {
    return { publicId: randomUUID(), auth: 'bearer', eventType: 'telemetry' }
  }
  return {}
}

export async function createConnector(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    kind: string
    name: string
    description?: string | null
    config?: Record<string, unknown>
    enabled?: boolean
    secrets?: Record<string, string>
    createdBy?: string | null
  },
): Promise<ConnectorRecord> {
  if (!CONNECTOR_KINDS.includes(input.kind as ConnectorKind)) {
    throw new HttpError(400, 'Tipo de conector não suportado.')
  }
  const kind = input.kind as ConnectorKind
  const config = { ...defaultConfigFor(kind), ...(input.config ?? {}) }
  let secretId: string | null = null
  if (input.secrets && Object.keys(input.secrets).length) {
    secretId = await saveSecrets(supabase, orgId, null, input.secrets)
  }
  const { data, error } = await supabase
    .from('connectors')
    .insert({
      organization_id: orgId,
      kind,
      name: input.name.trim(),
      description: input.description ?? null,
      status: secretId || Object.keys(config).length ? 'configured' : 'draft',
      config,
      secret_id: secretId,
      enabled: input.enabled === true,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw new HttpError(500, error.message)
  return mapConnector(data as Row)
}

export async function updateConnector(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  patch: {
    name?: string
    description?: string | null
    config?: Record<string, unknown>
    enabled?: boolean
    status?: ConnectorRecord['status']
    secrets?: Record<string, string>
  },
): Promise<ConnectorRecord> {
  const current = await getConnector(supabase, orgId, id)
  if (!current) throw new HttpError(404, 'Conector não encontrado.')
  let secretId = current.secretId
  if (patch.secrets && Object.keys(patch.secrets).length) {
    secretId = await saveSecrets(supabase, orgId, current.secretId, patch.secrets)
  }
  const nextConfig = patch.config ? { ...current.config, ...patch.config } : current.config
  const { data, error } = await supabase
    .from('connectors')
    .update({
      name: patch.name?.trim() ?? current.name,
      description: patch.description === undefined ? current.description : patch.description,
      config: nextConfig,
      enabled: patch.enabled ?? current.enabled,
      status: patch.status ?? (patch.enabled === false ? 'paused' : current.status),
      secret_id: secretId,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new HttpError(500, error.message)
  return mapConnector(data as Row)
}

export async function deleteConnector(supabase: SupabaseClient, orgId: string, id: string): Promise<void> {
  const { error } = await supabase.from('connectors').delete().eq('organization_id', orgId).eq('id', id)
  if (error) throw new HttpError(500, error.message)
}

export async function touchConnector(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  result: { ok: boolean; error?: string | null; metrics?: Record<string, unknown> },
): Promise<void> {
  const now = new Date().toISOString()
  const health: ConnectorHealth = result.ok ? 'healthy' : 'down'
  await supabase
    .from('connectors')
    .update({
      last_attempt_at: now,
      last_success_at: result.ok ? now : undefined,
      last_error: result.ok ? null : sanitizeLogText(result.error ?? 'falha', 240),
      health,
      status: result.ok ? 'active' : 'error',
      metrics: result.metrics ?? {},
      updated_at: now,
    })
    .eq('organization_id', orgId)
    .eq('id', id)
}

export async function listChecks(supabase: SupabaseClient, orgId: string): Promise<CheckRecord[]> {
  const { data, error } = await supabase
    .from('monitoring_checks')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((r) => mapCheck(r as Row))
}

export async function createCheck(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    name: string
    kind: string
    assetExternalId?: string | null
    connectorId?: string | null
    config?: Record<string, unknown>
    enabled?: boolean
  },
): Promise<CheckRecord> {
  const { data, error } = await supabase
    .from('monitoring_checks')
    .insert({
      organization_id: orgId,
      name: input.name.trim(),
      kind: input.kind,
      asset_external_id: input.assetExternalId ?? null,
      connector_id: input.connectorId ?? null,
      config: input.config ?? {},
      enabled: input.enabled === true,
    })
    .select('*')
    .single()
  if (error) throw new HttpError(500, error.message)
  return mapCheck(data as Row)
}

export async function updateCheck(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  patch: Partial<{ name: string; config: Record<string, unknown>; enabled: boolean; assetExternalId: string | null }>,
): Promise<CheckRecord> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.config !== undefined) update.config = patch.config
  if (patch.enabled !== undefined) update.enabled = patch.enabled
  if (patch.assetExternalId !== undefined) update.asset_external_id = patch.assetExternalId
  const { data, error } = await supabase
    .from('monitoring_checks')
    .update(update)
    .eq('organization_id', orgId)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new HttpError(500, error.message)
  return mapCheck(data as Row)
}

export async function deleteCheck(supabase: SupabaseClient, orgId: string, id: string): Promise<void> {
  const { error } = await supabase.from('monitoring_checks').delete().eq('organization_id', orgId).eq('id', id)
  if (error) throw new HttpError(500, error.message)
}

export async function listDueChecks(supabase: SupabaseClient, limit = 40): Promise<CheckRecord[]> {
  const { data, error } = await supabase
    .from('monitoring_checks')
    .select('*')
    .eq('enabled', true)
    .order('last_run_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((r) => mapCheck(r as Row))
}

export async function listEnabledConnectorsByKind(
  supabase: SupabaseClient,
  kind: ConnectorKind,
): Promise<ConnectorRecord[]> {
  const { data, error } = await supabase.from('connectors').select('*').eq('kind', kind).eq('enabled', true)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((r) => mapConnector(r as Row))
}
