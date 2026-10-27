const SENSITIVE = /secret|token|password|authorization|community|private.?key|api.?key|credential/gi

export function sanitizeLogText(value: string, max = 400): string {
  const stripped = value
    .replace(/rtsp:\/\/[^\s]+/gi, 'rtsp://[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:community|password|token|secret|authorization)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(SENSITIVE, '[redacted]')
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped
}

export function sanitizeLogObject(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]'
  if (typeof value === 'string') return sanitizeLogText(value, 240)
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeLogObject(v, depth + 1))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/secret|token|password|authorization|community|credential|private/i.test(k)) {
      out[k] = v == null ? v : '[redacted]'
      continue
    }
    out[k] = sanitizeLogObject(v, depth + 1)
  }
  return out
}

export function redactRtspUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.username = ''
    u.password = ''
    return u.toString().replace(/\/\/:/, '//')
  } catch {
    return raw.replace(/:[^/@]+@/, '@').replace(SENSITIVE, '[redacted]')
  }
}
