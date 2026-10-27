import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const SESSION_TTL_MIN = 5
export const SESSION_TTL_MAX = 7 * 24 * 60
export const SESSION_TTL_DEFAULT = 60

export type SessionPolicy = {
  ttlMinutes: number
  updatedAt: string | null
}

function dataDir() {
  return process.env.FOGO_DATA_DIR || path.join(process.cwd(), 'data')
}

function policyFile() {
  return path.join(dataDir(), 'platform-session.json')
}

export function clampSessionTtlMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return SESSION_TTL_DEFAULT
  return Math.min(SESSION_TTL_MAX, Math.max(SESSION_TTL_MIN, Math.round(n)))
}

export function readSessionPolicy(): SessionPolicy {
  try {
    const row = JSON.parse(readFileSync(policyFile(), 'utf8')) as Partial<SessionPolicy>
    return {
      ttlMinutes: clampSessionTtlMinutes(row.ttlMinutes),
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
    }
  } catch {
    return { ttlMinutes: SESSION_TTL_DEFAULT, updatedAt: null }
  }
}

export function writeSessionPolicy(ttlMinutes: number): SessionPolicy {
  const next: SessionPolicy = {
    ttlMinutes: clampSessionTtlMinutes(ttlMinutes),
    updatedAt: new Date().toISOString(),
  }
  mkdirSync(path.dirname(policyFile()), { recursive: true })
  writeFileSync(policyFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

export function sessionTtlMs(policy = readSessionPolicy()): number {
  return policy.ttlMinutes * 60_000
}
