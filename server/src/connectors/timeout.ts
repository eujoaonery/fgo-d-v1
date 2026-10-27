export class TimeoutError extends Error {
  readonly code = 'TIMEOUT'
  constructor(ms: number) {
    super(`Tempo esgotado após ${ms} ms.`)
    this.name = 'TimeoutError'
  }
}

export function clampTimeout(raw: unknown, fallback = 5000, max = 20_000): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 200) return fallback
  return Math.min(Math.floor(n), max)
}

export async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await Promise.race([
      work(ac.signal),
      new Promise<T>((_, reject) => {
        ac.signal.addEventListener('abort', () => reject(new TimeoutError(ms)), { once: true })
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function isSafeHostname(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (!h || h.length > 253) return false
  if (h.includes('/') || h.includes(' ') || h.includes('\\')) return false
  return /^[a-z0-9._:-]+$/i.test(h) || /^\[[0-9a-f:]+\]$/i.test(h)
}
