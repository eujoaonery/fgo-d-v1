import { isAlertOverdue } from '../alertSla.js'
import {
  CAPABILITY_LABELS,
  capabilityForAlertCategory,
  teamCanHandle,
} from '../teamCapabilities.js'
import type { Incident, OperationalAlert, OperationalTeam, TeamCapability } from '../types.js'
import {
  CRISIS_LEVEL_RANK,
  IDLE_CRISIS,
  UNATTENDED_CRITICAL_MS,
  type CrisisAssignment,
  type CrisisLevel,
  type CrisisSnapshot,
  type CrisisState,
  type UnsolvedReason,
} from './types.js'

const OPEN_ALERT: ReadonlySet<string> = new Set(['novo', 'reconhecido', 'em atendimento', 'em observação'])
const CLOSED_INCIDENT: ReadonlySet<string> = new Set(['resolvida', 'cancelada'])

export function isAlertOpen(alert: OperationalAlert): boolean {
  return OPEN_ALERT.has(alert.state)
}

export function solutionForAlert(alert: OperationalAlert): string {
  const cap = capabilityForAlertCategory(alert.category)
  const loc = alert.region ? ` em ${alert.region}` : ''
  const asset = alert.relatedAssetId ? ` no ativo ${alert.relatedAssetId}` : ''
  const byCap: Record<TeamCapability, string> = {
    cameras: `Isolar o ponto cego${loc}: reinício do encoder/PoE${asset}, conferência de foco e religação do stream no CCO.`,
    semaforos: `Colocar o cruzamento${loc} em amarelo intermitente, montar desvio tático e substituir o controlador ou a lâmpada em falha.`,
    sensores: `Confirmar a leitura de campo${loc}${asset}, isolar o trecho se houver risco à via e calibrar/substituir a sonda.`,
    conectividade: `Reestabelecer o enlace${loc}${asset}: restart do rádio/AP, troca de canal e teste de heartbeat até o ativo voltar a reportar.`,
    infra: `Inspecionar o painel ou totem${loc}${asset}, religar a fonte e publicar mensagem de desvio se o equipamento permanecer mudo.`,
    transito: `Reforçar o setor${loc} com agente de via, redistribuir o fluxo e acompanhar o corredor até o evento cair.`,
    manutencao: `Abrir corretiva imediata${asset}${loc}, usar peça sobressalente do almoxarifado e só encerrar após teste de operação.`,
  }
  return byCap[cap]
}

export function unsolvedReasonLabel(reason: UnsolvedReason): string {
  switch (reason) {
    case 'sem_cobertura':
      return 'Nenhuma equipe cadastrada com a competência exigida'
    case 'sem_unidade_livre':
      return 'Equipes qualificadas ocupadas ou indisponíveis'
    case 'critico_sem_atendimento':
      return 'Alerta grave sem ocorrência nem equipe acionada'
    case 'prazo_estourado':
      return 'Prazo de resposta (SLA) estourado'
    case 'escalonado':
      return 'Alerta já escalonado sem resolução'
  }
}

export function classifyUnsolved(
  alert: OperationalAlert,
  teams: OperationalTeam[],
  incidents: Incident[],
  now = Date.now(),
): UnsolvedReason | null {
  if (!isAlertOpen(alert)) return null

  const required = capabilityForAlertCategory(alert.category)
  const incident = alert.incidentId ? incidents.find((i) => i.id === alert.incidentId) : undefined
  const assigned =
    incident && !CLOSED_INCIDENT.has(incident.status) ? incident.assignedTeamId : undefined
  if (assigned) return null

  const qualified = teams.filter((t) => teamCanHandle(t.capabilities, required))
  if (qualified.length === 0) return 'sem_cobertura'

  const free = qualified.filter((t) => t.status === 'disponível')
  if (free.length === 0) return 'sem_unidade_livre'

  if ((alert.escalationLevel ?? 0) >= 1) return 'escalonado'
  if (isAlertOverdue(alert.responseDueAt, alert.state)) return 'prazo_estourado'

  const age = now - new Date(alert.detectedAt).getTime()
  const grave = alert.severity === 'crítica' || alert.severity === 'alta'
  if (grave && alert.state === 'novo' && !incident && age >= UNATTENDED_CRITICAL_MS) {
    return 'critico_sem_atendimento'
  }

  return null
}

export function classifyCrisisLevel(snapshot: CrisisSnapshot): CrisisLevel | null {
  const { unsolvedAlerts, criticalUnsolved, highUnsolved, regionsAffected, openAlerts, availableTeams } =
    snapshot
  if (unsolvedAlerts <= 0) return null

  if (
    unsolvedAlerts >= 10 ||
    (criticalUnsolved >= 3 && regionsAffected >= 3) ||
    (openAlerts >= 14 && availableTeams <= 2)
  ) {
    return 'A'
  }
  if (unsolvedAlerts >= 6 || (highUnsolved + criticalUnsolved >= 4 && regionsAffected >= 2)) {
    return 'B'
  }
  if (unsolvedAlerts >= 3 || criticalUnsolved + highUnsolved >= 2) {
    return 'C'
  }
  return null
}

export function buildSnapshot(
  alerts: OperationalAlert[],
  teams: OperationalTeam[],
  incidents: Incident[],
  now = Date.now(),
): { snapshot: CrisisSnapshot; unsolved: { alert: OperationalAlert; reason: UnsolvedReason }[] } {
  const open = alerts.filter(isAlertOpen)
  const resolved = alerts.filter((a) => a.state === 'resolvido')
  const unsolved: { alert: OperationalAlert; reason: UnsolvedReason }[] = []
  for (const alert of open) {
    const reason = classifyUnsolved(alert, teams, incidents, now)
    if (reason) unsolved.push({ alert, reason })
  }
  const regions = new Set(unsolved.map((u) => u.alert.region).filter(Boolean))
  return {
    unsolved,
    snapshot: {
      openAlerts: open.length,
      resolvedAlerts: resolved.length,
      unsolvedAlerts: unsolved.length,
      criticalUnsolved: unsolved.filter((u) => u.alert.severity === 'crítica').length,
      highUnsolved: unsolved.filter((u) => u.alert.severity === 'alta').length,
      availableTeams: teams.filter((t) => t.status === 'disponível').length,
      regionsAffected: regions.size,
    },
  }
}

export function crisisReasons(level: CrisisLevel, snapshot: CrisisSnapshot): string[] {
  const reasons = [
    `${snapshot.unsolvedAlerts} alerta(s) sem solução operacional imediata`,
    `${snapshot.availableTeams} unidade(s) disponível(is) para despacho`,
  ]
  if (snapshot.criticalUnsolved) {
    reasons.push(`${snapshot.criticalUnsolved} alerta(s) crítico(s) sem equipe`)
  }
  if (snapshot.highUnsolved) {
    reasons.push(`${snapshot.highUnsolved} alerta(s) de alta sem atendimento`)
  }
  if (snapshot.regionsAffected) {
    reasons.push(`${snapshot.regionsAffected} região(ões) sob pressão`)
  }
  if (level === 'A') reasons.unshift('Esgotamento da capacidade de resposta na cidade')
  if (level === 'B') reasons.unshift('Crise setorial simultânea em mais de um recorte da malha')
  if (level === 'C') reasons.unshift('Foco local sem equipe qualificada livre')
  return reasons
}

export function mergeDeclaredCrisis(prev: CrisisState, nextLevel: CrisisLevel, snapshot: CrisisSnapshot): CrisisState {
  const prevRank = prev.level ? CRISIS_LEVEL_RANK[prev.level] : 0
  const nextRank = CRISIS_LEVEL_RANK[nextLevel]
  const escalating = nextRank > prevRank
  const fresh = prev.status === 'idle' || prev.status === 'recovered' || !prev.level
  if (!fresh && !escalating) {
    return {
      ...prev,
      snapshot,
      reasons: crisisReasons(prev.level ?? nextLevel, snapshot),
    }
  }
  return {
    ...prev,
    level: nextLevel,
    status: prev.status === 'super_intel' || prev.status === 'plan_active' ? prev.status : 'declared',
    declaredAt: fresh ? new Date().toISOString() : prev.declaredAt ?? new Date().toISOString(),
    acknowledgedAt: escalating ? undefined : prev.acknowledgedAt,
    popupLevel: nextLevel,
    reasons: crisisReasons(nextLevel, snapshot),
    snapshot,
    recoveredAt: undefined,
    recoveredMessage: undefined,
  }
}

export function scoreTeam(
  team: OperationalTeam,
  required: TeamCapability,
  region: string | undefined,
  reserved: Set<string>,
): number {
  if (reserved.has(team.id)) return -1
  if (!teamCanHandle(team.capabilities, required)) return -1
  if (team.status === 'indisponível') return -1
  let score = 100
  if (region && team.region === region) score += 40
  if (team.status === 'disponível') score += 30
  else if (team.status === 'em campo') score += 8
  if (!team.assignedIncidentId) score += 12
  return score
}

export function pickTeamForAlert(
  alert: OperationalAlert,
  teams: OperationalTeam[],
  reserved: Set<string>,
): OperationalTeam | null {
  const required = capabilityForAlertCategory(alert.category)
  let best: OperationalTeam | null = null
  let bestScore = 0
  for (const team of teams) {
    const score = scoreTeam(team, required, alert.region, reserved)
    if (score > bestScore) {
      best = team
      bestScore = score
    }
  }
  return best
}

export function assignmentsFromUnsolved(
  unsolved: { alert: OperationalAlert; reason: UnsolvedReason }[],
  teams: OperationalTeam[],
  existing: CrisisAssignment[],
): CrisisAssignment[] {
  const kept = existing.filter((a) => a.status === 'normalized' || a.status === 'normalizing' || a.status === 'dispatched')
  const keptIds = new Set(kept.map((a) => a.alertProtocol))
  const reserved = new Set(kept.map((a) => a.teamId).filter((id): id is string => !!id))
  const next = [...kept]

  for (const { alert, reason } of unsolved) {
    if (keptIds.has(alert.id)) continue
    const prior = existing.find((a) => a.alertProtocol === alert.id)
    if (prior && (prior.status === 'pending' || prior.status === 'dispatched' || prior.status === 'normalizing')) {
      next.push(prior)
      if (prior.teamId) reserved.add(prior.teamId)
      keptIds.add(alert.id)
      continue
    }
    const team = pickTeamForAlert(alert, teams, reserved)
    if (team) reserved.add(team.id)
    next.push({
      alertProtocol: alert.id,
      alertTitle: alert.title,
      category: alert.category,
      severity: alert.severity,
      region: alert.region ?? '—',
      capability: capabilityForAlertCategory(alert.category),
      reason,
      solution: solutionForAlert(alert),
      teamId: team?.id,
      teamName: team?.name,
      incidentId: alert.incidentId ?? prior?.incidentId,
      status: 'pending',
    })
    keptIds.add(alert.id)
  }

  for (const prior of existing) {
    if (keptIds.has(prior.alertProtocol)) continue
    if (prior.status !== 'pending') continue
    next.push(prior)
    if (prior.teamId) reserved.add(prior.teamId)
    keptIds.add(prior.alertProtocol)
  }

  return next.map((item) => {
    if (item.status !== 'pending' || item.teamId) return item
    const stub = unsolved.find((u) => u.alert.id === item.alertProtocol)?.alert
    if (!stub) return item
    const team = pickTeamForAlert(stub, teams, reserved)
    if (!team) return item
    reserved.add(team.id)
    return { ...item, teamId: team.id, teamName: team.name }
  })
}

export function capabilityLabel(cap: TeamCapability): string {
  return CAPABILITY_LABELS[cap]
}

export function parseCrisisState(raw: unknown): CrisisState {
  if (!raw || typeof raw !== 'object') return { ...IDLE_CRISIS }
  const o = raw as Partial<CrisisState>
  const level = o.level === 'A' || o.level === 'B' || o.level === 'C' ? o.level : null
  const status: CrisisState['status'] =
    o.status === 'declared' ||
    o.status === 'plan_active' ||
    o.status === 'super_intel' ||
    o.status === 'recovered'
      ? o.status
      : 'idle'
  return {
    ...IDLE_CRISIS,
    ...o,
    level,
    status,
    reasons: Array.isArray(o.reasons) ? o.reasons.map(String) : [],
    snapshot: { ...IDLE_CRISIS.snapshot, ...(o.snapshot ?? {}) },
    assignments: Array.isArray(o.assignments) ? o.assignments : [],
    unitsConvened: !!o.unitsConvened,
    superIntelActive: !!o.superIntelActive,
  }
}
