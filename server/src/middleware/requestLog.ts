import type { NextFunction, Response } from 'express'
import type { FogoRequest } from './attachOrg.js'
import type { FogoDb } from '../db.js'
import { writeSystemLog } from '../systemLog.js'

const SKIP_SUFFIXES = [
  '/health',
  '/bootstrap',
  '/events/stream',
  '/settings/simulation',
  '/crisis',
  '/crisis/advance',
  '/org/system-logs',
  '/org/audit-logs',
  '/mng/infra',
]

function sanitizeQueryForLog(query: FogoRequest['query']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(query ?? {})) {
    if (k === 'ticket' || k === 'access_token') {
      out[k] = '[redacted]'
    } else {
      out[k] = v
    }
  }
  return out
}

function apiPath(req: FogoRequest): string {
  const fromOriginal = (req.originalUrl ?? '').split('?')[0]
  if (fromOriginal.startsWith('/api')) return fromOriginal
  const p = req.path.startsWith('/') ? req.path : `/${req.path}`
  return p.startsWith('/api') ? p : `/api${p}`
}

export function createRequestLogMiddleware(fallbackDb: () => FogoDb) {
  return (req: FogoRequest, res: Response, next: NextFunction) => {
    const path = apiPath(req)
    if (!path.startsWith('/api') || SKIP_SUFFIXES.some((s) => path === `/api${s}` || path.endsWith(s))) {
      next()
      return
    }

    const start = Date.now()
    res.on('finish', () => {
      const status = res.statusCode
      const method = req.method
      const shouldLog =
        status >= 400 || (method !== 'GET' && method !== 'HEAD' && status < 400)
      if (!shouldLog) return

      const db = req.fogoDb ?? fallbackDb()
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
      void writeSystemLog(db, {
        level,
        category: 'http',
        message: `${method} ${path} → ${status}`,
        metadata: {
          method,
          path,
          status,
          durationMs: Date.now() - start,
          query: sanitizeQueryForLog(req.query),
        },
      })
    })
    next()
  }
}
