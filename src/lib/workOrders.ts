import type { Incident, IncidentStatus, MaintenanceOrder, OsCloseImage } from '@/types'

export const OS_STATUSES: IncidentStatus[] = [
  'aberta',
  'triagem',
  'planejada',
  'agendada',
  'em deslocamento',
  'em atendimento',
  'aguardando material',
  'resolvida',
  'cancelada',
]

export const OS_WORKFLOW_STATUSES: IncidentStatus[] = [
  'aberta',
  'triagem',
  'planejada',
  'agendada',
  'em deslocamento',
  'em atendimento',
  'aguardando material',
]

export const OS_MAINT_TYPES = ['preventiva', 'corretiva', 'inspeção'] as const
export type OsMaintType = (typeof OS_MAINT_TYPES)[number]

export const OS_CATEGORIES = [
  'Semáforos',
  'Câmeras',
  'Sensores',
  'Conectividade',
  'Painéis',
  'Trânsito',
  ...OS_MAINT_TYPES,
] as const

export function isMaintenanceOsType(type: string | undefined | null): boolean {
  const t = (type ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return t === 'preventiva' || t === 'corretiva' || t === 'inspecao' || t === 'manutencao'
}

export const OS_REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste'] as const

export function isOsClosed(status: IncidentStatus): boolean {
  return status === 'resolvida' || status === 'cancelada'
}

export function isOsOpen(status: IncidentStatus): boolean {
  return !isOsClosed(status)
}

export function isOsInProgress(status: IncidentStatus): boolean {
  return status === 'em deslocamento' || status === 'em atendimento' || status === 'aguardando material'
}

export function parseCloseImages(raw: unknown): OsCloseImage[] {
  if (!Array.isArray(raw)) return []
  const out: OsCloseImage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const fileName = typeof r.fileName === 'string' ? r.fileName.slice(0, 160) : ''
    const contentType = typeof r.contentType === 'string' ? r.contentType : 'image/jpeg'
    const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : ''
    if (!fileName || !dataUrl.startsWith('data:image/') || dataUrl.length > 2_000_000) continue
    out.push({ fileName, contentType, dataUrl })
    if (out.length >= 6) break
  }
  return out
}

export function isOsUnscheduled(os: Incident): boolean {
  return os.status === 'aberta' && !os.scheduledStart
}

export function osTitle(os: Incident): string {
  const subject = os.subjectLabel?.trim()
  if (subject) return subject
  const custom = os.workOrderDescription?.trim()
  return custom || os.description
}

export function osOccurrenceSummary(os: Incident): string {
  const parts = [os.description]
  if (os.notes?.trim() && os.notes.trim() !== os.description.trim()) parts.push(os.notes.trim())
  return parts.join('\n')
}

export function priorityStripe(priority: Incident['priority']): string {
  switch (priority) {
    case 'crítica':
      return '#dc2626'
    case 'alta':
      return '#ea580c'
    case 'média':
      return '#ca8a04'
    default:
      return '#7c3aed'
  }
}

export function agendaHours(): number[] {
  return Array.from({ length: 15 }, (_, i) => i + 6)
}

export function startOfDayIso(day: Date): string {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString()
}

export function atHourOnDay(day: Date, hour: number): string {
  const d = new Date(day)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function sameDay(iso: string, day: Date): boolean {
  const a = new Date(iso)
  return a.getFullYear() === day.getFullYear() && a.getMonth() === day.getMonth() && a.getDate() === day.getDate()
}

export function formatHourRange(startIso: string, endIso?: string): string {
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : new Date(start.getTime() + 3600_000)
  const fmt = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt(start)} - ${fmt(end)}`
}

export function datetimeLocalValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function maintenanceStatusToOs(status: MaintenanceOrder['status']): IncidentStatus {
  switch (status) {
    case 'em execução':
      return 'em atendimento'
    case 'concluída':
      return 'resolvida'
    default:
      return 'aberta'
  }
}

export function maintenanceToIncident(order: MaintenanceOrder, region = 'Centro'): Incident {
  const dueAt = order.dueDate
    ? order.dueDate.length <= 10
      ? `${order.dueDate}T12:00:00.000Z`
      : order.dueDate
    : undefined
  const description = order.description?.trim() || `${order.type} — ${order.assetName}`
  return {
    id: order.id,
    description,
    workOrderDescription: description,
    type: order.type,
    region,
    priority: order.priority,
    status: maintenanceStatusToOs(order.status),
    openedAt: order.openedAt ?? dueAt ?? new Date().toISOString(),
    dueAt,
    assignee: order.assignee,
    relatedAssetId: order.assetId || undefined,
    location: order.assetName,
    requiredCapability: 'manutencao',
    sourceAlertId: order.sourceAlertId,
    dataOrigin: 'manual',
  }
}
