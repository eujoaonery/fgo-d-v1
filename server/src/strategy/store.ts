import type { FogoDb } from '../db.js'
import type {
  PrometheusBriefing,
  SnapshotDigest,
  StrategicActionRecord,
  StrategicActionStatus,
  StrategicActionType,
} from '../../../src/lib/strategy.js'
import { nextCounter } from '../repository.js'

export type StoredBriefing = {
  id: string
  generatedAt: string
  model: string | null
  contextHash: string | null
  snapshotDigest: SnapshotDigest
  context: Record<string, unknown>
  briefing: PrometheusBriefing
  stale: boolean
  error: string | null
}

function rowToAction(row: Record<string, unknown>): StrategicActionRecord {
  return {
    id: String(row.id),
    protocol: String(row.protocol),
    actionType: row.action_type as StrategicActionType,
    status: row.status as StrategicActionStatus,
    title: String(row.title),
    payload: (row.payload as Record<string, unknown>) ?? {},
    justification: String(row.justification ?? ''),
    region: String(row.region ?? ''),
    createdBy: (row.created_by as string) ?? null,
    approvedBy: (row.approved_by as string) ?? null,
    approvedAt: (row.approved_at as string) ?? null,
    executedAt: (row.executed_at as string) ?? null,
    executionResult: (row.execution_result as Record<string, unknown>) ?? null,
    linkedEntity: (row.linked_entity as string) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function loadLatestBriefing(db: FogoDb): Promise<StoredBriefing | null> {
  const { data, error } = await db.supabase
    .from('strategic_briefings')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    generatedAt: data.generated_at,
    model: data.model,
    contextHash: data.context_hash,
    snapshotDigest: data.snapshot_digest as SnapshotDigest,
    context: (data.context as Record<string, unknown>) ?? {},
    briefing: data.briefing as PrometheusBriefing,
    stale: !!data.stale,
    error: data.error,
  }
}

export async function insertBriefing(
  db: FogoDb,
  input: {
    model: string | null
    contextHash: string
    snapshotDigest: SnapshotDigest
    context: Record<string, unknown>
    briefing: PrometheusBriefing
    stale: boolean
    error: string | null
  },
): Promise<StoredBriefing> {
  const { data, error } = await db.supabase
    .from('strategic_briefings')
    .insert({
      organization_id: db.orgId,
      generated_at: new Date().toISOString(),
      model: input.model,
      context_hash: input.contextHash,
      snapshot_digest: input.snapshotDigest,
      context: input.context,
      briefing: input.briefing,
      stale: input.stale,
      error: input.error,
    })
    .select('*')
    .single()
  if (error) throw error
  return {
    id: data.id,
    generatedAt: data.generated_at,
    model: data.model,
    contextHash: data.context_hash,
    snapshotDigest: data.snapshot_digest as SnapshotDigest,
    context: (data.context as Record<string, unknown>) ?? {},
    briefing: data.briefing as PrometheusBriefing,
    stale: !!data.stale,
    error: data.error,
  }
}

export async function listStrategicActions(db: FogoDb): Promise<StrategicActionRecord[]> {
  const { data, error } = await db.supabase
    .from('strategic_actions')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) throw error
  return (data ?? []).map((row) => rowToAction(row as Record<string, unknown>))
}

export async function getStrategicAction(db: FogoDb, protocol: string): Promise<StrategicActionRecord | null> {
  const { data, error } = await db.supabase
    .from('strategic_actions')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const action = rowToAction(data as Record<string, unknown>)
  const { data: events } = await db.supabase
    .from('strategic_action_events')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('action_id', action.id)
    .order('created_at', { ascending: true })
  action.events = (events ?? []).map((e) => ({
    eventType: e.event_type,
    detail: e.detail ?? undefined,
    actorLabel: e.actor_label ?? undefined,
    createdAt: e.created_at,
  }))
  return action
}

export async function insertActionEvent(
  db: FogoDb,
  actionId: string,
  eventType: string,
  detail?: Record<string, unknown>,
) {
  await db.supabase.from('strategic_action_events').insert({
    organization_id: db.orgId,
    action_id: actionId,
    event_type: eventType,
    detail: detail ?? null,
    actor_label: db.actor?.displayName ?? db.actor?.email ?? 'operador',
  })
}

export async function createStrategicAction(
  db: FogoDb,
  input: {
    actionType: StrategicActionType
    title: string
    payload: Record<string, unknown>
    justification: string
    region: string
    status: StrategicActionStatus
  },
): Promise<StrategicActionRecord> {
  const n = await nextCounter(db, 'strategic_action')
  const protocol = `AE-${n.toString().padStart(4, '0')}`
  const { data, error } = await db.supabase
    .from('strategic_actions')
    .insert({
      organization_id: db.orgId,
      protocol,
      action_type: input.actionType,
      status: input.status,
      title: input.title,
      payload: input.payload,
      justification: input.justification,
      region: input.region,
      created_by: db.actor?.displayName ?? db.actor?.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  const action = rowToAction(data as Record<string, unknown>)
  await insertActionEvent(db, action.id, 'created', { status: input.status })
  return action
}

export async function updateStrategicAction(
  db: FogoDb,
  protocol: string,
  patch: Partial<{
    status: StrategicActionStatus
    payload: Record<string, unknown>
    justification: string
    region: string
    title: string
    approvedBy: string | null
    approvedAt: string | null
    executedAt: string | null
    executionResult: Record<string, unknown> | null
    linkedEntity: string | null
  }>,
): Promise<StrategicActionRecord> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status) row.status = patch.status
  if (patch.payload) row.payload = patch.payload
  if (patch.justification != null) row.justification = patch.justification
  if (patch.region != null) row.region = patch.region
  if (patch.title) row.title = patch.title
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt
  if (patch.executedAt !== undefined) row.executed_at = patch.executedAt
  if (patch.executionResult !== undefined) row.execution_result = patch.executionResult
  if (patch.linkedEntity !== undefined) row.linked_entity = patch.linkedEntity
  const { data, error } = await db.supabase
    .from('strategic_actions')
    .update(row)
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .select('*')
    .single()
  if (error) throw error
  return rowToAction(data as Record<string, unknown>)
}

export async function insertContingencyPlan(
  db: FogoDb,
  input: {
    protocol: string
    title: string
    version: number
    status: string
    body: Record<string, unknown>
    parentId?: string | null
  },
) {
  const { data, error } = await db.supabase
    .from('contingency_plans')
    .insert({
      organization_id: db.orgId,
      protocol: input.protocol,
      title: input.title,
      version: input.version,
      status: input.status,
      body: input.body,
      parent_id: input.parentId ?? null,
      created_by: db.actor?.displayName ?? db.actor?.email ?? null,
    })
    .select('id, protocol, version, status')
    .single()
  if (error) throw error
  return data
}

export async function latestContingencyVersion(db: FogoDb, protocol: string): Promise<number> {
  const { data, error } = await db.supabase
    .from('contingency_plans')
    .select('version')
    .eq('organization_id', db.orgId)
    .eq('protocol', protocol)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.version ?? 0
}
