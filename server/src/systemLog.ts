import type { FogoDb } from './supabase.js'
import type { AccessEntry } from './platform/trafficLog.js'

export type SystemLogLevel = 'info' | 'warn' | 'error'
export type SystemLogCategory = 'auth' | 'http' | 'ops' | 'system'

export type SystemLogEntry = {
  id: string
  level: SystemLogLevel
  category: SystemLogCategory
  message: string
  metadata: Record<string, unknown>
  actorId: string | null
  actorEmail: string | null
  createdAt: string
}

export async function writeSystemLog(
  db: FogoDb,
  entry: {
    level: SystemLogLevel
    category: SystemLogCategory
    message: string
    metadata?: Record<string, unknown>
    actorId?: string | null
  },
) {
  const meta = {
    ...(entry.metadata ?? {}),
    actorEmail: db.actor?.email ?? null,
  }
  const { error } = await db.supabase.from('system_logs').insert({
    organization_id: db.orgId,
    level: entry.level,
    category: entry.category,
    message: entry.message.slice(0, 2000),
    metadata: meta,
    actor_id: entry.actorId ?? db.actor?.userId ?? null,
  })
  if (error) console.error('[fogo] system_logs', error.message)
}

export async function listSystemLogs(
  db: FogoDb,
  opts?: {
    limit?: number
    offset?: number
    level?: SystemLogLevel
    category?: SystemLogCategory
  },
): Promise<SystemLogEntry[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 150, 1), 500)
  const offset = Math.max(opts?.offset ?? 0, 0)

  let query = db.supabase
    .from('system_logs')
    .select('id, level, category, message, metadata, actor_id, created_at')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.level) query = query.eq('level', opts.level)
  if (opts?.category) query = query.eq('category', opts.category)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      level: row.level as SystemLogLevel,
      category: row.category as SystemLogCategory,
      message: row.message,
      metadata: meta,
      actorId: row.actor_id,
      actorEmail: typeof meta.actorEmail === 'string' ? meta.actorEmail : null,
      createdAt: row.created_at,
    }
  })
}

export async function listPlatformAuthLogs(db: FogoDb, limit = 150): Promise<AccessEntry[]> {
  const cap = Math.min(Math.max(limit, 1), 400)
  const { data, error } = await db.supabase
    .from('system_logs')
    .select('message, metadata, created_at')
    .eq('category', 'auth')
    .order('created_at', { ascending: false })
    .limit(cap)
  if (error) {
    console.error('[fogo] platform auth logs', error.message)
    return []
  }
  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const email = typeof meta.email === 'string' ? meta.email : typeof meta.actorEmail === 'string' ? meta.actorEmail : null
    const event = typeof meta.event === 'string' ? meta.event : 'auth'
    const ip = typeof meta.ip === 'string' ? meta.ip : null
    const err = typeof meta.error === 'string' ? meta.error : null
    return {
      at: row.created_at as string,
      event,
      email,
      ip,
      message: err ? `${row.message}: ${err}` : (row.message as string),
      status: typeof meta.status === 'number' ? meta.status : null,
    }
  })
}
