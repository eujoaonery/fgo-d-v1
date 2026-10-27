import { Router } from 'express'
import {
  OPERATION_MODES,
  TENANT_STATUSES,
  validateTenantSlug,
  type DuplicateCopyOptions,
  type OperationMode,
  type TenantStatus,
} from '../../../src/lib/tenant.js'
import type { FogoDb } from '../db.js'
import { HttpError, isHttpError } from '../httpError.js'
import type { AuthedRequest } from '../middleware/platformAdmin.js'
import { writeTenantAdminEvent, listTenantAdminEvents } from '../tenant/adminEvents.js'
import { loadOrgById, loadOrgBySlug, listOrganizations } from '../tenant/orgs.js'
import {
  cancelProvisioningJob,
  duplicateTenant,
  listProvisioningJobs,
  provisionNewTenant,
  retryProvisioningJob,
} from '../tenant/provision.js'
import { searchMunicipalities } from '../geo/municipalities.js'
import { stopSimulationTimer } from '../simulation/engine.js'

function handle(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (isHttpError(err)) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  next(err)
}

function parseMode(raw: unknown): OperationMode {
  if (typeof raw === 'string' && (OPERATION_MODES as readonly string[]).includes(raw)) {
    return raw as OperationMode
  }
  throw new HttpError(400, 'Modo de operação inválido. Use demo ou real.', 'INVALID_MODE')
}

export function createPlatformTenantsRouter(
  db: FogoDb,
  requirePlatformAdmin: ReturnType<
    typeof import('../middleware/platformAdmin.js').createPlatformAdminMiddleware
  >,
) {
  const router = Router()
  router.use(requirePlatformAdmin)

  router.get('/overview', async (_req: AuthedRequest, res, next) => {
    try {
      const tenants = await listOrganizations(db.supabase)
      const ids = tenants.map((t) => t.id)
      const counts = new Map<string, { members: number; assets: number; running: number }>()
      const userIds = new Set<string>()
      let assetsTotal = 0
      let assetsRunning = 0
      let assetsAlert = 0
      let assetsInactive = 0
      if (ids.length) {
        const [{ data: memberRows }, { data: assetRows }] = await Promise.all([
          db.supabase
            .from('organization_members')
            .select('organization_id, user_id, status')
            .in('organization_id', ids),
          db.supabase.from('assets').select('organization_id, status').in('organization_id', ids),
        ])
        for (const id of ids) counts.set(id, { members: 0, assets: 0, running: 0 })
        for (const row of memberRows ?? []) {
          if (row.status && row.status !== 'active') continue
          const cur = counts.get(row.organization_id as string)
          if (cur) cur.members += 1
          if (typeof row.user_id === 'string') userIds.add(row.user_id)
        }
        for (const row of assetRows ?? []) {
          const cur = counts.get(row.organization_id as string)
          const st = String(row.status ?? '')
          assetsTotal += 1
          if (cur) cur.assets += 1
          if (st === 'operacional') {
            assetsRunning += 1
            if (cur) cur.running += 1
          } else if (st === 'alerta') assetsAlert += 1
          else if (st === 'inativo') assetsInactive += 1
        }
      }
      const byStatus = { provisioning: 0, active: 0, suspended: 0, archived: 0 }
      const byMode = { demo: 0, real: 0 }
      for (const t of tenants) {
        if (t.status in byStatus) byStatus[t.status as keyof typeof byStatus] += 1
        if (t.operationMode in byMode) byMode[t.operationMode as keyof typeof byMode] += 1
      }
      res.json({
        tenants: { total: tenants.length, ...byStatus, ...byMode },
        users: { total: userIds.size },
        assets: { total: assetsTotal, running: assetsRunning, alert: assetsAlert, inactive: assetsInactive },
        cities: tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          operationMode: t.operationMode,
          memberCount: counts.get(t.id)?.members ?? 0,
          assetCount: counts.get(t.id)?.assets ?? 0,
          runningAssetCount: counts.get(t.id)?.running ?? 0,
        })),
      })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/tenants', async (req: AuthedRequest, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined
      const status =
        typeof req.query.status === 'string' && (TENANT_STATUSES as readonly string[]).includes(req.query.status)
          ? (req.query.status as TenantStatus)
          : undefined
      const mode =
        typeof req.query.mode === 'string' && (OPERATION_MODES as readonly string[]).includes(req.query.mode)
          ? (req.query.mode as OperationMode)
          : undefined
      const tenants = await listOrganizations(db.supabase, { search, status, mode })
      const ids = tenants.map((t) => t.id)
      const counts = new Map<string, { members: number; assets: number }>()
      if (ids.length) {
        const [{ data: memberRows }, { data: assetRows }] = await Promise.all([
          db.supabase.from('organization_members').select('organization_id').in('organization_id', ids),
          db.supabase.from('assets').select('organization_id').in('organization_id', ids),
        ])
        for (const id of ids) counts.set(id, { members: 0, assets: 0 })
        for (const row of memberRows ?? []) {
          const cur = counts.get(row.organization_id as string)
          if (cur) cur.members += 1
        }
        for (const row of assetRows ?? []) {
          const cur = counts.get(row.organization_id as string)
          if (cur) cur.assets += 1
        }
      }
      res.json({
        tenants: tenants.map((t) => ({
          ...t,
          memberCount: counts.get(t.id)?.members ?? 0,
          assetCount: counts.get(t.id)?.assets ?? 0,
        })),
      })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/municipalities', async (req: AuthedRequest, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : ''
      if (q.trim().length < 2) {
        res.json({ municipalities: [] })
        return
      }
      res.json({ municipalities: await searchMunicipalities(q) })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/tenants', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as {
        name?: string
        slug?: string
        description?: string
        operationMode?: string
        timezone?: string
        locale?: string
        settings?: Record<string, unknown>
        mapIbgeId?: number
      }
      const name = body.name?.trim() ?? ''
      if (name.length < 2) throw new HttpError(400, 'Informe o nome oficial da cidade.', 'INVALID_NAME')
      const parsed = validateTenantSlug(body.slug ?? '')
      if (!parsed.ok) throw new HttpError(400, parsed.error, 'TENANT_SLUG_INVALID')
      const result = await provisionNewTenant(db.supabase, req.authUser!.id, {
        name,
        slug: parsed.slug,
        description: body.description,
        operationMode: parseMode(body.operationMode ?? 'demo'),
        timezone: body.timezone,
        locale: body.locale,
        settings: body.settings,
        mapIbgeId: body.mapIbgeId,
      })
      res.status(201).json(result)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/tenants/:id', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      const [{ count: members }, { count: assets }, { data: city }] = await Promise.all([
        db.supabase
          .from('organization_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', tenant.id),
        db.supabase.from('assets').select('*', { count: 'exact', head: true }).eq('organization_id', tenant.id),
        db.supabase.from('cities').select('name, map_image_path').eq('organization_id', tenant.id).maybeSingle(),
      ])
      res.json({
        ...tenant,
        cityName: city?.name ?? tenant.name,
        mapImagePath: city?.map_image_path ?? null,
        memberCount: members ?? 0,
        assetCount: assets ?? 0,
      })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.patch('/tenants/:id', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      const body = req.body as {
        name?: string
        slug?: string
        description?: string | null
        timezone?: string
        locale?: string
        operationMode?: string
        settings?: Record<string, unknown>
      }
      const patch: Record<string, unknown> = {}
      if (typeof body.name === 'string' && body.name.trim().length >= 2) patch.name = body.name.trim()
      if (body.description !== undefined) patch.description = body.description?.trim() || null
      if (typeof body.timezone === 'string' && body.timezone.trim()) patch.timezone = body.timezone.trim()
      if (typeof body.locale === 'string' && body.locale.trim()) patch.locale = body.locale.trim()
      if (body.operationMode) patch.operation_mode = parseMode(body.operationMode)
      if (body.settings && typeof body.settings === 'object') patch.settings = body.settings
      if (typeof body.slug === 'string' && body.slug !== tenant.slug) {
        const parsed = validateTenantSlug(body.slug)
        if (!parsed.ok) throw new HttpError(400, parsed.error, 'TENANT_SLUG_INVALID')
        const taken = await loadOrgBySlug(db.supabase, parsed.slug)
        if (taken && taken.id !== tenant.id) {
          throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')
        }
        patch.slug = parsed.slug
      }
      if (!Object.keys(patch).length) {
        res.json(tenant)
        return
      }
      const { error } = await db.supabase.from('organizations').update(patch).eq('id', tenant.id)
      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'Já existe uma cidade com este identificador.', 'SLUG_TAKEN')
        throw error
      }
      if (patch.operation_mode === 'real') {
        await db.supabase
          .from('system_settings')
          .update({
            simulation: {
              enabled: false,
              intensity: 'medium',
              ticksTotal: 0,
              tickIntervalMs: 60_000,
            },
          })
          .eq('organization_id', tenant.id)
        stopSimulationTimer(tenant.id)
      }
      await writeTenantAdminEvent(db.supabase, {
        organizationId: tenant.id,
        actorUserId: req.authUser!.id,
        action: 'tenant.updated',
        payload: patch,
      })
      res.json(await loadOrgById(db.supabase, tenant.id))
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/tenants/:id/status', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      const body = req.body as { status?: string; confirm?: boolean }
      if (!body.confirm) {
        throw new HttpError(400, 'Confirme a alteração de estado da cidade.', 'CONFIRM_REQUIRED')
      }
      if (!body.status || !(TENANT_STATUSES as readonly string[]).includes(body.status)) {
        throw new HttpError(400, 'Estado inválido.', 'INVALID_STATUS')
      }
      const nextStatus = body.status as TenantStatus
      if (nextStatus === tenant.status) {
        res.json(tenant)
        return
      }
      const { error } = await db.supabase.from('organizations').update({ status: nextStatus }).eq('id', tenant.id)
      if (error) throw error
      if (nextStatus !== 'active') stopSimulationTimer(tenant.id)
      await writeTenantAdminEvent(db.supabase, {
        organizationId: tenant.id,
        actorUserId: req.authUser!.id,
        action: `tenant.status.${nextStatus}`,
        payload: { from: tenant.status, to: nextStatus },
      })
      res.json(await loadOrgById(db.supabase, tenant.id))
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/tenants/:id/duplicate', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as {
        name?: string
        slug?: string
        description?: string
        operationMode?: string
        copy?: Partial<DuplicateCopyOptions>
      }
      const name = body.name?.trim() ?? ''
      if (name.length < 2) throw new HttpError(400, 'Informe o nome oficial da nova cidade.', 'INVALID_NAME')
      const parsed = validateTenantSlug(body.slug ?? '')
      if (!parsed.ok) throw new HttpError(400, parsed.error, 'TENANT_SLUG_INVALID')
      const result = await duplicateTenant(db.supabase, req.authUser!.id, String(req.params.id), {
        name,
        slug: parsed.slug,
        description: body.description,
        operationMode: parseMode(body.operationMode ?? 'demo'),
        copy: body.copy,
      })
      res.status(201).json(result)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/tenants/:id/members', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      const { data, error } = await db.supabase
        .from('organization_members')
        .select('id, user_id, role, group_id, created_at')
        .eq('organization_id', tenant.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      const members = await Promise.all(
        (data ?? []).map(async (m) => {
          const { data: userData } = await db.supabase.auth.admin.getUserById(m.user_id)
          return {
            id: m.id,
            userId: m.user_id,
            role: m.role,
            email: userData.user?.email ?? null,
            displayName:
              (userData.user?.user_metadata?.display_name as string | undefined) ??
              userData.user?.email ??
              m.user_id,
          }
        }),
      )
      res.json({ members })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/tenants/:id/events', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      res.json({ events: await listTenantAdminEvents(db.supabase, tenant.id) })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.get('/tenants/:id/jobs', async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await loadOrgById(db.supabase, String(req.params.id))
      if (!tenant) throw new HttpError(404, 'Cidade não encontrada.', 'TENANT_NOT_FOUND')
      res.json({ jobs: await listProvisioningJobs(db.supabase, tenant.id) })
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/tenants/:id/jobs/:jobId/retry', async (req: AuthedRequest, res, next) => {
    try {
      const result = await retryProvisioningJob(db.supabase, String(req.params.jobId), req.authUser!.id)
      res.json(result)
    } catch (e) {
      handle(e, res, next)
    }
  })

  router.post('/tenants/:id/jobs/:jobId/cancel', async (req: AuthedRequest, res, next) => {
    try {
      res.json(await cancelProvisioningJob(db.supabase, String(req.params.jobId), req.authUser!.id))
    } catch (e) {
      handle(e, res, next)
    }
  })

  return router
}
