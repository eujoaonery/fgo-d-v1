export type TeamCapability =
  | 'semaforos'
  | 'cameras'
  | 'sensores'
  | 'conectividade'
  | 'infra'
  | 'transito'
  | 'manutencao'

export const ALL_TEAM_CAPABILITIES: TeamCapability[] = [
  'semaforos',
  'cameras',
  'sensores',
  'conectividade',
  'infra',
  'transito',
  'manutencao',
]

export const CAPABILITY_LABELS: Record<TeamCapability, string> = {
  semaforos: 'Semáforos e sinalização',
  cameras: 'Câmeras e videomonitoramento',
  sensores: 'Sensores ambientais',
  conectividade: 'Redes e conectividade',
  infra: 'Painéis e infraestrutura urbana',
  transito: 'Trânsito e vias',
  manutencao: 'Manutenção corretiva',
}

export function teamCanHandle(capabilities: TeamCapability[], required: TeamCapability): boolean {
  return capabilities.includes(required)
}

export function capabilityLabel(cap: TeamCapability): string {
  return CAPABILITY_LABELS[cap] ?? cap
}

export const AGENT_ROLE_OPTIONS = [
  'Agente de trânsito',
  'Guarda de trânsito',
  'Guarda municipal',
  'Policial militar',
  'Outro profissional operacional',
] as const

export function agentRoleOptions(current?: string): string[] {
  const value = current?.trim()
  if (value && !AGENT_ROLE_OPTIONS.includes(value as (typeof AGENT_ROLE_OPTIONS)[number])) {
    return [value, ...AGENT_ROLE_OPTIONS]
  }
  return [...AGENT_ROLE_OPTIONS]
}

const INCIDENT_TYPE_MAP: Record<string, TeamCapability> = {
  Semáforos: 'semaforos',
  Câmeras: 'cameras',
  Sensores: 'sensores',
  Conectividade: 'conectividade',
  Painéis: 'infra',
  Trânsito: 'transito',
  Manutenção: 'manutencao',
  preventiva: 'manutencao',
  corretiva: 'manutencao',
  inspeção: 'manutencao',
}

export function capabilityForIncidentType(type: string): TeamCapability {
  return INCIDENT_TYPE_MAP[type] ?? 'manutencao'
}
