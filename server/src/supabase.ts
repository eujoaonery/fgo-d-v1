import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadOrgBySlug, type TenantRecord } from './tenant/orgs.js'

export type FogoDb = {
  orgId: string
  orgSlug: string
  supabase: SupabaseClient
  tenant?: TenantRecord
  actor?: { userId?: string; email?: string; displayName?: string | null }
}

export async function createFogoClient(): Promise<{ supabase: SupabaseClient }> {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      '[fogo] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env (Dashboard → Project Settings → API → service_role).',
    )
  }
  return {
    supabase: createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

export function dbForTenant(supabase: SupabaseClient, tenant: TenantRecord): FogoDb {
  return { orgId: tenant.id, orgSlug: tenant.slug, supabase, tenant }
}

export async function createFogoDb(): Promise<FogoDb> {
  const orgSlug = process.env.FOGO_ORG_SLUG ?? 'prefeitura-marilia'
  const { supabase } = await createFogoClient()
  const tenant = await loadOrgBySlug(supabase, orgSlug)
  if (!tenant) {
    throw new Error(`[fogo] Organização não encontrada para slug "${orgSlug}". Rode as migrations/seed no Supabase.`)
  }
  return dbForTenant(supabase, tenant)
}
