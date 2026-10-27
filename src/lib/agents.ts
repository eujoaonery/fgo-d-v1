import type { AgentFunctionalStatus, AgentOperationalStatus, AgentShift, Team } from '@/types'

export const AGENT_OPERATIONAL_STATUSES: AgentOperationalStatus[] = [
  'disponível',
  'em campo',
  'em atividade',
  'fora de escala',
  'pausa',
  'encerrado o turno',
  'indisponível',
]

export const AGENT_FUNCTIONAL_STATUSES: AgentFunctionalStatus[] = ['ativo', 'afastado', 'desligado', 'ferias']

export const AGENT_FUNCTIONAL_LABELS: Record<AgentFunctionalStatus, string> = {
  ativo: 'Ativo',
  afastado: 'Afastado',
  desligado: 'Desligado',
  ferias: 'Férias',
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

export function normalizeAgentOperationalStatus(raw?: string | null): AgentOperationalStatus {
  if (raw && (AGENT_OPERATIONAL_STATUSES as string[]).includes(raw)) return raw as AgentOperationalStatus
  return 'disponível'
}

export function normalizeAgentFunctionalStatus(raw?: string | null): AgentFunctionalStatus {
  if (raw && (AGENT_FUNCTIONAL_STATUSES as string[]).includes(raw)) return raw as AgentFunctionalStatus
  return 'ativo'
}

export function isAgentBusy(status: AgentOperationalStatus): boolean {
  return status === 'em campo' || status === 'em atividade'
}

export function isAgentFunctionallyActive(status: AgentFunctionalStatus): boolean {
  return status === 'ativo'
}

export function canDispatchAgent(agent: Pick<Team, 'status' | 'functionalStatus' | 'assignedIncidentId'>, incidentId?: string): boolean {
  if (!isAgentFunctionallyActive(agent.functionalStatus ?? 'ativo')) return false
  if (agent.status === 'indisponível' || agent.status === 'fora de escala' || agent.status === 'pausa' || agent.status === 'encerrado o turno') {
    return false
  }
  if (isAgentBusy(agent.status) && agent.assignedIncidentId && agent.assignedIncidentId !== incidentId) {
    return false
  }
  return agent.status === 'disponível' || (isAgentBusy(agent.status) && agent.assignedIncidentId === incidentId)
}

export function parseShifts(raw: unknown): AgentShift[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const weekday = Number(r.weekday)
      const start = typeof r.start === 'string' ? r.start : ''
      const end = typeof r.end === 'string' ? r.end : ''
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !start || !end) return null
      return { weekday, start, end } satisfies AgentShift
    })
    .filter((s): s is AgentShift => s != null)
}

export function parseStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
  if (typeof raw === 'string') {
    return raw
      .split(/[,|;]/)
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}
