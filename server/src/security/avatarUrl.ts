/** Aceita URL pública do bucket avatars deste projeto ou null. */
export function isAllowedAvatarUrl(url: string | null | undefined, supabaseUrl: string | undefined): boolean {
  if (url == null || url === '') return true
  const trimmed = url.trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return false
  if (trimmed.startsWith('/api/public/avatars/')) return true
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (!supabaseUrl) return false
    const base = new URL(supabaseUrl)
    const storageHost = base.host
    if (parsed.host !== storageHost) return false
    return parsed.pathname.includes('/storage/v1/object/public/avatars/')
  } catch {
    return false
  }
}

export function publicAvatarPath(userId: string, fileName: string): string {
  return `/api/public/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(fileName)}`
}
