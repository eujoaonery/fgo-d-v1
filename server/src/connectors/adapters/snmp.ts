import dgram from 'node:dgram'
import { assertSafeHost } from '../ssrf.js'
import { isSafeHostname, TimeoutError } from '../timeout.js'
import { sanitizeLogText } from '../sanitize.js'
import type { ConnectorAdapter, ConnectorContext } from '../types.js'

function encodeLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len])
  const bytes: number[] = []
  let n = len
  while (n > 0) {
    bytes.unshift(n & 0xff)
    n >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value])
}

function encodeInt(n: number): Buffer {
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  let buf = Buffer.from(hex, 'hex')
  if (buf[0]! & 0x80) buf = Buffer.concat([Buffer.from([0]), buf])
  return tlv(0x02, buf)
}

function encodeOid(oid: string): Buffer {
  const parts = oid.replace(/^\./, '').split('.').map(Number)
  if (parts.length < 2) throw new Error('OID inválido')
  const out: number[] = [40 * parts[0]! + parts[1]!]
  for (const p of parts.slice(2)) {
    if (p < 128) out.push(p)
    else {
      const stack: number[] = []
      let v = p
      stack.push(v & 0x7f)
      v >>= 7
      while (v > 0) {
        stack.push(0x80 | (v & 0x7f))
        v >>= 7
      }
      out.push(...stack.reverse())
    }
  }
  return tlv(0x06, Buffer.from(out))
}

function encodeGetRequest(community: string, oids: string[]): Buffer {
  const varbinds = Buffer.concat(
    oids.map((oid) => tlv(0x30, Buffer.concat([encodeOid(oid), tlv(0x05, Buffer.alloc(0))]))),
  )
  const pdu = tlv(
    0xa0,
    Buffer.concat([encodeInt(Math.floor(Math.random() * 0x7fffffff)), encodeInt(0), encodeInt(0), tlv(0x30, varbinds)]),
  )
  return tlv(
    0x30,
    Buffer.concat([encodeInt(1), tlv(0x04, Buffer.from(community, 'utf8')), pdu]),
  )
}

function decodeStrings(buf: Buffer): string[] {
  const found: string[] = []
  let i = 0
  while (i < buf.length - 2) {
    if (buf[i] === 0x04) {
      const len = buf[i + 1]!
      if (len < 128 && i + 2 + len <= buf.length) {
        const s = buf.subarray(i + 2, i + 2 + len).toString('utf8')
        if (s && /[\x20-\x7e]/.test(s)) found.push(s)
        i += 2 + len
        continue
      }
    }
    i += 1
  }
  return found
}

async function snmpGet(host: string, port: number, packet: Buffer, timeoutMs: number): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4')
    const timer = setTimeout(() => {
      sock.close()
      reject(new TimeoutError(timeoutMs))
    }, timeoutMs)
    sock.once('message', (msg) => {
      clearTimeout(timer)
      sock.close()
      resolve(msg)
    })
    sock.once('error', (err) => {
      clearTimeout(timer)
      sock.close()
      reject(err)
    })
    sock.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer)
        sock.close()
        reject(err)
      }
    })
  })
}

export async function runSnmp(ctx: ConnectorContext) {
  const host = String(ctx.config.host ?? '').trim()
  const port = Number(ctx.config.port ?? 161)
  const version = String(ctx.config.version ?? '3')
  if (!isSafeHostname(host) || !Number.isInteger(port)) {
    return { ok: false, result: 'config_invalida', detail: {}, error: 'Destino SNMP inválido.' }
  }
  await assertSafeHost(host, ctx.allowPrivate)
  if (version === '3') {
    if (!ctx.secrets.username) {
      return {
        ok: false,
        result: 'snmpv3_sem_credencial',
        detail: {
          host,
          version: '3',
          note: 'SNMPv3 está estruturado; a sessão USM completa depende de homologação com o equipamento real.',
        },
        error: 'Informe usuário SNMPv3 no cofre. Sem equipamento homologado, a sessão USM não é iniciada.',
      }
    }
    return {
      ok: false,
      result: 'snmpv3_pendente_homologacao',
      detail: {
        host,
        version: '3',
        authProtocol: ctx.config.authProtocol ?? 'SHA',
        privProtocol: ctx.config.privProtocol ?? 'AES',
        note: 'Credenciais SNMPv3 permanecem no cofre. A implementação USM exige homologação com o fabricante.',
      },
      error: 'SNMPv3 aguarda homologação com equipamento real. Use v2c apenas para compatibilidade em laboratório.',
    }
  }
  const community = ctx.secrets.community || ctx.secrets.password
  if (!community) {
    return { ok: false, result: 'sem_comunidade', detail: { version: '2c' }, error: 'Comunidade SNMPv2c ausente no cofre.' }
  }
  const oids = Array.isArray(ctx.config.oids)
    ? (ctx.config.oids as unknown[]).map(String)
    : ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.2.1.0']
  const started = Date.now()
  try {
    const reply = await snmpGet(host, port, encodeGetRequest(community, oids.slice(0, 6)), ctx.timeoutMs)
    const strings = decodeStrings(reply)
    const sysDescr = strings[0] ?? null
    return {
      ok: reply.length > 0,
      result: 'snmp_ok',
      latencyMs: Date.now() - started,
      detail: {
        host,
        port,
        version: '2c',
        limitation: 'SNMPv1/v2c expõe comunidade no protocolo; use SNMPv3 em produção.',
        sysDescr,
        oidsQueried: oids,
        missingMetrics: sysDescr ? [] : ['sysDescr'],
        note: 'Métricas ausentes permanecem indisponíveis; não são preenchidas com zero.',
      },
      error: null,
    }
  } catch (e) {
    return {
      ok: false,
      result: 'snmp_sem_resposta',
      latencyMs: Date.now() - started,
      detail: { host, port, version: '2c' },
      error: sanitizeLogText(e instanceof Error ? e.message : 'Falha SNMP'),
    }
  }
}

export const snmpAdapter: ConnectorAdapter = {
  kind: 'snmp',
  version: '1',
  test: runSnmp,
  execute: runSnmp,
}
