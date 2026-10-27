import type { AgentFunctionalStatus, AgentOperationalStatus, Incident, IncidentStatus, OperationalAlert } from '../types'
import { canDispatchAgent, isAgentBusy, isAgentFunctionallyActive } from './agents'
import { isOsInProgress, isOsOpen, OS_REGIONS } from './workOrders'
import { operatorAlertKpis } from './operatorAlertStats'
import { formatDurationMs } from './format'
import type { AlphaClaim, AlphaRecommendationDraft, AlphaChartSeries } from './prometheusAlpha'

export type FieldAgentLite = {
  id: string
  name: string
  region: string
  status: AgentOperationalStatus
  functionalStatus?: AgentFunctionalStatus
  assignedIncidentId?: string
}

export type FieldIncidentLite = {
  id: string
  region: string
  status: IncidentStatus
  assignedTeamId?: string
  openedAt: string
  resolvedAt?: string
}

export type SlaAlertLite = {
  protocol: string
  claimedBy?: string
  claimedByLabel?: string
  state: string
  firstResponseOverdue: boolean
  assumeAt?: string
  assumeMs: number | null
  dispatchMs: number | null
  completeMs: number | null
  slaPercent: number
  region?: string
}

export type OperatorMemberLite = {
  userId: string
  displayName: string
  role: string
}

export type FieldCapacitySnapshot = {
  active: number
  dispatchable: number
  busy: number
  available: number
  offShift: number
  openOs: number
  unassignedOpen: number
  inProgress: number
  resolved7d: number
  utilizationPct: number | null
  verdict: 'dando_conta' | 'sobrecarga' | 'sem_amostra'
  verdictText: string
  slackText: string | null
  sectorHint: string | null
  byRegion: { region: string; agents: number; dispatchable: number; openOs: number; unassigned: number }[]
  byStatus: { status: string; count: number }[]
}

export type OperatorSlaSnapshot = {
  operators: number
  onFloor: number
  occupied: number
  freeOnFloor: number
  openAlerts: number
  overdueOpen: number
  assumed: number
  solved: number
  onTimeFirstResponse: number
  overdueFirstResponse: number
  compliancePct: number | null
  avgAssumeMs: number | null
  avgDispatchMs: number | null
  avgCompleteMs: number | null
  perOperator: {
    userId: string
    displayName: string
    role: string
    onFloor: boolean
    occupied: boolean
    assumed: number
    solved: number
    overdueClaimed: number
  }[]
  verdictText: string
}

const CCO_FLOOR_ROLES = new Set(['operator', 'admin', 'manager'])
const GENERATOR = 'alpha-ops-intel'

function chart(
  id: string,
  title: string,
  description: string,
  unit: string,
  observed: boolean,
  points: AlphaChartSeries['points'],
  generatedAt: string,
): AlphaChartSeries {
  return { id, title, description, unit, observed, points, source: 'FOGO', updatedAt: generatedAt }
}

function claim(partial: AlphaClaim): AlphaClaim {
  return partial
}

function rec(partial: Omit<AlphaRecommendationDraft, 'generator'>): AlphaRecommendationDraft {
  return { ...partial, generator: GENERATOR }
}

export function fieldCapacitySnapshot(
  agents: FieldAgentLite[],
  incidents: FieldIncidentLite[],
  today: string,
): FieldCapacitySnapshot {
  const from7 = daysAgo(today, 6)
  const active = agents.filter((a) => isAgentFunctionallyActive(a.functionalStatus ?? 'ativo'))
  const dispatchable = active.filter((a) => canDispatchAgent(a))
  const busy = active.filter((a) => isAgentBusy(a.status))
  const available = active.filter((a) => a.status === 'disponível' && canDispatchAgent(a))
  const offShift = agents.filter((a) => {
    const fn = a.functionalStatus ?? 'ativo'
    return !isAgentFunctionallyActive(fn) || a.status === 'fora de escala' || a.status === 'encerrado o turno' || a.status === 'indisponível' || a.status === 'pausa'
  })
  const open = incidents.filter((i) => isOsOpen(i.status))
  const unassignedOpen = open.filter((i) => !i.assignedTeamId)
  const inProgress = open.filter((i) => isOsInProgress(i.status))
  const resolved7d = incidents.filter((i) => i.status === 'resolvida' && (i.resolvedAt ?? '').slice(0, 10) >= from7)
  const denom = busy.length + available.length
  const utilizationPct = denom ? Math.round((busy.length / denom) * 1000) / 10 : null

  const byRegion = OS_REGIONS.map((region) => {
    const regionAgents = active.filter((a) => a.region === region)
    return {
      region,
      agents: regionAgents.length,
      dispatchable: regionAgents.filter((a) => canDispatchAgent(a)).length,
      openOs: open.filter((i) => i.region === region).length,
      unassigned: open.filter((i) => i.region === region && !i.assignedTeamId).length,
    }
  })

  const statusOrder: AgentOperationalStatus[] = [
    'disponível',
    'em campo',
    'em atividade',
    'pausa',
    'fora de escala',
    'encerrado o turno',
    'indisponível',
  ]
  const byStatus = statusOrder.map((status) => ({
    status,
    count: agents.filter((a) => a.status === status).length,
  }))

  let verdict: FieldCapacitySnapshot['verdict'] = 'sem_amostra'
  let verdictText = 'Não há agentes cadastrados nesta seleção para avaliar a capacidade de campo.'
  if (agents.length === 0) {
    verdict = 'sem_amostra'
  } else if (unassignedOpen.length > dispatchable.length) {
    verdict = 'sobrecarga'
    verdictText = `Os agentes atuais não cobrem a fila agora: ${unassignedOpen.length} OS aberta(s) sem agente e ${dispatchable.length} agente(s) despachável(is).`
  } else if (dispatchable.length === 0 && open.length > 0) {
    verdict = 'sobrecarga'
    verdictText = `Há ${open.length} OS aberta(s) e nenhum agente despachável neste recorte.`
  } else if (utilizationPct != null && utilizationPct >= 90 && unassignedOpen.length > 0) {
    verdict = 'sobrecarga'
    verdictText = `Utilização de ${utilizationPct}% com ${unassignedOpen.length} OS ainda sem agente — a escala atual está no limite.`
  } else {
    verdict = 'dando_conta'
    verdictText =
      unassignedOpen.length === 0
        ? `Os agentes atuais dão conta neste recorte: ${dispatchable.length} despachável(is), ${busy.length} em campo/atividade, nenhuma OS aberta sem agente.`
        : `Os agentes atuais cobrem a fila neste recorte: ${unassignedOpen.length} OS sem agente e ${dispatchable.length} despachável(is).`
  }

  const slackRegions = byRegion.filter((r) => r.agents > 0 && r.unassigned === 0)
  const tightRegion = [...byRegion]
    .filter((r) => r.unassigned > r.dispatchable)
    .sort((a, b) => b.unassigned - a.unassigned)[0]
  let slackText: string | null = null
  if (verdict === 'dando_conta') {
    const slackNames = slackRegions.map((r) => r.region)
    if (available.length > 0) {
      slackText = slackNames.length
        ? `Há folga na escala: ${available.length} agente(s) disponível(is). Setores com pouco serviço agora: ${slackNames.join(', ')}.`
        : `Há folga na escala: ${available.length} agente(s) disponível(is) além da fila atual.`
    } else if (utilizationPct != null && utilizationPct < 55) {
      slackText = `Utilização de ${utilizationPct}% — a escala cobre a fila com folga.`
    } else if (slackNames.length) {
      slackText = `Setores com pouco serviço agora: ${slackNames.join(', ')}.`
    }
  }
  const sectorHint =
    verdict === 'sobrecarga' && tightRegion
      ? `O setor mais apertado agora é ${tightRegion.region}.`
      : verdict === 'dando_conta'
        ? 'Nenhum setor pede contratação agora.'
        : null

  return {
    active: active.length,
    dispatchable: dispatchable.length,
    busy: busy.length,
    available: available.length,
    offShift: offShift.length,
    openOs: open.length,
    unassignedOpen: unassignedOpen.length,
    inProgress: inProgress.length,
    resolved7d: resolved7d.length,
    utilizationPct,
    verdict,
    verdictText,
    slackText,
    sectorHint,
    byRegion,
    byStatus,
  }
}

export function fieldCapacityPresentation(
  snap: FieldCapacitySnapshot,
  generatedAt: string,
  region?: string | null,
): { claims: AlphaClaim[]; recommendations: AlphaRecommendationDraft[]; charts: AlphaChartSeries[]; limitations: string[] } {
  const claims: AlphaClaim[] = [
    claim({
      kind: 'fact',
      title: 'Capacidade de agentes de campo',
      body: snap.verdictText,
      region: region ?? undefined,
      sourceKeys: ['teams', 'incidents'],
    }),
    claim({
      kind: 'fact',
      title: 'Escala agora',
      body: `${snap.active} agente(s) ativo(s) no cadastro. Despacháveis ${snap.dispatchable}; em campo/atividade ${snap.busy}; disponíveis ${snap.available}; fora da escala/pausa/afastados ${snap.offShift}. Utilização ${snap.utilizationPct ?? 'n/d'}%.`,
      sourceKeys: ['teams'],
    }),
    claim({
      kind: 'fact',
      title: 'Fila de OS',
      body: `${snap.openOs} OS aberta(s), ${snap.unassignedOpen} sem agente, ${snap.inProgress} em deslocamento/atendimento. ${snap.resolved7d} OS resolvida(s) nos últimos 7 dias.`,
      sourceKeys: ['incidents'],
    }),
  ]
  if (snap.slackText) {
    claims.push(
      claim({
        kind: 'fact',
        title: 'Folga na escala',
        body: snap.slackText,
        sourceKeys: ['teams', 'incidents'],
      }),
    )
  }
  const loaded = snap.byRegion.filter((r) => r.openOs || r.agents)
  if (loaded.length) {
    claims.push(
      claim({
        kind: 'fact',
        title: 'Cobertura por região',
        body: loaded.map((r) => `${r.region}: ${r.openOs} OS (${r.unassigned} sem agente) / ${r.dispatchable} despachável(is)`).join('; ') + '.',
        sourceKeys: ['teams', 'incidents'],
      }),
    )
  }
  const recs: AlphaRecommendationDraft[] = []
  if (snap.verdict === 'sobrecarga') {
    const tight = snap.byRegion.filter((r) => r.unassigned > r.dispatchable).sort((a, b) => b.unassigned - a.unassigned)[0]
    recs.push(
      rec({
        category: 'escala',
        priority: snap.unassignedOpen >= 5 || snap.dispatchable === 0 ? 'alta' : 'media',
        region: tight?.region ?? region ?? undefined,
        situation: snap.verdictText,
        evidence: [
          `OS sem agente: ${snap.unassignedOpen}`,
          `Despacháveis: ${snap.dispatchable}`,
          ...(tight ? [`${tight.region}: ${tight.unassigned} sem agente / ${tight.dispatchable} despacháveis`] : []),
        ],
        justification: 'Contagem observada de OS abertas versus agentes despacháveis. Não estima contratação futura.',
        actionText: tight
          ? `Reforçar a escala de campo em ${tight.region} ou redistribuir agentes de regiões com folga.`
          : 'Revisar a escala de campo: não há agente despachável suficiente para a fila aberta.',
        uncertainties: 'Parte da fila pode ser preventiva ou aguardar material, o que não exige agente imediato.',
      }),
    )
  }
  return {
    claims,
    recommendations: recs,
    charts: [
      chart(
        'agents-status',
        'Agentes por situação operacional',
        'Cadastro atual. Sem interpolação.',
        'agentes',
        true,
        snap.byStatus.map((s) => ({ label: s.status, value: s.count })),
        generatedAt,
      ),
      chart(
        'agents-os-region',
        'OS abertas por região',
        'Fila observada. Sem interpolação.',
        'OS',
        true,
        snap.byRegion.map((r) => ({ label: r.region, value: r.openOs })),
        generatedAt,
      ),
      chart(
        'agents-dispatch-region',
        'Agentes despacháveis por região',
        'Cadastro ativo e situação disponível.',
        'agentes',
        true,
        snap.byRegion.map((r) => ({ label: r.region, value: r.dispatchable })),
        generatedAt,
      ),
    ].filter((c) => c.points.some((p) => (p.value ?? 0) > 0)),
    limitations: [
      'Agente despachável = cadastro ativo e situação disponível (ou já nesta OS). Não usa GPS em tempo real.',
      'A avaliação é deste recorte; não projeta contratação nem ausência futura.',
    ],
  }
}

export function operatorSlaSnapshot(input: {
  members: OperatorMemberLite[]
  presenceUserIds: string[]
  alerts: OperationalAlert[]
  incidents: Incident[]
  slaRows: SlaAlertLite[]
  summary: {
    openAlerts: number
    overdueOpen: number
    avgAssumeMs: number | null
    avgDispatchMs: number | null
    avgCompleteMs: number | null
  }
}): OperatorSlaSnapshot {
  const presence = new Set(input.presenceUserIds)
  const floorMembers = input.members.filter(
    (m) => CCO_FLOOR_ROLES.has(m.role) || presence.has(m.userId),
  )
  const operators = floorMembers.length ? floorMembers : input.members.filter((m) => m.role === 'operator')
  const openByClaim = new Set(
    input.alerts.filter((a) => a.claimedBy && ['novo', 'reconhecido', 'em atendimento', 'em observação'].includes(a.state)).map((a) => a.claimedBy as string),
  )

  const perOperator = operators.map((m) => {
    const kpis = operatorAlertKpis(input.alerts, input.incidents, m.userId)
    const overdueClaimed = input.slaRows.filter((r) => r.claimedBy === m.userId && r.firstResponseOverdue).length
    return {
      userId: m.userId,
      displayName: m.displayName,
      role: m.role,
      onFloor: presence.has(m.userId),
      occupied: openByClaim.has(m.userId),
      assumed: kpis.assumed,
      solved: kpis.solved,
      overdueClaimed,
    }
  })

  const onTimeFirstResponse = input.slaRows.filter((r) => r.assumeAt && !r.firstResponseOverdue).length
  const overdueFirstResponse = input.slaRows.filter((r) => r.firstResponseOverdue).length
  const slaSample = onTimeFirstResponse + overdueFirstResponse
  const compliancePct = slaSample ? Math.round((onTimeFirstResponse / slaSample) * 1000) / 10 : null
  const assumedOpen = perOperator.reduce((n, o) => n + o.assumed, 0)
  const solved = perOperator.reduce((n, o) => n + o.solved, 0)
  const onFloor = perOperator.filter((o) => o.onFloor).length
  const occupied = perOperator.filter((o) => o.occupied).length

  let verdictText = 'Não há operadores CCO nesta cidade para medir expediente nem SLA.'
  if (operators.length) {
    const slaPart =
      compliancePct == null
        ? 'Ainda não há amostra de primeira resposta com relógio de SLA.'
        : `Cumprimento de SLA de primeira resposta: ${compliancePct}% (${onTimeFirstResponse} no prazo, ${overdueFirstResponse} excedido${overdueFirstResponse === 1 ? '' : 's'}).`
    const floorPart =
      onFloor === 0
        ? 'Nenhum operador com sessão ativa no CCO neste instante.'
        : `${onFloor} no expediente, ${occupied} ocupado(s) com alerta assumido.`
    const loadPart = `Tempo médio até assumir ${formatDurationMs(input.summary.avgAssumeMs)}; até acionar ${formatDurationMs(input.summary.avgDispatchMs)}; até concluir ${formatDurationMs(input.summary.avgCompleteMs)}.`
    verdictText = `${slaPart} ${floorPart} ${loadPart}`
  }

  return {
    operators: operators.length,
    onFloor,
    occupied,
    freeOnFloor: Math.max(0, onFloor - occupied),
    openAlerts: input.summary.openAlerts,
    overdueOpen: input.summary.overdueOpen,
    assumed: assumedOpen,
    solved,
    onTimeFirstResponse,
    overdueFirstResponse,
    compliancePct,
    avgAssumeMs: input.summary.avgAssumeMs,
    avgDispatchMs: input.summary.avgDispatchMs,
    avgCompleteMs: input.summary.avgCompleteMs,
    perOperator,
    verdictText,
  }
}

export function operatorSlaPresentation(
  snap: OperatorSlaSnapshot,
  generatedAt: string,
): { claims: AlphaClaim[]; recommendations: AlphaRecommendationDraft[]; charts: AlphaChartSeries[]; limitations: string[] } {
  const top = [...snap.perOperator].sort((a, b) => b.assumed + b.solved - (a.assumed + a.solved)).slice(0, 6)
  const claims: AlphaClaim[] = [
    claim({
      kind: 'fact',
      title: 'Cumprimento de SLA dos operadores',
      body: snap.verdictText,
      sourceKeys: ['alerts', 'operators'],
    }),
    claim({
      kind: 'fact',
      title: 'Expediente do CCO',
      body: `${snap.operators} operador(es) no recorte. No expediente agora: ${snap.onFloor}. Ocupados ${snap.occupied}; livres no expediente ${snap.freeOnFloor}. Alertas abertos ${snap.openAlerts}, dos quais ${snap.overdueOpen} com primeira resposta vencida.`,
      sourceKeys: ['operators', 'alerts'],
    }),
    claim({
      kind: 'fact',
      title: 'Eficiência da equipe',
      body: `Alertas assumidos em aberto: ${snap.assumed}. Alertas/OS concluídos por quem assumiu: ${snap.solved}. Médias — assumir ${formatDurationMs(snap.avgAssumeMs)}, acionar ${formatDurationMs(snap.avgDispatchMs)}, concluir ${formatDurationMs(snap.avgCompleteMs)}.`,
      sourceKeys: ['alerts', 'incidents'],
    }),
  ]
  if (top.length) {
    claims.push(
      claim({
        kind: 'fact',
        title: 'Por operador',
        body: top
          .map((o) => {
            const floor = o.onFloor ? (o.occupied ? 'ocupado' : 'no expediente') : 'fora da sessão'
            return `${o.displayName}: ${floor}, ${o.assumed} assumido(s), ${o.solved} solucionado(s), ${o.overdueClaimed} SLA excedido(s)`
          })
          .join('; ') + '.',
        sourceKeys: ['alerts', 'operators'],
      }),
    )
  }
  const recs: AlphaRecommendationDraft[] = []
  if (snap.overdueOpen > 0 || (snap.compliancePct != null && snap.compliancePct < 70 && snap.onTimeFirstResponse + snap.overdueFirstResponse >= 3)) {
    recs.push(
      rec({
        category: 'sla',
        priority: snap.overdueOpen >= 3 || (snap.compliancePct != null && snap.compliancePct < 50) ? 'alta' : 'media',
        situation:
          snap.overdueOpen > 0
            ? `${snap.overdueOpen} alerta(s) aberto(s) com primeira resposta fora do SLA.`
            : `Cumprimento de SLA de primeira resposta em ${snap.compliancePct}%.`,
        evidence: [
          `No prazo: ${snap.onTimeFirstResponse}`,
          `Excedidos: ${snap.overdueFirstResponse}`,
          `Abertos vencidos: ${snap.overdueOpen}`,
        ],
        justification: 'Relógio alerta → primeira resposta humana, conforme janela de SLA da categoria.',
        actionText: 'Revisar o plantão do CCO: quem está no expediente, fila de alertas sem dono e redistribuição dos vencidos.',
        uncertainties: 'Alertas resolvidos pelo sistema ou sem assumir humano não entram como cumprimento.',
      }),
    )
  }
  const named = snap.perOperator.filter((o) => o.assumed || o.solved || o.onFloor)
  return {
    claims,
    recommendations: recs,
    charts: [
      chart(
        'sla-compliance',
        'Primeira resposta no SLA',
        'No prazo versus excedido. Só alertas com relógio de SLA.',
        'alertas',
        true,
        [
          { label: 'No prazo', value: snap.onTimeFirstResponse },
          { label: 'Excedido', value: snap.overdueFirstResponse },
        ],
        generatedAt,
      ),
      chart(
        'operator-load',
        'Carga por operador',
        'Assumidos em aberto e solucionados (alerta resolvido ou OS finalizada).',
        'qtd',
        true,
        named.flatMap((o) => [
          { label: `${shortName(o.displayName)} assum.`, value: o.assumed },
          { label: `${shortName(o.displayName)} sol.`, value: o.solved },
        ]),
        generatedAt,
      ),
    ].filter((c) => c.points.some((p) => (p.value ?? 0) > 0)),
    limitations: [
      'SLA de operadores é o da primeira resposta ao alerta (assumir), não um índice composto inventado.',
      'Expediente “agora” depende de sessão aberta no CCO. Operador logado em outro sistema não aparece no plantão.',
      'Eficiência usa alertas assumidos e OS/alertas concluídos por esse operador — não mede qualidade do atendimento.',
    ],
  }
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length <= 2 ? name : `${parts[0]} ${parts[1][0]}.`
}

function daysAgo(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() - days)
  return dt.toISOString().slice(0, 10)
}
