export const FOGO_TENANT_HEADER = 'X-Fogo-Tenant'
export const LAST_TENANT_STORAGE_KEY = 'fogo.tenant.slug'

export const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'archived'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

export const OPERATION_MODES = ['demo', 'real'] as const
export type OperationMode = (typeof OPERATION_MODES)[number]

export const RESERVED_TENANT_SLUGS = new Set([
  'mng',
  'api',
  'assets',
  'asset',
  'camera-feeds',
  'login',
  'health',
  'auth',
  'public',
  'tenants',
  'static',
  'vite',
  'well-known',
  'favicon',
  'admin',
  'plataforma',
  'cidades',
  'previsoes',
])

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeTenantSlug(raw: string): string {
  return raw.trim().toLowerCase()
}

export function validateTenantSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = normalizeTenantSlug(raw)
  if (slug.length < 2 || slug.length > 48) {
    return { ok: false, error: 'O identificador deve ter entre 2 e 48 caracteres.' }
  }
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Use apenas letras minúsculas, números e hífens (sem hífen no início ou fim).' }
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    return { ok: false, error: 'Este identificador é reservado pelo sistema.' }
  }
  return { ok: true, slug }
}

export function isReservedRootSegment(segment: string): boolean {
  return RESERVED_TENANT_SLUGS.has(normalizeTenantSlug(segment))
}

/** Converte rota lógica (`/alertas`) em URL da cidade (`/prefeitura-marilia/alertas`). */
export function cityPath(slug: string, route = '/'): string {
  if (!slug) return route || '/'
  const [pathPart, ...qs] = route.split('?')
  const path = pathPart || '/'
  const base = path === '/' ? `/${slug}` : `/${slug}${path.startsWith('/') ? path : `/${path}`}`
  return qs.length ? `${base}?${qs.join('?')}` : base
}

/** Remove o prefixo `/:citySlug` de um pathname absoluto. */
export function stripCityPrefix(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  const parts = pathname.split('/').filter(Boolean)
  const first = parts[0]
  if (!first || isReservedRootSegment(first)) return pathname
  const rest = parts.slice(1)
  return rest.length ? `/${rest.join('/')}` : '/'
}

export function tenantStatusLabel(status: TenantStatus): string {
  switch (status) {
    case 'provisioning':
      return 'Em provisionamento'
    case 'active':
      return 'Ativa'
    case 'suspended':
      return 'Suspensa'
    case 'archived':
      return 'Arquivada'
  }
}

export function operationModeLabel(mode: OperationMode): string {
  return mode === 'real' ? 'Operação real' : 'Demonstração'
}

export function simulationAllowed(mode: OperationMode): boolean {
  return mode === 'demo'
}

export type DuplicateCopyOptions = {
  ui: boolean
  categories: boolean
  operationalSettings: boolean
  businessRules: boolean
  moduleSettings: boolean
  users: boolean
  userIds: string[]
  assets: boolean
  history: boolean
}

export const DEFAULT_DUPLICATE_COPY: DuplicateCopyOptions = {
  ui: true,
  categories: true,
  operationalSettings: true,
  businessRules: true,
  moduleSettings: true,
  users: false,
  userIds: [],
  assets: false,
  history: false,
}

const SENSITIVE_KEY = /secret|token|password|private.?key|api.?key|webhook|credential|authorization|auth.?header/i
/** Ponteiro UUID do cofre — não é a credencial. Sem isto o PROMETHEUS “não salva” a chave. */
const SETTINGS_POINTER_KEY = /^(secretId|secret_id)$/i

export function sanitizeTenantSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key) && !SETTINGS_POINTER_KEY.test(key)) continue
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      out[key] = sanitizeTenantSettings(child)
    } else {
      out[key] = child
    }
  }
  return out
}
