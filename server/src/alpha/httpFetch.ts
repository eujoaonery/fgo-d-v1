const DEFAULT_TIMEOUT_MS = 8_000
const UA = 'FOGO-CCO/1.0 (prometheus-alpha; +https://open-meteo.com/)'

export type FetchJsonResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function fetchJson(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<FetchJsonResult> {
  const ac = new AbortController()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json', 'User-Agent': UA, ...opts.headers },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, data: await res.json() }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'tempo esgotado' : e.message) : 'falha de rede'
    return { ok: false, error: msg }
  } finally {
    clearTimeout(t)
  }
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function asStr(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : ''
}

export function asNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
