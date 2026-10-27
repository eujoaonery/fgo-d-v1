import type { FogoDb } from '../db.js'
import { listAlerts, listAssets, listTeams } from '../repository.js'
import { computeAvailability } from '../../../src/lib/assetAvailability.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'
import { loadPrometheusCredentials } from '../orgIntegrations.js'
import { isOsTicketPrediction, listPredictions } from './engine.js'
import { computePredictiveMetrics, type PredictiveMetrics } from './metrics.js'
import { normalizeCadastral } from '../assets/truth.js'

const SYSTEM = `Você é PROMETHEUS, módulo de previsibilidade do CCO municipal FOGO.
Recebe um JSON com números já calculados (disponibilidade, alertas, agentes, MAE/RMSE, calibração). Não comente ordens de serviço.
Responda APENAS um JSON:
{
  "headline": string,
  "feedbacks": [{ "title": string, "body": string, "tone": "neutral"|"warning"|"critical", "basedOn": string }],
  "priorities": [{ "title": string, "why": string, "horizon": string }],
  "limitations": string[]
}
Regras:
- Use somente o contexto. Não invente MAE, RMSE, probabilidade, contagens ou IDs.
- Não calcule métricas novas. Comente as que já vieram no contexto.
- Se mae/rmse forem null, diga que o horizonte ainda não fechou — não estime.
- Distinga ausência de dado de ausência de ocorrência.
- Feedbacks curtos, em português, operacionais. Máximo 6 feedbacks e 4 prioridades.
- basedOn deve citar a chave do contexto (ex.: "metrics.mae", "availability.percent", "charts.alertsBySeverity").`

export type PrevisibilidadeChartSlice = { name: string; value: number }
export type PrevisibilidadeRegionLoad = { region: string; os: number; alerts: number; assets: number }

export type PrevisibilidadeCharts = {
  osByStatus: PrevisibilidadeChartSlice[]
  alertsBySeverity: PrevisibilidadeChartSlice[]
  cadastralMix: PrevisibilidadeChartSlice[]
  agentsByStatus: PrevisibilidadeChartSlice[]
  predictionsByType: PrevisibilidadeChartSlice[]
  decisions: PrevisibilidadeChartSlice[]
  regionLoad: PrevisibilidadeRegionLoad[]
}

export type PrometheusPrevisibilidade = {
  available: boolean
  generatedAt: string | null
  model: string | null
  unavailableReason: string | null
  headline: string | null
  feedbacks: { title: string; body: string; tone: 'neutral' | 'warning' | 'critical'; basedOn: string }[]
  priorities: { title: string; why: string; horizon: string }[]
  limitations: string[]
  metrics: PredictiveMetrics
  availability: ReturnType<typeof computeAvailability>
  charts: PrevisibilidadeCharts
}

function countBy(items: string[]): PrevisibilidadeChartSlice[] {
  const map = new Map<string, number>()
  for (const k of items) map.set(k, (map.get(k) ?? 0) + 1)
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseFeedback(json: unknown): Pick<
  PrometheusPrevisibilidade,
  'headline' | 'feedbacks' | 'priorities' | 'limitations'
> {
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  const feedbacksRaw = Array.isArray(obj.feedbacks) ? obj.feedbacks : []
  const prioritiesRaw = Array.isArray(obj.priorities) ? obj.priorities : []
  const limitationsRaw = Array.isArray(obj.limitations) ? obj.limitations : []
  const tones = new Set(['neutral', 'warning', 'critical'])
  return {
    headline: asText(obj.headline),
    feedbacks: feedbacksRaw
      .slice(0, 6)
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const title = asText(r.title)
        const body = asText(r.body)
        if (!title || !body) return null
        const tone = tones.has(String(r.tone)) ? (r.tone as 'neutral' | 'warning' | 'critical') : 'neutral'
        return { title, body, tone, basedOn: asText(r.basedOn) ?? 'contexto' }
      })
      .filter((x): x is NonNullable<typeof x> => x != null),
    priorities: prioritiesRaw
      .slice(0, 4)
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const title = asText(r.title)
        const why = asText(r.why)
        if (!title || !why) return null
        return { title, why, horizon: asText(r.horizon) ?? 'qualitativo' }
      })
      .filter((x): x is NonNullable<typeof x> => x != null),
    limitations: limitationsRaw.map((x) => asText(x)).filter((x): x is string => x != null),
  }
}

async function callOpenAi(
  context: Record<string, unknown>,
  creds: { apiKey: string | null; model: string },
): Promise<{ json: unknown; model: string }> {
  const key = creds.apiKey?.trim()
  if (!key) {
    const err = new Error('OPENAI_API_KEY não configurada')
    ;(err as Error & { code?: string }).code = 'NO_KEY'
    throw err
  }
  const model = creds.model.trim() || 'gpt-4o-mini'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 25_000)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify(context) },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`)
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenAI retornou conteúdo vazio')
    return { json: JSON.parse(content), model }
  } finally {
    clearTimeout(timer)
  }
}

export async function buildPrevisibilidadeCharts(db: FogoDb): Promise<{
  charts: PrevisibilidadeCharts
  metrics: PredictiveMetrics
  availability: ReturnType<typeof computeAvailability>
}> {
  const [assets, alerts, teams, predictionRows] = await Promise.all([
    listAssets(db),
    listAlerts(db),
    listTeams(db),
    listPredictions(db, 200),
  ])
  const predictions = predictionRows.filter((p) => !isOsTicketPrediction(p))

  const availability = computeAvailability(assets)
  const metrics = computePredictiveMetrics(predictions)
  const activeAlerts = alerts.filter((a) => isOccurrencePending(a.state))

  const cadMap = new Map<string, number>()
  for (const a of assets) {
    const cad = normalizeCadastral(a.cadastralStatus)
    cadMap.set(cad, (cadMap.get(cad) ?? 0) + 1)
  }

  const regions = new Set<string>()
  assets.forEach((a) => regions.add(a.region))
  alerts.forEach((a) => a.region && regions.add(a.region))

  const charts: PrevisibilidadeCharts = {
    osByStatus: [],
    alertsBySeverity: countBy(activeAlerts.map((a) => a.severity)),
    cadastralMix: [...cadMap.entries()].map(([name, value]) => ({ name, value })),
    agentsByStatus: countBy(teams.map((t) => t.status)),
    predictionsByType: countBy(predictions.map((p) => p.predictionType)),
    decisions: countBy(predictions.map((p) => p.decisionStatus)),
    regionLoad: [...regions].sort().map((region) => ({
      region,
      os: 0,
      alerts: activeAlerts.filter((a) => a.region === region).length,
      assets: assets.filter((a) => a.region === region).length,
    })),
  }

  return { charts, metrics, availability }
}

export async function runPrometheusPrevisibilidade(db: FogoDb): Promise<PrometheusPrevisibilidade> {
  const { charts, metrics, availability } = await buildPrevisibilidadeCharts(db)
  const generatedAt = new Date().toISOString()
  const base: PrometheusPrevisibilidade = {
    available: false,
    generatedAt,
    model: null,
    unavailableReason: null,
    headline: null,
    feedbacks: [],
    priorities: [],
    limitations: [],
    metrics,
    availability,
    charts,
  }

  const creds = await loadPrometheusCredentials(db)
  const context = {
    generatedAt,
    availability,
    metrics: {
      mae: metrics.mae,
      rmse: metrics.rmse,
      baselineMae: metrics.baselineMae,
      skillScore: metrics.skillScore,
      accuracy: metrics.accuracy,
      scored: metrics.scored,
      pending: metrics.pending,
      chronological: metrics.chronological,
      note: metrics.note,
    },
    charts,
  }

  try {
    const { json, model } = await callOpenAi(context, creds)
    const parsed = parseFeedback(json)
    return {
      ...base,
      available: true,
      model,
      ...parsed,
      limitations: parsed.limitations.length ? parsed.limitations : metrics.mae == null ? [metrics.note] : parsed.limitations,
    }
  } catch (e) {
    const code = (e as Error & { code?: string }).code
    const reason =
      code === 'NO_KEY'
        ? 'Integração PROMETHEUS indisponível: cadastre a chave OpenAI em Integrações.'
        : `Integração PROMETHEUS indisponível: ${e instanceof Error ? e.message : 'falha'}.`
    return {
      ...base,
      unavailableReason: reason,
      limitations: [reason, metrics.note],
    }
  }
}

export async function getPrevisibilidadeState(db: FogoDb): Promise<PrometheusPrevisibilidade> {
  const { charts, metrics, availability } = await buildPrevisibilidadeCharts(db)
  return {
    available: false,
    generatedAt: new Date().toISOString(),
    model: null,
    unavailableReason: null,
    headline: null,
    feedbacks: [],
    priorities: [],
    limitations: [],
    metrics,
    availability,
    charts,
  }
}
