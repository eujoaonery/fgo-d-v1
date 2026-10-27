import { Router } from 'express'
import { requirePermission } from '../middleware/requirePermission.js'
import { writeAudit } from '../audit.js'
import type { FogoRequest } from '../middleware/attachOrg.js'
import { HttpError } from '../httpError.js'
import { isAlphaAnalysisKind, isAlphaRecStatus, type AlphaAnalysisKind } from '../../../src/lib/prometheusAlpha.js'
import { OS_REGIONS } from '../../../src/lib/workOrders.js'
import { resolveCityGeo, saveCityGeo, type AlphaConfigPatch } from './geoConfig.js'
import { loadForecast } from './weather.js'
import { loadTraffic } from './traffic.js'
import { loadNamedWays } from './osm.js'
import { loadPrometheusCredentials } from '../orgIntegrations.js'
import { ALPHA_MODEL_VERSION } from './forecast.js'
import { runNamedAnalysis } from './analyses.js'
import { answerQuestion } from './chat.js'
import {
  appendMessage,
  clearSessionMessages,
  clipSessionTitle,
  createSession,
  getAnalysis,
  getOwnedSession,
  insertAnalysis,
  latestAnalysis,
  listAnalyses,
  listSessionMessages,
  listUserSessions,
  loadOrCreateSession,
  saveSessionContext,
} from './store.js'
import {
  acceptanceNextStep,
  decideRecommendation,
  listRecommendations,
  observeRecommendation,
  persistRecommendations,
} from './recommendations.js'
import type { SourceMeta } from '../../../src/lib/strategy.js'

const inflight = new Map<string, Promise<unknown>>()
const chatHits = new Map<string, number[]>()

function limitHits(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const prev = (chatHits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (prev.length >= max) return false
  prev.push(now)
  chatHits.set(key, prev)
  return true
}

async function once<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const p = factory().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function actorId(req: FogoRequest): string {
  const id = req.fogoDb?.actor?.userId
  if (!id) throw new HttpError(401, 'Autenticação necessária.')
  return id
}

function missingModel(): SourceMeta {
  return {
    key: 'alpha-model',
    label: 'Baseline estatístico',
    status: 'ok',
    origin: ALPHA_MODEL_VERSION,
    lastUpdatedAt: null,
    note: 'Média do mesmo dia da semana com corte cronológico 70/30. Sem métricas inventadas.',
  }
}

export function createAlphaRouter() {
  const router = Router()

  router.get('/alpha/board', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const city = resolveCityGeo(db)
      const [weather, traffic, creds, last, pending] = await Promise.all([
        loadForecast(city, 2),
        loadTraffic(city),
        loadPrometheusCredentials(db),
        latestAnalysis(db),
        listRecommendations(db, 'pending'),
      ])
      res.json({
        generatedAt: new Date().toISOString(),
        agent: {
          openai: creds.apiKey ? 'ready' : 'missing',
          openaiNote: creds.apiKey
            ? `Modelo ${creds.model}${creds.fromOrg ? ' (chave da cidade)' : ' (servidor)'}.`
            : 'Chave OpenAI ausente. Análises determinísticas seguem; o chat narrativo fica limitado.',
          weather: weather.source,
          traffic: traffic.source,
          osm: {
            key: 'osm-overpass',
            label: 'OpenStreetMap',
            status: 'ok',
            origin: 'consulta sob demanda',
            lastUpdatedAt: null,
            note: 'Vias OSM só entram quando a análise geográfica pede. Não é evidência de tráfego.',
          },
          model: missingModel(),
        },
        city,
        lastAnalysisAt: last?.createdAt ?? null,
        pendingRecommendations: pending.length,
        regions: [...OS_REGIONS],
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/config', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json({ city: resolveCityGeo(req.fogoDb!) })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/alpha/config', requirePermission('settings', 'manage'), async (req: FogoRequest, res, next) => {
    try {
      const body = (req.body ?? {}) as AlphaConfigPatch
      const city = await saveCityGeo(req.fogoDb!, body)
      await writeAudit(req.fogoDb!, 'alpha.config', 'prometheus_alpha', { cityName: city.cityName, uf: city.uf })
      res.json({ city })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/geo/ways', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      res.json(await loadNamedWays(resolveCityGeo(req.fogoDb!)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/alpha/analyses', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const kind = req.body?.kind as string
      if (!isAlphaAnalysisKind(kind) || kind === 'chat') {
        throw new HttpError(400, 'Tipo de análise inválido.')
      }
      const region = typeof req.body?.region === 'string' ? req.body.region : null
      const date = typeof req.body?.date === 'string' ? req.body.date : null
      const hour = typeof req.body?.hour === 'number' ? req.body.hour : null
      const userId = actorId(req)
      if (!limitHits(`an:${db.orgId}:${userId}`, 12, 10 * 60_000)) {
        throw new HttpError(429, 'Limite de análises atingido. Aguarde alguns minutos.')
      }
      const result = await once(`an:${db.orgId}:${kind}:${region}:${date}:${hour}`, () =>
        runNamedAnalysis(db, kind as AlphaAnalysisKind, { region, date, hour }),
      )
      const id = await insertAnalysis(db, {
        kind: result.kind,
        title: result.title,
        params: { region, date, hour },
        result,
        createdBy: userId,
      })
      const stored = { ...result, id }
      const recs = await persistRecommendations(db, id, result.recommendations, result.modelVersion)
      await writeAudit(db, 'alpha.analysis', 'prometheus_alpha', { kind, id })
      res.json({ analysis: stored, recommendations: recs })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/analyses', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 20)
      res.json({ items: await listAnalyses(req.fogoDb!, limit) })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/analyses/:id', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const row = await getAnalysis(req.fogoDb!, req.params.id)
      if (!row) throw new HttpError(404, 'Análise não encontrada.')
      res.json(row)
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/sessions', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      res.json({ items: await listUserSessions(db, actorId(req)) })
    } catch (e) {
      next(e)
    }
  })

  router.post('/alpha/sessions', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const session = await createSession(db, actorId(req))
      const items = await listUserSessions(db, actorId(req))
      res.json({ sessionId: session.id, context: session.context, messages: [], items })
    } catch (e) {
      next(e)
    }
  })

  router.post('/alpha/sessions/:id/clear', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const session = await getOwnedSession(db, actorId(req), req.params.id)
      if (!session) throw new HttpError(404, 'Conversa não encontrada.')
      await clearSessionMessages(db, session.id)
      res.json({ sessionId: session.id, context: session.context, messages: [] })
    } catch (e) {
      next(e)
    }
  })

  router.post('/alpha/chat', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const text = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
      if (text.length < 3 || text.length > 2000) {
        throw new HttpError(400, 'Pergunta entre 3 e 2000 caracteres.')
      }
      const userId = actorId(req)
      if (!limitHits(`chat:${db.orgId}:${userId}`, 20, 10 * 60_000)) {
        throw new HttpError(429, 'Limite de perguntas atingido. Aguarde alguns minutos.')
      }
      const requestedId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : null
      const session = requestedId ? await getOwnedSession(db, userId, requestedId) : await loadOrCreateSession(db, userId)
      if (!session) throw new HttpError(404, 'Conversa não encontrada.')
      const region = typeof req.body?.region === 'string' ? req.body.region : session.context.region
      const prior = await listSessionMessages(db, session.id)
      const title = session.context.title ?? clipSessionTitle(text)
      await appendMessage(db, session.id, 'user', text)
      const out = await answerQuestion(db, {
        text,
        region,
        context: { ...session.context, title },
        history: prior.map((m) => ({ role: m.role, content: m.content })),
      })
      await saveSessionContext(db, session.id, out.context)
      const id = await insertAnalysis(db, {
        sessionId: session.id,
        kind: out.result.kind,
        title: out.result.title,
        params: { message: text.slice(0, 200), region },
        result: out.result,
        createdBy: userId,
      })
      const analysis = { ...out.result, id }
      const recs = await persistRecommendations(db, id, out.result.recommendations, out.result.modelVersion)
      const assistant = await appendMessage(db, session.id, 'assistant', out.answer, {
        analysis,
        claims: analysis.claims,
      })
      await writeAudit(db, 'alpha.chat', 'prometheus_alpha', { sessionId: session.id, usedLlm: out.usedLlm })
      const messages = await listSessionMessages(db, session.id)
      const items = await listUserSessions(db, userId)
      res.json({
        sessionId: session.id,
        context: out.context,
        message: assistant,
        analysis,
        recommendations: recs,
        messages,
        items,
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/session', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const db = req.fogoDb!
      const userId = actorId(req)
      const requestedId = typeof req.query.id === 'string' ? req.query.id : null
      const session = requestedId ? await getOwnedSession(db, userId, requestedId) : await loadOrCreateSession(db, userId)
      if (!session) throw new HttpError(404, 'Conversa não encontrada.')
      const messages = await listSessionMessages(db, session.id)
      res.json({ sessionId: session.id, context: session.context, messages })
    } catch (e) {
      next(e)
    }
  })

  router.get('/alpha/recommendations', requirePermission('prometheusAlpha', 'view'), async (req: FogoRequest, res, next) => {
    try {
      const status = typeof req.query.status === 'string' && isAlphaRecStatus(req.query.status) ? req.query.status : undefined
      res.json({ items: await listRecommendations(req.fogoDb!, status) })
    } catch (e) {
      next(e)
    }
  })

  router.post(
    '/alpha/recommendations/:id/decision',
    requirePermission('prometheusAlpha', 'manage'),
    async (req: FogoRequest, res, next) => {
      try {
        const status = req.body?.status
        const justification = typeof req.body?.justification === 'string' ? req.body.justification : ''
        if (!isAlphaRecStatus(status) || status === 'pending') {
          throw new HttpError(400, 'Estado inválido.')
        }
        const rec = await decideRecommendation(req.fogoDb!, req.params.id, status, justification)
        await writeAudit(req.fogoDb!, 'alpha.recommendation.decision', 'prometheus_alpha', {
          id: rec.id,
          status,
        })
        res.json({ recommendation: rec, nextStep: status === 'accepted' ? acceptanceNextStep(rec) : null })
      } catch (e) {
        next(e)
      }
    },
  )

  router.post(
    '/alpha/recommendations/:id/observe',
    requirePermission('prometheusAlpha', 'manage'),
    async (req: FogoRequest, res, next) => {
      try {
        const observedResult = typeof req.body?.observedResult === 'string' ? req.body.observedResult : ''
        const rec = await observeRecommendation(req.fogoDb!, req.params.id, observedResult)
        await writeAudit(req.fogoDb!, 'alpha.recommendation.observe', 'prometheus_alpha', { id: rec.id })
        res.json({ recommendation: rec })
      } catch (e) {
        next(e)
      }
    },
  )

  return router
}
