import type { FogoDb } from '../db.js'
import type { PrometheusResult, StrategySnapshot } from '../../../src/lib/strategy.js'
import { collectKnownIds, validatePrometheusBriefing, type PrometheusContext } from './validateBriefing.js'
import { insertBriefing, loadLatestBriefing } from './store.js'
import { contextHash } from './snapshot.js'
import { listPredictions } from '../predictive/engine.js'
import { listAlerts, listAssets, listIncidents, listTeams } from '../repository.js'
import { assessAssetsLifecycle, todayYmd } from '../../../src/lib/assetLifecycle.js'
import { isMaintenanceOsType } from '../../../src/lib/workOrders.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'
import { loadPrometheusCredentials } from '../orgIntegrations.js'

const SYSTEM = `Você é PROMETHEUS, analista estratégico do CCO municipal FOGO (Marília/SP).
Responda APENAS um JSON com:
{
  "executiveSummary": string,
  "risks": [{ "title": string, "justification": string, "horizon": string, "confidence": number|null }],
  "preventiveRecommendations": string[],
  "resourcesNeedingReinforcement": string[],
  "missingOrInconsistentData": string[]
}
Regras:
- Use somente o contexto JSON fornecido. Não invente ocorrências, ativos, equipes, avisos ou IDs.
- Não calcule probabilidades novas. Só preencha confidence se o contexto já tiver probabilidade de modelo para aquele risco (0 a 1). Caso contrário null.
- Não declare que um evento ocorrerá com certeza.
- Distinga ausência de dados de ausência de ocorrências, usando o status das fontes.
- Recomendações só a partir dos dados (alertas, OS, preditivo, ciclo/vida útil de ativos, clima, equipes, monitoramento técnico e saúde de conectores).
- Se assetLifecycle estiver presente, use as narrativas e percentuais já calculados. Não invente outros %. Ativos ausentes dessa lista não têm ciclo ou vida útil cadastrados.
- Não invente métricas, latência, probabilidade ou confirmação de execução. Se technicalMonitoring estiver vazio, declare a limitação.
- Horizonte temporal deve ser qualitativo e ancorado nos dados (ex.: validade do alerta, horizonteHours do preditivo).
- Se uma fonte estiver unavailable, registre em missingOrInconsistentData.`

function staleResult(reason: string, last: Awaited<ReturnType<typeof loadLatestBriefing>>): PrometheusResult {
  if (last?.briefing) {
    return {
      available: true,
      stale: true,
      generatedAt: last.generatedAt,
      model: last.model,
      briefing: last.briefing,
      validationIssues: last.error ? [last.error] : [],
      unavailableReason: `${reason} Exibindo o último resultado válido.`,
    }
  }
  return {
    available: false,
    stale: false,
    generatedAt: null,
    model: null,
    briefing: null,
    validationIssues: [],
    unavailableReason: reason,
  }
}

async function buildContext(db: FogoDb, snapshot: StrategySnapshot): Promise<Record<string, unknown>> {
  const [incidents, alerts, teams, predictions, assets, monitorStates, connectors] = await Promise.all([
    listIncidents(db),
    listAlerts(db),
    listTeams(db),
    listPredictions(db, 20),
    listAssets(db),
    db.supabase
      .from('asset_monitor_states')
      .select('asset_external_id, state, reason, last_check_at, last_ok_at, consecutive_failures')
      .eq('organization_id', db.orgId)
      .limit(80),
    db.supabase
      .from('connectors')
      .select('id, kind, name, health, last_success_at, last_error, enabled')
      .eq('organization_id', db.orgId)
      .limit(40),
  ])
  const openOs = incidents.filter((i) => i.status !== 'resolvida' && i.status !== 'cancelada')
  const activeAlerts = alerts.filter((a) => isOccurrencePending(a.state))
  const lifecycle = assessAssetsLifecycle(assets, todayYmd())
  const overdueLife = lifecycle.filter((a) => (a.overdueDays ?? 0) > 0)
  const endedLife = lifecycle.filter((a) => a.remainingLifeDays != null && a.remainingLifeDays <= 0)
  return {
    generatedAt: snapshot.generatedAt,
    city: snapshot.city,
    digest: snapshot.digest,
    changesSinceLastBriefing: snapshot.changesSinceLastBriefing,
    limitations: snapshot.limitations,
    sources: snapshot.indicators.map((i) => ({
      key: i.key,
      label: i.label,
      value: i.value,
      source: i.source,
    })),
    weatherForecast: snapshot.weatherForecast,
    weatherForecastSource: snapshot.weatherForecastSource,
    weatherWarnings: snapshot.weatherWarnings,
    weatherWarningsSource: snapshot.weatherWarningsSource,
    trafficExternalSource: snapshot.trafficExternalSource,
    openWorkOrders: openOs.slice(0, 20).map((i) => ({
      id: i.id,
      type: i.type,
      priority: i.priority,
      status: i.status,
      region: i.region,
      openedAt: i.openedAt,
    })),
    activeAlerts: activeAlerts.slice(0, 20).map((a) => ({
      id: a.id,
      severity: a.severity,
      state: a.state,
      title: a.title,
      region: a.region,
      responseDueAt: a.responseDueAt ?? null,
      detectedAt: a.detectedAt,
    })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      region: t.region,
      capabilities: t.capabilities,
    })),
    maintenanceOpen: incidents
      .filter((i) => isMaintenanceOsType(i.type) && i.status !== 'resolvida' && i.status !== 'cancelada')
      .slice(0, 15)
      .map((i) => ({
        id: i.id,
        assetId: i.relatedAssetId,
        type: i.type,
        status: i.status,
        dueDate: i.dueAt,
      })),
    predictions: predictions.slice(0, 15).map((p) => ({
      id: p.id,
      target: p.targetLabel,
      region: p.region,
      horizonHours: p.horizonHours,
      probability: p.probability ?? null,
      explanation: p.explanation,
      reviewStatus: p.reviewStatus,
    })),
    assetLifecycle: {
      note: 'Estimativa operacional a partir do cadastro (ciclo, vida útil, degradação). Não é telemetria de falha nem probabilidade observada. Ativos sem esses campos não entram.',
      overdueCount: overdueLife.length,
      usefulLifeEndedCount: endedLife.length,
      overdue: overdueLife.slice(0, 12).map((a) => ({
        assetId: a.assetId,
        category: a.category,
        region: a.region ?? null,
        overdueDays: a.overdueDays,
        degradation: a.degradation,
        unavailabilityRiskPct: Math.round(a.unavailabilityRisk * 100),
        accidentRiskPct: Math.round(a.accidentRisk * 100),
        narrative: a.narrative,
      })),
      usefulLifeEnded: endedLife.slice(0, 6).map((a) => ({
        assetId: a.assetId,
        category: a.category,
        remainingLifeDays: a.remainingLifeDays,
        narrative: a.narrative,
      })),
    },
    technicalMonitoring: {
      states: (monitorStates.data ?? []).slice(0, 40).map((s) => ({
        assetId: s.asset_external_id,
        state: s.state,
        reason: s.reason,
        lastCheckAt: s.last_check_at,
        lastOkAt: s.last_ok_at,
        consecutiveFailures: s.consecutive_failures,
      })),
      unavailableOrStale: (monitorStates.data ?? []).filter((s) =>
        ['unavailable', 'stale', 'degraded'].includes(String(s.state)),
      ).length,
      note: 'Estados calculados por regras determinísticas. Ausência de verificação não é evidência de normalidade.',
    },
    connectorHealth: (connectors.data ?? []).map((c) => ({
      kind: c.kind,
      name: c.name,
      health: c.health,
      enabled: c.enabled,
      lastSuccessAt: c.last_success_at,
      lastError: c.last_error,
    })),
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
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenAI retornou conteúdo vazio')
    return { json: JSON.parse(content), model }
  } finally {
    clearTimeout(timer)
  }
}

export async function runPrometheus(db: FogoDb, snapshot: StrategySnapshot): Promise<PrometheusResult> {
  const last = await loadLatestBriefing(db)
  const creds = await loadPrometheusCredentials(db)
  const context = await buildContext(db, snapshot)
  const hash = contextHash(snapshot.digest, snapshot.limitations)
  const knownIds = collectKnownIds(snapshot)
  for (const item of (context.openWorkOrders as { id: string }[]) ?? []) knownIds.push(item.id)
  for (const item of (context.activeAlerts as { id: string }[]) ?? []) knownIds.push(item.id)
  for (const item of (context.predictions as { id: string }[]) ?? []) knownIds.push(item.id)
  for (const item of (context.maintenanceOpen as { id: string }[]) ?? []) knownIds.push(item.id)
  const ctx: PrometheusContext = {
    snapshot,
    knownIds: [...new Set(knownIds)],
    knownRegions: [...new Set(snapshot.indicators.flatMap((i) => (i.items ?? []).map((x) => x.detail ?? '')))],
    predictionProbabilities: ((context.predictions as { probability: number | null }[]) ?? [])
      .map((p) => p.probability)
      .filter((n): n is number => n != null),
  }

  try {
    const { json, model } = await callOpenAi(context, creds)
    const { briefing, issues } = validatePrometheusBriefing(json, ctx)
    if (!briefing) {
      return staleResult(`A resposta da IA não passou na validação (${issues.join('; ')}).`, last)
    }
    const stored = await insertBriefing(db, {
      model,
      contextHash: hash,
      snapshotDigest: snapshot.digest,
      context,
      briefing,
      stale: false,
      error: issues.length ? issues.join(' ') : null,
    })
    return {
      available: true,
      stale: false,
      generatedAt: stored.generatedAt,
      model,
      briefing,
      validationIssues: issues,
      unavailableReason: null,
    }
  } catch (e) {
    const code = (e as Error & { code?: string }).code
    const reason =
      code === 'NO_KEY'
        ? 'Integração PROMETHEUS indisponível: cadastre a chave OpenAI em Integrações.'
        : `Integração PROMETHEUS indisponível: ${e instanceof Error ? e.message : 'falha'}.`
    return staleResult(reason, last)
  }
}

export async function getPrometheusState(db: FogoDb, snapshot: StrategySnapshot): Promise<PrometheusResult> {
  const last = await loadLatestBriefing(db)
  const creds = await loadPrometheusCredentials(db)
  const key = creds.apiKey
  if (!last) {
    return {
      available: false,
      stale: false,
      generatedAt: null,
      model: null,
      briefing: null,
      validationIssues: [],
      unavailableReason: key
        ? 'Ainda não há análise PROMETHEUS gerada para esta organização.'
        : 'Integração PROMETHEUS indisponível: cadastre a chave OpenAI em Integrações.',
    }
  }
  const ageMs = Date.now() - Date.parse(last.generatedAt)
  const stale = last.stale || ageMs > 30 * 60_000 || last.contextHash !== contextHash(snapshot.digest, snapshot.limitations)
  return {
    available: true,
    stale,
    generatedAt: last.generatedAt,
    model: last.model,
    briefing: last.briefing,
    validationIssues: last.error ? [last.error] : [],
    unavailableReason: stale
      ? key
        ? 'Análise desatualizada em relação ao snapshot atual. Gere novamente para atualizar.'
        : 'Análise desatualizada. Cadastre a chave OpenAI em Integrações para regenerar.'
      : null,
  }
}

export async function suggestActionPayload(
  db: FogoDb,
  snapshot: StrategySnapshot,
  actionType: string,
  briefing: PrometheusResult,
): Promise<{ suggestions: Record<string, string> | null; unavailableReason: string | null }> {
  const creds = await loadPrometheusCredentials(db)
  const key = creds.apiKey?.trim()
  if (!key) {
    return { suggestions: null, unavailableReason: 'IA indisponível: cadastre a chave OpenAI em Integrações.' }
  }
  if (!briefing.briefing) {
    return { suggestions: null, unavailableReason: 'Não há análise PROMETHEUS válida para sugerir campos.' }
  }
  try {
    const model = creds.model.trim() || 'gpt-4o-mini'
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Sugira campos iniciais de um formulário de ação do CCO a partir do briefing e do snapshot. JSON plano string→string. Não invente IDs. Inclua justification. Revisão humana é obrigatória.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              actionType,
              briefing: briefing.briefing,
              digest: snapshot.digest,
              limitations: snapshot.limitations,
              weatherWarnings: snapshot.weatherWarnings,
            }),
          },
        ],
      }),
    })
    if (!res.ok) return { suggestions: null, unavailableReason: `IA indisponível (HTTP ${res.status}).` }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || '{}') as Record<string, unknown>
    const suggestions: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) suggestions[k] = v.trim()
    }
    return { suggestions, unavailableReason: null }
  } catch (e) {
    return {
      suggestions: null,
      unavailableReason: `IA indisponível: ${e instanceof Error ? e.message : 'falha'}.`,
    }
  }
}
