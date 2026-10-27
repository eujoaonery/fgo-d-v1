import net from 'node:net'
import tls from 'node:tls'
import { createHash } from 'node:crypto'
import { assertSafeHost } from '../ssrf.js'
import { isSafeHostname, TimeoutError } from '../timeout.js'
import { sanitizeLogText } from '../sanitize.js'
import type { AdapterResult, ConnectorAdapter, ConnectorContext, IngestCandidate } from '../types.js'

function encodeStr(s: string): Buffer {
  const b = Buffer.from(s, 'utf8')
  const h = Buffer.alloc(2)
  h.writeUInt16BE(b.length, 0)
  return Buffer.concat([h, b])
}

function remainingLength(n: number): Buffer {
  const out: number[] = []
  do {
    let d = n % 128
    n = Math.floor(n / 128)
    if (n > 0) d |= 0x80
    out.push(d)
  } while (n > 0)
  return Buffer.from(out)
}

function connectPacket(opts: { clientId: string; username?: string; password?: string }): Buffer {
  let flags = 0x02
  const payloadParts = [encodeStr(opts.clientId)]
  if (opts.username) {
    flags |= 0x80
    payloadParts.push(encodeStr(opts.username))
  }
  if (opts.password) {
    flags |= 0x40
    payloadParts.push(encodeStr(opts.password))
  }
  const vh = Buffer.concat([encodeStr('MQTT'), Buffer.from([4, flags, 0, 30])])
  const payload = Buffer.concat(payloadParts)
  const rem = remainingLength(vh.length + payload.length)
  return Buffer.concat([Buffer.from([0x10]), rem, vh, payload])
}

function subscribePacket(topics: string[]): Buffer {
  const id = Buffer.from([0, 1])
  const payload = Buffer.concat(topics.map((t) => Buffer.concat([encodeStr(t), Buffer.from([0])])))
  const rem = remainingLength(id.length + payload.length)
  return Buffer.concat([Buffer.from([0x82]), rem, id, payload])
}

function parsePublish(buf: Buffer): { topic: string; payload: string } | null {
  if (!buf.length || (buf[0]! & 0xf0) !== 0x30) return null
  let i = 1
  let mul = 1
  let len = 0
  for (;;) {
    const d = buf[i++]!
    len += (d & 127) * mul
    if ((d & 128) === 0) break
    mul *= 128
    if (i > 4) return null
  }
  const topicLen = buf.readUInt16BE(i)
  i += 2
  const topic = buf.subarray(i, i + topicLen).toString('utf8')
  i += topicLen
  const qos = (buf[0]! >> 1) & 0x03
  if (qos > 0) i += 2
  const payload = buf.subarray(i, 1 + (i - 1) + (len - (i - (buf.length - buf.subarray(buf.length - (buf.length - i)).length)))).toString('utf8')
  const end = buf.length
  const body = buf.subarray(i, end).toString('utf8')
  return { topic, payload: body || payload }
}

async function mqttSession(
  ctx: ConnectorContext,
  waitForMessage: boolean,
): Promise<AdapterResult> {
  const host = String(ctx.config.host ?? '').trim()
  const port = Number(ctx.config.port ?? (ctx.config.tls === true ? 8883 : 1883))
  if (!isSafeHostname(host) || !Number.isInteger(port)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Broker MQTT inválido.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  const topics = Array.isArray(ctx.config.topics) ? (ctx.config.topics as unknown[]).map(String).filter(Boolean) : []
  const clientId = String(ctx.config.clientId ?? `fogo-${ctx.connector.id.slice(0, 8)}`)
  const started = Date.now()
  const useTls = ctx.config.tls === true
  try {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = useTls
        ? tls.connect({ host, port, servername: host, timeout: ctx.timeoutMs }, () => resolve(s))
        : net.connect({ host, port, timeout: ctx.timeoutMs }, () => resolve(s))
      s.once('error', reject)
      s.once('timeout', () => reject(new TimeoutError(ctx.timeoutMs)))
    })
    const reply = await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(ctx.timeoutMs)), ctx.timeoutMs)
      socket.once('data', (d) => {
        clearTimeout(timer)
        resolve(Buffer.from(d))
      })
      socket.write(
        connectPacket({
          clientId,
          username: ctx.secrets.username || ctx.secrets.mqttUser,
          password: ctx.secrets.password || ctx.secrets.mqttPassword,
        }),
      )
    })
    const connack = reply[0] === 0x20 && reply[3] === 0
    if (!connack) {
      socket.destroy()
      return {
        ok: false,
        result: 'mqtt_auth_falhou',
        latencyMs: Date.now() - started,
        detail: { host, port, tls: useTls },
        error: 'CONNACK recusado. Verifique autenticação e permissões do broker.',
      }
    }
    const ingest: IngestCandidate[] = []
    let lastTopic: string | null = null
    if (waitForMessage && topics.length) {
      socket.write(subscribePacket(topics.slice(0, 20)))
      try {
        const pub = await new Promise<Buffer>((resolve, reject) => {
          const timer = setTimeout(() => reject(new TimeoutError(Math.min(ctx.timeoutMs, 4000))), Math.min(ctx.timeoutMs, 4000))
          socket.on('data', (d) => {
            const buf = Buffer.from(d)
            if ((buf[0]! & 0xf0) === 0x30) {
              clearTimeout(timer)
              resolve(buf)
            }
          })
        })
        const parsed = parsePublish(pub)
        if (parsed) {
          lastTopic = parsed.topic
          let body: Record<string, unknown> = { raw: parsed.payload.slice(0, 4000) }
          try {
            body = JSON.parse(parsed.payload) as Record<string, unknown>
          } catch {
            /* keep raw */
          }
          ingest.push({
            idempotencyKey: createHash('sha256').update(`${ctx.connector.id}:${parsed.topic}:${parsed.payload}`).digest('hex').slice(0, 40),
            eventType: 'mqtt.message',
            assetExternalId: typeof body.deviceId === 'string' ? body.deviceId : typeof body.assetId === 'string' ? body.assetId : null,
            occurredAt: typeof body.ts === 'string' ? body.ts : new Date().toISOString(),
            payload: { topic: parsed.topic, ...body },
            metric:
              typeof body.metric === 'string'
                ? { name: body.metric, value: Number(body.value), unit: typeof body.unit === 'string' ? body.unit : null }
                : undefined,
          })
        }
      } catch {
        /* subscribe ok, no message yet */
      }
    }
    socket.end()
    return {
      ok: true,
      result: ingest.length ? 'mqtt_mensagem' : 'mqtt_conectado',
      latencyMs: Date.now() - started,
      detail: {
        host,
        port,
        tls: useTls,
        topics,
        lastTopic,
        note: 'O MQTT não descobre sensores sozinho. Tópico e formato precisam estar configurados.',
      },
      ingest: ingest.length ? ingest : undefined,
      error: null,
    }
  } catch (e) {
    return {
      ok: false,
      result: 'mqtt_desconectado',
      latencyMs: Date.now() - started,
      detail: { host, port, tls: useTls },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha MQTT'),
    }
  }
}

export const mqttAdapter: ConnectorAdapter = {
  kind: 'mqtt',
  version: '1',
  test: (ctx) => mqttSession(ctx, false),
  execute: (ctx) => mqttSession(ctx, true),
}
