import {
  CITY_ADMIN_GROUP_CIDADE,
  foldGroupName,
  isSystemAdminGroupName,
  normalizeMemberRole,
} from '../../../src/lib/ccoPermissions.js'
import type { FogoDb } from '../db.js'
import { dbForTenant } from '../db.js'
import { HttpError, isHttpError } from '../httpError.js'
import { ensureDefaultOrgGroups } from '../members/groupOps.js'
import { inviteOrgOperator } from '../members/operatorOps.js'
import { writeTenantAdminEvent } from '../tenant/adminEvents.js'
import { listOrganizations, loadOrgById } from '../tenant/orgs.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CitySuperAdminActor = { userId?: string; email?: string }

export type CitySuperAdminRecord = {
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

function groupNameOf(
  raw: { id: string; name: string } | { id: string; name: string }[] | null | undefined,
): string | null {
  if (!raw) return null
  return (Array.isArray(raw) ? raw[0] : raw)?.name ?? null
}

/** SuperADM municipal = grupo Administrador de cidade (ou admin legado sem grupo). */
export function isCitySuperAdminMember(input: { role: string; groupName?: string | null }): boolean {
  const groupName = input.groupName?.trim() || null
  if (groupName && isSystemAdminGroupName(groupName)) return false
  if (groupName && foldGroupName(groupName) === foldGroupName(CITY_ADMIN_GROUP_CIDADE)) return true
  return normalizeMemberRole(input.role) === 'admin' && !groupName
}

async function resolveCityAdminGroupId(db: FogoDb): Promise<string> {
  await ensureDefaultOrgGroups(db)
  const { data, error } = await db.supabase
    .from('organization_groups')
    .select('id, name')
    .eq('organization_id', db.orgId)
  if (error) throw error
  const group = (data ?? []).find((g) => foldGroupName(g.name) === foldGroupName(CITY_ADMIN_GROUP_CIDADE))
  if (!group) {
    throw new HttpError(
      500,
      'O grupo Administrador de cidade não está disponível nesta cidade.',
      'CITY_ADMIN_GROUP_MISSING',
    )
  }
  return group.id
}

export async function listCitySuperAdmins(supabase: SupabaseClient): Promise<CitySuperAdminRecord[]> {
  const tenants = await listOrganizations(supabase)
  const byId = new Map(tenants.map((t) => [t.id, t]))
  const ids = tenants.map((t) => t.id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      'id, user_id, role, group_id, status, created_at, organization_id, organization_groups ( id, name )',
    )
    .in('organization_id', ids)
    .eq('role', 'admin')
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []).filter((m) =>
    isCitySuperAdminMember({ role: m.role, groupName: groupNameOf(m.organization_groups) }),
  )

  return Promise.all(
    rows.map(async (m) => {
      const tenant = byId.get(m.organization_id)
      const { data: userData } = await supabase.auth.admin.getUserById(m.user_id)
      const email = userData.user?.email ?? null
      const displayName =
        (userData.user?.user_metadata?.display_name as string | undefined) ?? email ?? m.user_id
      return {
        id: m.id,
        userId: m.user_id,
        email,
        displayName,
        status: m.status === 'inactive' ? 'inactive' : 'active',
        groupName: groupNameOf(m.organization_groups) ?? CITY_ADMIN_GROUP_CIDADE,
        tenantId: m.organization_id,
        tenantName: tenant?.name ?? 'Cidade',
        tenantSlug: tenant?.slug ?? '',
        createdAt: m.created_at,
      }
    }),
  )
}

export async function createCitySuperAdmin(
  supabase: SupabaseClient,
  input: {
    tenantId: string
    email: string
    displayName?: string
    password?: string
    actor?: CitySuperAdminActor
  },
) {
  if (!input.tenantId.trim()) throw new HttpError(400, 'Selecione a cidade.', 'TENANT_REQUIRED')
  const tenant = await loadOrgById(supabase, input.tenantId)
  if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
  if (tenant.status === 'archived') {
    throw new HttpError(400, 'Não é possível criar administrador em cidade arquivada.', 'TENANT_ARCHIVED')
  }

  const scoped: FogoDb = {
    ...dbForTenant(supabase, tenant),
    actor: input.actor,
  }

  try {
    const groupId = await resolveCityAdminGroupId(scoped)
    const result = await inviteOrgOperator(scoped, {
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      role: 'admin',
      groupId,
    })

    await writeTenantAdminEvent(supabase, {
      organizationId: tenant.id,
      actorUserId: input.actor?.userId ?? null,
      action: 'city_admin.create',
      payload: {
        userId: result.userId,
        email: result.email,
        linkedExisting: result.linkedExisting,
      },
    })

    return {
      ...result,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      groupName: CITY_ADMIN_GROUP_CIDADE,
    }
  } catch (e) {
    if (isHttpError(e)) throw e
    throw new HttpError(400, e instanceof Error ? e.message : 'Falha ao criar o superadministrador.', 'CITY_ADMIN_CREATE_FAILED')
  }
}
