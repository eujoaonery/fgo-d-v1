import type { SupabaseClient } from '@supabase/supabase-js'

export async function writeTenantAdminEvent(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    actorUserId?: string | null
    action: string
    payload?: Record<string, unknown>
  },
) {
  const { error } = await supabase.from('tenant_admin_events').insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    payload: input.payload ?? {},
  })
  if (error) throw error
}

export async function listTenantAdminEvents(supabase: SupabaseClient, organizationId: string, limit = 80) {
  const { data, error } = await supabase
    .from('tenant_admin_events')
    .select('id, action, payload, actor_user_id, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}
