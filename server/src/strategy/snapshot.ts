import { createHash } from 'crypto'
import type { FogoDb } from '../db.js'
import { listAlerts, listAssets, listIncidents, listTeams } from '../repository.js'
import { listPredictions } from '../predictive/engine.js'
import {
  DIGEST_LABELS,
  type SnapshotDelta,
  type SnapshotDigest,
  type SourceMeta,
  type StrategyIndicator,
  type StrategySnapshot,
  type TrafficIncidentItem,
} from '../../../src/lib/strategy.js'
import { loadWeather } from './weather.js'
import { resolveCityGeo } from '../alpha/geoConfig.js'
import { listStrategicActions, loadLatestBriefing } from './store.js'
import { isMaintenanceOsType, isOsInProgress, isOsOpen } from '../../../src/lib/workOrders.js'

const TRAFFIC_RE = /tr[aâ]nsito|semafor|sinaliza|bloqueio|congestion|radar|desvio|via\b/i
const ACTIVE_ALERT = new Set(['novo', 'reconhecido', 'em atendimento', 'em observação'])

function maxIso(values: Array<string | undefined | null>): string | null {
  const dates = values.filter((v): v is string => !!v).map((v) => Date.parse(v)).filter((n) => Number.isFinite(n))
  if (!dates.length) return null
  return new Date(Math.max(...dates)).toISOString()
}

export function sourceForCount(opts: {
  key: string
  label: string
  origin: string
  count: number
  lastUpdatedAt: string | null
  emptyNote: string
  okNote?: string
}): SourceMeta {
  if (opts.count === 0) {
    return {
      key: opts.key,
      label: opts.label,
      status: 'empty',
      origin: opts.origin,
      lastUpdatedAt: opts.lastUpdatedAt,
      note: opts.emptyNote,
    }
  }
  return {
    key: opts.key,
    label: opts.label,
    status: 'ok',
    origin: opts.origin,
    lastUpdatedAt: opts.lastUpdatedAt,
    note: opts.okNote ?? 'Dados do cadastro operacional FOGO.',
  }
}

function countBy(items: { key: string }[]): { key: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) map.set(item.key, (map.get(item.key) ?? 0) + 1)
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

export function digestDeltas(previous: SnapshotDigest | null, current: SnapshotDigest): SnapshotDelta[] {
  if (!previous) return []
  const out: SnapshotDelta[] = []
  for (const field of Object.keys(current) as (keyof SnapshotDigest)[]) {
    const delta = current[field] - previous[field]
    if (delta === 0) continue
    out.push({
      field,
      label: DIGEST_LABELS[field],
      previous: previous[field],
      current: current[field],
      delta,
    })
  }
  return out
}

export function contextHash(digest: SnapshotDigest, extras: string[]): string {
  return createHash('sha256').update(JSON.stringify({ digest, extras })).digest('hex').slice(0, 16)
}

export async function buildStrategySnapshot(db: FogoDb): Promise<StrategySnapshot> {
  const geo = resolveCityGeo(db)
  const [assets, incidents, alerts, teams, predictions, actions, lastBriefing, weather] = await Promise.all([
    listAssets(db),
    listIncidents(db),
    listAlerts(db),
    listTeams(db),
    listPredictions(db, 40),
    listStrategicActions(db),
    loadLatestBriefing(db),
    loadWeather(geo),
  ])

  const operational = assets.filter((a) => a.status === 'operacional')
  const unavailable = assets.filter((a) => a.status !== 'operacional')
  const openOs = incidents.filter((i) => isOsOpen(i.status))
  const criticalOs = openOs.filter((i) => i.priority === 'crítica' || i.priority === 'alta')
  const activeAlerts = alerts.filter((a) => ACTIVE_ALERT.has(a.state))
  const overdueAlerts = activeAlerts.filter((a) => a.responseDueAt && Date.parse(a.responseDueAt) < Date.now())
  const teamsAvailable = teams.filter((t) => t.status === 'disponível')
  const teamsMobilized = teams.filter((t) => t.status === 'em campo')
  const trafficFromAlerts: TrafficIncidentItem[] = activeAlerts
    .filter((a) => TRAFFIC_RE.test(`${a.category} ${a.title} ${a.description}`))
    .map((a) => ({ id: a.id, title: a.title, region: a.region, severity: a.severity, kind: 'alerta' as const }))
  const trafficFromOs: TrafficIncidentItem[] = openOs
    .filter((i) => TRAFFIC_RE.test(`${i.type} ${i.description}`))
    .map((i) => ({
      id: i.id,
      title: i.workOrderDescription || i.description,
      region: i.region,
      severity: i.priority,
      kind: 'ordem_servico' as const,
    }))
  const traffic = [...trafficFromAlerts, ...trafficFromOs]
  const predictive = predictions.filter((p) => p.reviewStatus === 'pending')
  const inProgressOs = incidents.filter((i) => isOsInProgress(i.status))
  const inProgressMaintOs = inProgressOs.filter((i) => isMaintenanceOsType(i.type))
  const inProgressActions = actions.filter((a) => a.status === 'executing' || a.status === 'sent')
  const pendingApprovals = actions.filter((a) => a.status === 'pending_approval')
  const now = new Date().toISOString()

  const digest: SnapshotDigest = {
    assetsTotal: assets.length,
    assetsOperational: operational.length,
    assetsUnavailable: unavailable.length,
    openWorkOrders: openOs.length,
    criticalWorkOrders: criticalOs.length,
    activeAlerts: activeAlerts.length,
    teamsAvailable: teamsAvailable.length,
    teamsMobilized: teamsMobilized.length,
    trafficIncidents: traffic.length,
    weatherWarnings: weather.warnings.length,
    predictiveRisks: predictive.length,
    actionsInProgress: inProgressOs.length + inProgressActions.length,
    pendingApprovals: pendingApprovals.length,
  }

  const prevDigest = (lastBriefing?.snapshotDigest as SnapshotDigest | undefined) ?? null
  const changesSinceLastBriefing = digestDeltas(prevDigest, digest)

  const assetsUpdated = maxIso(assets.map((a) => a.lastSeen)) ?? now
  const osUpdated = maxIso(incidents.map((i) => i.openedAt)) ?? now
  const alertsUpdated = maxIso(alerts.map((a) => a.detectedAt)) ?? now

  const indicators: StrategyIndicator[] = [
    {
      key: 'assetsTotal',
      label: DIGEST_LABELS.assetsTotal,
      value: assets.length,
      source: sourceForCount({
        key: 'assets',
        label: 'Cadastro de ativos',
        origin: 'FOGO / ativos',
        count: assets.length,
        lastUpdatedAt: assetsUpdated,
        emptyNote: 'Nenhum ativo cadastrado no inventário.',
      }),
    },
    {
      key: 'assetsOperational',
      label: DIGEST_LABELS.assetsOperational,
      value: operational.length,
      breakdown: countBy(operational.map((a) => ({ key: a.category || 'sem categoria' }))),
      source: sourceForCount({
        key: 'assets-op',
        label: 'Ativos operacionais',
        origin: 'FOGO / ativos',
        count: operational.length,
        lastUpdatedAt: assetsUpdated,
        emptyNote: assets.length ? 'Nenhum ativo está operacional neste momento.' : 'Inventário vazio.',
      }),
    },
    {
      key: 'assetsUnavailable',
      label: DIGEST_LABELS.assetsUnavailable,
      value: unavailable.length,
      breakdown: countBy(unavailable.map((a) => ({ key: `${a.status}` }))),
      items: unavailable.slice(0, 8).map((a) => ({ id: a.id, title: a.name, detail: `${a.status} · ${a.region}` })),
      source: sourceForCount({
        key: 'assets-down',
        label: 'Ativos indisponíveis',
        origin: 'FOGO / ativos',
        count: unavailable.length,
        lastUpdatedAt: assetsUpdated,
        emptyNote: 'Nenhum ativo em alerta ou inativo.',
      }),
    },
    {
      key: 'openWorkOrders',
      label: 'Ocorrências / OS abertas',
      value: openOs.length,
      breakdown: countBy(openOs.map((i) => ({ key: i.priority }))),
      items: openOs.slice(0, 8).map((i) => ({
        id: i.id,
        title: i.workOrderDescription || i.description,
        detail: `${i.priority} · ${i.status} · ${i.region}`,
      })),
      source: sourceForCount({
        key: 'os',
        label: 'Ordens de serviço',
        origin: 'FOGO / ordens de serviço',
        count: openOs.length,
        lastUpdatedAt: osUpdated,
        emptyNote: 'Nenhuma ordem de serviço aberta, agendada ou em atendimento.',
      }),
    },
    {
      key: 'activeAlerts',
      label: DIGEST_LABELS.activeAlerts,
      value: activeAlerts.length,
      breakdown: countBy(activeAlerts.map((a) => ({ key: a.severity }))),
      items: activeAlerts.slice(0, 8).map((a) => ({
        id: a.id,
        title: a.title,
        detail: [
          a.severity,
          a.state,
          a.responseDueAt
            ? Date.parse(a.responseDueAt) < Date.now()
              ? 'prazo vencido'
              : `válido até ${a.responseDueAt}`
            : 'validade não informada',
        ].join(' · '),
      })),
      source: sourceForCount({
        key: 'alerts',
        label: 'Alertas operacionais',
        origin: 'FOGO / alertas',
        count: activeAlerts.length,
        lastUpdatedAt: alertsUpdated,
        emptyNote: 'Nenhum alerta ativo. Consulta ao módulo de alertas concluída.',
        okNote: overdueAlerts.length
          ? `${overdueAlerts.length} alerta(s) com prazo de validade/SLA vencido.`
          : 'Alertas ativos com validade conforme prazo de resposta.',
      }),
    },
    {
      key: 'teams',
      label: 'Equipes',
      value: teams.length,
      breakdown: [
        { key: 'disponível', count: teamsAvailable.length },
        { key: 'em campo', count: teamsMobilized.length },
        { key: 'indisponível', count: teams.filter((t) => t.status === 'indisponível').length },
      ],
      source: sourceForCount({
        key: 'teams',
        label: 'Equipes operacionais',
        origin: 'FOGO / equipes',
        count: teams.length,
        lastUpdatedAt: now,
        emptyNote: 'Nenhuma equipe cadastrada.',
      }),
    },
    {
      key: 'traffic',
      label: DIGEST_LABELS.trafficIncidents,
      value: traffic.length,
      items: traffic.slice(0, 8).map((t) => ({ id: t.id, title: t.title, detail: `${t.kind} · ${t.region ?? '—'}` })),
      source: sourceForCount({
        key: 'traffic-fogo',
        label: 'Trânsito (registros FOGO)',
        origin: 'FOGO / alertas e OS de trânsito',
        count: traffic.length,
        lastUpdatedAt: maxIso([...alerts.map((a) => a.detectedAt), ...incidents.map((i) => i.openedAt)]),
        emptyNote: 'Nenhum alerta ou ordem de serviço de trânsito aberto no FOGO.',
      }),
    },
    {
      key: 'weatherOfficial',
      label: DIGEST_LABELS.weatherWarnings,
      value: weather.warningsSource.status === 'unavailable' ? null : weather.warnings.length,
      items: weather.warnings.slice(0, 8).map((w) => ({
        id: w.id,
        title: w.event,
        detail: `${w.severity} · ${w.endsAt ? `até ${w.endsAt}` : 'validade não informada'}`,
      })),
      source: weather.warningsSource,
    },
    {
      key: 'predictive',
      label: DIGEST_LABELS.predictiveRisks,
      value: predictive.length,
      items: predictive.slice(0, 8).map((p) => ({
        id: p.id,
        title: p.targetLabel,
        detail: [p.region, p.horizonHours ? `${p.horizonHours}h` : null, p.probability != null ? `${Math.round(p.probability * 100)}% modelo` : null]
          .filter(Boolean)
          .join(' · '),
      })),
      source: sourceForCount({
        key: 'predictive',
        label: 'Riscos preditivos',
        origin: 'FOGO / motor preditivo',
        count: predictive.length,
        lastUpdatedAt: maxIso(predictions.map((p) => p.calculatedAt)) ?? now,
        emptyNote: 'Nenhum risco preditivo pendente de revisão.',
      }),
    },
    {
      key: 'actionsInProgress',
      label: DIGEST_LABELS.actionsInProgress,
      value: digest.actionsInProgress,
      breakdown: [
        { key: 'OS em atendimento', count: inProgressOs.length - inProgressMaintOs.length },
        { key: 'OS de manutenção', count: inProgressMaintOs.length },
        { key: 'ações estratégicas', count: inProgressActions.length },
      ],
      source: sourceForCount({
        key: 'actions',
        label: 'Ações em andamento',
        origin: 'FOGO / OS e ações estratégicas',
        count: digest.actionsInProgress,
        lastUpdatedAt: now,
        emptyNote: 'Nenhuma ação operacional em andamento.',
      }),
    },
    {
      key: 'pendingApprovals',
      label: DIGEST_LABELS.pendingApprovals,
      value: pendingApprovals.length,
      items: pendingApprovals.slice(0, 8).map((a) => ({ id: a.protocol, title: a.title, detail: a.actionType })),
      source: sourceForCount({
        key: 'approvals',
        label: 'Aprovações',
        origin: 'FOGO / ações estratégicas',
        count: pendingApprovals.length,
        lastUpdatedAt: maxIso(actions.map((a) => a.updatedAt)) ?? now,
        emptyNote: 'Nenhuma aprovação pendente no catálogo estratégico.',
      }),
    },
  ]

  const limitations = [
    weather.warningsSource.status === 'unavailable'
      ? 'Avisos oficiais do INMET não puderam ser consultados.'
      : null,
    weather.forecastSource.status === 'unavailable'
      ? 'Previsão Open-Meteo indisponível.'
      : 'A previsão Open-Meteo é modelo numérico, não aviso oficial.',
    'Não há integração de feed externo de trânsito (CET/Waze). O indicador usa apenas registros FOGO.',
    overdueAlerts.length ? `${overdueAlerts.length} alerta(s) com prazo vencido — validade operacional comprometida.` : null,
  ].filter((x): x is string => !!x)

  return {
    generatedAt: now,
    city: { name: geo.cityName, lat: geo.lat, lng: geo.lng },
    digest,
    changesSinceLastBriefing,
    lastBriefingAt: lastBriefing?.generatedAt ?? null,
    indicators,
    weatherForecast: weather.forecast,
    weatherForecastSource: weather.forecastSource,
    weatherWarnings: weather.warnings,
    weatherWarningsSource: weather.warningsSource,
    trafficExternalSource: {
      key: 'traffic-external',
      label: 'Feed externo de trânsito',
      status: 'unavailable',
      origin: 'não integrada',
      lastUpdatedAt: null,
      note: 'Nenhuma integração de trânsito externo configurada. Não simular incidentes.',
    },
    limitations,
  }
}
