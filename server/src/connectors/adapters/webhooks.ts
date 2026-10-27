import { createHmac, randomUUID } from 'node:crypto'
import { assertSafeHost, parseUrlSafe } from '../ssrf.js'
import { sanitizeLogText } from '../sanitize.js'
import type { ConnectorAdapter, ConnectorContext } from '../types.js'

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function verifyWebhookSignature(secret: string, body: string, header: string | undefined): boolean {
  if (!header) return false
  const expected = signWebhookBody(secret, body)
  if (header.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  return mismatch === 0
}

export async function runWebhookOut(ctx: ConnectorContext) {
  const rawUrl = String(ctx.config.url ?? '')
  let url: URL
  try {
    url = parseUrlSafe(rawUrl)
  } catch (e) {
    return { ok: false, result: 'config_invalida', detail: {}, error: e instanceof Error ? e.message : 'URL inválida' }
  }
  await assertSafeHost(url.hostname, ctx.allowPrivate)
  const started = Date.now()
  const eventId = randomUUID()
  const body = JSON.stringify({
    id: eventId,
    type: 'connector.test',
    source: 'fogo',
    occurredAt: new Date().toISOString(),
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Fogo-Event-Id': eventId }
  const secret = ctx.secrets.hmacSecret || ctx.secrets.token
  if (secret) headers['X-Fogo-Signature'] = signWebhookBody(secret, body)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ctx.timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal, redirect: 'manual' })
    const ok = res.status >= 200 && res.status < 300
    return {
      ok,
      result: ok ? 'entrega_ok' : 'entrega_falhou',
      latencyMs: Date.now() - started,
      httpStatus: res.status,
      detail: { host: url.hostname, path: url.pathname, eventId },
      error: ok ? null : sanitizeLogText(`HTTP ${res.status}`),
    }
  } catch (e) {
    return {
      ok: false,
      result: 'falha_comunicacao',
      latencyMs: Date.now() - started,
      detail: { host: url.hostname },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha no webhook de saída'),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function deliverSignedWebhook(opts: {
  url: string
  allowPrivate: boolean
  timeoutMs: number
  secret?: string
  eventType: string
  eventId: string
  payload: Record<string, unknown>
}): Promise<{ ok: boolean; status: number | null; error: string | null; latencyMs: number }> {
  const url = parseUrlSafe(opts.url)
  await assertSafeHost(url.hostname, opts.allowPrivate)
  const body = JSON.stringify({
    id: opts.eventId,
    type: opts.eventType,
    source: 'fogo',
    occurredAt: new Date().toISOString(),
    data: opts.payload,
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Fogo-Event-Id': opts.eventId,
    'X-Fogo-Event-Type': opts.eventType,
  }
  if (opts.secret) headers['X-Fogo-Signature'] = signWebhookBody(opts.secret, body)
  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal, redirect: 'manual' })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`,
      latencyMs: Date.now() - started,
    }
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: sanitizeLogText(e instanceof Error ? e.message : 'falha'),
      latencyMs: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
  }
}

export const webhookOutAdapter: ConnectorAdapter = {
  kind: 'webhook_out',
  version: '1',
  test: runWebhookOut,
  execute: runWebhookOut,
}

export const webhookInAdapter: ConnectorAdapter = {
  kind: 'webhook_in',
  version: '1',
  async test() {
    return {
      ok: true,
      result: 'endpoint_configurado',
      detail: { note: 'O teste confirma a configuração. O recebimento real ocorre no endpoint público autenticado.' },
      error: null,
    }
  },
  async execute() {
    return {
      ok: true,
      result: 'aguardando_eventos',
      detail: { note: 'Webhooks de entrada são passivos.' },
      error: null,
    }
  },
}
