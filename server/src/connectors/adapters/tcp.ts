import net from 'node:net'
import { assertSafeHost } from '../ssrf.js'
import { isSafeHostname, TimeoutError } from '../timeout.js'
import { sanitizeLogText } from '../sanitize.js'
import type { ConnectorAdapter, ConnectorContext } from '../types.js'

export async function runTcp(ctx: ConnectorContext) {
  const host = String(ctx.config.host ?? '').trim()
  const port = Number(ctx.config.port)
  if (!isSafeHostname(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Host ou porta TCP inválidos.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  const started = Date.now()
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host, port, timeout: ctx.timeoutMs })
      const fail = (err: Error) => {
        socket.destroy()
        reject(err)
      }
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('timeout', () => fail(new TimeoutError(ctx.timeoutMs)))
      socket.once('error', fail)
    })
    return {
      ok: true,
      result: 'porta_aberta',
      latencyMs: Date.now() - started,
      detail: {
        host,
        port,
        method: 'tcp',
        note: 'A abertura da porta não prova que o serviço execute corretamente suas funções.',
      },
      error: null,
    }
  } catch (e) {
    return {
      ok: false,
      result: 'conexao_recusada',
      latencyMs: Date.now() - started,
      detail: { host, port, method: 'tcp' },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha TCP'),
    }
  }
}

export const tcpAdapter: ConnectorAdapter = {
  kind: 'tcp',
  version: '1',
  test: runTcp,
  execute: runTcp,
}
