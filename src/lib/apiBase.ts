import { isClientBffAuth } from '@/lib/authMode'

/** Em produção BFF use o mesmo domínio (VITE_API_URL vazio + reverse proxy /api). */
export function getApiBase(): string {
  if (isClientBffAuth()) {
    const raw = import.meta.env.VITE_API_URL as string | undefined
    if (!raw?.trim()) return ''
    return raw.trim().replace(/\/$/, '')
  }
  const raw = import.meta.env.VITE_API_URL as string | undefined
  if (!raw?.trim()) return ''
  return raw.trim().replace(/\/$/, '')
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getApiBase()}${p}`
}
