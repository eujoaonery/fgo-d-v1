import type { NextFunction, Response } from 'express'
import type { CcoAccessAction, CcoModuleKey } from '../../../src/lib/ccoPermissions.js'
import { actorCan } from '../permissions.js'
import type { FogoRequest } from './attachOrg.js'

export function requirePermission(module: CcoModuleKey, action: CcoAccessAction = 'manage') {
  return (req: FogoRequest, res: Response, next: NextFunction) => {
    if (!actorCan(req.fogoDb?.actor, module, action)) {
      res.status(403).json({ error: 'Sem permissão para esta operação' })
      return
    }
    next()
  }
}
