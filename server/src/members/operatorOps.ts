import { randomBytes } from 'node:crypto'
import type { CcoMemberRole } from '../../../src/lib/ccoPermissions.js'
import {
  isCityAdminGroupName,
  normalizeMemberRole,
  permissionsForRole,
  serializePermissions,
} from '../../../src/lib/ccoPermissions.js'
import type { FogoDb } from '../db.js'
import { writeAudit } from '../audit.js'
import { MUST_CHANGE_PASSWORD } from './authMeta.js'
import { MIN_PASSWORD_LENGTH } from '../security/constants.js'
import { revokeUserSessions } from '../security/revokeSessions.js'
import { HttpError } from '../httpError.js'

export type MemberStatus = 'active' | 'inactive'

function generateTempPassword(): string {
  return randomBytes(24).toString('base64url')
}

function persistStatus(raw: unknown): MemberStatus {
  return raw === 'inactive' ? 'inactive' : 'active'
}

function toIsoOrNull(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function persistRole(role: string | undefined | null): CcoMemberRole {
  const n = normalizeMemberRole(role)
  return n === 'viewer' ? 'auditor' : n
}

function maskEmail(email: string | null): string | null {
  if (!email || !email.includes('@')) return email
  const [user, domain] = email.split('@')
  const head = (user ?? '').slice(0, 1) || '*'
  return `${head}***@${domain}`
}

export async function mapOperatorRow(
  supabase: FogoDb['supabase'],
  m: {
    id: string
    role: string
    permissions: unknown
    created_at: string
    user_id: string
    group_id: string | null
    scope_region?: string | null
    scope_org?: string | null
    location_share_until?: string | null
    status?: string | null
    organization_groups?: { id: string; name: string } | { id: string; name: string }[] | null
  },
  opts?: { maskPii?: boolean },
) {
  const { data: userData } = await supabase.auth.admin.getUserById(m.user_id)
  const role = persistRole(m.role)
  const grp = Array.isArray(m.organization_groups)
    ? m.organization_groups[0]
    : m.organization_groups ?? null
  const email = userData.user?.email ?? null
  const displayName =
    (userData.user?.user_metadata?.display_name as string | undefined) ?? email ?? m.user_id
  return {
    id: m.id,
    userId: m.user_id,
    role,
    permissions: serializePermissions(permissionsForRole(role)),
    groupId: m.group_id,
    groupName: grp?.name ?? null,
    scopeRegion: m.scope_region ?? null,
    scopeOrg: m.scope_org ?? null,
    locationShareUntil: m.location_share_until ?? null,
    status: persistStatus(m.status),
    createdAt: m.created_at,
    email: opts?.maskPii ? maskEmail(email) : email,
    displayName: opts?.maskPii && email && displayName === email ? maskEmail(email)! : displayName,
  }
}

export async function listOrgOperators(db: FogoDb, opts?: { maskPii?: boolean }) {
  const { data, error } = await db.supabase
    .from('organization_members')
    .select(
      'id, role, permissions, created_at, user_id, group_id, scope_region, scope_org, location_share_until, status, organization_groups ( id, name )',
    )
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return Promise.all((data ?? []).map((m) => mapOperatorRow(db.supabase, m, opts)))
}

async function loadGroup(db: FogoDb, groupId: string) {
  const { data, error } = await db.supabase
    .from('organization_groups')
    .select('id, name')
    .eq('organization_id', db.orgId)
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Grupo não encontrado')
  return data
}

function resolveCityMemberRole(
  requested: CcoMemberRole | undefined,
  groupName: string | null,
  opts?: { allowLegacyAdminWithoutGroup?: boolean },
): CcoMemberRole {
  if (groupName && isCityAdminGroupName(groupName)) return 'admin'
  const role = persistRole(requested ?? 'operator')
  if (role === 'admin') {
    if (opts?.allowLegacyAdminWithoutGroup && !groupName) return 'admin'
    throw new Error(
      'Administrador de plataforma não é um papel da cidade. Use o grupo Administrador de cidade ou Administrador do sistema.',
    )
  }
  return role
}

export async function inviteOrgOperator(
  db: FogoDb,
  body: {
    email: string
    password?: string
    displayName?: string
    role?: CcoMemberRole
    groupId?: string
    scopeRegion?: string | null
    scopeOrg?: string | null
    locationShareUntil?: string | null
  },
) {
  const { email, displayName, role, groupId } = body
  if (!email?.trim()) throw new Error('E-mail é obrigatório')
  const supplied = body.password?.trim() ?? ''
  const generated = !supplied
  const password = supplied || generateTempPassword()
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  }

  const group = groupId ? await loadGroup(db, groupId) : null
  const memberRole = resolveCityMemberRole(role, group?.name ?? null)
  const adminGroup = memberRole === 'admin'

  const permJson = serializePermissions(permissionsForRole(memberRole))
  const scopeRegion = adminGroup ? null : body.scopeRegion?.trim() || null
  const scopeOrg = adminGroup ? null : body.scopeOrg?.trim() || null
  const locationShareUntil =
    memberRole === 'field' ? toIsoOrNull(body.locationShareUntil) : null

  let userId: string
  let linkedExisting = false

  const { data: created, error: createErr } = await db.supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName?.trim() || email.trim(),
      [MUST_CHANGE_PASSWORD]: true,
    },
  })

  if (createErr) {
    if (!createErr.message.includes('already been registered')) throw createErr
    const { data: list } = await db.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
    if (!existing) throw new Error(createErr.message)
    userId = existing.id
    linkedExisting = true
  } else {
    userId = created.user!.id
  }

  const { error: memErr } = await db.supabase.from('organization_members').upsert(
    {
      organization_id: db.orgId,
      user_id: userId,
      role: memberRole,
      permissions: permJson,
      group_id: groupId ?? null,
      scope_region: scopeRegion,
      scope_org: scopeOrg,
      location_share_until: locationShareUntil,
      status: 'active',
    },
    { onConflict: 'organization_id,user_id' },
  )
  if (memErr) throw memErr

  await writeAudit(db, 'operator.invite', 'organization_member', {
    userId,
    email: email.trim(),
    role: memberRole,
    groupId: groupId ?? null,
    scopeRegion,
    scopeOrg,
    locationShareUntil,
    linkedExisting,
  })

  return {
    userId,
    email: email.trim(),
    role: memberRole,
    groupId: groupId ?? null,
    scopeRegion,
    scopeOrg,
    linkedExisting,
    temporaryPassword: generated && !linkedExisting ? password : undefined,
  }
}

export async function updateOrgOperator(
  db: FogoDb,
  userId: string,
  body: {
    role?: CcoMemberRole
    groupId?: string | null
    password?: string
    displayName?: string
    scopeRegion?: string | null
    scopeOrg?: string | null
    locationShareUntil?: string | null
    status?: MemberStatus
  },
) {
  const { data: existing, error: findErr } = await db.supabase
    .from('organization_members')
    .select('id, role, group_id, scope_region, scope_org, location_share_until, status')
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (findErr) throw findErr
  if (!existing) throw new Error('Operador não encontrado')

  const nextStatus = body.status !== undefined ? persistStatus(body.status) : persistStatus(existing.status)
  if (nextStatus === 'inactive' && userId === db.actor?.userId) {
    throw new HttpError(400, 'Você não pode inativar o próprio usuário.')
  }

  let groupId: string | null | undefined = body.groupId
  if (groupId === undefined) groupId = existing.group_id ?? null
  const group = groupId ? await loadGroup(db, groupId) : null
  const nextRole = resolveCityMemberRole(body.role ?? persistRole(existing.role), group?.name ?? null, {
    allowLegacyAdminWithoutGroup: persistRole(existing.role) === 'admin' && !groupId,
  })
  const adminGroup = nextRole === 'admin'

  const scopeRegion =
    adminGroup ? null : body.scopeRegion !== undefined ? body.scopeRegion?.trim() || null : existing.scope_region
  const scopeOrg =
    adminGroup ? null : body.scopeOrg !== undefined ? body.scopeOrg?.trim() || null : existing.scope_org
  const locationShareUntil =
    nextRole === 'field'
      ? body.locationShareUntil !== undefined
        ? toIsoOrNull(body.locationShareUntil)
        : existing.location_share_until
      : null

  const { error: updErr } = await db.supabase
    .from('organization_members')
    .update({
      role: nextRole,
      permissions: serializePermissions(permissionsForRole(nextRole)),
      group_id: groupId ?? null,
      scope_region: scopeRegion,
      scope_org: scopeOrg,
      location_share_until: locationShareUntil,
      status: nextStatus,
    })
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
  if (updErr) throw updErr

  if (body.password && body.password.length >= MIN_PASSWORD_LENGTH) {
    await db.supabase.auth.admin.updateUserById(userId, { password: body.password })
    await revokeUserSessions(userId)
  }
  if (body.displayName?.trim()) {
    const { data: u } = await db.supabase.auth.admin.getUserById(userId)
    const prevMeta = (u.user?.user_metadata ?? {}) as Record<string, unknown>
    await db.supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...prevMeta, display_name: body.displayName.trim() },
    })
  }

  const roleChanged = persistRole(existing.role) !== nextRole
  const scopeChanged =
    (existing.scope_region ?? null) !== (scopeRegion ?? null) ||
    (existing.scope_org ?? null) !== (scopeOrg ?? null) ||
    (existing.group_id ?? null) !== (groupId ?? null)
  const statusChanged = persistStatus(existing.status) !== nextStatus

  if (roleChanged || scopeChanged || (statusChanged && nextStatus === 'inactive')) {
    await revokeUserSessions(userId)
    await writeAudit(db, 'operator.session_revoke', 'organization_member', {
      userId,
      reason: nextStatus === 'inactive' ? 'deactivated' : roleChanged ? 'role_change' : 'scope_change',
    })
  }

  await writeAudit(db, 'operator.update', 'organization_member', {
    userId,
    before: {
      role: existing.role,
      groupId: existing.group_id,
      scopeRegion: existing.scope_region,
      scopeOrg: existing.scope_org,
      status: persistStatus(existing.status),
    },
    after: {
      role: nextRole,
      groupId: groupId ?? null,
      scopeRegion,
      scopeOrg,
      locationShareUntil,
      status: nextStatus,
    },
  })

  if (statusChanged) {
    await writeAudit(db, nextStatus === 'inactive' ? 'operator.deactivate' : 'operator.activate', 'organization_member', {
      userId,
      status: nextStatus,
    })
  }

  return {
    userId,
    role: nextRole,
    groupId: groupId ?? null,
    scopeRegion,
    scopeOrg,
    locationShareUntil,
    status: nextStatus,
  }
}

export async function removeOrgOperator(db: FogoDb, userId: string) {
  if (userId === db.actor?.userId) {
    throw new HttpError(400, 'Você não pode remover seu próprio usuário.')
  }
  const { error } = await db.supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', db.orgId)
    .eq('user_id', userId)
  if (error) throw error
  await revokeUserSessions(userId)
  await writeAudit(db, 'operator.remove', 'organization_member', { userId })
  await writeAudit(db, 'operator.session_revoke', 'organization_member', { userId, reason: 'removed' })
}
