import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_DUPLICATE_COPY,
  sanitizeTenantSettings,
  type DuplicateCopyOptions,
  type OperationMode,
} from '../../../src/lib/tenant.js'
import { resolveMunicipality } from '../geo/municipalities.js'
import { HttpError } from '../httpError.js'
import { parseMapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { ensureDefaultOrgGroups } from '../members/groupOps.js'
import type { FogoDb } from '../supabase.js'
import { writeTenantAdminEvent } from './adminEvents.js'
import { loadOrgById, loadOrgBySlug, type TenantRecord } from './orgs.js'

type JobStatus = 'requested' | 'provisioning' | 'completed' | 'failed' | 'cancelled'
type JobKind = 'create' | 'duplicate'
type StepStatus = 'pending' | 'done' | 'failed' | 'skipped'

export type ProvisionStep = {
  name: string
  label: string
  status: StepStatus
  error?: string
  at?: string
}

type JobRow = {
  id: string
  organization_id: string
  source_organization_id: string | null
  created_by: string | null
  kind: JobKind
  status: JobStatus
  config: Record<string, unknown>
  steps: ProvisionStep[]
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type CreateTenantInput = {
  name: string
  slug: string
  description?: string | null
  operationMode: OperationMode
  timezone?: string
  locale?: string
  settings?: Record<string, unknown>
  /** Obrigatório só na criação. Cidades já existentes não recebem este campo. */
  mapIbgeId?: number
}

function asDb(supabase: SupabaseClient, tenant: TenantRecord, actorUserId?: string | null): FogoDb {
  return {
    orgId: tenant.id,
    orgSlug: tenant.slug,
    supabase,
    tenant,
    actor: actorUserId ? { userId: actorUserId } : undefined,
  }
}

async function insertJob(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    sourceOrganizationId?: string | null
    createdBy: string
    kind: JobKind
    config: Record<string, unknown>
    steps: ProvisionStep[]
  },
): Promise<JobRow> {
  const { data, error } = await supabase
    .from('tenant_provisioning_jobs')
    .insert({
      organization_id: input.organizationId,
      source_organization_id: input.sourceOrganizationId ?? null,
      created_by: input.createdBy,
      kind: input.kind,
      status: 'requested',
      config: input.config,
      steps: input.steps,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as JobRow
}

async function patchJob(
  supabase: SupabaseClient,
  jobId: string,
  patch: Partial<{ status: JobStatus; steps: ProvisionStep[]; error: string | null; completed_at: string | null }>,
) {
  const { data, error } = await supabase
    .from('tenant_provisioning_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .select('*')
    .single()
  if (error) throw error
  return data as JobRow
}

function markStep(steps: ProvisionStep[], name: string, status: StepStatus, error?: string): ProvisionStep[] {
  return steps.map((s) =>
    s.name === name
      ? { ...s, status, error, at: new Date().toISOString() }
      : s,
  )
}

async function setOrgStatus(supabase: SupabaseClient, orgId: string, status: TenantRecord['status']) {
  const { error } = await supabase.from('organizations').update({ status }).eq('id', orgId)
  if (error) throw error
}

async function failJob(supabase: SupabaseClient, job: JobRow, step: string, err: unknown) {
  const message = err instanceof Error ? err.message : 'Falha no provisionamento'
  const steps = markStep(job.steps ?? [], step, 'failed', message)
  await patchJob(supabase, job.id, { status: 'failed', steps, error: message })
  await writeTenantAdminEvent(supabase, {
    organizationId: job.organization_id,
    actorUserId: job.created_by,
    action: 'provision.failed',
    payload: { jobId: job.id, step, error: message },
  })
  return { jobId: job.id, error: message, step }
}

export async function provisionNewTenant(
  supabase: SupabaseClient,
  actorUserId: string,
  input: CreateTenantInput,
): Promise<{ tenant: TenantRecord; job: JobRow }> {
  const existing = await loadOrgBySlug(supabase, input.slug)
  if (existing) throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')
  if (!Number.isInteger(input.mapIbgeId)) {
    throw new HttpError(400, 'Selecione o município que o mapa geral vai considerar.', 'MAP_CITY_REQUIRED')
  }
  const mapMunicipality = await resolveMunicipality(input.mapIbgeId!)

  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name.trim(),
      slug: input.slug,
      description: input.description?.trim() || null,
      status: 'provisioning',
      operation_mode: input.operationMode,
      timezone: input.timezone || 'America/Sao_Paulo',
      locale: input.locale || 'pt-BR',
      settings: sanitizeTenantSettings({ ...(input.settings ?? {}), mapMunicipality }),
      created_by: actorUserId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')
    throw error
  }

  let job = await insertJob(supabase, {
    organizationId: org.id,
    createdBy: actorUserId,
    kind: 'create',
    config: {
      name: input.name.trim(),
      slug: input.slug,
      operationMode: input.operationMode,
      timezone: input.timezone || 'America/Sao_Paulo',
      mapIbgeId: mapMunicipality.ibgeId,
    },
    steps: [
      { name: 'city', label: 'Cadastro municipal', status: 'pending' },
      { name: 'groups', label: 'Grupos padrão', status: 'pending' },
      { name: 'settings', label: 'Configurações iniciais', status: 'pending' },
      { name: 'activate', label: 'Ativação', status: 'pending' },
    ],
  })

  job = await patchJob(supabase, job.id, { status: 'provisioning' })
  await writeTenantAdminEvent(supabase, {
    organizationId: org.id,
    actorUserId,
    action: 'tenant.created',
    payload: { slug: input.slug, operationMode: input.operationMode, jobId: job.id },
  })

  try {
    const { error: cityErr } = await supabase.from('cities').insert({
      organization_id: org.id,
      name: input.name.trim(),
    })
    if (cityErr) throw cityErr
    job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'city', 'done') })

    const tenant = (await loadOrgById(supabase, org.id))!
    await ensureDefaultOrgGroups(asDb(supabase, tenant, actorUserId))
    job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'groups', 'done') })

    const { error: settingsErr } = await supabase.from('system_settings').upsert({
      organization_id: org.id,
      simulation: {
        enabled: false,
        intensity: 'medium',
        ticksTotal: 0,
        tickIntervalMs: 60_000,
      },
      crisis: {},
    })
    if (settingsErr) throw settingsErr
    job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'settings', 'done') })

    await setOrgStatus(supabase, org.id, 'active')
    job = await patchJob(supabase, job.id, {
      status: 'completed',
      steps: markStep(job.steps, 'activate', 'done'),
      completed_at: new Date().toISOString(),
      error: null,
    })
    await writeTenantAdminEvent(supabase, {
      organizationId: org.id,
      actorUserId,
      action: 'provision.completed',
      payload: { jobId: job.id, kind: 'create' },
    })
    return { tenant: (await loadOrgById(supabase, org.id))!, job }
  } catch (err) {
    await failJob(supabase, job, job.steps.find((s) => s.status === 'pending')?.name ?? 'activate', err)
    throw err instanceof HttpError ? err : new HttpError(500, err instanceof Error ? err.message : 'Falha no provisionamento', 'PROVISION_FAILED')
  }
}

function duplicateSettings(source: Record<string, unknown>, copy: DuplicateCopyOptions): Record<string, unknown> {
  const base = copy.businessRules || copy.ui ? sanitizeTenantSettings(source) : {}
  const mapMunicipality = parseMapMunicipality(source)
  if (!mapMunicipality) return base
  return sanitizeTenantSettings({ ...base, mapMunicipality })
}

export async function duplicateTenant(
  supabase: SupabaseClient,
  actorUserId: string,
  sourceId: string,
  input: CreateTenantInput & { copy?: Partial<DuplicateCopyOptions> },
): Promise<{ tenant: TenantRecord; job: JobRow }> {
  const source = await loadOrgById(supabase, sourceId)
  if (!source) throw new HttpError(404, 'Cidade de origem não encontrada.', 'TENANT_NOT_FOUND')
  const copy: DuplicateCopyOptions = { ...DEFAULT_DUPLICATE_COPY, ...input.copy, history: false }
  if (input.copy?.history) {
    throw new HttpError(
      400,
      'A cópia de histórico operacional não está habilitada. Ocorrências, alertas e filas não são duplicados.',
      'HISTORY_COPY_FORBIDDEN',
    )
  }

  const existing = await loadOrgBySlug(supabase, input.slug)
  if (existing) throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')

  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name.trim(),
      slug: input.slug,
      description: input.description?.trim() || source.description,
      status: 'provisioning',
      operation_mode: input.operationMode,
      timezone: copy.ui ? source.timezone : input.timezone || 'America/Sao_Paulo',
      locale: copy.ui ? source.locale : input.locale || 'pt-BR',
      settings: duplicateSettings(source.settings, copy),
      created_by: actorUserId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')
    throw error
  }

  let job = await insertJob(supabase, {
    organizationId: org.id,
    sourceOrganizationId: source.id,
    createdBy: actorUserId,
    kind: 'duplicate',
    config: {
      name: input.name.trim(),
      slug: input.slug,
      operationMode: input.operationMode,
      sourceId: source.id,
      sourceSlug: source.slug,
      copy: { ...copy, history: false, userIds: copy.users ? copy.userIds : [] },
    },
    steps: [
      { name: 'city', label: 'Cadastro municipal', status: 'pending' },
      { name: 'categories', label: 'Categorias de ativos', status: 'pending' },
      { name: 'groups', label: 'Grupos e módulos', status: 'pending' },
      { name: 'settings', label: 'Configurações', status: 'pending' },
      { name: 'users', label: 'Usuários selecionados', status: 'pending' },
      { name: 'activate', label: 'Ativação', status: 'pending' },
    ],
  })
  job = await patchJob(supabase, job.id, { status: 'provisioning' })
  await writeTenantAdminEvent(supabase, {
    organizationId: org.id,
    actorUserId,
    action: 'tenant.duplicated',
    payload: { sourceId: source.id, sourceSlug: source.slug, slug: input.slug, jobId: job.id, copy },
  })

  try {
    const { data: sourceCity } = await supabase
      .from('cities')
      .select('name, map_image_path')
      .eq('organization_id', source.id)
      .maybeSingle()
    const { error: cityErr } = await supabase.from('cities').insert({
      organization_id: org.id,
      name: input.name.trim(),
      map_image_path: copy.ui ? sourceCity?.map_image_path ?? null : null,
    })
    if (cityErr) throw cityErr
    job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'city', 'done') })

    if (copy.categories) {
      const { data: cats, error: catErr } = await supabase
        .from('asset_categories')
        .select('slug, label, marker_kind, sort_order')
        .eq('organization_id', source.id)
      if (catErr) throw catErr
      if (cats?.length) {
        const { error: insCat } = await supabase.from('asset_categories').insert(
          cats.map((c) => ({
            organization_id: org.id,
            slug: c.slug,
            label: c.label,
            marker_kind: c.marker_kind,
            sort_order: c.sort_order,
          })),
        )
        if (insCat) throw insCat
      }
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'categories', 'done') })
    } else {
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'categories', 'skipped') })
    }

    const groupIdMap = new Map<string, string>()
    if (copy.moduleSettings) {
      const { data: groups, error: gErr } = await supabase
        .from('organization_groups')
        .select('id, name, description, permissions, scope_region, scope_org')
        .eq('organization_id', source.id)
      if (gErr) throw gErr
      for (const g of groups ?? []) {
        const { data: created, error: insG } = await supabase
          .from('organization_groups')
          .insert({
            organization_id: org.id,
            name: g.name,
            description: g.description,
            permissions: g.permissions,
            scope_region: g.scope_region,
            scope_org: g.scope_org,
          })
          .select('id')
          .single()
        if (insG) throw insG
        if (created) groupIdMap.set(g.id as string, created.id)
      }
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'groups', 'done') })
    } else {
      const tenant = (await loadOrgById(supabase, org.id))!
      await ensureDefaultOrgGroups(asDb(supabase, tenant, actorUserId))
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'groups', 'done') })
    }

    const { data: sourceSettings } = await supabase
      .from('system_settings')
      .select('simulation')
      .eq('organization_id', source.id)
      .maybeSingle()
    const sim = (sourceSettings?.simulation as Record<string, unknown> | null) ?? {}
    const { error: settingsErr } = await supabase.from('system_settings').upsert({
      organization_id: org.id,
      simulation: {
        enabled: false,
        intensity: copy.operationalSettings ? sim.intensity ?? 'medium' : 'medium',
        ticksTotal: 0,
        tickIntervalMs: copy.operationalSettings ? sim.tickIntervalMs ?? 60_000 : 60_000,
      },
      crisis: {},
    })
    if (settingsErr) throw settingsErr
    job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'settings', 'done') })

    if (copy.users && copy.userIds.length) {
      const { data: members, error: mErr } = await supabase
        .from('organization_members')
        .select('user_id, role, permissions, group_id, scope_region, scope_org')
        .eq('organization_id', source.id)
        .in('user_id', copy.userIds)
      if (mErr) throw mErr
      for (const m of members ?? []) {
        const { error: insM } = await supabase.from('organization_members').insert({
          organization_id: org.id,
          user_id: m.user_id,
          role: m.role === 'admin' ? 'admin' : m.role,
          permissions: m.permissions ?? {},
          group_id: m.group_id ? groupIdMap.get(m.group_id) ?? null : null,
          scope_region: m.scope_region,
          scope_org: m.scope_org,
        })
        if (insM && insM.code !== '23505') throw insM
      }
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'users', 'done') })
    } else {
      job = await patchJob(supabase, job.id, { steps: markStep(job.steps, 'users', 'skipped') })
    }

    await setOrgStatus(supabase, org.id, 'active')
    job = await patchJob(supabase, job.id, {
      status: 'completed',
      steps: markStep(job.steps, 'activate', 'done'),
      completed_at: new Date().toISOString(),
      error: null,
    })
    await writeTenantAdminEvent(supabase, {
      organizationId: org.id,
      actorUserId,
      action: 'provision.completed',
      payload: { jobId: job.id, kind: 'duplicate', sourceId: source.id },
    })
    return { tenant: (await loadOrgById(supabase, org.id))!, job }
  } catch (err) {
    await failJob(supabase, job, job.steps.find((s) => s.status === 'pending')?.name ?? 'activate', err)
    throw err instanceof HttpError
      ? err
      : new HttpError(500, err instanceof Error ? err.message : 'Falha no provisionamento', 'PROVISION_FAILED')
  }
}

export async function retryProvisioningJob(supabase: SupabaseClient, jobId: string, actorUserId: string) {
  const { data: job, error } = await supabase.from('tenant_provisioning_jobs').select('*').eq('id', jobId).maybeSingle()
  if (error) throw error
  if (!job) throw new HttpError(404, 'Tarefa de provisionamento não encontrada.', 'JOB_NOT_FOUND')
  if (job.status !== 'failed') {
    throw new HttpError(409, 'Somente tarefas com falha podem ser reexecutadas.', 'JOB_NOT_RETRYABLE')
  }
  const kind = job.kind as JobKind
  const config = (job.config ?? {}) as Record<string, unknown>
  const { error: delErr } = await supabase.from('organizations').delete().eq('id', job.organization_id).eq('status', 'provisioning')
  if (delErr) throw delErr

  if (kind === 'duplicate') {
    const sourceId = String(config.sourceId ?? job.source_organization_id ?? '')
    const copy = (config.copy ?? {}) as Partial<DuplicateCopyOptions>
    return duplicateTenant(supabase, actorUserId, sourceId, {
      name: String(config.name ?? ''),
      slug: String(config.slug ?? ''),
      operationMode: (config.operationMode as OperationMode) ?? 'demo',
      copy,
    })
  }
  return provisionNewTenant(supabase, actorUserId, {
    name: String(config.name ?? ''),
    slug: String(config.slug ?? ''),
    operationMode: (config.operationMode as OperationMode) ?? 'demo',
    timezone: typeof config.timezone === 'string' ? config.timezone : undefined,
    mapIbgeId: Number(config.mapIbgeId),
  })
}

export async function cancelProvisioningJob(supabase: SupabaseClient, jobId: string, actorUserId: string) {
  const { data: job, error } = await supabase.from('tenant_provisioning_jobs').select('*').eq('id', jobId).maybeSingle()
  if (error) throw error
  if (!job) throw new HttpError(404, 'Tarefa de provisionamento não encontrada.', 'JOB_NOT_FOUND')
  if (job.status === 'completed') {
    throw new HttpError(409, 'Não é possível cancelar um provisionamento já concluído.', 'JOB_COMPLETED')
  }
  await patchJob(supabase, job.id, {
    status: 'cancelled',
    error: 'Cancelado pelo administrador',
    completed_at: new Date().toISOString(),
  })
  const { data: org } = await supabase
    .from('organizations')
    .select('id, status')
    .eq('id', job.organization_id)
    .maybeSingle()
  if (org?.status === 'provisioning') {
    await setOrgStatus(supabase, org.id, 'archived')
  }
  await writeTenantAdminEvent(supabase, {
    organizationId: job.organization_id,
    actorUserId,
    action: 'provision.cancelled',
    payload: { jobId: job.id },
  })
  return { ok: true }
}

export async function listProvisioningJobs(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from('tenant_provisioning_jobs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw error
  return data ?? []
}
