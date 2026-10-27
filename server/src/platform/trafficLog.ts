import type { NextFunction, Request, Response } from 'express'

export type TrafficDirection = 'inbound' | 'outbound'
export type TrafficTarget = 'fogo-api' | 'supabase' | 'openai' | 'turnstile' | 'weather' | 'osm' | 'external'

export type TrafficEntry = {
  at: string
  direction: TrafficDirection
  target: TrafficTarget
  method: string
  path: string
  status: number
  durationMs: number
  tenant?: string | null
  error?: string | null
}

export type AccessEntry = {
  at: string
  event: string
  email: string | null
  ip: string | null
  message: string
  status?: number | null
}

const MAX = 400
const inbound: TrafficEntry[] = []
const outbound: TrafficEntry[] = []
const access: AccessEntry[] = []

function push<T>(list: T[], item: T) {
  list.unshift(item)
  if (list.length > MAX) list.length = MAX
}

export function classifyTarget(raw: string): TrafficTarget {
  const u = raw.toLowerCase()
  if (u.includes('openai.com')) return 'openai'
  if (u.includes('challenges.cloudflare.com') || u.includes('turnstile')) return 'turnstile'
  if (u.includes('open-meteo.com')) return 'weather'
  if (u.includes('overpass-api.de') || u.includes('overpass')) return 'osm'
  if (
    u.includes('supabase') ||
    u.includes('/auth/v1') ||
    u.includes('/rest/v1') ||
    u.includes('/storage/v1') ||
    /:8000\b/.test(u)
  ) {
    return 'supabase'
  }
  return 'external'
}

export function safeUrlPath(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname}`.slice(0, 240)
  } catch {
    return raw.split('?')[0]?.slice(0, 240) || raw.slice(0, 240)
  }
}

export function skipOutboundUrl(raw: string): boolean {
  const u = raw.toLowerCase()
  return u.includes('system_logs') || u.includes('/api/mng/infra')
}

export function recordInbound(entry: Omit<TrafficEntry, 'direction' | 'target' | 'at'> & { at?: string }) {
  push(inbound, {
    at: entry.at ?? new Date().toISOString(),
    direction: 'inbound',
    target: 'fogo-api',
    method: entry.method,
    path: entry.path.slice(0, 240),
    status: entry.status,
    durationMs: entry.durationMs,
    tenant: entry.tenant ?? null,
    error: entry.error ?? null,
  })
}

export function recordOutbound(entry: {
  url: string
  method?: string
  status: number
  durationMs: number
  error?: string | null
}) {
  if (skipOutboundUrl(entry.url)) return
  const path = safeUrlPath(entry.url)
  const target = classifyTarget(entry.url)
  const method = (entry.method ?? 'GET').toUpperCase()
  const noisyGet = target === 'supabase' && method === 'GET' && entry.status < 400 && entry.durationMs < 80
  if (noisyGet) return
  push(outbound, {
    at: new Date().toISOString(),
    direction: 'outbound',
    target,
    method,
    path,
    status: entry.status,
    durationMs: entry.durationMs,
    error: entry.error ?? null,
  })
}

export function recordAccess(entry: Omit<AccessEntry, 'at'> & { at?: string }) {
  push(access, {
    at: entry.at ?? new Date().toISOString(),
    event: entry.event,
    email: entry.email,
    ip: entry.ip,
    message: entry.message.slice(0, 500),
    status: entry.status ?? null,
  })
}

export function readTrafficSnapshot() {
  return {
    inbound: inbound.slice(0, 200),
    outbound: outbound.slice(0, 200),
    access: access.slice(0, 200),
  }
}

const SKIP_INBOUND = ['/health', '/bootstrap', '/events/stream', '/mng/infra', '/settings/simulation']

function apiPath(req: Request): string {
  const fromOriginal = (req.originalUrl ?? '').split('?')[0]
  if (fromOriginal.startsWith('/api')) return fromOriginal
  const p = req.path.startsWith('/') ? req.path : `/${req.path}`
  return p.startsWith('/api') ? p : `/api${p}`
}

export function createInboundTrafficMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = apiPath(req)
    if (!path.startsWith('/api') || SKIP_INBOUND.some((s) => path === `/api${s}` || path.endsWith(s))) {
      next()
      return
    }
    const start = Date.now()
    const tenantHeader = req.headers['x-fogo-tenant']
    res.on('finish', () => {
      recordInbound({
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - start,
        tenant: typeof tenantHeader === 'string' ? tenantHeader : null,
      })
    })
    next()
  }
}

export function installOutboundFetchHook() {
  const orig = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method =
      init?.method ??
      (typeof input === 'object' && input && 'method' in input ? (input as Request).method : 'GET')
    const start = Date.now()
    try {
      const res = await orig(input as RequestInfo, init)
      recordOutbound({ url, method, status: res.status, durationMs: Date.now() - start })
      return res
    } catch (e) {
      recordOutbound({
        url,
        method,
        status: 0,
        durationMs: Date.now() - start,
        error: e instanceof Error ? e.message : 'falha de rede',
      })
      throw e
    }
  }) as typeof fetch
}
