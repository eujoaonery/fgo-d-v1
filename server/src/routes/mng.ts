import { Router } from 'express'
import type { CcoMemberRole, CcoPermissions } from '../../../src/lib/ccoPermissions.js'
import {
  normalizeMemberRole,
  parsePermissionsJson,
  permissionsForRole,
  serializePermissions,
} from '../../../src/lib/ccoPermissions.js'
import type { FogoDb } from '../db.js'
import type { AuthedRequest } from '../middleware/platformAdmin.js'
import { MIN_PASSWORD_LENGTH } from '../security/constants.js'
import { revokeUserSessions } from '../security/revokeSessions.js'

async function mapOperatorRow(
  supabase: FogoDb['supabase'],
  m: { id: string; role: string; permissions: unknown; created_at: string; user_id: string },
) {
  const { data: userData } = await supabase.auth.admin.getUserById(m.user_id)
  const role = m.role as CcoMemberRole
  return {
    id: m.id,
    userId: m.user_id,
    role,
    permissions: serializePermissions(parsePermissionsJson(m.permissions, role)),
    createdAt: m.created_at,
    email: userData.user?.email ?? null,
    displayName:
      (userData.user?.user_metadata?.display_name as string | undefined) ??
      userData.user?.email ??
      m.user_id,
  }
}

export function createMngRouter(
  db: FogoDb,
  requirePlatformAdmin: ReturnType<
    typeof import('../middleware/platformAdmin.js').createPlatformAdminMiddleware
  >,
) {
  const router = Router()

  router.get('/me', requirePlatformAdmin, (req: AuthedRequest, res) => {
    res.json({
      user: {
        id: req.authUser!.id,
        email: req.authUser!.email,
      },
      role: 'platform_super_admin' as const,
      isOriginal: req.platformAdmin?.isOriginal === true,
    })
  })

  router.get('/tenant', requirePlatformAdmin, async (_req, res, next) => {
    try {
      const { data: org, error } = await db.supabase
        .from('organizations')
        .select('id, name, slug, created_at, cities(id, name, map_image_path)')
        .eq('id', db.orgId)
        .single()
      if (error) throw error
      const city = org.cities as { name: string; map_image_path: string | null }[] | null
      const { count: memberCount } = await db.supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', db.orgId)
      const { count: assetCount } = await db.supabase
        .from('assets')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', db.orgId)
      res.json({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.created_at,
        cityName: city?.[0]?.name ?? null,
        mapImagePath: city?.[0]?.map_image_path ?? null,
        memberCount: memberCount ?? 0,
        assetCount: assetCount ?? 0,
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/operators', requirePlatformAdmin, async (_req, res, next) => {
    try {
      const { data, error } = await db.supabase
        .from('organization_members')
        .select('id, role, permissions, created_at, user_id')
        .eq('organization_id', db.orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = await Promise.all((data ?? []).map((m) => mapOperatorRow(db.supabase, m)))
      res.json(rows)
    } catch (e) {
      next(e)
    }
  })

  router.post('/operators', requirePlatformAdmin, async (req, res, next) => {
    try {
      const { email, password, displayName, role, permissions } = req.body as {
        email?: string
        password?: string
        displayName?: string
        role?: CcoMemberRole
        permissions?: CcoPermissions
      }
      if (!email || !password) {
        res.status(400).json({ error: 'E-mail e senha são obrigatórios' })
        return
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` })
        return
      }

      const memberRole: CcoMemberRole = normalizeMemberRole(role ?? 'operator') === 'viewer'
        ? 'auditor'
        : normalizeMemberRole(role ?? 'operator')
      const permJson = serializePermissions(permissions ?? permissionsForRole(memberRole))

      let userId: string
      let linkedExisting = false

      const { data: created, error: createErr } = await db.supabase.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName?.trim() || email.trim() },
      })

      if (createErr) {
        if (!createErr.message.includes('already been registered')) throw createErr
        const { data: list } = await db.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = list.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
        if (!existing) {
          res.status(409).json({ error: createErr.message })
          return
        }
        userId = existing.id
        linkedExisting = true
      } else {
        userId = created.user!.id
      }

      const { error: memErr } = await db.supabase.from('organization_members').upsert(
        {
          organization_id: db.orgId,
          user_id: userId,
          role: memberRole,
          permissions: permJson,
        },
        { onConflict: 'organization_id,user_id' },
      )
      if (memErr) throw memErr

      res.status(201).json({
        userId,
        email: email.trim(),
        role: memberRole,
        permissions: permJson,
        linkedExisting,
      })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/operators/:userId', requirePlatformAdmin, async (req, res, next) => {
    try {
      const { userId } = req.params
      const { role, permissions, password, displayName } = req.body as {
        role?: CcoMemberRole
        permissions?: CcoPermissions
        password?: string
        displayName?: string
      }

      const { data: existing, error: findErr } = await db.supabase
        .from('organization_members')
        .select('id, role, permissions')
        .eq('organization_id', db.orgId)
        .eq('user_id', userId)
        .maybeSingle()
      if (findErr) throw findErr
      if (!existing) {
        res.status(404).json({ error: 'Operador não encontrado' })
        return
      }

      const nextRole =
        normalizeMemberRole((role ?? existing.role) as CcoMemberRole) === 'viewer'
          ? 'auditor'
          : normalizeMemberRole((role ?? existing.role) as CcoMemberRole)
      const permJson = serializePermissions(permissions ?? permissionsForRole(nextRole))

      const { error: updErr } = await db.supabase
        .from('organization_members')
        .update({ role: nextRole, permissions: permJson })
        .eq('organization_id', db.orgId)
        .eq('user_id', userId)
      if (updErr) throw updErr

      if (password && password.length >= MIN_PASSWORD_LENGTH) {
        await db.supabase.auth.admin.updateUserById(userId, { password })
      }
      if (displayName?.trim()) {
        await db.supabase.auth.admin.updateUserById(userId, {
          user_metadata: { display_name: displayName.trim() },
        })
      }

      res.json({ userId, role: nextRole, permissions: permJson })
    } catch (e) {
      next(e)
    }
  })

  router.delete('/operators/:userId', requirePlatformAdmin, async (req, res, next) => {
    try {
      const { userId } = req.params
      const { error } = await db.supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', db.orgId)
        .eq('user_id', userId)
      if (error) throw error
      await revokeUserSessions(userId)
      res.status(204).send()
    } catch (e) {
      next(e)
    }
  })

  return router
}
