import type { FogoDb } from '../db.js'
import {
  acaoPriorityRank,
  isAcaoPriority,
  isAcaoSource,
  isAcaoStatus,
  type AcaoPriority,
  type AcaoRecord,
  type AcaoSource,
  type AcaoStatus,
} from '../../../src/lib/acao.js'

export type AcaoDraft = {
  source: AcaoSource
  sourceId: string
  title: string
  actionText: string
  detail?: string | null
  priority: AcaoPriority
  region?: string | null
  originLabel: string
}

function asText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function rowToAcao(row: Record<string, unknown>): AcaoRecord {
  const priority = isAcaoPriority(row.priority) ? row.priority : 'media'
  const status = isAcaoStatus(row.status) ? row.status : 'analisar'
  const source = isAcaoSource(row.source) ? row.source : 'alpha'
  return {
    id: String(row.id),
    source,
    sourceId: String(row.source_id),
    title: String(row.title ?? ''),
    actionText: String(row.action_text ?? ''),
    detail: asText(row.detail),
    priority,
    region: asText(row.region),
    originLabel: String(row.origin_label ?? ''),
    status,
    takenAction: asText(row.taken_action),
    delegatedToName: asText(row.delegated_to_name),
    delegatedToUserId: asText(row.delegated_to_user_id),
    ignoredReason: asText(row.ignored_reason),
    decidedAt: asText(row.decided_at),
    decidedBy: asText(row.decided_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function sortAcoes(items: AcaoRecord[]): AcaoRecord[] {
  return [...items].sort((a, b) => {
    const pr = acaoPriorityRank(a.priority) - acaoPriorityRank(b.priority)
    if (pr !== 0) return pr
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

export async function listAcoes(db: FogoDb): Promise<AcaoRecord[]> {
  const { data, error } = await db.supabase
    .from('cco_actions')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return sortAcoes((data ?? []).map((r) => rowToAcao(r as Record<string, unknown>)))
}

export async function getAcao(db: FogoDb, id: string): Promise<AcaoRecord | null> {
  const { data, error } = await db.supabase
    .from('cco_actions')
    .select('*')
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? rowToAcao(data as Record<string, unknown>) : null
}

export async function upsertAcaoDrafts(db: FogoDb, drafts: AcaoDraft[]): Promise<void> {
  if (!drafts.length) return
  const existing = await listAcoes(db)
  const map = new Map(existing.map((item) => [`${item.source}:${item.sourceId}`, item]))
  const inserts: Record<string, unknown>[] = []
  const updates: { id: string; draft: AcaoDraft }[] = []

  for (const draft of drafts) {
    const key = `${draft.source}:${draft.sourceId}`
    const cur = map.get(key)
    if (!cur) {
      inserts.push({
        organization_id: db.orgId,
        source: draft.source,
        source_id: draft.sourceId,
        title: draft.title,
        action_text: draft.actionText,
        detail: draft.detail ?? null,
        priority: draft.priority,
        region: draft.region ?? null,
        origin_label: draft.originLabel,
        status: 'analisar',
      })
      continue
    }
    if (cur.status === 'analisar' || cur.status === 'delegada') {
      updates.push({ id: cur.id, draft })
    }
  }

  if (inserts.length) {
    const { error } = await db.supabase.from('cco_actions').insert(inserts)
    if (error) throw error
  }

  const now = new Date().toISOString()
  for (const u of updates) {
    const { error } = await db.supabase
      .from('cco_actions')
      .update({
        title: u.draft.title,
        action_text: u.draft.actionText,
        detail: u.draft.detail ?? null,
        priority: u.draft.priority,
        region: u.draft.region ?? null,
        origin_label: u.draft.originLabel,
        updated_at: now,
      })
      .eq('organization_id', db.orgId)
      .eq('id', u.id)
    if (error) throw error
  }
}

export async function updateAcaoStatus(
  db: FogoDb,
  id: string,
  fields: {
    status: AcaoStatus
    takenAction?: string | null
    ignoredReason?: string | null
    delegatedToName?: string | null
    delegatedToUserId?: string | null
    decidedAt?: string | null
  },
): Promise<AcaoRecord> {
  const patch: Record<string, unknown> = {
    status: fields.status,
    updated_at: new Date().toISOString(),
    decided_by: db.actor?.userId ?? null,
  }
  if ('takenAction' in fields) patch.taken_action = fields.takenAction ?? null
  if ('ignoredReason' in fields) patch.ignored_reason = fields.ignoredReason ?? null
  if ('delegatedToName' in fields) patch.delegated_to_name = fields.delegatedToName ?? null
  if ('delegatedToUserId' in fields) patch.delegated_to_user_id = fields.delegatedToUserId ?? null
  if ('decidedAt' in fields) patch.decided_at = fields.decidedAt ?? null

  const { error } = await db.supabase
    .from('cco_actions')
    .update(patch)
    .eq('organization_id', db.orgId)
    .eq('id', id)
  if (error) throw error
  const next = await getAcao(db, id)
  if (!next) throw new Error('Ação não encontrada após atualizar.')
  return next
}
