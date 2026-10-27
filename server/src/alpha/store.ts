import type { FogoDb } from '../db.js'
import type {
  AlphaAnalysisKind,
  AlphaAnalysisResult,
  AlphaChatMessage,
  AlphaSessionContext,
  AlphaSessionSummary,
} from '../../../src/lib/prometheusAlpha.js'

const SESSION_TTL_MS = 4 * 3600_000
const MAX_MESSAGES = 20

export type AlphaSession = {
  id: string
  userId: string
  context: AlphaSessionContext
  expiresAt: string
}

function emptyContext(): AlphaSessionContext {
  return { region: null, date: null, hour: null, lastKind: null, title: null }
}

function asContext(raw: unknown): AlphaSessionContext {
  if (!raw || typeof raw !== 'object') return emptyContext()
  const o = raw as Record<string, unknown>
  return {
    region: typeof o.region === 'string' ? o.region : null,
    date: typeof o.date === 'string' ? o.date : null,
    hour: typeof o.hour === 'number' && Number.isFinite(o.hour) ? o.hour : null,
    lastKind: typeof o.lastKind === 'string' ? (o.lastKind as AlphaSessionContext['lastKind']) : null,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
  }
}

export function clipSessionTitle(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'Nova conversa'
  return t.length <= 42 ? t : `${t.slice(0, 41)}…`
}

export async function loadOrCreateSession(db: FogoDb, userId: string): Promise<AlphaSession> {
  const now = new Date()
  const { data, error } = await db.supabase
    .from('prometheus_alpha_sessions')
    .select('id, user_id, context, expires_at')
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
    .gt('expires_at', now.toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data) {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      context: asContext(data.context),
      expiresAt: data.expires_at as string,
    }
  }
  const expires = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  const inserted = await db.supabase
    .from('prometheus_alpha_sessions')
    .insert({
      organization_id: db.orgId,
      user_id: userId,
      context: emptyContext(),
      expires_at: expires,
    })
    .select('id, user_id, context, expires_at')
    .single()
  if (inserted.error) throw inserted.error
  return {
    id: inserted.data.id as string,
    userId: inserted.data.user_id as string,
    context: emptyContext(),
    expiresAt: inserted.data.expires_at as string,
  }
}

export async function getOwnedSession(db: FogoDb, userId: string, sessionId: string): Promise<AlphaSession | null> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_sessions')
    .select('id, user_id, context, expires_at')
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    userId: data.user_id as string,
    context: asContext(data.context),
    expiresAt: data.expires_at as string,
  }
}

export async function listUserSessions(db: FogoDb, userId: string, limit = 12): Promise<AlphaSessionSummary[]> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_sessions')
    .select('id, context, updated_at, expires_at')
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(20, Math.max(1, limit)))
  if (error) throw error
  const rows = data ?? []
  const ids = rows.map((r) => r.id as string)
  const counts = new Map<string, { count: number; firstUser?: string }>()
  if (ids.length) {
    const { data: msgs, error: msgErr } = await db.supabase
      .from('prometheus_alpha_messages')
      .select('session_id, role, content, created_at')
      .eq('organization_id', db.orgId)
      .in('session_id', ids)
      .order('created_at', { ascending: true })
    if (msgErr) throw msgErr
    for (const m of msgs ?? []) {
      const sid = m.session_id as string
      const cur = counts.get(sid) ?? { count: 0 }
      cur.count += 1
      if (!cur.firstUser && m.role === 'user' && typeof m.content === 'string') cur.firstUser = m.content
      counts.set(sid, cur)
    }
  }
  const now = Date.now()
  return rows
    .map((row) => {
      const id = row.id as string
      const info = counts.get(id)
      const ctx = asContext(row.context)
      return {
        id,
        title: ctx.title || (info?.firstUser ? clipSessionTitle(info.firstUser) : 'Nova conversa'),
        updatedAt: row.updated_at as string,
        messageCount: info?.count ?? 0,
        expiresAt: row.expires_at as string,
      }
    })
    .filter((row) => row.messageCount > 0 || new Date(row.expiresAt).getTime() > now)
    .map(({ expiresAt: _e, ...row }) => row)
}

export async function createSession(db: FogoDb, userId: string): Promise<AlphaSession> {
  const current = await loadOrCreateSession(db, userId)
  const msgs = await listSessionMessages(db, current.id)
  if (msgs.length === 0) return current
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const inserted = await db.supabase
    .from('prometheus_alpha_sessions')
    .insert({
      organization_id: db.orgId,
      user_id: userId,
      context: emptyContext(),
      expires_at: expires,
    })
    .select('id, user_id, context, expires_at')
    .single()
  if (inserted.error) throw inserted.error
  return {
    id: inserted.data.id as string,
    userId: inserted.data.user_id as string,
    context: emptyContext(),
    expiresAt: inserted.data.expires_at as string,
  }
}

export async function clearSessionMessages(db: FogoDb, sessionId: string) {
  const { error } = await db.supabase
    .from('prometheus_alpha_messages')
    .delete()
    .eq('organization_id', db.orgId)
    .eq('session_id', sessionId)
  if (error) throw error
  await saveSessionContext(db, sessionId, emptyContext())
}

export async function saveSessionContext(db: FogoDb, sessionId: string, context: AlphaSessionContext) {
  const { error } = await db.supabase
    .from('prometheus_alpha_sessions')
    .update({
      context,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    })
    .eq('organization_id', db.orgId)
    .eq('id', sessionId)
  if (error) throw error
}

export async function appendMessage(
  db: FogoDb,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  payload: Record<string, unknown> = {},
): Promise<AlphaChatMessage> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_messages')
    .insert({
      organization_id: db.orgId,
      session_id: sessionId,
      role,
      content,
      payload,
    })
    .select('id, role, content, payload, created_at')
    .single()
  if (error) throw error
  const { data: extras } = await db.supabase
    .from('prometheus_alpha_messages')
    .select('id')
    .eq('organization_id', db.orgId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
  const overflow = (extras ?? []).slice(MAX_MESSAGES)
  if (overflow.length) {
    await db.supabase
      .from('prometheus_alpha_messages')
      .delete()
      .eq('organization_id', db.orgId)
      .in(
        'id',
        overflow.map((r) => r.id),
      )
  }
  return {
    id: data.id as string,
    role: data.role as 'user' | 'assistant',
    content: data.content as string,
    createdAt: data.created_at as string,
    analysis: (data.payload as { analysis?: AlphaAnalysisResult } | null)?.analysis,
    claims: (data.payload as { claims?: AlphaAnalysisResult['claims'] } | null)?.claims,
  }
}

export async function listSessionMessages(db: FogoDb, sessionId: string): Promise<AlphaChatMessage[]> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_messages')
    .select('id, role, content, payload, created_at')
    .eq('organization_id', db.orgId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES)
  if (error) throw error
  return (data ?? [])
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      id: row.id as string,
      role: row.role as 'user' | 'assistant',
      content: row.content as string,
      createdAt: row.created_at as string,
      analysis: (row.payload as { analysis?: AlphaAnalysisResult } | null)?.analysis,
      claims: (row.payload as { claims?: AlphaAnalysisResult['claims'] } | null)?.claims,
    }))
}

export async function insertAnalysis(
  db: FogoDb,
  input: {
    sessionId?: string | null
    kind: AlphaAnalysisKind
    title: string
    params: Record<string, unknown>
    result: AlphaAnalysisResult
    createdBy?: string | null
  },
): Promise<string> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_analyses')
    .insert({
      organization_id: db.orgId,
      session_id: input.sessionId ?? null,
      kind: input.kind,
      title: input.title,
      params: input.params,
      result: input.result,
      sources: input.result.sources,
      model_version: input.result.modelVersion,
      created_by: input.createdBy ?? db.actor?.userId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function getAnalysis(db: FogoDb, id: string): Promise<AlphaAnalysisResult | null> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_analyses')
    .select('id, result, created_at')
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const result = data.result as AlphaAnalysisResult
  return { ...result, id: data.id as string, generatedAt: result.generatedAt || (data.created_at as string) }
}

export async function listAnalyses(
  db: FogoDb,
  limit = 20,
): Promise<{ id: string; kind: string; title: string; createdAt: string; region: string | null }[]> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_analyses')
    .select('id, kind, title, created_at, result')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)))
  if (error) throw error
  return (data ?? []).map((row) => {
    const result = row.result as { region?: string | null }
    return {
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      region: result?.region ?? null,
    }
  })
}

export async function latestAnalysis(db: FogoDb): Promise<{ id: string; createdAt: string } | null> {
  const { data, error } = await db.supabase
    .from('prometheus_alpha_analyses')
    .select('id, created_at')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id as string, createdAt: data.created_at as string } : null
}
