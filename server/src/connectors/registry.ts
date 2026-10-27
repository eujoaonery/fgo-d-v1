import { icmpAdapter } from './adapters/icmp.js'
import { tcpAdapter } from './adapters/tcp.js'
import { httpAdapter, restAdapter } from './adapters/http.js'
import { snmpAdapter } from './adapters/snmp.js'
import { mqttAdapter } from './adapters/mqtt.js'
import { onvifAdapter, rtspAdapter } from './adapters/camera.js'
import { webhookInAdapter, webhookOutAdapter } from './adapters/webhooks.js'
import { fileImportAdapter } from './adapters/fileImport.js'
import { SsrfError } from './ssrf.js'
import { clampTimeout } from './timeout.js'
import { sanitizeLogText } from './sanitize.js'
import type { ConnectorAdapter, ConnectorContext, ConnectorKind, ConnectorRecord } from './types.js'

const adapters: Record<ConnectorKind, ConnectorAdapter> = {
  icmp: icmpAdapter,
  tcp: tcpAdapter,
  http: httpAdapter,
  rest: restAdapter,
  webhook_in: webhookInAdapter,
  webhook_out: webhookOutAdapter,
  mqtt: mqttAdapter,
  snmp: snmpAdapter,
  onvif: onvifAdapter,
  rtsp: rtspAdapter,
  file_import: fileImportAdapter,
}

export function getAdapter(kind: string): ConnectorAdapter {
  const a = adapters[kind as ConnectorKind]
  if (!a) throw new Error(`Adaptador não registrado: ${kind}`)
  return a
}

export function allowPrivateTargets(actorIsPlatformAdmin: boolean | undefined, config: Record<string, unknown>): boolean {
  return actorIsPlatformAdmin === true && config.allowPrivate === true
}

export async function runAdapter(
  mode: 'test' | 'execute',
  connector: ConnectorRecord,
  opts: {
    organizationId: string
    orgSlug: string
    secrets: Record<string, string>
    allowPrivate: boolean
    configOverride?: Record<string, unknown>
  },
) {
  const adapter = getAdapter(connector.kind)
  const config = { ...connector.config, ...(opts.configOverride ?? {}) }
  const ctx: ConnectorContext = {
    organizationId: opts.organizationId,
    orgSlug: opts.orgSlug,
    connector,
    config,
    secrets: opts.secrets,
    allowPrivate: opts.allowPrivate,
    timeoutMs: clampTimeout(config.timeoutMs, 5000),
  }
  try {
    const result = mode === 'test' ? await adapter.test(ctx) : await adapter.execute(ctx)
    return { ...result, adapterVersion: adapter.version }
  } catch (e) {
    if (e instanceof SsrfError) {
      return {
        ok: false,
        result: 'destino_bloqueado',
        detail: { code: e.code },
        error: sanitizeLogText(e.message),
        adapterVersion: adapter.version,
      }
    }
    return {
      ok: false,
      result: 'falha_execucao',
      detail: {},
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha no adaptador'),
      adapterVersion: adapter.version,
    }
  }
}
