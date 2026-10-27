import type { Request } from 'express'
import {
  FOGO_TENANT_HEADER,
  normalizeTenantSlug,
  validateTenantSlug,
  type TenantStatus,
} from '../../../src/lib/tenant.js'
import { HttpError } from '../httpError.js'

export type TenantAccessDecision =
  | { ok: true; reason: 'member' | 'platform_admin' }
  | { ok: false; status: number; code: string; message: string }

export function readTenantSlugFromRequest(req: Request, fallbackSlug: string | null): string | null {
  const header = req.headers[FOGO_TENANT_HEADER.toLowerCase()]
  const fromHeader = Array.isArray(header) ? header[0] : header
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return normalizeTenantSlug(fromHeader)
  }
  const q = req.query.tenant
  if (typeof q === 'string' && q.trim()) return normalizeTenantSlug(q)
  return fallbackSlug ? normalizeTenantSlug(fallbackSlug) : null
}

export function assertValidRequestedSlug(slug: string): string {
  const parsed = validateTenantSlug(slug)
  if (!parsed.ok) {
    throw new HttpError(400, parsed.error, 'TENANT_SLUG_INVALID')
  }
  return parsed.slug
}

export function operationalAccessForStatus(status: TenantStatus): TenantAccessDecision {
  switch (status) {
    case 'active':
      return { ok: true, reason: 'member' }
    case 'provisioning':
      return {
        ok: false,
        status: 403,
        code: 'TENANT_PROVISIONING',
        message: 'Esta cidade ainda está em provisionamento.',
      }
    case 'suspended':
      return {
        ok: false,
        status: 403,
        code: 'TENANT_SUSPENDED',
        message: 'Esta cidade está suspensa. O acesso operacional foi bloqueado.',
      }
    case 'archived':
      return {
        ok: false,
        status: 403,
        code: 'TENANT_ARCHIVED',
        message: 'Esta cidade foi arquivada e não está mais disponível.',
      }
  }
}

export function authorizeTenantAccess(input: {
  hasMembership: boolean
  isPlatformAdmin: boolean
  orgStatus: TenantStatus
}): TenantAccessDecision {
  if (!input.hasMembership && !input.isPlatformAdmin) {
    return {
      ok: false,
      status: 403,
      code: 'CROSS_TENANT',
      message: 'Usuário sem acesso a esta cidade.',
    }
  }
  const statusAccess = operationalAccessForStatus(input.orgStatus)
  if (!statusAccess.ok) return statusAccess
  return { ok: true, reason: input.hasMembership ? 'member' : 'platform_admin' }
}

export function throwIfCrossTenantBody(body: unknown) {
  if (!body || typeof body !== 'object') return
  const rec = body as Record<string, unknown>
  if ('organization_id' in rec || 'organizationId' in rec || 'tenant_id' in rec || 'tenantId' in rec) {
    throw new HttpError(
      400,
      'Não envie identificador de cidade no corpo da requisição. O tenant é resolvido pela sessão e pelo cabeçalho X-Fogo-Tenant.',
      'TENANT_INJECTION',
    )
  }
}
