import type { FogoDb } from '../db.js'
import type {
  AlphaAnalysisKind,
  AlphaAnalysisResult,
  AlphaChartSeries,
  AlphaClaim,
  AlphaRecommendationDraft,
} from '../../../src/lib/prometheusAlpha.js'
import { OS_REGIONS } from '../../../src/lib/workOrders.js'
import { buildAlphaContext, maintenanceDue, openIncidents, activeAlerts, scheduledOps, type AlphaContext } from './context.js'
import { ALPHA_MODEL_VERSION, aggregateDaily, correlatePrecipAndIncidents, evaluateForecast, hourlyHistogram, predictSameWeekday } from './forecast.js'
import { addLocalDays } from './period.js'
import { hoursOnDate, hourAt } from './weather.js'
import { listRecommendations } from './recommendations.js'
import { listPredictions } from '../predictive/engine.js'
import { isOsOpen } from '../../../src/lib/workOrders.js'
import { formatChartDayPtBr, formatDatePtBr } from '../../../src/lib/format.js'
import { weatherOpsRecommendations } from './weatherRecs.js'
import { lifecycleIntel } from './lifecycleRecs.js'
import { listAlertSla } from '../ccoSla.js'
import { listOrgOperators } from '../members/operatorOps.js'
import { listCcoPresence } from '../ccoPresence.js'
import {
  fieldCapacityPresentation,
  fieldCapacitySnapshot,
  operatorSlaPresentation,
  operatorSlaSnapshot,
} from '../../../src/lib/alphaOpsIntel.js'
import { activeAlertsClaim, alertForecastClaim, openWorkOrdersClaim } from './operationBrief.js'

const TITLES: Record<AlphaAnalysisKind, string> = {
  tomorrow: 'Análise de amanhã',
  next7d: 'Próximos 7 dias',
  climate_ops: 'Clima e operação',
  operational_risk: 'Riscos operacionais',
  region_demand: 'Demanda por região',
  traffic: 'Tráfego',
  pending_recs: 'Recomendações pendentes',
  field_capacity: 'Agentes de campo',
  operator_sla: 'Operadores e SLA',
  chat: 'Consulta operacional',
}

function chart(
  id: string,
  title: string,
  description: string,
  unit: string,
  observed: boolean,
  points: AlphaChartSeries['points'],
  source?: string,
  updatedAt?: string | null,
): AlphaChartSeries {
  return { id, title, description, unit, observed, points, source, updatedAt }
}

function claim(partial: AlphaClaim): AlphaClaim {
  return partial
}

function regionCounts(ctx: AlphaContext, fromIso: string) {
  const map = new Map<string, number>()
  for (const r of OS_REGIONS) map.set(r, 0)
  for (const inc of ctx.incidents) {
    if (inc.openedAt < fromIso) continue
    map.set(inc.region, (map.get(inc.region) ?? 0) + 1)
  }
  return [...map.entries()].map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count)
}

function buildTomorrow(ctx: AlphaContext, date: string, hour: number | null): Pick<AlphaAnalysisResult, 'claims' | 'charts' | 'limitations' | 'recommendations' | 'followUps'> {
  const claims: AlphaClaim[] = []
  const recs: AlphaRecommendationDraft[] = []
  const holiday = ctx.holidays.find((h) => h.date === date)
  const hours = hoursOnDate(ctx.weather.hourly, date)
  const slot = hour != null ? hourAt(ctx.weather.hourly, date, hour) : null
  const peak = hours.reduce<(typeof hours)[0] | null>((best, h) => {
    const p = h.precipProbPct ?? -1
    if (!best || p > (best.precipProbPct ?? -1)) return h
    return best
  }, null)
  const daily = ctx.weather.daily.find((d) => d.date === date)

  if (ctx.weather.source.status === 'unavailable') {
    claims.push(
      claim({
        kind: 'forecast',
        title: 'Previsão meteorológica indisponível',
        body: ctx.weather.source.note,
        sourceKeys: ['open-meteo'],
      }),
    )
  } else if (slot) {
    claims.push(
      claim({
        kind: 'forecast',
        title: `Previsão às ${String(hour).padStart(2, '0')}h`,
        body: `${slot.condition}. Temperatura ${slot.temperatureC ?? 'n/d'} °C, probabilidade de precipitação ${slot.precipProbPct ?? 'n/d'}%, precipitação prevista ${slot.precipMm ?? 'n/d'} mm, vento ${slot.windKmh ?? 'n/d'} km/h.`,
        at: slot.time,
        region: ctx.region ?? undefined,
        sourceKeys: ['open-meteo'],
        confidenceNote: ctx.city.weatherPointNote,
      }),
    )
  } else if (daily) {
    claims.push(
      claim({
        kind: 'forecast',
        title: `Previsão para ${formatDatePtBr(date)}`,
        body: `${daily.condition}. Máxima ${daily.tempMaxC ?? 'n/d'} °C, mínima ${daily.tempMinC ?? 'n/d'} °C, precipitação acumulada ${daily.precipSumMm ?? 'n/d'} mm, probabilidade máxima ${daily.precipProbMaxPct ?? 'n/d'}%.`,
        at: date,
        sourceKeys: ['open-meteo'],
        confidenceNote: ctx.city.weatherPointNote,
      }),
    )
  }

  if (holiday) {
    claims.push(
      claim({
        kind: 'fact',
        title: 'Calendário',
        body: `${formatDatePtBr(date)} é ${holiday.name} (${holiday.scope}).`,
        at: date,
        sourceKeys: ['calendar'],
      }),
    )
  }

  const scheduled = scheduledOps(ctx, date)
  claims.push(
    claim({
      kind: 'fact',
      title: 'Atividades já agendadas',
      body: scheduled.length
        ? `${scheduled.length} OS agendada(s) para ${formatDatePtBr(date)}: ${scheduled.map((s) => s.id).slice(0, 8).join(', ')}.`
        : `Nenhuma OS com agenda para ${formatDatePtBr(date)} nesta seleção.`,
      at: date,
      sourceKeys: ['incidents'],
    }),
  )

  const hist = aggregateDaily(
    ctx.incidents.map((i) => ({ date: i.openedAt.slice(0, 10), region: i.region })),
    ctx.region,
  )
  const forecast = predictSameWeekday(hist, date)
  const evals = evaluateForecast(hist)
  const persisted = ctx.predictions
    .filter((p) => p.predictionType === 'demand_forecast' && p.horizonHours === 24 && !p.region)
    .sort((a, b) => Date.parse(b.calculatedAt) - Date.parse(a.calculatedAt))[0]
  if (persisted?.predictedValue != null) {
    claims.push(
      claim({
        kind: 'model',
        title: persisted.inputSummary?.experimental ? 'Previsão experimental persistida' : 'Previsão de demanda persistida',
        body: `Motor ${persisted.modelName} ${persisted.modelVersion}: ${persisted.predictedValue} no horizonte de 24 h (emitida ${persisted.calculatedAt}). Linha de base ${persisted.baselineValue ?? 'n/d'}. ${persisted.explanation}`,
        at: date,
        sourceKeys: ['predictive-rules'],
        confidenceNote: evals.note,
      }),
    )
  } else if (forecast.predicted == null) {
    claims.push(
      claim({
        kind: 'model',
        title: 'Demanda operacional',
        body: 'Histórico insuficiente para prever volume de OS. Segue apenas a descrição do que já está aberto.',
        sourceKeys: ['incidents', 'predictive-rules'],
      }),
    )
  } else {
    claims.push(
      claim({
        kind: 'model',
        title: forecast.experimental ? 'Previsão experimental de demanda' : 'Previsão de demanda',
        body: `${forecast.method}: ${forecast.predicted} OS. Linha de base ${forecast.baseline ?? 'n/d'}. Amostra de ${forecast.sampleDays} dia(s). MAE ${evals.mae ?? 'n/d'}, RMSE ${evals.rmse ?? 'n/d'}. Sem linha persistida do motor neste horizonte.`,
        at: date,
        sourceKeys: ['incidents'],
        confidenceNote: evals.note,
      }),
    )
  }

  const open = openIncidents(ctx)
  const alerts = activeAlerts(ctx)
  claims.push(
    claim({
      kind: 'fact',
      title: 'Situação atual',
      body: `${open.length} OS em aberto, ${alerts.length} alerta(s) ativo(s), disponibilidade ${ctx.availability.percent}% (${ctx.availability.operational}/${ctx.availability.eligible} elegíveis).`,
      sourceKeys: ['incidents', 'alerts', 'assets'],
    }),
  )

  const due = maintenanceDue(ctx, date)
  if (due.length) {
    claims.push(
      claim({
        kind: 'fact',
        title: 'Inspeção preventiva no horizonte',
        body: `${due.length} ativo(s) com manutenção prevista até ${formatDatePtBr(date)}: ${due
          .slice(0, 8)
          .map((a) => a.id)
          .join(', ')}.`,
        sourceKeys: ['assets'],
      }),
    )
    recs.push({
      category: 'inspecao',
      priority: due.length >= 5 ? 'alta' : 'media',
      region: ctx.region ?? undefined,
      situation: `${due.length} ativo(s) com plano de manutenção vencendo até ${formatDatePtBr(date)}.`,
      evidence: due.slice(0, 8).map((a) => `${a.id}`),
      justification: 'O plano cadastral indica vencimento. Não marca o ativo como defeituoso.',
      actionText: 'Revisar a fila de inspeção preventiva e abrir OS só com confirmação humana.',
      suggestedDeadline: date,
      uncertainties: 'O vencimento do plano não prova falha iminente.',
      generator: ALPHA_MODEL_VERSION,
    })
  }
  const life = lifecycleIntel(ctx.assets, ctx.today)
  claims.push(...life.claims)
  recs.push(...life.recs)

  recs.push(
    ...weatherOpsRecommendations({
      days: daily ? [daily] : ctx.weather.daily.filter((d) => d.date === date),
      hourly: hours,
      scheduledIds: scheduled.map((s) => s.id),
      region: ctx.region,
      generator: ALPHA_MODEL_VERSION,
    }),
  )

  const charts: AlphaChartSeries[] = [
    chart(
      'precip',
      'Probabilidade de precipitação (previsão)',
      `Modelo Open-Meteo para ${formatDatePtBr(date)}. Não é ocorrência confirmada.`,
      '%',
      false,
      hours.map((h) => ({
        label: h.time.slice(11, 16),
        value: h.precipProbPct,
        timestamp: h.time,
      })),
      ctx.weather.source.origin,
      ctx.weather.source.lastUpdatedAt,
    ),
    chart(
      'temp',
      'Temperatura prevista',
      ctx.city.weatherPointNote,
      '°C',
      false,
      hours.map((h) => ({ label: h.time.slice(11, 16), value: h.temperatureC, timestamp: h.time })),
      ctx.weather.source.origin,
      ctx.weather.source.lastUpdatedAt,
    ),
  ]

  const limitations = [
    ctx.city.weatherPointNote,
    evals.note,
    ctx.traffic.source.status === 'unavailable' ? ctx.traffic.source.note : null,
    peak && (peak.precipProbPct ?? 0) >= 50
      ? `Maior probabilidade de chuva às ${peak.time.slice(11, 16)} (${peak.precipProbPct}%).`
      : null,
  ].filter((x): x is string => !!x)

  return {
    claims,
    charts,
    limitations,
    recommendations: recs,
    followUps: ['E especificamente às 18h?', 'Quais regiões tiveram mais OS nos últimos 7 dias?'],
  }
}

function buildNext7d(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const claims: AlphaClaim[] = []
  const recs: AlphaRecommendationDraft[] = []
  const days = ctx.weather.daily.slice(0, 7)
  if (!days.length) {
    claims.push({
      kind: 'forecast',
      title: 'Horizonte de 7 dias',
      body: ctx.weather.source.status === 'unavailable' ? ctx.weather.source.note : 'Sem série diária na resposta meteorológica.',
      sourceKeys: ['open-meteo'],
    })
  }
  for (const d of days) {
    const hol = ctx.holidays.find((h) => h.date === d.date)
    const wet = (d.precipProbMaxPct ?? 0) >= 60 || (d.precipSumMm ?? 0) >= 10
    claims.push({
      kind: 'forecast',
      title: formatDatePtBr(d.date),
      body: `${d.condition}. ${d.tempMinC ?? 'n/d'}–${d.tempMaxC ?? 'n/d'} °C. Precipitação ${d.precipSumMm ?? 'n/d'} mm, probabilidade máxima ${d.precipProbMaxPct ?? 'n/d'}%.${hol ? ` Feriado: ${hol.name}.` : ''}${wet ? ' Período potencialmente crítico por chuva prevista.' : ''}`,
      at: d.date,
      sourceKeys: ['open-meteo', 'calendar'],
    })
  }
  const from = ctx.today
  const hist = aggregateDaily(
    ctx.incidents.map((i) => ({ date: i.openedAt.slice(0, 10), region: i.region })),
    ctx.region,
  )
  for (const d of days) {
    const f = predictSameWeekday(hist, d.date)
    if (f.predicted == null) continue
    claims.push({
      kind: f.experimental ? 'hypothesis' : 'model',
      title: `Demanda ${formatDatePtBr(d.date)}`,
      body: `${f.method}: ${f.predicted} OS (${f.experimental ? 'experimental' : 'avaliável'}).`,
      at: d.date,
      sourceKeys: ['incidents'],
    })
  }
  recs.push(
    ...weatherOpsRecommendations({
      days,
      region: ctx.region,
      generator: ALPHA_MODEL_VERSION,
    }),
  )
  const due = maintenanceDue(ctx, addLocalDays(from, 7))
  if (due.length) {
    recs.push({
      category: 'inspecao',
      priority: 'media',
      situation: `${due.length} ativo(s) com manutenção prevista nos próximos 7 dias.`,
      evidence: due.slice(0, 10).map((a) => a.id),
      justification: 'Vencimento do plano cadastral, sem marcar defeito.',
      actionText: 'Priorizar inspeções no horizonte de 7 dias após confirmação da equipe.',
      uncertainties: 'O plano pode estar desatualizado.',
      generator: ALPHA_MODEL_VERSION,
    })
  }
  const life = lifecycleIntel(ctx.assets, ctx.today)
  claims.push(...life.claims)
  recs.push(...life.recs)
  return {
    claims,
    charts: [
      chart(
        'week-precip',
        'Precipitação prevista (7 dias)',
        'Soma diária do modelo Open-Meteo.',
        'mm',
        false,
        days.map((d) => ({ label: formatChartDayPtBr(d.date), value: d.precipSumMm, timestamp: d.date })),
        ctx.weather.source.origin,
        ctx.weather.source.lastUpdatedAt,
      ),
      chart(
        'week-temp',
        'Temperatura máxima prevista',
        'Série diária. Lacunas permanecem vazias.',
        '°C',
        false,
        days.map((d) => ({ label: formatChartDayPtBr(d.date), value: d.tempMaxC, timestamp: d.date })),
        ctx.weather.source.origin,
        ctx.weather.source.lastUpdatedAt,
      ),
    ],
    limitations: [ctx.city.weatherPointNote, evaluateForecast(hist).note],
    recommendations: recs,
    followUps: ['Analisar o clima e a operação', 'Quais ativos precisam de inspeção preventiva?'],
  }
}

function buildClimate(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const from = addLocalDays(ctx.today, -7)
  const recent = ctx.incidents.filter((i) => i.openedAt.slice(0, 10) >= from)
  const link = correlatePrecipAndIncidents(
    recent.map((i) => ({ openedAt: i.openedAt })),
    ctx.archive.hours,
  )
  const claims: AlphaClaim[] = [
    {
      kind: link.experimental ? 'hypothesis' : 'trend',
      title: 'Chuva × ocorrências (últimos 7–30 dias no arquivo)',
      body: link.note +
        (link.meanIncidentsWet != null
          ? ` Média em hora úmida ${link.meanIncidentsWet}; em hora seca ${link.meanIncidentsDry ?? 'n/d'}; razão ${link.ratio ?? 'n/d'}. Amostra ${link.sampleIncidents} OS cruzada(s).`
          : ''),
      sourceKeys: ['open-meteo-archive', 'incidents'],
      confidenceNote: 'Não afirma causalidade.',
    },
  ]
  const tomorrow = addLocalDays(ctx.today, 1)
  const daily = ctx.weather.daily.find((d) => d.date === tomorrow)
  if (daily && (daily.precipProbMaxPct ?? 0) >= 70 && link.ratio != null && link.ratio > 1.2 && !link.experimental) {
    claims.push({
      kind: 'hypothesis',
      title: 'Sobreposição amanhã',
      body: `Amanhã o modelo indica até ${daily.precipProbMaxPct}% de precipitação. No histórico recente, horas úmidas tiveram mais OS do que horas secas. Isso é hipótese, não previsão de congestionamento.`,
      at: tomorrow,
      sourceKeys: ['open-meteo', 'open-meteo-archive', 'incidents'],
    })
  }
  return {
    claims,
    charts: [
      chart(
        'climate-wet',
        'Média de OS por tipo de hora',
        'Hora úmida = precipitação observada ≥ 1 mm no arquivo Open-Meteo.',
        'OS / hora',
        true,
        [
          { label: 'Hora úmida', value: link.meanIncidentsWet },
          { label: 'Hora seca', value: link.meanIncidentsDry },
        ],
        ctx.archive.source.origin,
        ctx.archive.source.lastUpdatedAt,
      ),
    ],
    limitations: [link.note, ctx.archive.source.note],
    recommendations: weatherOpsRecommendations({
      days: ctx.weather.daily.slice(0, 7),
      region: ctx.region,
      generator: ALPHA_MODEL_VERSION,
    }),
    followUps: ['Como estará o tempo amanhã às 8h?'],
  }
}

function buildRisk(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const open = openIncidents(ctx)
  const alerts = activeAlerts(ctx)
  const byRegion = regionCounts(ctx, addLocalDays(ctx.today, -6) + 'T00:00:00')
  const top = byRegion[0]
  const claims: AlphaClaim[] = [
    {
      kind: 'fact',
      title: 'Concentração de OS (7 dias)',
      body: top && top.count
        ? `${top.region} lidera com ${top.count} OS. Demais: ${byRegion
            .slice(1, 4)
            .map((r) => `${r.region} ${r.count}`)
            .join('; ')}.`
        : 'Não há OS nos últimos 7 dias nesta seleção.',
      sourceKeys: ['incidents'],
    },
    {
      kind: 'fact',
      title: 'Alertas e ativos',
      body: `${alerts.length} alerta(s) ativo(s). Ativos em alerta cadastral: ${ctx.availability.alert}. Disponibilidade ${ctx.availability.percent}%.`,
      sourceKeys: ['alerts', 'assets'],
    },
  ]
  const recs: AlphaRecommendationDraft[] = [
    ...weatherOpsRecommendations({
      days: ctx.weather.daily.slice(0, 3),
      region: ctx.region,
      generator: ALPHA_MODEL_VERSION,
    }),
  ]
  if (top && top.count >= 5) {
    recs.push({
      category: 'regiao',
      priority: 'alta',
      region: top.region,
      situation: `Concentração de ${top.count} OS em ${top.region} nos últimos 7 dias.`,
      evidence: [`${top.region}: ${top.count} OS`],
      justification: 'Volume observado, sem extrapolar causa.',
      actionText: `Revisar escala e fila de ${top.region} com o gestor da operação.`,
      uncertainties: 'Parte do volume pode ser retrabalho ou OS preventivas.',
      generator: ALPHA_MODEL_VERSION,
    })
  }
  const life = lifecycleIntel(ctx.assets, ctx.today)
  claims.push(...life.claims)
  recs.push(...life.recs)
  const pendingPred = ctx.predictions.filter((p) => p.decisionStatus === 'pending')
  if (pendingPred.length) {
    claims.push({
      kind: 'fact',
      title: 'Recomendações preditivas pendentes',
      body: `${pendingPred.length} sinal(is) do motor de regras ainda sem decisão humana.`,
      sourceKeys: ['predictive-rules'],
    })
  }
  return {
    claims,
    charts: [
      chart(
        'risk-region',
        'OS por região (7 dias)',
        'Contagem observada. Sem interpolação.',
        'OS',
        true,
        byRegion.map((r) => ({ label: r.region, value: r.count })),
        'FOGO',
        ctx.generatedAt,
      ),
    ],
    limitations: ['Risco aqui é concentração observada + indisponibilidade cadastral, não um índice composto inventado.'],
    recommendations: recs,
    followUps: ['Analisar demanda por região', 'Recomendações pendentes'],
  }
}

function buildDemand(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const from = addLocalDays(ctx.today, -6)
  const recent = ctx.incidents.filter((i) => i.openedAt.slice(0, 10) >= from)
  const byRegion = regionCounts(ctx, from + 'T00:00:00')
  const histAll = OS_REGIONS.map((region) => {
    const hist = aggregateDaily(
      ctx.incidents.map((i) => ({ date: i.openedAt.slice(0, 10), region: i.region })),
      region,
    )
    const f = predictSameWeekday(hist, addLocalDays(ctx.today, 1))
    return { region, hist, forecast: f, eval: evaluateForecast(hist) }
  })
  const hourHist = hourlyHistogram(recent.map((i) => i.openedAt))
  const claims: AlphaClaim[] = histAll.map((row) => ({
    kind: row.forecast.experimental ? 'hypothesis' : 'model',
    title: row.region,
    body:
      row.forecast.predicted == null
        ? `Sem histórico suficiente para prever ${row.region}.`
        : `Amanhã: ${row.forecast.predicted} OS (${row.forecast.method}). MAE ${row.eval.mae ?? 'n/d'}.`,
    region: row.region,
    sourceKeys: ['incidents'],
    confidenceNote: row.eval.note,
  }))
  claims.unshift({
    kind: 'fact',
    title: 'Volume observado (7 dias)',
    body: byRegion.map((r) => `${r.region}: ${r.count}`).join('; ') || 'Sem OS no período.',
    sourceKeys: ['incidents'],
  })
  const peakHour = [...hourHist].sort((a, b) => b.count - a.count)[0]
  if (peakHour && peakHour.count) {
    claims.push({
      kind: 'trend',
      title: 'Horário com mais OS (7 dias)',
      body: `${peakHour.hour} concentrou ${peakHour.count} abertura(s). Tendência observada, não previsão.`,
      sourceKeys: ['incidents'],
    })
  }
  return {
    claims,
    charts: [
      chart(
        'demand-region',
        'OS observadas por região (7 dias)',
        'Contagem real.',
        'OS',
        true,
        byRegion.map((r) => ({ label: r.region, value: r.count })),
        'FOGO',
        ctx.generatedAt,
      ),
      chart(
        'demand-hour',
        'Aberturas por hora (7 dias)',
        'Histograma do horário de abertura. Zeros são horas sem registro.',
        'OS',
        true,
        hourHist.map((h) => ({ label: h.hour, value: h.count })),
        'FOGO',
        ctx.generatedAt,
      ),
      chart(
        'demand-forecast',
        'Previsão de amanhã por região',
        histAll.some((r) => r.forecast.experimental)
          ? 'Há regiões em modo experimental (histórico curto).'
          : 'Baseline do mesmo dia da semana.',
        'OS',
        false,
        histAll.map((r) => ({ label: r.region, value: r.forecast.predicted })),
        ALPHA_MODEL_VERSION,
        ctx.generatedAt,
      ),
    ],
    limitations: histAll.map((r) => `${r.region}: ${r.eval.note}`),
    recommendations: [],
    followUps: ['Quais equipes podem ter maior demanda amanhã?'],
  }
}

function buildTraffic(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const claims: AlphaClaim[] = [
    {
      kind: 'fact',
      title: 'Dados de tráfego',
      body:
        ctx.traffic.source.status === 'unavailable'
          ? 'Dados de tráfego indisponíveis. Nenhum provedor autorizado está configurado.'
          : `${ctx.traffic.events.length} evento(s) do provedor ${ctx.traffic.source.origin}.`,
      sourceKeys: ['traffic-external'],
    },
  ]
  const trafficLike = ctx.incidents.filter(
    (i) => isOsOpen(i.status) && /tr[aâ]nsito|semafor|bloqueio|congestion|desvio/i.test(`${i.type} ${i.description}`),
  )
  if (ctx.traffic.source.status === 'unavailable') {
    claims.push({
      kind: 'hypothesis',
      title: 'Risco viário indireto',
      body: trafficLike.length
        ? `${trafficLike.length} OS aberta(s) com texto relacionado a via/trânsito. Isso não substitui um feed de velocidade ou congestionamento.`
        : 'Sem OS viária aberta e sem feed externo. Não há base para falar de congestionamento.',
      sourceKeys: ['incidents'],
    })
  }
  return {
    claims,
    charts: [],
    limitations: [ctx.traffic.source.note],
    recommendations: [],
    followUps: ['Analisar riscos operacionais'],
  }
}

async function buildPending(db: FogoDb, ctx: AlphaContext): Promise<ReturnType<typeof buildTomorrow>> {
  const alphaPending = await listRecommendations(db, 'pending')
  const predPending = (await listPredictions(db, 50)).filter((p) => p.decisionStatus === 'pending')
  const claims: AlphaClaim[] = [
    {
      kind: 'fact',
      title: 'Fila Alpha',
      body: alphaPending.length
        ? `${alphaPending.length} recomendação(ões) do Alpha aguardando decisão.`
        : 'Nenhuma recomendação do Alpha pendente.',
      sourceKeys: ['predictive-rules'],
    },
    {
      kind: 'fact',
      title: 'Fila do motor de regras',
      body: predPending.length
        ? `${predPending.length} sinal(is) preditivos sem aceite/rejeição. Ver Inteligência preditiva.`
        : 'Nenhum sinal preditivo pendente.',
      sourceKeys: ['predictive-rules'],
    },
  ]
  return {
    claims,
    charts: [
      chart(
        'recs-status',
        'Recomendações Alpha pendentes',
        'Apenas itens ainda sem decisão.',
        'itens',
        true,
        [{ label: 'Pendentes', value: alphaPending.length }],
        'FOGO',
        ctx.generatedAt,
      ),
    ],
    limitations: ['Aceitar uma recomendação não executa OS, alerta nem webhook.'],
    recommendations: [],
    followUps: ['O que mudou em relação à última análise?'],
  }
}

function fieldAgents(ctx: AlphaContext) {
  return ctx.teams.map((t) => ({
    id: t.id,
    name: t.name,
    region: t.region,
    status: t.status,
    functionalStatus: t.functionalStatus,
    assignedIncidentId: t.assignedIncidentId,
  }))
}

function fieldIncidents(ctx: AlphaContext) {
  return ctx.incidents.map((i) => ({
    id: i.id,
    region: i.region,
    status: i.status,
    assignedTeamId: i.assignedTeamId,
    openedAt: i.openedAt,
    resolvedAt: i.resolvedAt,
  }))
}

function buildFieldCapacity(ctx: AlphaContext): ReturnType<typeof buildTomorrow> {
  const snap = fieldCapacitySnapshot(fieldAgents(ctx), fieldIncidents(ctx), ctx.today)
  const out = fieldCapacityPresentation(snap, ctx.generatedAt, ctx.region)
  return {
    claims: out.claims,
    charts: out.charts,
    limitations: out.limitations,
    recommendations: out.recommendations,
    followUps: ['Qual o cumprimento de SLA dos operadores?', 'Quais regiões tiveram mais OS nos últimos 7 dias?'],
  }
}

async function loadOperatorSnap(db: FogoDb, ctx: AlphaContext) {
  const [sla, members] = await Promise.all([listAlertSla(db), listOrgOperators(db)])
  const presence = listCcoPresence(db.orgId)
  return operatorSlaSnapshot({
    members: members
      .filter((m) => m.status !== 'inactive')
      .map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role })),
    presenceUserIds: presence.map((p) => p.userId),
    alerts: ctx.alerts,
    incidents: ctx.incidents,
    slaRows: sla.alerts.map((r) => ({
      protocol: r.protocol,
      claimedBy: r.claimedBy,
      claimedByLabel: r.claimedByLabel,
      state: r.state,
      firstResponseOverdue: r.firstResponseOverdue,
      assumeAt: r.assumeAt,
      assumeMs: r.assumeMs,
      dispatchMs: r.dispatchMs,
      completeMs: r.completeMs,
      slaPercent: r.slaPercent,
      region: r.region,
    })),
    summary: {
      openAlerts: sla.summary.openAlerts,
      overdueOpen: sla.summary.overdueOpen,
      avgAssumeMs: sla.summary.avgAssumeMs,
      avgDispatchMs: sla.summary.avgDispatchMs,
      avgCompleteMs: sla.summary.avgCompleteMs,
    },
  })
}

async function buildOperatorSla(db: FogoDb, ctx: AlphaContext): Promise<ReturnType<typeof buildTomorrow>> {
  const snap = await loadOperatorSnap(db, ctx)
  const out = operatorSlaPresentation(snap, ctx.generatedAt)
  return {
    claims: out.claims,
    charts: out.charts,
    limitations: out.limitations,
    recommendations: out.recommendations,
    followUps: ['Os agentes de campo dão conta da fila?', 'Quais alertas estão vencidos?'],
  }
}

function weatherBrief(ctx: AlphaContext, date: string, hour: number | null): AlphaClaim | null {
  if (ctx.weather.source.status === 'unavailable') {
    return {
      kind: 'forecast',
      title: 'Previsão meteorológica',
      body: ctx.weather.source.note,
      sourceKeys: ['open-meteo'],
    }
  }
  const slot = hour != null ? hourAt(ctx.weather.hourly, date, hour) : null
  const daily = ctx.weather.daily.find((d) => d.date === date)
  if (slot) {
    return {
      kind: 'forecast',
      title: `Tempo às ${String(hour).padStart(2, '0')}h`,
      body: `${slot.condition}. ${slot.temperatureC ?? 'n/d'} °C, probabilidade de precipitação ${slot.precipProbPct ?? 'n/d'}%.`,
      at: slot.time,
      sourceKeys: ['open-meteo'],
      confidenceNote: ctx.city.weatherPointNote,
    }
  }
  if (daily) {
    return {
      kind: 'forecast',
      title: `Tempo em ${formatDatePtBr(date)}`,
      body: `${daily.condition}. ${daily.tempMinC ?? 'n/d'}–${daily.tempMaxC ?? 'n/d'} °C, precipitação ${daily.precipSumMm ?? 'n/d'} mm, probabilidade máxima ${daily.precipProbMaxPct ?? 'n/d'}%.`,
      at: date,
      sourceKeys: ['open-meteo'],
      confidenceNote: ctx.city.weatherPointNote,
    }
  }
  return null
}

async function buildConsulta(
  db: FogoDb,
  ctx: AlphaContext,
  date: string,
  hour: number | null,
): Promise<ReturnType<typeof buildTomorrow>> {
  const open = openIncidents(ctx)
  const alerts = activeAlerts(ctx)
  const field = fieldCapacityPresentation(
    fieldCapacitySnapshot(fieldAgents(ctx), fieldIncidents(ctx), ctx.today),
    ctx.generatedAt,
    ctx.region,
  )
  const sla = operatorSlaPresentation(await loadOperatorSnap(db, ctx), ctx.generatedAt)
  const weather = weatherBrief(ctx, date, hour)
  const forecast = await alertForecastClaim(db)
  const claims: AlphaClaim[] = [
    {
      kind: 'fact',
      title: 'Situação atual',
      body: `${open.length} OS em aberto, ${alerts.length} alerta(s) ativo(s), disponibilidade de ativos ${ctx.availability.percent}% (${ctx.availability.operational}/${ctx.availability.eligible} elegíveis).`,
      sourceKeys: ['incidents', 'alerts', 'assets'],
    },
    openWorkOrdersClaim(ctx),
    activeAlertsClaim(ctx),
    forecast,
    ...field.claims,
    ...sla.claims,
  ]
  if (weather) claims.push(weather)
  return {
    claims,
    charts: [...field.charts, ...sla.charts].slice(0, 4),
    limitations: [...field.limitations, ...sla.limitations],
    recommendations: [...field.recommendations, ...sla.recommendations],
    followUps: ['Os agentes de campo dão conta?', 'Qual o cumprimento de SLA dos operadores?'],
  }
}

export async function runNamedAnalysis(
  db: FogoDb,
  kind: AlphaAnalysisKind,
  opts: { region?: string | null; date?: string | null; hour?: number | null } = {},
): Promise<AlphaAnalysisResult> {
  const ctx = await buildAlphaContext(db, { region: opts.region, forecastDays: 7 })
  const date = opts.date || addLocalDays(ctx.today, kind === 'tomorrow' ? 1 : 0)
  const hour = opts.hour ?? null
  const built =
    kind === 'next7d'
      ? buildNext7d(ctx)
      : kind === 'climate_ops'
        ? buildClimate(ctx)
        : kind === 'operational_risk'
          ? buildRisk(ctx)
          : kind === 'region_demand'
            ? buildDemand(ctx)
            : kind === 'traffic'
              ? buildTraffic(ctx)
              : kind === 'pending_recs'
                ? await buildPending(db, ctx)
                : kind === 'field_capacity'
                  ? buildFieldCapacity(ctx)
                  : kind === 'operator_sla'
                    ? await buildOperatorSla(db, ctx)
                    : kind === 'chat'
                      ? await buildConsulta(db, ctx, date || ctx.today, hour)
                      : buildTomorrow(ctx, date || addLocalDays(ctx.today, 1), hour)

  const from =
    kind === 'next7d'
      ? addLocalDays(ctx.today, 1)
      : kind === 'climate_ops' || kind === 'region_demand' || kind === 'operational_risk' || kind === 'field_capacity' || kind === 'operator_sla' || kind === 'chat'
        ? addLocalDays(ctx.today, -6)
        : date
  const to = kind === 'next7d' ? addLocalDays(ctx.today, 7) : date
  return {
    kind,
    title: TITLES[kind],
    generatedAt: ctx.generatedAt,
    city: ctx.city,
    region: ctx.region,
    period: {
      from: `${from}T00:00:00`,
      to: `${to}T23:59:59`,
      label:
        kind === 'next7d'
          ? 'próximos 7 dias'
          : kind === 'tomorrow'
            ? `amanhã${hour != null ? ` ${hour}h` : ''}`
            : kind === 'field_capacity' || kind === 'operator_sla' || kind === 'chat'
              ? 'agora e últimos 7 dias'
              : TITLES[kind],
    },
    claims: built.claims,
    charts: built.charts.filter((c) => c.points.some((p) => p.value != null)),
    sources: ctx.sources,
    limitations: built.limitations,
    recommendations: built.recommendations,
    followUps: built.followUps,
    modelVersion: ALPHA_MODEL_VERSION,
  }
}

export { TITLES }
