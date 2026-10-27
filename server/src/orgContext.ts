import type { SupabaseClient } from '@supabase/supabase-js'
import type { CcoMemberRole } from '../../src/lib/ccoPermissions.js'
import { fullPermissions } from '../../src/lib/ccoPermissions.js'
import { HttpError } from './httpError.js'
import { resolveMemberPermissions, type ResolvedActor } from './permissions.js'
import type { FogoDb } from './supabase.js'
import { authorizeTenantAccess } from './tenant/access.js'
import type { TenantRecord } from './tenant/orgs.js'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class ForbiddenOrgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenOrgError'
  }
}

export type RequestActor = ResolvedActor

export type RequestFogoDb = FogoDb & {
  actor?: RequestActor
}

export async function resolveRequestContext(
  supabase: SupabaseClient,
  tenant: TenantRecord,
  authHeader: string | undefined,
): Promise<RequestFogoDb> {
  const base: RequestFogoDb = {
    orgId: tenant.id,
    orgSlug: tenant.slug,
    supabase,
    tenant,
  }

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Autenticação necessária')
  }

  const token = authHeader.slice(7)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AuthError('Sessão inválida ou expirada')

  const user = data.user

  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select(
      'role, permissions, group_id, scope_region, scope_org, location_share_until, status, organization_groups ( permissions, scope_region, scope_org )',
    )
    .eq('organization_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (memErr) throw memErr

  const { data: platformAdmin, error: paErr } = await supabase
    .from('platform_admins')
    .select('user_id, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (paErr) throw paErr
  const isActivePlatformAdmin = !!platformAdmin && platformAdmin.status !== 'inactive'

  const memberActive = !!membership && (membership as { status?: string }).status !== 'inactive'
  if (membership && !memberActive && !isActivePlatformAdmin) {
    throw new HttpError(403, 'Esta conta está inativa nesta cidade. Solicite reativação ao administrador.', 'MEMBER_INACTIVE')
  }

  const access = authorizeTenantAccess({
    hasMembership: memberActive,
    isPlatformAdmin: isActivePlatformAdmin,
    orgStatus: tenant.status,
  })
  if (!access.ok) {
    if (access.code === 'CROSS_TENANT') {
      throw new ForbiddenOrgError(access.message)
    }
    throw new HttpError(access.status, access.message, access.code)
  }

  if (!memberActive) {
    return {
      ...base,
      actor: {
        userId: user.id,
        email: user.email,
        role: 'admin',
        permissions: fullPermissions(),
        isPlatformSuperAdmin: isActivePlatformAdmin,
        memberRole: 'admin',
        displayName: (user.user_metadata?.display_name as string | undefined) ?? user.email ?? null,
      },
    }
  }

  const memberRole = membership.role as CcoMemberRole
  const groupRow = membership.organization_groups as {
    permissions?: unknown
    scope_region?: string | null
    scope_org?: string | null
  } | null
  const permissions = resolveMemberPermissions(
    memberRole,
    membership.permissions,
    groupRow?.permissions ?? null,
  )
  const scopeRegion = (membership.scope_region as string | null) || groupRow?.scope_region || null
  const scopeOrg = (membership.scope_org as string | null) || groupRow?.scope_org || null

  return {
    ...base,
    actor: {
      userId: user.id,
      email: user.email,
      role: memberRole,
      permissions,
      isPlatformSuperAdmin: isActivePlatformAdmin,
      memberRole,
      scopeRegion,
      scopeOrg,
      locationShareUntil: (membership.location_share_until as string | null) ?? null,
      displayName: (user.user_metadata?.display_name as string | undefined) ?? user.email ?? null,
    },
  }
}
