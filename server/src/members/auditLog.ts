import type { FogoDb } from '../db.js'

export type AuditLogEntry = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  actorId: string | null
  actorEmail: string | null
  createdAt: string
}

export async function listAuditLogs(
  db: FogoDb,
  opts?: { limit?: number; offset?: number; action?: string; entityType?: string },
): Promise<AuditLogEntry[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 150, 1), 500)
  const offset = Math.max(opts?.offset ?? 0, 0)

  let query = db.supabase
    .from('audit_log')
    .select('id, action, entity_type, entity_id, metadata, actor_id, created_at')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.action?.trim()) query = query.eq('action', opts.action.trim())
  if (opts?.entityType?.trim()) query = query.eq('entity_type', opts.entityType.trim())

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: meta,
      actorId: row.actor_id,
      actorEmail: typeof meta.actorEmail === 'string' ? meta.actorEmail : null,
      createdAt: row.created_at,
    }
  })
}
