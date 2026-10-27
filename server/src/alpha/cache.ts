type Entry<T> = { value: T; expiresAt: number }

const store = new Map<string, Entry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    store.delete(key)
    return null
  }
  return hit.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) })
  return value
}

export async function cacheWrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key)
  if (hit !== null) return hit
  const value = await factory()
  return cacheSet(key, value, ttlMs)
}

export function cacheClear(prefix?: string) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
