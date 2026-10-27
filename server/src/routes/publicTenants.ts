import { Router } from 'express'
import type { FogoDb } from '../db.js'
import { AuthError } from '../orgContext.js'
import { isHttpError } from '../httpError.js'
import { getRequestUser, isPlatformAdminUser } from '../auth/requestUser.js'
import { loadOrgBySlug } from '../tenant/orgs.js'
import { validateTenantSlug } from '../../../src/lib/tenant.js'

export function createPublicTenantsRouter(db: FogoDb) {
  const router = Router()

  router.get('/public/:slug', async (req, res, next) => {
    try {
      const parsed = validateTenantSlug(String(req.params.slug ?? ''))
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error, code: 'TENANT_SLUG_INVALID' })
        return
      }
      const tenant = await loadOrgBySlug(db.supabase, parsed.slug)
      if (!tenant) {
        res.status(404).json({ error: 'Cidade não encontrada.', code: 'TENANT_NOT_FOUND' })
        return
      }
      const { data: city } = await db.supabase
        .from('cities')
        .select('name')
        .eq('organization_id', tenant.id)
        .maybeSingle()
      res.json({
        slug: tenant.slug,
        name: tenant.name,
        cityName: city?.name ?? tenant.name,
        status: tenant.status,
        operationMode: tenant.operationMode,
        timezone: tenant.timezone,
        locale: tenant.locale,
        loginAllowed: tenant.status === 'active',
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/accessible', async (req, res, next) => {
    try {
      const user = await getRequestUser(db.supabase, req)
      const platform = await isPlatformAdminUser(db.supabase, user.id)

      if (platform) {
        const { data, error } = await db.supabase
          .from('organizations')
          .select('id, name, slug, status, operation_mode, timezone')
          .neq('status', 'archived')
          .order('name')
        if (error) throw error
        res.json({
          isPlatformSuperAdmin: true,
          tenants: (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            status: row.status,
            operationMode: row.operation_mode,
            timezone: row.timezone,
            role: 'platform_super_admin',
          })),
        })
        return
      }

      const { data: memberships, error } = await db.supabase
        .from('organization_members')
        .select('role, organization_id, organizations ( id, name, slug, status, operation_mode, timezone )')
        .eq('user_id', user.id)
      if (error) throw error

      const tenants = (memberships ?? [])
        .map((m) => {
          const org = m.organizations as {
            id: string
            name: string
            slug: string
            status: string
            operation_mode: string
            timezone: string
          } | null
          if (!org || org.status === 'archived') return null
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            status: org.status,
            operationMode: org.operation_mode,
            timezone: org.timezone,
            role: m.role,
          }
        })
        .filter(Boolean)

      res.json({ isPlatformSuperAdmin: false, tenants })
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(401).json({ error: e.message })
        return
      }
      if (isHttpError(e)) {
        res.status(e.status).json({ error: e.message, code: e.code })
        return
      }
      next(e)
    }
  })

  return router
}
