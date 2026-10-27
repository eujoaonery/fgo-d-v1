import type { FogoDb } from './db.js'

export async function writeAudit(
  db: FogoDb,
  action: string,
  entityType: string,
  metadata: Record<string, unknown> = {},
  entityUuid?: string | null,
) {
  const { error } = await db.supabase.from('audit_log').insert({
    organization_id: db.orgId,
    actor_id: db.actor?.userId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityUuid ?? null,
    metadata: {
      ...metadata,
      actorEmail: db.actor?.email ?? null,
    },
  })
  if (error) console.error('[fogo] audit_log', error.message)
}
