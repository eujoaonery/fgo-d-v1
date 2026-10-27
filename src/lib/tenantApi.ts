import type { DuplicateCopyOptions, OperationMode, TenantStatus } from '@/lib/tenant'
import { apiUrl } from '@/lib/apiBase'
import { getApiAccessToken } from '@/lib/apiAccessToken'
import { authUsesCookies } from '@/lib/authMode'
import { currentAuthEpoch, noteUnauthorized } from '@/lib/sessionExpiry'

function sessionFetch(input: string, init?: RequestInit): Promise<Response> {
  const startedEpoch = currentAuthEpoch()
  const headers = new Headers(init?.headers)
  const token = getApiAccessToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const path = input.startsWith('http') ? input : apiUrl(input.startsWith('/') ? input : `/${input}`)
  return fetch(path, {
    credentials: authUsesCookies() ? 'include' : 'same-origin',
    ...init,
    headers,
  }).then((res) => {
    if (res.status === 401 && !/\/api\/tenants\/public\//.test(path)) noteUnauthorized(path, startedEpoch)
    return res
  })
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText
    let code: string | undefined
    try {
      const body = (await res.json()) as { error?: string; code?: string }
      if (body.error) message = body.error
      code = body.code
    } catch {
      message = await res.text().catch(() => message)
    }
    const err = new Error(message) as Error & { status: number; code?: string }
    err.status = res.status
    err.code = code
    throw err
  }
  return (await res.json()) as T
}

function opts(init?: RequestInit): RequestInit {
  return { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }
}

export type PublicTenant = {
  slug: string
  name: string
  cityName: string
  status: TenantStatus
  operationMode: OperationMode
  timezone: string
  locale: string
  loginAllowed: boolean
}

export type AccessibleTenant = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  operationMode: OperationMode
  timezone: string
  role: string
}

export type AdminTenant = {
  id: string
  name: string
  slug: string
  description: string | null
  status: TenantStatus
  operationMode: OperationMode
  settings: Record<string, unknown>
  timezone: string
  locale: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  memberCount?: number
  assetCount?: number
  cityName?: string
}

export async function fetchPublicTenant(slug: string): Promise<PublicTenant> {
  return parse(await sessionFetch(`/api/tenants/public/${encodeURIComponent(slug)}`, { credentials: 'include' }))
}

export async function fetchAccessibleTenants(): Promise<{
  isPlatformSuperAdmin: boolean
  tenants: AccessibleTenant[]
}> {
  return parse(await sessionFetch('/api/tenants/accessible', { credentials: 'include' }))
}

export type PlatformOverview = {
  tenants: {
    total: number
    provisioning: number
    active: number
    suspended: number
    archived: number
    demo: number
    real: number
  }
  users: { total: number }
  assets: { total: number; running: number; alert: number; inactive: number }
  cities: Array<{
    id: string
    name: string
    slug: string
    status: TenantStatus
    operationMode: OperationMode
    memberCount: number
    assetCount: number
    runningAssetCount: number
  }>
}

export async function fetchPlatformOverview() {
  return parse<PlatformOverview>(await sessionFetch('/api/mng/overview', { credentials: 'include' }))
}

export async function fetchAdminTenants(query?: { search?: string; status?: string; mode?: string }) {
  const params = new URLSearchParams()
  if (query?.search) params.set('search', query.search)
  if (query?.status) params.set('status', query.status)
  if (query?.mode) params.set('mode', query.mode)
  const qs = params.toString()
  return parse<{ tenants: AdminTenant[] }>(await sessionFetch(`/api/mng/tenants${qs ? `?${qs}` : ''}`, { credentials: 'include' }))
}

export async function fetchAdminTenant(id: string) {
  return parse<AdminTenant>(await sessionFetch(`/api/mng/tenants/${id}`, { credentials: 'include' }))
}

export async function searchMunicipalities(query: string) {
  const params = new URLSearchParams({ q: query })
  return parse<{ municipalities: { id: number; name: string; uf: string }[] }>(
    await sessionFetch(`/api/mng/municipalities?${params}`, { credentials: 'include' }),
  )
}

export async function createAdminTenant(body: {
  name: string
  slug: string
  description?: string
  operationMode: OperationMode
  timezone?: string
  locale?: string
  mapIbgeId: number
}) {
  return parse<{ tenant: AdminTenant; job: unknown }>(
    await sessionFetch('/api/mng/tenants', opts({ method: 'POST', body: JSON.stringify(body) })),
  )
}

export async function patchAdminTenant(id: string, body: Record<string, unknown>) {
  return parse<AdminTenant>(
    await sessionFetch(`/api/mng/tenants/${id}`, opts({ method: 'PATCH', body: JSON.stringify(body) })),
  )
}

export async function changeAdminTenantStatus(id: string, status: TenantStatus) {
  return parse<AdminTenant>(
    await sessionFetch(`/api/mng/tenants/${id}/status`, opts({ method: 'POST', body: JSON.stringify({ status, confirm: true }) })),
  )
}

export async function duplicateAdminTenant(
  id: string,
  body: {
    name: string
    slug: string
    description?: string
    operationMode: OperationMode
    copy: Partial<DuplicateCopyOptions>
  },
) {
  return parse<{ tenant: AdminTenant; job: unknown }>(
    await sessionFetch(`/api/mng/tenants/${id}/duplicate`, opts({ method: 'POST', body: JSON.stringify(body) })),
  )
}

export async function fetchTenantMembers(id: string) {
  return parse<{ members: { id: string; userId: string; role: string; email: string | null; displayName: string }[] }>(
    await sessionFetch(`/api/mng/tenants/${id}/members`, { credentials: 'include' }),
  )
}

export async function fetchTenantEvents(id: string) {
  return parse<{ events: { id: string; action: string; payload: Record<string, unknown>; created_at: string }[] }>(
    await sessionFetch(`/api/mng/tenants/${id}/events`, { credentials: 'include' }),
  )
}

export async function fetchTenantJobs(id: string) {
  return parse<{ jobs: { id: string; status: string; kind: string; steps: unknown; error: string | null; created_at: string }[] }>(
    await sessionFetch(`/api/mng/tenants/${id}/jobs`, { credentials: 'include' }),
  )
}

export async function retryTenantJob(tenantId: string, jobId: string) {
  return parse(
    await sessionFetch(`/api/mng/tenants/${tenantId}/jobs/${jobId}/retry`, opts({ method: 'POST', body: '{}' })),
  )
}

export async function cancelTenantJob(tenantId: string, jobId: string) {
  return parse(
    await sessionFetch(`/api/mng/tenants/${tenantId}/jobs/${jobId}/cancel`, opts({ method: 'POST', body: '{}' })),
  )
}

export type CitySuperAdmin = {
  id: string
  userId: string
  email: string | null
  displayName: string
  status: 'active' | 'inactive'
  groupName: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  createdAt: string
}

export async function fetchCitySuperAdmins() {
  return parse<{ admins: CitySuperAdmin[] }>(await sessionFetch('/api/mng/city-admins', { credentials: 'include' }))
}

export async function createCitySuperAdmin(body: {
  tenantId: string
  email: string
  displayName?: string
  password?: string
}) {
  return parse<{
    userId: string
    email: string
    tenantId: string
    tenantName: string
    tenantSlug: string
    groupName: string
    linkedExisting: boolean
    temporaryPassword?: string
  }>(await sessionFetch('/api/mng/city-admins', opts({ method: 'POST', body: JSON.stringify(body) })))
}

export type PlatformSuperAdmin = {
  userId: string
  email: string | null
  displayName: string
  status: 'active' | 'inactive'
  isOriginal: boolean
  createdAt: string
}

export async function fetchPlatformAdmins() {
  return parse<{ admins: PlatformSuperAdmin[] }>(
    await sessionFetch('/api/mng/platform-admins', { credentials: 'include' }),
  )
}

export async function createPlatformAdmin(body: { email: string; displayName?: string; password?: string }) {
  return parse<{
    userId: string
    email: string
    linkedExisting: boolean
    temporaryPassword?: string
  }>(await sessionFetch('/api/mng/platform-admins', opts({ method: 'POST', body: JSON.stringify(body) })))
}

export async function patchPlatformAdmin(userId: string, status: 'active' | 'inactive') {
  return parse<{ userId: string; status: 'active' | 'inactive' }>(
    await sessionFetch(`/api/mng/platform-admins/${userId}`, opts({ method: 'PATCH', body: JSON.stringify({ status }) })),
  )
}

export async function deletePlatformAdmin(userId: string) {
  const res = await sessionFetch(`/api/mng/platform-admins/${userId}`, opts({ method: 'DELETE' }))
  if (!res.ok && res.status !== 204) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status: number }
    err.status = res.status
    throw err
  }
}

export async function fetchPlatformMe() {
  return parse<{ user: { id: string; email?: string }; role: 'platform_super_admin'; isOriginal?: boolean }>(
    await sessionFetch('/api/mng/me', { credentials: 'include' }),
  )
}

export type InfraHostSample = {
  at: string
  cpuPercent: number
  memUsedBytes: number
  memTotalBytes: number
  memPercent: number
  diskUsedBytes: number
  diskTotalBytes: number
  diskPercent: number
  load1: number
  uptimeSec: number
}

export type InfraTrafficEntry = {
  at: string
  direction: 'inbound' | 'outbound'
  target: 'fogo-api' | 'supabase' | 'openai' | 'turnstile' | 'weather' | 'osm' | 'external'
  method: string
  path: string
  status: number
  durationMs: number
  tenant?: string | null
  error?: string | null
}

export type InfraAccessEntry = {
  at: string
  event: string
  email: string | null
  ip: string | null
  message: string
  status?: number | null
}

export type PlatformInfraSnapshot = {
  host: {
    hostname: string
    platform: string
    arch: string
    cpus: number
    cpuModel?: string
    memTotalBytes?: number
    diskTotalBytes?: number
    node: string
    pid: number
    osPretty?: string
    osFamily?: string
  }
  current: InfraHostSample
  series: InfraHostSample[]
  historyHour?: InfraHostSample[]
  historyDay?: InfraHostSample[]
  historyWeek?: InfraHostSample[]
  inbound: InfraTrafficEntry[]
  outbound: InfraTrafficEntry[]
  access: InfraAccessEntry[]
}

export async function fetchPlatformInfra() {
  return parse<PlatformInfraSnapshot>(await sessionFetch('/api/mng/infra', { credentials: 'include' }))
}

export type PlatformFirewallConfig = {
  clientIp: string | null
  siteAllow: string[]
  siteDeny: string[]
  mngAllow: string[]
  cityLogin?: Record<string, string[]>
  updatedAt: string | null
  nginxHost: boolean
  applied?: boolean
  detail?: string
}

export type PlatformSessionPolicy = {
  ttlMinutes: number
  updatedAt: string | null
}

export async function fetchPlatformSessionPolicy() {
  return parse<PlatformSessionPolicy>(await sessionFetch('/api/mng/session-policy', { credentials: 'include' }))
}

export async function savePlatformSessionPolicy(ttlMinutes: number) {
  return parse<PlatformSessionPolicy>(
    await sessionFetch('/api/mng/session-policy', opts({ method: 'PUT', body: JSON.stringify({ ttlMinutes }) })),
  )
}

export async function fetchPlatformFirewall() {
  return parse<PlatformFirewallConfig>(await sessionFetch('/api/mng/firewall', { credentials: 'include' }))
}

export async function savePlatformFirewall(body: {
  siteAllow: string[]
  siteDeny: string[]
  mngAllow: string[]
  includeMyIp: boolean
}) {
  return parse<PlatformFirewallConfig>(
    await sessionFetch('/api/mng/firewall', opts({ method: 'PUT', body: JSON.stringify(body) })),
  )
}
