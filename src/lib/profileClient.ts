import { isClientBffAuth } from '@/lib/authMode'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import {
  changeAccountPassword,
  patchUserProfile,
  type UserProfileRecord,
} from '@/lib/api'
import { apiUrl } from '@/lib/apiBase'
import { authUsesCookies } from '@/lib/authMode'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Use JPEG, PNG, WebP ou GIF.')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Imagem até 2 MB.')
  }

  if (isClientBffAuth()) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(apiUrl('/api/me/profile/avatar'), {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Falha no upload')
    }
    const profile = (await res.json()) as UserProfileRecord
    return profile.avatarUrl ?? ''
  }

  if (!supabaseBrowser) throw new Error('Supabase não configurado')

  const ext =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : file.type === 'image/gif'
          ? 'gif'
          : 'jpg'
  const path = `${userId}/avatar.${ext}`

  const { error: upErr } = await supabaseBrowser.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })
  if (upErr) throw new Error(upErr.message)

  const { data } = supabaseBrowser.storage.from('avatars').getPublicUrl(path)
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`

  const profile = await patchUserProfile({ avatarUrl: publicUrl })
  return profile.avatarUrl ?? publicUrl
}

export async function removeUserAvatar(_userId: string): Promise<UserProfileRecord> {
  if (isClientBffAuth()) {
    const res = await fetch(apiUrl('/api/me/profile/avatar'), {
      method: 'DELETE',
      credentials: authUsesCookies() ? 'include' : 'same-origin',
    })
    if (!res.ok) throw new Error('Não foi possível remover o avatar')
    return res.json() as Promise<UserProfileRecord>
  }
  if (!supabaseBrowser) throw new Error('Supabase não configurado')
  const { data: files } = await supabaseBrowser.storage.from('avatars').list(_userId)
  if (files?.length) {
    await supabaseBrowser.storage.from('avatars').remove(files.map((f) => `${_userId}/${f.name}`))
  }
  return patchUserProfile({ avatarUrl: null })
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  turnstileToken?: string,
): Promise<void> {
  if (newPassword.length < 12) throw new Error('Nova senha: mínimo 12 caracteres.')

  if (isClientBffAuth()) {
    await changeAccountPassword(currentPassword, newPassword, turnstileToken)
    return
  }

  if (!supabaseBrowser) throw new Error('Supabase não configurado')

  const { data: sessionData } = await supabaseBrowser.auth.getSession()
  const email = sessionData.session?.user.email
  if (!email) throw new Error('Sessão inválida')

  const { error: verifyErr } = await supabaseBrowser.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyErr) throw new Error('Senha atual incorreta.')

  const { error } = await supabaseBrowser.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
}
