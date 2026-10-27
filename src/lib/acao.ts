export const ACAO_SOURCES = ['alpha', 'preditivo', 'estrategico'] as const
export type AcaoSource = (typeof ACAO_SOURCES)[number]

export const ACAO_PRIORITIES = ['baixa', 'media', 'alta', 'critica'] as const
export type AcaoPriority = (typeof ACAO_PRIORITIES)[number]

export const ACAO_STATUSES = ['analisar', 'delegada', 'tomada', 'ignorada'] as const
export type AcaoStatus = (typeof ACAO_STATUSES)[number]

export const ACAO_STATUS_LABEL: Record<AcaoStatus, string> = {
  analisar: 'Em análise',
  delegada: 'Delegada',
  tomada: 'Ação tomada',
  ignorada: 'Ignorada',
}

export const ACAO_PRIORITY_LABEL: Record<AcaoPriority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

export const ACAO_SOURCE_LABEL: Record<AcaoSource, string> = {
  alpha: 'Prometheus Alpha',
  preditivo: 'Inteligência preditiva',
  estrategico: 'Painel estratégico',
}

export type AcaoRecord = {
  id: string
  source: AcaoSource
  sourceId: string
  title: string
  actionText: string
  detail: string | null
  priority: AcaoPriority
  region: string | null
  originLabel: string
  status: AcaoStatus
  takenAction: string | null
  delegatedToName: string | null
  delegatedToUserId: string | null
  ignoredReason: string | null
  decidedAt: string | null
  decidedBy: string | null
  createdAt: string
  updatedAt: string
}

export function isAcaoStatus(v: unknown): v is AcaoStatus {
  return typeof v === 'string' && (ACAO_STATUSES as readonly string[]).includes(v)
}

export function isAcaoPriority(v: unknown): v is AcaoPriority {
  return typeof v === 'string' && (ACAO_PRIORITIES as readonly string[]).includes(v)
}

export function isAcaoSource(v: unknown): v is AcaoSource {
  return typeof v === 'string' && (ACAO_SOURCES as readonly string[]).includes(v)
}

export function isAcaoOpen(status: AcaoStatus): boolean {
  return status === 'analisar' || status === 'delegada'
}

export function acaoPriorityRank(priority: AcaoPriority): number {
  if (priority === 'critica') return 0
  if (priority === 'alta') return 1
  if (priority === 'media') return 2
  return 3
}

export function inferAcaoPriorityFromText(text: string): AcaoPriority {
  const t = text.toLowerCase()
  if (/cr[ií]tic|tempestad|defesa civil|evacu|colapso|extremo|60\s*dia/.test(t)) return 'critica'
  if (/chuva|interdi|80\s*km|urgente|alto risco|bloqueio|atraso na (manuten|revis)|risco de acidentes/.test(t)) return 'alta'
  if (/\bbaixa\b|monitorar|acompanhar/.test(t)) return 'baixa'
  return 'media'
}
