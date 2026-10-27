import type { SupabaseClient } from '@supabase/supabase-js'

export async function ensurePlatformSuperAdmin(
  supabase: SupabaseClient,
  email: string,
  password: string,
  displayName?: string,
  organizationId?: string,
) {
  const normalized = email.trim().toLowerCase()
  let userId: string | undefined

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw listErr
  const existing = list.users.find((u) => u.email?.toLowerCase() === normalized)

  if (existing) {
    userId = existing.id
    const { error: pwdErr } = await supabase.auth.admin.updateUserById(userId, { password })
    if (pwdErr) throw pwdErr
    console.log(`[fogo] Super admin já existe (senha sincronizada com FOGO_SUPERADMIN_PASSWORD): ${normalized}`)
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName ?? 'Super Admin FOGO', must_change_password: false },
    })
    if (createErr) throw createErr
    userId = created.user!.id
    console.log(`[fogo] Super admin criado: ${normalized}`)
  }

  const { error: paErr } = await supabase.from('platform_admins').upsert(
    { user_id: userId, status: 'active', is_original: true },
    { onConflict: 'user_id' },
  )
  if (paErr) throw paErr
  console.log('[fogo] platform_admins atualizado.')

  if (organizationId) {
    const { error: memErr } = await supabase.from('organization_members').upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        role: 'admin',
        permissions: {},
      },
      { onConflict: 'organization_id,user_id' },
    )
    if (memErr) throw memErr
    console.log('[fogo] Super admin vinculado ao CCO da organização (admin).')
  }

  return userId
}
