import type { FogoDb } from '../db.js'
import { writeAudit } from '../audit.js'
import { MUST_CHANGE_PASSWORD, mustChangePasswordFromMeta } from './authMeta.js'
import { MIN_PASSWORD_LENGTH } from '../security/constants.js'
import { isAllowedAvatarUrl, publicAvatarPath } from '../security/avatarUrl.js'
import { goTruePasswordGrant } from '../auth/goTrueClient.js'
import { serverAuthBffEnabled } from '../auth/bffMode.js'

export type UserProfileDto = {
  userId: string
  email: string | null
  displayName: string
  avatarUrl: string | null
  role: string
  mustChangePassword: boolean
}

export async function getActorProfile(db: FogoDb): Promise<UserProfileDto | null> {
  const actor = db.actor
  if (!actor) return null

  const { data: userData, error } = await db.supabase.auth.admin.getUserById(actor.userId)
  if (error) throw error
  const user = userData.user
  if (!user) return null

  const meta = user.user_metadata ?? {}
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName:
      (meta.display_name as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      'Operador',
    avatarUrl: (meta.avatar_url as string | undefined)?.trim() || null,
    role: actor.role,
    mustChangePassword: mustChangePasswordFromMeta(meta as Record<string, unknown>),
  }
}

export async function updateActorProfile(
  db: FogoDb,
  patch: { displayName?: string; avatarUrl?: string | null },
): Promise<UserProfileDto> {
  const actor = db.actor
  if (!actor) throw new Error('Sessão inválida')

  const current = await getActorProfile(db)
  if (!current) throw new Error('Usuário não encontrado')

  const displayName =
    patch.displayName !== undefined ? patch.displayName.trim().slice(0, 120) : current.displayName
  if (!displayName) throw new Error('Nome de exibição é obrigatório')

  let avatarUrl = current.avatarUrl
  if (patch.avatarUrl !== undefined) {
    avatarUrl = patch.avatarUrl?.trim() || null
    if (!isAllowedAvatarUrl(avatarUrl, process.env.SUPABASE_URL)) {
      throw new Error('URL de avatar inválida')
    }
  }

  const { data: userData } = await db.supabase.auth.admin.getUserById(actor.userId)
  const prevMeta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>

  const { error } = await db.supabase.auth.admin.updateUserById(actor.userId, {
    user_metadata: {
      ...prevMeta,
      display_name: displayName,
      avatar_url: avatarUrl,
    },
  })
  if (error) throw error

  await writeAudit(db, 'profile.update', 'user', actor.userId, {
    displayName,
    hasAvatar: !!avatarUrl,
  })

  return {
    ...current,
    displayName,
    avatarUrl,
  }
}

export async function completeFirstLoginPassword(db: FogoDb, newPassword: string): Promise<void> {
  const actor = db.actor
  if (!actor) throw new Error('Sessão inválida')
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  }

  const { data: userData, error: getErr } = await db.supabase.auth.admin.getUserById(actor.userId)
  if (getErr) throw getErr
  const meta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>
  if (!mustChangePasswordFromMeta(meta)) {
    throw new Error('Troca de senha inicial não é necessária para esta conta')
  }

  const { error } = await db.supabase.auth.admin.updateUserById(actor.userId, {
    password: newPassword,
    user_metadata: {
      ...meta,
      [MUST_CHANGE_PASSWORD]: false,
    },
  })
  if (error) throw error

  await writeAudit(db, 'profile.password_first_login', 'user', actor.userId, {})
}

export async function changeActorPassword(
  db: FogoDb,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const actor = db.actor
  if (!actor?.email) throw new Error('Sessão inválida')
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  }
  await goTruePasswordGrant(actor.email, currentPassword)
  const { error } = await db.supabase.auth.admin.updateUserById(actor.userId, { password: newPassword })
  if (error) throw error
  await writeAudit(db, 'profile.password_change', 'user', actor.userId, {})
}

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function uploadActorAvatar(
  db: FogoDb,
  file: { buffer: Buffer; mimetype: string; size: number },
): Promise<UserProfileDto> {
  const actor = db.actor
  if (!actor) throw new Error('Sessão inválida')
  if (!AVATAR_TYPES.has(file.mimetype)) throw new Error('Use JPEG, PNG, WebP ou GIF.')
  if (file.size > 2 * 1024 * 1024) throw new Error('Imagem até 2 MB.')

  const ext =
    file.mimetype === 'image/png'
      ? 'png'
      : file.mimetype === 'image/webp'
        ? 'webp'
        : file.mimetype === 'image/gif'
          ? 'gif'
          : 'jpg'
  const fileName = `avatar.${ext}`
  const storagePath = `${actor.userId}/${fileName}`

  const { error: upErr } = await db.supabase.storage.from('avatars').upload(storagePath, file.buffer, {
    upsert: true,
    contentType: file.mimetype,
    cacheControl: '3600',
  })
  if (upErr) throw upErr

  const avatarUrl = serverAuthBffEnabled()
    ? `${publicAvatarPath(actor.userId, fileName)}?v=${Date.now()}`
    : (() => {
        const { data } = db.supabase.storage.from('avatars').getPublicUrl(storagePath)
        return `${data.publicUrl}?v=${Date.now()}`
      })()

  return updateActorProfile(db, { avatarUrl })
}

export async function removeActorAvatar(db: FogoDb): Promise<UserProfileDto> {
  const actor = db.actor
  if (!actor) throw new Error('Sessão inválida')
  const { data: files } = await db.supabase.storage.from('avatars').list(actor.userId)
  if (files?.length) {
    await db.supabase.storage
      .from('avatars')
      .remove(files.map((f) => `${actor.userId}/${f.name}`))
  }
  return updateActorProfile(db, { avatarUrl: null })
}
