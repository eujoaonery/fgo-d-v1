import net from 'node:net'
import { assertSafeHost, parseUrlSafe } from '../ssrf.js'
import { isSafeHostname, TimeoutError } from '../timeout.js'
import { redactRtspUrl, sanitizeLogText } from '../sanitize.js'
import type { ConnectorAdapter, ConnectorContext } from '../types.js'

function basicAuth(secrets: Record<string, string>): string | null {
  if (!secrets.username && !secrets.password) return null
  return Buffer.from(`${secrets.username ?? ''}:${secrets.password ?? ''}`).toString('base64')
}

const DATE_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`

const INFO_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`

export async function runOnvif(ctx: ConnectorContext) {
  const host = String(ctx.config.host ?? '').trim()
  const port = Number(ctx.config.port ?? 80)
  const path = String(ctx.config.path ?? '/onvif/device_service')
  if (!isSafeHostname(host)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Host ONVIF inválido.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  const scheme = ctx.config.tls === true ? 'https' : 'http'
  const url = `${scheme}://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`
  const started = Date.now()
  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
  }
  const auth = basicAuth(ctx.secrets)
  if (auth) headers.Authorization = `Basic ${auth}`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ctx.timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers, body: DATE_SOAP, signal: ac.signal })
    const text = await res.text()
    const managementAccessible = res.status < 500
    const deviceReachable = true
    let authValid: boolean | null = null
    let manufacturer: string | null = null
    if (auth && res.status !== 401) {
      const info = await fetch(url, { method: 'POST', headers, body: INFO_SOAP, signal: ac.signal })
      const infoText = await info.text()
      authValid = info.status !== 401
      const m = infoText.match(/<[^>]*Manufacturer[^>]*>([^<]+)</i)
      manufacturer = m?.[1] ?? null
    } else if (res.status === 401) {
      authValid = false
    }
    const ok = managementAccessible && res.status < 400
    return {
      ok,
      result: ok ? 'onvif_gerenciamento_ok' : 'onvif_falhou',
      latencyMs: Date.now() - started,
      httpStatus: res.status,
      detail: {
        host,
        port,
        deviceReachable,
        managementAccessible,
        authValid,
        streamAccessible: null,
        manufacturer,
        soapBytes: text.length,
        note: 'ONVIF acessível não significa que a câmera esteja transmitindo vídeo.',
      },
      error: ok ? null : sanitizeLogText(`ONVIF HTTP ${res.status}`),
    }
  } catch (e) {
    return {
      ok: false,
      result: 'falha_comunicacao',
      latencyMs: Date.now() - started,
      detail: {
        host,
        deviceReachable: false,
        managementAccessible: false,
        authValid: null,
        streamAccessible: null,
      },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha ONVIF'),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runRtsp(ctx: ConnectorContext) {
  const host = String(ctx.config.host ?? '').trim()
  const port = Number(ctx.config.port ?? 554)
  const path = String(ctx.config.path ?? '/')
  if (!isSafeHostname(host) || !Number.isInteger(port)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Destino RTSP inválido.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  const started = Date.now()
  const displayUrl = redactRtspUrl(`rtsp://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`)
  try {
    const status = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host, port, timeout: ctx.timeoutMs })
      let buf = ''
      const fail = (err: Error) => {
        socket.destroy()
        reject(err)
      }
      socket.once('connect', () => {
        socket.write(`OPTIONS rtsp://${host}:${port}${path.startsWith('/') ? path : `/${path}`} RTSP/1.0\r\nCSeq: 1\r\n\r\n`)
      })
      socket.on('data', (d) => {
        buf += String(d)
        if (buf.includes('\r\n')) {
          socket.end()
          resolve(buf.split('\r\n')[0] ?? buf)
        }
      })
      socket.once('timeout', () => fail(new TimeoutError(ctx.timeoutMs)))
      socket.once('error', fail)
    })
    const streamAccessible = /RTSP\/1\.\d\s+200/i.test(status)
    const authRequired = /RTSP\/1\.\d\s+401/i.test(status)
    return {
      ok: streamAccessible || authRequired,
      result: streamAccessible ? 'rtsp_endpoint_ok' : authRequired ? 'rtsp_autenticacao_requerida' : 'rtsp_indisponivel',
      latencyMs: Date.now() - started,
      detail: {
        host,
        port,
        url: displayUrl,
        statusLine: status.slice(0, 80),
        deviceReachable: true,
        managementAccessible: null,
        authValid: authRequired ? false : streamAccessible ? null : null,
        streamAccessible,
        note: 'OPTIONS confirma o endpoint, não o conteúdo do vídeo. Análise de frames não está habilitada.',
      },
      error: streamAccessible || authRequired ? null : sanitizeLogText(status),
    }
  } catch (e) {
    return {
      ok: false,
      result: 'falha_comunicacao',
      latencyMs: Date.now() - started,
      detail: {
        host,
        port,
        url: displayUrl,
        deviceReachable: false,
        streamAccessible: false,
      },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha RTSP'),
    }
  }
}

export const onvifAdapter: ConnectorAdapter = {
  kind: 'onvif',
  version: '1',
  test: runOnvif,
  execute: runOnvif,
}

export const rtspAdapter: ConnectorAdapter = {
  kind: 'rtsp',
  version: '1',
  test: runRtsp,
  execute: runRtsp,
}

export function parseOptionalHttpUrl(raw: string) {
  return parseUrlSafe(raw)
}
