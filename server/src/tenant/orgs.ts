import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperationMode, TenantStatus } from '../../../src/lib/tenant.js'
import { sanitizeTenantSettings } from '../../../src/lib/tenant.js'

export type TenantRecord = {
  id: string
  name: string
  slug: string
  description: string | null
  status: TenantStatus
  operationMode: OperationMode
  settings: Record<string, unknown>
  timezone: string
  locale: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

type OrgRow = {
  id: string
  name: string
  slug: string
  description: string | null
  status: TenantStatus
  operation_mode: OperationMode
  settings: Record<string, unknown> | null
  timezone: string
  locale: string
  created_at: string
  updated_at: string
  created_by: string | null
}

const ORG_COLUMNS =
  'id, name, slug, description, status, operation_mode, settings, timezone, locale, created_at, updated_at, created_by'

export function rowToTenant(row: OrgRow): TenantRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    operationMode: row.operation_mode,
    settings: sanitizeTenantSettings(row.settings ?? {}),
    timezone: row.timezone || 'America/Sao_Paulo',
    locale: row.locale || 'pt-BR',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}

export async function loadOrgBySlug(supabase: SupabaseClient, slug: string): Promise<TenantRecord | null> {
  const { data, error } = await supabase.from('organizations').select(ORG_COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? rowToTenant(data as OrgRow) : null
}

export async function loadOrgById(supabase: SupabaseClient, id: string): Promise<TenantRecord | null> {
  const { data, error } = await supabase.from('organizations').select(ORG_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? rowToTenant(data as OrgRow) : null
}

export async function listOrganizations(
  supabase: SupabaseClient,
  opts: { search?: string; status?: TenantStatus; mode?: OperationMode } = {},
): Promise<TenantRecord[]> {
  let query = supabase.from('organizations').select(ORG_COLUMNS).order('name', { ascending: true })
  if (opts.status) query = query.eq('status', opts.status)
  if (opts.mode) query = query.eq('operation_mode', opts.mode)
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`
    query = query.or(`name.ilike.${q},slug.ilike.${q}`)
  }
  const { data, error } = await query
  if (error) throw error
  return (data as OrgRow[] | null)?.map(rowToTenant) ?? []
}

export async function patchOrgSettings(
  supabase: SupabaseClient,
  orgId: string,
  patch: Record<string, unknown>,
): Promise<TenantRecord> {
  const { data: raw, error: readErr } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!raw) throw new Error('Organização não encontrada')
  const currentSettings =
    raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
      ? (raw.settings as Record<string, unknown>)
      : {}
  const settings = { ...currentSettings, ...patch }
  const { data, error } = await supabase
    .from('organizations')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .select(ORG_COLUMNS)
    .single()
  if (error) throw error
  return rowToTenant(data as OrgRow)
}

export async function listActiveOrgs(supabase: SupabaseClient): Promise<TenantRecord[]> {
  const { data, error } = await supabase.from('organizations').select(ORG_COLUMNS).eq('status', 'active')
  if (error) throw error
  return (data as OrgRow[] | null)?.map(rowToTenant) ?? []
}

export async function listDemoActiveOrgs(supabase: SupabaseClient): Promise<TenantRecord[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('status', 'active')
    .eq('operation_mode', 'demo')
  if (error) throw error
  return (data as OrgRow[] | null)?.map(rowToTenant) ?? []
}
