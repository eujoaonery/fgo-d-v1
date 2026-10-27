import { Router } from 'express'
import multer from 'multer'
import type { FogoRequest } from '../middleware/attachOrg.js'
import {
  changeActorPassword,
  completeFirstLoginPassword,
  getActorProfile,
  removeActorAvatar,
  updateActorProfile,
  uploadActorAvatar,
} from '../members/profileOps.js'
import { assertTurnstile } from '../auth/turnstile.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
})

function db(req: FogoRequest) {
  if (!req.fogoDb?.actor) throw new Error('Autenticação necessária')
  return req.fogoDb
}

export function createProfileRouter() {
  const router = Router()

  router.get('/', async (req, res, next) => {
    try {
      const profile = await getActorProfile(db(req))
      if (!profile) {
        res.status(401).json({ error: 'Sessão inválida' })
        return
      }
      res.json(profile)
    } catch (e) {
      next(e)
    }
  })

  router.post('/password/first-login', async (req, res, next) => {
    try {
      const body = req.body as { newPassword?: string; turnstileToken?: string }
      await assertTurnstile(body.turnstileToken, req.ip)
      if (!body.newPassword?.trim()) {
        res.status(400).json({ error: 'Nova senha é obrigatória' })
        return
      }
      await completeFirstLoginPassword(db(req), body.newPassword.trim())
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/password', async (req, res, next) => {
    try {
      const body = req.body as {
        currentPassword?: string
        newPassword?: string
        turnstileToken?: string
      }
      await assertTurnstile(body.turnstileToken, req.ip)
      if (!body.currentPassword || !body.newPassword?.trim()) {
        res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' })
        return
      }
      await changeActorPassword(db(req), body.currentPassword, body.newPassword.trim())
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/avatar', upload.single('file'), async (req, res, next) => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'Arquivo é obrigatório' })
        return
      }
      res.json(await uploadActorAvatar(db(req), file))
    } catch (e) {
      next(e)
    }
  })

  router.delete('/avatar', async (req, res, next) => {
    try {
      res.json(await removeActorAvatar(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.patch('/', async (req, res, next) => {
    try {
      const body = req.body as { displayName?: string; avatarUrl?: string | null }
      res.json(
        await updateActorProfile(db(req), {
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        }),
      )
    } catch (e) {
      next(e)
    }
  })

  return router
}
