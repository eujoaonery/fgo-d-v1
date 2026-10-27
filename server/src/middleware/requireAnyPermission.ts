import type { NextFunction, Response } from 'express'
import type { CcoModuleKey } from '../../../src/lib/ccoPermissions.js'
import { actorCan } from '../permissions.js'
import type { FogoRequest } from './attachOrg.js'

export function requireAnyPermission(modules: CcoModuleKey[], action: 'view' | 'manage' = 'view') {
  return (req: FogoRequest, res: Response, next: NextFunction) => {
    const actor = req.fogoDb?.actor
    if (!actor) {
      res.status(401).json({ error: 'Autenticação necessária' })
      return
    }
    const ok = modules.some((m) => actorCan(actor, m, action))
    if (!ok) {
      res.status(403).json({ error: 'Sem permissão para esta operação' })
      return
    }
    next()
  }
}
