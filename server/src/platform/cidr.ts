import { isIP } from 'node:net'

export function normalizeCidr(raw: string): string | null {
  const t = raw.trim()
  if (!t || t.length > 80) return null
  const [ipPart, maskPart] = t.split('/')
  if (!ipPart || t.includes(' ') || t.split('/').length > 2) return null
  const version = isIP(ipPart)
  if (version === 4) {
    const octets = ipPart.split('.')
    if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return null
    const prefix = maskPart == null || maskPart === '' ? 32 : Number(maskPart)
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
    return `${octets.map((o) => String(Number(o))).join('.')}/${prefix}`
  }
  if (version === 6) {
    const prefix = maskPart == null || maskPart === '' ? 128 : Number(maskPart)
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null
    return `${ipPart.toLowerCase()}/${prefix}`
  }
  return null
}

export function normalizeCidrList(values: unknown, max = 200): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of values) {
    if (typeof v !== 'string') continue
    const cidr = normalizeCidr(v)
    if (!cidr || seen.has(cidr)) continue
    seen.add(cidr)
    out.push(cidr)
    if (out.length >= max) break
  }
  return out
}

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map((n) => Number(n))
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [net, prefixStr] = cidr.split('/')
  if (!net) return false
  const ipVer = isIP(ip)
  const netVer = isIP(net)
  if (!ipVer || ipVer !== netVer) return false
  const prefix = Number(prefixStr)
  if (ipVer === 4) {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(net) & mask)
  }
  const ipBits = ipv6Bits(ip)
  const netBits = ipv6Bits(net)
  if (!ipBits || !netBits) return ip.toLowerCase() === net.toLowerCase()
  return ipBits.slice(0, prefix) === netBits.slice(0, prefix)
}

function ipv6Bits(ip: string): string | null {
  const expanded = expandIpv6(ip)
  if (!expanded) return null
  return expanded
    .split(':')
    .map((h) => Number.parseInt(h, 16).toString(2).padStart(16, '0'))
    .join('')
}

function expandIpv6(ip: string): string | null {
  const stripped = ip.replace(/^\[|\]$/g, '')
  const halves = stripped.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : []
  const tail = halves[1] ? halves[1].split(':').filter(Boolean) : []
  if (halves.length === 1) {
    if (head.length !== 8) return null
    return head.map((h) => h.padStart(4, '0')).join(':')
  }
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  const mid = Array.from({ length: fill }, () => '0000')
  return [...head, ...mid, ...tail].map((h) => h.padStart(4, '0')).join(':')
}

export function canonicalIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const t = ip.trim().replace(/^\[|\]$/g, '')
  if (t.toLowerCase().startsWith('::ffff:')) return t.slice(7)
  return t
}

export function ipAllowed(ip: string | null, allow: string[], deny: string[]): boolean {
  const addr = canonicalIp(ip)
  if (!addr) return false
  if (addr === '127.0.0.1' || addr === '::1') return true
  if (deny.some((c) => ipMatchesCidr(addr, c))) return false
  if (allow.length === 0) return true
  return allow.some((c) => ipMatchesCidr(addr, c))
}
