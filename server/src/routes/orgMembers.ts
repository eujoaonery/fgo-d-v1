import { Router } from 'express'
import type { CcoMemberRole, CcoPermissions } from '../../../src/lib/ccoPermissions.js'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { requireAnyPermission } from '../middleware/requireAnyPermission.js'
import { requireOrgAdmin } from '../middleware/requireOrgAdmin.js'
import { requireStepUp } from '../security/stepUp.js'
import { actorCan } from '../permissions.js'
import {
  inviteOrgOperator,
  listOrgOperators,
  removeOrgOperator,
  updateOrgOperator,
} from '../members/operatorOps.js'
import {
  createOrgGroup,
  deleteOrgGroup,
  listOrgGroups,
  updateOrgGroup,
} from '../members/groupOps.js'
import { listAuditLogs } from '../members/auditLog.js'
import { listSystemLogs, type SystemLogCategory, type SystemLogLevel } from '../systemLog.js'

function db(req: FogoRequest) {
  if (!req.fogoDb) throw new Error('fogoDb missing')
  return req.fogoDb
}

export function createOrgMembersRouter() {
  const router = Router()

  router.get('/members', requireAnyPermission(['users', 'operators'], 'view'), async (req, res, next) => {
    try {
      const maskPii =
        !actorCan(req.fogoDb?.actor, 'users', 'manage') &&
        !actorCan(req.fogoDb?.actor, 'operators', 'manage')
      res.json(await listOrgOperators(db(req), { maskPii }))
    } catch (e) {
      next(e)
    }
  })

  router.post(
    '/members',
    requireAnyPermission(['users', 'operators'], 'manage'),
    requireOrgAdmin,
    async (req, res, next) => {
    try {
      const body = req.body as {
        email?: string
        password?: string
        displayName?: string
        role?: CcoMemberRole
        groupId?: string
        scopeRegion?: string | null
        scopeOrg?: string | null
        locationShareUntil?: string | null
      }
      const result = await inviteOrgOperator(db(req), {
        email: body.email ?? '',
        password: body.password ?? '',
        displayName: body.displayName,
        role: body.role,
        groupId: body.groupId,
        scopeRegion: body.scopeRegion,
        scopeOrg: body.scopeOrg,
        locationShareUntil: body.locationShareUntil,
      })
      res.status(201).json(result)
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('obrigat') || e.message.includes('Senha') || e.message.includes('plataforma'))
      ) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.patch(
    '/members/:userId',
    requireAnyPermission(['users', 'operators'], 'manage'),
    requireOrgAdmin,
    async (req, res, next) => {
    try {
      const body = req.body as {
        role?: CcoMemberRole
        groupId?: string | null
        password?: string
        displayName?: string
        scopeRegion?: string | null
        scopeOrg?: string | null
        locationShareUntil?: string | null
        status?: 'active' | 'inactive'
      }
      res.json(await updateOrgOperator(db(req), req.params.userId, body))
    } catch (e) {
      if (e instanceof Error && e.message === 'Operador não encontrado') {
        res.status(404).json({ error: e.message })
        return
      }
      if (e instanceof Error && (e.message.includes('plataforma') || e.message.includes('Grupo não encontrado'))) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.delete(
    '/members/:userId',
    requireAnyPermission(['users', 'operators'], 'manage'),
    requireOrgAdmin,
    requireStepUp,
    async (req, res, next) => {
    try {
      await removeOrgOperator(db(req), req.params.userId)
      res.status(204).send()
    } catch (e) {
      next(e)
    }
  })

  router.get('/audit-logs', requireAnyPermission(['users', 'operators'], 'view'), async (req, res, next) => {
    try {
      const q = req.query as { limit?: string; offset?: string; action?: string; entityType?: string }
      res.json(
        await listAuditLogs(db(req), {
          limit: q.limit ? Number(q.limit) : undefined,
          offset: q.offset ? Number(q.offset) : undefined,
          action: q.action,
          entityType: q.entityType,
        }),
      )
    } catch (e) {
      next(e)
    }
  })

  router.get('/system-logs', requireAnyPermission(['users', 'operators'], 'view'), async (req, res, next) => {
    try {
      const q = req.query as { limit?: string; offset?: string; level?: string; category?: string }
      res.json(
        await listSystemLogs(db(req), {
          limit: q.limit ? Number(q.limit) : undefined,
          offset: q.offset ? Number(q.offset) : undefined,
          level: q.level as SystemLogLevel | undefined,
          category: q.category as SystemLogCategory | undefined,
        }),
      )
    } catch (e) {
      next(e)
    }
  })

  router.get('/groups', requireAnyPermission(['users', 'operators'], 'view'), async (req, res, next) => {
    try {
      res.json(await listOrgGroups(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/groups', requireAnyPermission(['users', 'operators'], 'manage'), requireOrgAdmin, requireStepUp, async (req, res, next) => {
    try {
      const body = req.body as { name?: string; description?: string; permissions?: CcoPermissions }
      res.status(201).json(
        await createOrgGroup(db(req), {
          name: body.name ?? '',
          description: body.description,
          permissions: body.permissions ?? ({} as CcoPermissions),
        }),
      )
    } catch (e) {
      if (e instanceof Error && (e.message.includes('obrigat') || e.message.includes('plataforma'))) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.patch('/groups/:groupId', requireAnyPermission(['users', 'operators'], 'manage'), requireOrgAdmin, requireStepUp, async (req, res, next) => {
    try {
      const body = req.body as { name?: string; description?: string; permissions?: CcoPermissions }
      res.json(await updateOrgGroup(db(req), req.params.groupId, body))
    } catch (e) {
      if (e instanceof Error && e.message === 'Grupo não encontrado') {
        res.status(404).json({ error: e.message })
        return
      }
      if (e instanceof Error && e.message.includes('plataforma')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.delete('/groups/:groupId', requireAnyPermission(['users', 'operators'], 'manage'), requireOrgAdmin, requireStepUp, async (req, res, next) => {
    try {
      await deleteOrgGroup(db(req), req.params.groupId)
      res.status(204).send()
    } catch (e) {
      if (e instanceof Error && e.message.includes('Remova')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  return router
}
