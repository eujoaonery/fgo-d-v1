import type { NextFunction, Response } from 'express'
import type { FogoRequest } from './attachOrg.js'

/** Admin da organização (ou super admin plataforma) — gestão de operadores §5. */
export function requireOrgAdmin(req: FogoRequest, res: Response, next: NextFunction) {
  const actor = req.fogoDb?.actor
  if (!actor) {
    res.status(401).json({ error: 'Autenticação necessária' })
    return
  }
  if (actor.isPlatformSuperAdmin || actor.memberRole === 'admin') {
    next()
    return
  }
  res.status(403).json({ error: 'Apenas administradores da cidade podem gerenciar usuários e grupos' })
}
