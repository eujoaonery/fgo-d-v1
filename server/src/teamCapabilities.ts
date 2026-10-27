/** Competências operacionais — equipe precisa possuir a chave para atender a ocorrência. */
export type TeamCapability =
  | 'semaforos'
  | 'cameras'
  | 'sensores'
  | 'conectividade'
  | 'infra'
  | 'transito'
  | 'manutencao'

export const CAPABILITY_LABELS: Record<TeamCapability, string> = {
  semaforos: 'Semáforos e sinalização',
  cameras: 'Câmeras e videomonitoramento',
  sensores: 'Sensores ambientais',
  conectividade: 'Redes e conectividade',
  infra: 'Painéis e infraestrutura urbana',
  transito: 'Trânsito e vias',
  manutencao: 'Manutenção corretiva',
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

const ALERT_CATEGORY_MAP: Record<string, TeamCapability> = {
  Comunicação: 'conectividade',
  CFTV: 'cameras',
  Tráfego: 'semaforos',
  Trânsito: 'transito',
  'Guarda municipal': 'transito',
  Polícia: 'transito',
  Ambiental: 'sensores',
  Conectividade: 'conectividade',
  Operação: 'transito',
  Manutenção: 'manutencao',
  Integração: 'conectividade',
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function capabilityForIncidentType(type: string): TeamCapability {
  return INCIDENT_TYPE_MAP[type] ?? capabilityFromLabel(type) ?? 'manutencao'
}

export function capabilityForAlertCategory(category: string): TeamCapability {
  return ALERT_CATEGORY_MAP[category] ?? capabilityFromLabel(category) ?? 'manutencao'
}

function capabilityFromLabel(label: string): TeamCapability | null {
  const c = fold(label)
  if (c.includes('cftv') || c.includes('camera') || c.includes('video')) return 'cameras'
  if (c.includes('semaforo') || c.includes('trafego') || c.includes('sinaliz')) return 'semaforos'
  if (c.includes('sensor') || c.includes('ambiental') || c.includes('alag')) return 'sensores'
  if (c.includes('wifi') || c.includes('wi-fi') || c.includes('conect') || c.includes('comunica') || c.includes('integra')) {
    return 'conectividade'
  }
  if (c.includes('painel') || c.includes('paineis') || c.includes('infra')) return 'infra'
  if (c.includes('policia') || c.includes('policial') || c.includes('guarda municipal') || c.includes('guarda de transito')) {
    return 'transito'
  }
  if (c.includes('transito') || c.includes('radar') || c.includes('via') || c.includes('operacao') || c.includes('preditiv')) {
    return 'transito'
  }
  if (c.includes('manut')) return 'manutencao'
  return null
}

export function parseCapabilities(raw: unknown): TeamCapability[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set(Object.keys(CAPABILITY_LABELS))
  return raw.filter((c): c is TeamCapability => typeof c === 'string' && allowed.has(c))
}

export function teamCanHandle(capabilities: TeamCapability[], required: TeamCapability): boolean {
  return capabilities.includes(required)
}
