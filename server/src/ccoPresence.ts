import { randomUUID } from 'node:crypto'

export type PresenceSnapshot = {
  userId: string
  displayName: string
  email: string | null
  role: string
  lastSeenAt: string
  connectionCount: number
}

type PresenceRow = PresenceSnapshot & { connections: Set<string> }

const byKey = new Map<string, PresenceRow>()

function key(orgId: string, userId: string) {
  return `${orgId}:${userId}`
}

export function connectCcoPresence(
  orgId: string,
  actor: { userId: string; displayName?: string | null; email?: string; role: string },
): string {
  const k = key(orgId, actor.userId)
  const cid = randomUUID()
  const now = new Date().toISOString()
  const displayName = actor.displayName?.trim() || actor.email || actor.userId
  const existing = byKey.get(k)
  if (!existing) {
    byKey.set(k, {
      userId: actor.userId,
      displayName,
      email: actor.email ?? null,
      role: actor.role,
      lastSeenAt: now,
      connectionCount: 1,
      connections: new Set([cid]),
    })
    return cid
  }
  existing.displayName = displayName
  existing.email = actor.email ?? existing.email
  existing.role = actor.role
  existing.lastSeenAt = now
  existing.connections.add(cid)
  existing.connectionCount = existing.connections.size
  return cid
}

export function touchCcoPresence(orgId: string, userId: string) {
  const row = byKey.get(key(orgId, userId))
  if (!row) return
  row.lastSeenAt = new Date().toISOString()
}

export function disconnectCcoPresence(orgId: string, userId: string, connectionId: string) {
  const k = key(orgId, userId)
  const row = byKey.get(k)
  if (!row) return
  row.connections.delete(connectionId)
  row.connectionCount = row.connections.size
  row.lastSeenAt = new Date().toISOString()
  if (row.connections.size === 0) byKey.delete(k)
}

export function listCcoPresence(orgId: string): PresenceSnapshot[] {
  const prefix = `${orgId}:`
  const out: PresenceSnapshot[] = []
  for (const [k, row] of byKey) {
    if (!k.startsWith(prefix) || row.connections.size === 0) continue
    out.push({
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
      lastSeenAt: row.lastSeenAt,
      connectionCount: row.connections.size,
    })
  }
  return out
}
