import { createHash } from 'node:crypto'
import { assertSafeHost, parseUrlSafe } from '../ssrf.js'
import { sanitizeLogText } from '../sanitize.js'
import { TimeoutError } from '../timeout.js'
import type { AdapterResult, ConnectorAdapter, ConnectorContext, IngestCandidate } from '../types.js'

function authHeader(secrets: Record<string, string>): Record<string, string> {
  if (secrets.token) return { Authorization: `Bearer ${secrets.token}` }
  if (secrets.username || secrets.password) {
    const pair = Buffer.from(`${secrets.username ?? ''}:${secrets.password ?? ''}`).toString('base64')
    return { Authorization: `Basic ${pair}` }
  }
  return {}
}

export async function runHttp(ctx: ConnectorContext, forIngest = false): Promise<AdapterResult> {
  const rawUrl = String(ctx.config.url ?? '')
  let url: URL
  try {
    url = parseUrlSafe(rawUrl)
  } catch (e) {
    return { ok: false, result: 'config_invalida', detail: {}, error: e instanceof Error ? e.message : 'URL inválida' }
  }
  await assertSafeHost(url.hostname, ctx.allowPrivate)
  const method = String(ctx.config.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Método HTTP não permitido.' }
  }
  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ctx.timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      signal: ac.signal,
      redirect: 'manual',
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...authHeader(ctx.secrets),
      },
    })
    const latencyMs = Date.now() - started
    const expectStatus = ctx.config.expectStatus != null ? Number(ctx.config.expectStatus) : null
    const body = method === 'HEAD' ? '' : await res.text()
    const expectContains = typeof ctx.config.expectContains === 'string' ? ctx.config.expectContains : ''
    const statusOk = expectStatus ? res.status === expectStatus : res.status >= 200 && res.status < 400
    const contentOk = expectContains ? body.includes(expectContains) : true
    const ok = statusOk && contentOk
    const tlsOk = url.protocol === 'https:' ? true : null
    const ingest: IngestCandidate[] = []
    if (forIngest && ok) {
      let parsed: unknown = body
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = { text: body.slice(0, 4000) }
      }
      ingest.push({
        idempotencyKey: createHash('sha256').update(`${ctx.connector.id}:${body.slice(0, 8000)}`).digest('hex').slice(0, 40),
        eventType: 'rest.poll',
        assetExternalId: pickMapped(parsed, ctx.config.fieldMap, 'assetId'),
        occurredAt: pickMapped(parsed, ctx.config.fieldMap, 'occurredAt') ?? new Date().toISOString(),
        payload: typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : { value: parsed },
        metric: mapMetric(parsed, ctx.config.fieldMap),
      })
    }
    return {
      ok,
      result: ok ? 'http_ok' : 'http_falhou',
      latencyMs,
      httpStatus: res.status,
      tlsOk,
      detail: {
        host: url.hostname,
        path: url.pathname,
        method,
        expectStatus,
        contentMatched: contentOk,
        bodyBytes: body.length,
        note: 'O código HTTP descreve o endpoint verificado, não o restante da infraestrutura.',
      },
      error: ok ? null : sanitizeLogText(`HTTP ${res.status}${contentOk ? '' : ' conteúdo inesperado'}`),
      ingest: ingest.length ? ingest : undefined,
    }
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'AbortError' || e instanceof TimeoutError)
    return {
      ok: false,
      result: aborted ? 'timeout' : 'falha_comunicacao',
      latencyMs: Date.now() - started,
      tlsOk: null,
      detail: { host: url.hostname, path: url.pathname, method },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha HTTP'),
    }
  } finally {
    clearTimeout(timer)
  }
}

function pickMapped(parsed: unknown, fieldMap: unknown, key: string): string | null {
  if (!fieldMap || typeof fieldMap !== 'object') return null
  const path = String((fieldMap as Record<string, unknown>)[key] ?? '')
  if (!path) return null
  const value = getPath(parsed, path)
  return value == null ? null : String(value)
}

function mapMetric(parsed: unknown, fieldMap: unknown) {
  const name = pickMapped(parsed, fieldMap, 'metric') ?? pickMapped(parsed, fieldMap, 'metricName')
  const valueRaw = pickMapped(parsed, fieldMap, 'value')
  if (!name) return undefined
  const value = valueRaw == null || valueRaw === '' ? null : Number(valueRaw)
  return {
    name,
    value: value != null && Number.isFinite(value) ? value : null,
    unit: pickMapped(parsed, fieldMap, 'unit'),
  }
}

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (Array.isArray(cur)) {
      cur = cur[Number(p)]
      continue
    }
    if (!cur || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur ?? null
}

export const httpAdapter: ConnectorAdapter = {
  kind: 'http',
  version: '1',
  test: (ctx) => runHttp(ctx, false),
  execute: (ctx) => runHttp(ctx, false),
}

export const restAdapter: ConnectorAdapter = {
  kind: 'rest',
  version: '1',
  test: (ctx) => runHttp(ctx, false),
  execute: (ctx) => runHttp(ctx, true),
}
