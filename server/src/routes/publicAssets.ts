import { Router } from 'express'
import type { FogoDb } from '../db.js'
import { ensureSession } from '../auth/ensureSession.js'

/** Proxy de avatares — oculta URL do projeto Supabase no browser (produção BFF). Exige sessão. */
export function createPublicAssetsRouter(db: FogoDb) {
  const router = Router()

  router.get('/avatars/:userId/:fileName', async (req, res, next) => {
    try {
      const access = await ensureSession(req, res, db.supabase)
      if (!access) {
        res.status(401).end()
        return
      }
      const { data: userData, error: authError } = await db.supabase.auth.getUser(access)
      if (authError || !userData.user) {
        res.status(401).end()
        return
      }
      const userId = req.params.userId
      const fileName = req.params.fileName
      if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
        res.status(400).send('Caminho inválido')
        return
      }
      const path = `${userId}/${fileName}`
      const { data, error } = await db.supabase.storage.from('avatars').download(path)
      if (error || !data) {
        res.status(404).send('Não encontrado')
        return
      }
      const buf = Buffer.from(await data.arrayBuffer())
      const ext = fileName.split('.').pop()?.toLowerCase()
      const type =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg'
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.send(buf)
    } catch (e) {
      next(e)
    }
  })

  return router
}
