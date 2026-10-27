import type { TeamCapability } from '../teamCapabilities.js'
import type { AlertSeverity } from '../types.js'

export type CrisisLevel = 'A' | 'B' | 'C'
export type CrisisStatus = 'idle' | 'declared' | 'plan_active' | 'super_intel' | 'recovered'
export type CrisisAssignmentStatus = 'pending' | 'dispatched' | 'normalizing' | 'normalized'

export type UnsolvedReason =
  | 'sem_cobertura'
  | 'sem_unidade_livre'
  | 'critico_sem_atendimento'
  | 'prazo_estourado'
  | 'escalonado'

export interface CrisisAssignment {
  alertProtocol: string
  alertTitle: string
  category: string
  severity: AlertSeverity
  region: string
  capability: TeamCapability
  reason: UnsolvedReason
  solution: string
  teamId?: string
  teamName?: string
  incidentId?: string
  status: CrisisAssignmentStatus
  dispatchedAt?: string
  normalizingAt?: string
  normalizedAt?: string
}

export interface CrisisSnapshot {
  openAlerts: number
  resolvedAlerts: number
  unsolvedAlerts: number
  criticalUnsolved: number
  highUnsolved: number
  availableTeams: number
  regionsAffected: number
}

export interface CrisisState {
  level: CrisisLevel | null
  status: CrisisStatus
  declaredAt?: string
  acknowledgedAt?: string
  popupLevel?: CrisisLevel | null
  reasons: string[]
  snapshot: CrisisSnapshot
  unitsConvened: boolean
  convenedAt?: string
  superIntelActive: boolean
  superIntelStartedAt?: string
  assignments: CrisisAssignment[]
  recoveredAt?: string
  recoveredMessage?: string
}

export const EMPTY_CRISIS_SNAPSHOT: CrisisSnapshot = {
  openAlerts: 0,
  resolvedAlerts: 0,
  unsolvedAlerts: 0,
  criticalUnsolved: 0,
  highUnsolved: 0,
  availableTeams: 0,
  regionsAffected: 0,
}

export const IDLE_CRISIS: CrisisState = {
  level: null,
  status: 'idle',
  reasons: [],
  snapshot: EMPTY_CRISIS_SNAPSHOT,
  unitsConvened: false,
  superIntelActive: false,
  assignments: [],
}

export const CRISIS_LEVEL_RANK: Record<CrisisLevel, number> = { C: 1, B: 2, A: 3 }

export const UNATTENDED_CRITICAL_MS = 45_000
export const DISPATCH_HOLD_MS = 2_400
export const NORMALIZE_HOLD_MS = 3_200
