import { spawn } from 'node:child_process'
import { assertSafeHost } from '../ssrf.js'
import { clampTimeout, isSafeHostname, TimeoutError } from '../timeout.js'
import type { ConnectorAdapter, ConnectorContext } from '../types.js'
import { sanitizeLogText } from '../sanitize.js'

function parsePing(output: string): { latencyMs: number | null; packetLoss: number | null } {
  const loss =
    output.match(/(\d+(?:\.\d+)?)%\s*(?:loss|perdidos|perda)/i) ??
    output.match(/Lost\s*=\s*\d+\s*\((\d+)%\s*loss\)/i)
  const latency =
    output.match(/(?:time|tempo|Average|Média)\s*[=<]\s*([\d.]+)\s*ms/i) ??
    output.match(/=\s*([\d.]+)ms/i)
  return {
    latencyMs: latency ? Number(latency[1]) : null,
    packetLoss: loss ? Number(loss[1]) : null,
  }
}

async function pingHost(host: string, timeoutMs: number): Promise<{ output: string; code: number | null }> {
  const win = process.platform === 'win32'
  const args = win ? ['-n', '1', '-w', String(timeoutMs), host] : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host]
  return await new Promise((resolve, reject) => {
    const child = spawn('ping', args, { windowsHide: true })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new TimeoutError(timeoutMs))
    }, timeoutMs + 1500)
    child.stdout.on('data', (d) => {
      output += String(d)
    })
    child.stderr.on('data', (d) => {
      output += String(d)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ output, code })
    })
  })
}

export async function runIcmp(ctx: ConnectorContext): Promise<ReturnType<ConnectorAdapter['test']>> {
  const host = String(ctx.config.host ?? ctx.config.target ?? '').trim()
  if (!isSafeHostname(host)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Host ICMP inválido.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  const started = Date.now()
  try {
    const { output, code } = await pingHost(host, ctx.timeoutMs)
    const parsed = parsePing(output)
    const ok = code === 0
    return {
      ok,
      result: ok ? 'alcance_ok' : 'sem_resposta',
      latencyMs: parsed.latencyMs ?? Date.now() - started,
      packetLoss: parsed.packetLoss,
      detail: {
        host,
        method: 'icmp',
        note: 'Resposta ICMP positiva não garante que a aplicação ou o serviço estejam funcionando.',
      },
      error: ok ? null : sanitizeLogText(output.replace(/\s+/g, ' ').slice(0, 180) || 'Sem resposta ICMP'),
    }
  } catch (e) {
    return {
      ok: false,
      result: 'falha_execucao',
      latencyMs: Date.now() - started,
      detail: { host, method: 'icmp' },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha ICMP'),
    }
  }
}

export const icmpAdapter: ConnectorAdapter = {
  kind: 'icmp',
  version: '1',
  test: runIcmp,
  execute: runIcmp,
}

export { clampTimeout }
