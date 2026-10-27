import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MUST_CHANGE_PASSWORD } from '../members/authMeta.js'
import { HttpError } from '../httpError.js'
import { MIN_PASSWORD_LENGTH } from '../security/constants.js'
import { revokeUserSessions } from '../security/revokeSessions.js'

export type PlatformAdminStatus = 'active' | 'inactive'

export type PlatformAdminRecord = {
  userId: string
  email: string | null
  displayName: string
  status: PlatformAdminStatus
  isOriginal: boolean
  createdAt: string
}

export type PlatformAdminActor = { userId: string; email?: string }

function generateTempPassword(): string {
  return randomBytes(24).toString('base64url')
}

export function canMutatePlatformAdmin(input: {
  targetIsOriginal: boolean
  targetUserId: string
  actorUserId: string
}): { ok: true } | { ok: false; status: number; code: string; message: string } {
  if (input.targetIsOriginal) {
    return {
      ok: false,
      status: 403,
      code: 'PLATFORM_ADMIN_PROTECTED',
      message: 'O superadministrador original da plataforma não pode ser inativado nem excluído.',
    }
  }
  if (input.targetUserId === input.actorUserId) {
    return {
      ok: false,
      status: 400,
      code: 'PLATFORM_ADMIN_SELF',
      message: 'Você não pode inativar ou excluir a própria conta.',
    }
  }
  return { ok: true }
}

async function mapRow(
  supabase: SupabaseClient,
  row: { user_id: string; status?: string | null; is_original?: boolean | null; created_at: string },
): Promise<PlatformAdminRecord> {
  const { data: userData } = await supabase.auth.admin.getUserById(row.user_id)
  const email = userData.user?.email ?? null
  return {
    userId: row.user_id,
    email,
    displayName:
      (userData.user?.user_metadata?.display_name as string | undefined) ?? email ?? row.user_id,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    isOriginal: row.is_original === true,
    createdAt: row.created_at,
  }
}

export async function listPlatformAdmins(supabase: SupabaseClient): Promise<PlatformAdminRecord[]> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id, status, is_original, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return Promise.all((data ?? []).map((row) => mapRow(supabase, row)))
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return list.users.find((u) => u.email?.toLowerCase() === email) ?? null
}

export async function createPlatformAdmin(
  supabase: SupabaseClient,
  input: { email: string; displayName?: string; password?: string },
) {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new HttpError(400, 'Informe o e-mail.', 'EMAIL_REQUIRED')

  const supplied = input.password?.trim() ?? ''
  const generated = !supplied
  const password = supplied || generateTempPassword()
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`, 'PASSWORD_TOO_SHORT')
  }

  let userId: string
  let linkedExisting = false

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: input.displayName?.trim() || email,
      [MUST_CHANGE_PASSWORD]: true,
    },
  })

  if (createErr) {
    if (!createErr.message.includes('already been registered')) throw createErr
    const existing = await findAuthUserByEmail(supabase, email)
    if (!existing) throw new HttpError(409, createErr.message, 'USER_EXISTS')
    userId = existing.id
    linkedExisting = true
    if (supplied) {
      await supabase.auth.admin.updateUserById(userId, { password })
    }
    if (input.displayName?.trim()) {
      const { data: u } = await supabase.auth.admin.getUserById(userId)
      const prevMeta = (u.user?.user_metadata ?? {}) as Record<string, unknown>
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...prevMeta, display_name: input.displayName.trim() },
      })
    }
  } else {
    userId = created.user!.id
  }

  const { data: current, error: findErr } = await supabase
    .from('platform_admins')
    .select('user_id, status, is_original, created_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (findErr) throw findErr

  if (current?.is_original) {
    throw new HttpError(409, 'Esta conta já é o superadministrador original da plataforma.', 'PLATFORM_ADMIN_PROTECTED')
  }

  if (current && current.status !== 'inactive') {
    throw new HttpError(409, 'Esta conta já é superadministrador da plataforma.', 'PLATFORM_ADMIN_EXISTS')
  }

  const { error: upsertErr } = await supabase.from('platform_admins').upsert(
    {
      user_id: userId,
      status: 'active',
      is_original: false,
    },
    { onConflict: 'user_id' },
  )
  if (upsertErr) throw upsertErr

  return {
    userId,
    email,
    linkedExisting: linkedExisting || !!current,
    temporaryPassword: generated && !linkedExisting && !current ? password : undefined,
  }
}

async function loadTarget(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id, status, is_original, created_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Superadministrador da plataforma não encontrado.', 'PLATFORM_ADMIN_NOT_FOUND')
  return data
}

export async function setPlatformAdminStatus(
  supabase: SupabaseClient,
  userId: string,
  status: PlatformAdminStatus,
  actor: PlatformAdminActor,
) {
  const target = await loadTarget(supabase, userId)
  const gate = canMutatePlatformAdmin({
    targetIsOriginal: target.is_original === true,
    targetUserId: target.user_id,
    actorUserId: actor.userId,
  })
  if (!gate.ok) throw new HttpError(gate.status, gate.message, gate.code)

  const { error } = await supabase.from('platform_admins').update({ status }).eq('user_id', userId)
  if (error) throw error
  if (status === 'inactive') await revokeUserSessions(userId)
  return { userId, status }
}

export async function removePlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
  actor: PlatformAdminActor,
) {
  const target = await loadTarget(supabase, userId)
  const gate = canMutatePlatformAdmin({
    targetIsOriginal: target.is_original === true,
    targetUserId: target.user_id,
    actorUserId: actor.userId,
  })
  if (!gate.ok) throw new HttpError(gate.status, gate.message, gate.code)

  const { error } = await supabase.from('platform_admins').delete().eq('user_id', userId)
  if (error) throw error
  await revokeUserSessions(userId)
}
