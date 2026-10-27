import { FOGO_TENANT_HEADER, LAST_TENANT_STORAGE_KEY } from '@/lib/tenant'

let currentTenantSlug: string | null = null

export function setApiTenantSlug(slug: string | null) {
  currentTenantSlug = slug ? slug.trim().toLowerCase() : null
}

export function getApiTenantSlug(): string | null {
  return currentTenantSlug
}

export function rememberTenantSlug(slug: string) {
  try {
    localStorage.setItem(LAST_TENANT_STORAGE_KEY, slug)
  } catch {
    /* ignore */
  }
}

export function readRememberedTenantSlug(): string | null {
  try {
    return localStorage.getItem(LAST_TENANT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function applyTenantHeader(headers: Headers) {
  const slug = currentTenantSlug
  if (slug && !headers.has(FOGO_TENANT_HEADER)) {
    headers.set(FOGO_TENANT_HEADER, slug)
  }
}
