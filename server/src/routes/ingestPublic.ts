import { Router } from 'express'
import type { FogoRequest } from '../middleware/attachOrg.js'
import type { FogoDb } from '../db.js'
import { findWebhookByPublicId, loadSecrets } from '../connectors/store.js'
import { verifyWebhookSignature } from '../connectors/adapters/webhooks.js'
import { idempotencyFromRequest, ingestCandidates } from '../ingest/pipeline.js'
import { ignoreExternalTenantId } from '../ingest/normalize.js'
import { safeEqualString } from '../security/safeCompare.js'
import { sanitizeLogText } from '../connectors/sanitize.js'

const buckets = new Map<string, number[]>()

function rateOk(id: string, maxPerMin: number): boolean {
  const now = Date.now()
  const arr = (buckets.get(id) ?? []).filter((t) => now - t < 60_000)
  if (arr.length >= maxPerMin) {
    buckets.set(id, arr)
    return false
  }
  arr.push(now)
  buckets.set(id, arr)
  return true
}

export function createIngestPublicRouter(defaultDb: FogoDb) {
  const router = Router()

  router.post('/hooks/:publicId', async (req: FogoRequest, res, next) => {
    try {
      const connector = await findWebhookByPublicId(defaultDb.supabase, req.params.publicId)
      if (!connector || !connector.enabled) {
        res.status(404).json({ error: 'Webhook não encontrado.' })
        return
      }
      const max = Number(connector.config.rateLimitPerMin ?? 60)
      if (!rateOk(connector.id, Number.isFinite(max) ? max : 60)) {
        res.status(429).json({ error: 'Limite de requisições do webhook excedido.' })
        return
      }
      const secrets = await loadSecrets(defaultDb.supabase, connector.organizationId, connector.secretId)
      const auth = String(connector.config.auth ?? 'bearer')
      const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {})
      if (auth === 'hmac') {
        const header = String(req.headers['x-fogo-signature'] ?? '')
        const secret = secrets.hmacSecret || secrets.token
        if (!secret || !verifyWebhookSignature(secret, rawBody, header)) {
          res.status(401).json({ error: 'Assinatura inválida.' })
          return
        }
      } else {
        const header = req.headers.authorization
        const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : ''
        const expected = secrets.token || secrets.hmacSecret
        if (!expected || !safeEqualString(token, expected)) {
          res.status(401).json({ error: 'Autenticação do webhook inválida.' })
          return
        }
      }
      const body = { ...(req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : { value: req.body }) }
      ignoreExternalTenantId(body)
      const eventType =
        String(req.headers['x-fogo-event-type'] ?? connector.config.eventType ?? body.type ?? 'webhook.event')
      const acceptedType = connector.config.eventType
      if (acceptedType && acceptedType !== '*' && String(acceptedType) !== eventType) {
        res.status(422).json({ error: 'Tipo de evento não aceito por este webhook.' })
        return
      }
      const key = idempotencyFromRequest(req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'] ?? body.id, body)
      const result = await ingestCandidates(defaultDb.supabase, {
        organizationId: connector.organizationId,
        connectorId: connector.id,
        sourceKind: 'webhook_in',
      }, [
        {
          idempotencyKey: key,
          eventType,
          assetExternalId: typeof body.assetId === 'string' ? body.assetId : typeof body.deviceId === 'string' ? body.deviceId : null,
          occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt : typeof body.ts === 'string' ? body.ts : null,
          payload: body,
          metric:
            typeof body.metric === 'string'
              ? { name: body.metric, value: body.value == null ? null : Number(body.value), unit: typeof body.unit === 'string' ? body.unit : null }
              : undefined,
        },
      ])
      await defaultDb.supabase
        .from('connectors')
        .update({
          last_attempt_at: new Date().toISOString(),
          last_success_at: result.rejected ? undefined : new Date().toISOString(),
          last_error: result.rejected ? sanitizeLogText('evento rejeitado') : null,
          health: result.rejected ? 'degraded' : 'healthy',
          metrics: { lastAccepted: result.accepted, lastDuplicate: result.duplicate, lastRejected: result.rejected },
          updated_at: new Date().toISOString(),
        })
        .eq('id', connector.id)
      res.status(202).json({ accepted: result.accepted, duplicate: result.duplicate, rejected: result.rejected })
    } catch (e) {
      next(e)
    }
  })

  return router
}
