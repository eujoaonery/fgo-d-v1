import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class SsrfError extends Error {
  readonly code = 'SSRF_BLOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'SsrfError'
  }
}

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map((n) => Number(n))
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (!base || !Number.isFinite(bits)) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const PRIVATE_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '224.0.0.0/4',
  '255.255.255.255/32',
]

function isBlockedIp(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) {
    return true
  }
  const v4 = ip.includes('.') ? ip.replace(/^::ffff:/, '') : null
  if (!v4 || v4.includes(':')) return ip.includes(':')
  return PRIVATE_V4.some((c) => inCidr(v4, c))
}

function isCloudMetadata(hostname: string, ips: string[]): boolean {
  if (hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) return true
  return ips.some((ip) => {
    const v4 = ip.replace(/^::ffff:/, '')
    return v4 === '169.254.169.254' || (v4.includes('.') && !v4.includes(':') && inCidr(v4, '169.254.0.0/16'))
  })
}

export function isPrivateOrSpecialIp(ip: string): boolean {
  return isBlockedIp(ip)
}

export async function assertSafeHost(host: string, allowPrivate: boolean): Promise<string[]> {
  const hostname = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname) throw new SsrfError('Destino vazio.')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    if (!allowPrivate) throw new SsrfError('Destinos locais não são permitidos.')
  }
  if (hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) {
    throw new SsrfError('Destinos de metadados ou rede interna não são permitidos.')
  }

  const ips: string[] = []
  if (isIP(hostname)) {
    ips.push(hostname)
  } else {
    try {
      const v4 = await lookup(hostname, { all: true, family: 4 })
      ips.push(...v4.map((r) => r.address))
    } catch {
      /* try v6 */
    }
    try {
      const v6 = await lookup(hostname, { all: true, family: 6 })
      ips.push(...v6.map((r) => r.address))
    } catch {
      /* none */
    }
    if (!ips.length) {
      try {
        const any = await lookup(hostname, { all: true })
        ips.push(...any.map((r) => r.address))
      } catch {
        /* unresolved */
      }
    }
  }
  if (!ips.length) throw new SsrfError('Não foi possível resolver o destino.')
  if (isCloudMetadata(hostname, ips)) {
    throw new SsrfError('Destinos de metadados ou rede interna não são permitidos.')
  }
  for (const ip of ips) {
    if (isBlockedIp(ip) && !allowPrivate) {
      throw new SsrfError('Destino em rede privada, de metadados ou especial bloqueado.')
    }
  }
  return ips
}

export function parseUrlSafe(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SsrfError('URL inválida.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('Somente HTTP/HTTPS são permitidos neste destino.')
  }
  if (url.username || url.password) {
    throw new SsrfError('Não inclua credenciais na URL. Use o cofre de segredos do conector.')
  }
  return url
}
