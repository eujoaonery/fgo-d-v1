import { categoryDefFor } from './assetCatalog'

export const DEGRADATION_LEVELS = ['nenhuma', 'baixa', 'media', 'alta', 'critica'] as const
export type DegradationLevel = (typeof DEGRADATION_LEVELS)[number]

export const PREVENTIVE_CYCLE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 365] as const
export const USEFUL_LIFE_MONTH_PRESETS = [24, 36, 48, 60, 84, 96, 120] as const

const VEHICLE_SLUGS = new Set(['onibus', 'viatura', 'moto-agente', 'fiscalizacao-autonoma', 'patinete'])
const TRAFFIC_SLUGS = new Set(['semaforo', 'radar', 'cancela', 'painel'])

export const DEGRADATION_LABEL: Record<DegradationLevel, string> = {
  nenhuma: 'Nenhuma',
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
}

export type AssetLifecycleInput = {
  id: string
  name: string
  category: string
  region?: string
  installedAt?: string
  acquiredAt?: string
  maintenanceIntervalDays?: number
  maintenanceNextDue?: string
  maintenanceLastDone?: string
  usefulLifeMonths?: number
  degradationLevel?: DegradationLevel
}

export type AssetLifecycleAssessment = {
  assetId: string
  name: string
  category: string
  region?: string
  vehicle: boolean
  traffic: boolean
  hasPlan: boolean
  dueOn: string | null
  overdueDays: number | null
  daysUntilDue: number | null
  usefulLifeEnd: string | null
  usefulLifeConsumedPct: number | null
  remainingLifeDays: number | null
  informedDegradation: DegradationLevel | null
  derivedDegradation: DegradationLevel
  degradation: DegradationLevel
  unavailabilityRisk: number
  accidentRisk: number
  impact: string
  narrative: string
  actionText: string
}

export function isDegradationLevel(v: unknown): v is DegradationLevel {
  return typeof v === 'string' && (DEGRADATION_LEVELS as readonly string[]).includes(v)
}

export function isVehicleAsset(category: string): boolean {
  const slug = categoryDefFor(category)?.slug
  return !!slug && VEHICLE_SLUGS.has(slug)
}

export function isTrafficAsset(category: string): boolean {
  const slug = categoryDefFor(category)?.slug
  return !!slug && TRAFFIC_SLUGS.has(slug)
}

export function preventiveLabels(category: string) {
  if (isVehicleAsset(category)) {
    return {
      plan: 'Plano de revisão preventiva',
      cycle: 'Ciclo de revisão',
      last: 'Última revisão',
      next: 'Próxima revisão',
      overdue: 'atraso na revisão preventiva',
      usefulLife: 'Vida útil do veículo',
    }
  }
  return {
    plan: 'Plano de manutenção preventiva',
    cycle: 'Ciclo de preventiva',
    last: 'Última manutenção preventiva',
    next: 'Próxima preventiva',
    overdue: 'atraso na manutenção preventiva',
    usefulLife: 'Vida útil do equipamento',
  }
}

export function todayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toYmd(value: string | undefined | null): string | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1 + months, d ?? 1))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

export function daysBetweenYmd(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00.000Z`)
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00.000Z`)
  return Math.round((b - a) / 86_400_000)
}

export function resolvePreventiveDue(asset: AssetLifecycleInput): string | null {
  const explicit = toYmd(asset.maintenanceNextDue)
  if (explicit) return explicit
  const last = toYmd(asset.maintenanceLastDone)
  const interval = asset.maintenanceIntervalDays
  if (last && interval != null && Number.isFinite(interval) && interval > 0) {
    return addDaysYmd(last, Math.floor(interval))
  }
  return null
}

export function hasLifecycleData(asset: AssetLifecycleInput): boolean {
  return (
    resolvePreventiveDue(asset) != null ||
    (asset.usefulLifeMonths != null && asset.usefulLifeMonths > 0) ||
    isDegradationLevel(asset.degradationLevel)
  )
}

function rank(level: DegradationLevel): number {
  return { nenhuma: 0, baixa: 1, media: 2, alta: 3, critica: 4 }[level]
}

function maxLevel(a: DegradationLevel, b: DegradationLevel): DegradationLevel {
  return rank(a) >= rank(b) ? a : b
}

function derivedFromOverdue(days: number): DegradationLevel {
  if (days >= 60) return 'critica'
  if (days >= 30) return 'alta'
  if (days >= 15) return 'media'
  if (days >= 1) return 'baixa'
  return 'nenhuma'
}

function derivedFromLife(consumedPct: number): DegradationLevel {
  if (consumedPct >= 0.95) return 'critica'
  if (consumedPct >= 0.8) return 'alta'
  if (consumedPct >= 0.6) return 'media'
  if (consumedPct >= 0.4) return 'baixa'
  return 'nenhuma'
}

function riskBases(category: string): { unavail: number; accident: number; impact: string } {
  const slug = categoryDefFor(category)?.slug ?? ''
  if (slug === 'semaforo') {
    return {
      unavail: 0.22,
      accident: 0.18,
      impact: 'transtorno no trânsito viário e risco de acidentes',
    }
  }
  if (slug === 'radar') {
    return {
      unavail: 0.16,
      accident: 0.14,
      impact: 'falha de fiscalização eletrônica e risco de acidentes',
    }
  }
  if (slug === 'cancela') {
    return {
      unavail: 0.18,
      accident: 0.1,
      impact: 'falha de controle de acesso e congestionamento no ponto',
    }
  }
  if (slug === 'painel') {
    return {
      unavail: 0.12,
      accident: 0.08,
      impact: 'falha de informação ao motorista no trânsito viário',
    }
  }
  if (slug === 'viatura' || slug === 'moto-agente') {
    return {
      unavail: 0.2,
      accident: 0.14,
      impact: 'indisponibilidade da viatura na operação de trânsito',
    }
  }
  if (slug === 'onibus') {
    return {
      unavail: 0.18,
      accident: 0.12,
      impact: 'falha de transporte coletivo e impacto na circulação',
    }
  }
  if (slug === 'fiscalizacao-autonoma') {
    return {
      unavail: 0.16,
      accident: 0.14,
      impact: 'interrupção da fiscalização móvel',
    }
  }
  if (slug === 'patinete') {
    return {
      unavail: 0.12,
      accident: 0.1,
      impact: 'risco ao usuário e recolhimento da frota',
    }
  }
  if (slug === 'camera') {
    return {
      unavail: 0.14,
      accident: 0.06,
      impact: 'perda de cobertura de monitoramento',
    }
  }
  return {
    unavail: 0.12,
    accident: 0.06,
    impact: 'indisponibilidade operacional do ativo',
  }
}

function pct(n: number): number {
  return Math.round(Math.min(0.95, Math.max(0, n)) * 100)
}

function degradBoost(level: DegradationLevel): number {
  return { nenhuma: 0, baixa: 0.05, media: 0.12, alta: 0.22, critica: 0.32 }[level]
}

export function assessAssetLifecycle(
  asset: AssetLifecycleInput,
  today = todayYmd(),
): AssetLifecycleAssessment | null {
  if (!hasLifecycleData(asset)) return null
  const labels = preventiveLabels(asset.category)
  const dueOn = resolvePreventiveDue(asset)
  const daysUntilDue = dueOn ? daysBetweenYmd(today, dueOn) : null
  const overdueDays = daysUntilDue != null && daysUntilDue < 0 ? Math.abs(daysUntilDue) : daysUntilDue != null ? 0 : null

  const start = toYmd(asset.installedAt) ?? toYmd(asset.acquiredAt)
  const months = asset.usefulLifeMonths
  const usefulLifeEnd =
    start && months != null && months > 0 ? addMonthsYmd(start, Math.floor(months)) : null
  const lifeSpanDays = start && usefulLifeEnd ? Math.max(1, daysBetweenYmd(start, usefulLifeEnd)) : null
  const remainingLifeDays = usefulLifeEnd ? daysBetweenYmd(today, usefulLifeEnd) : null
  const usefulLifeConsumedPct =
    start && lifeSpanDays != null ? Math.min(1.2, Math.max(0, daysBetweenYmd(start, today) / lifeSpanDays)) : null

  let derived: DegradationLevel = 'nenhuma'
  if (overdueDays != null) derived = maxLevel(derived, derivedFromOverdue(overdueDays))
  if (usefulLifeConsumedPct != null) derived = maxLevel(derived, derivedFromLife(usefulLifeConsumedPct))
  const informed = isDegradationLevel(asset.degradationLevel) ? asset.degradationLevel : null
  const degradation = informed ?? derived

  const bases = riskBases(asset.category)
  const overdueFactor = overdueDays != null ? Math.min(1, overdueDays / 90) : 0
  const lifeFactor = usefulLifeConsumedPct != null ? Math.min(1, usefulLifeConsumedPct) : 0
  const boost = degradBoost(degradation)
  const unavailabilityRisk = Math.min(0.92, bases.unavail + overdueFactor * 0.45 + lifeFactor * 0.2 + boost)
  const accidentRisk = Math.min(0.88, bases.accident + overdueFactor * 0.38 + lifeFactor * 0.12 + boost * 0.8)

  const unavailPct = pct(unavailabilityRisk)
  const accidentPct = pct(accidentRisk)
  const extreme = (overdueDays ?? 0) >= 60 || unavailPct >= 50
  const impactTone = extreme ? `extremo ${bases.impact}` : bases.impact

  let narrative: string
  if (overdueDays != null && overdueDays > 0) {
    narrative = `${asset.category} ${asset.id} com ${overdueDays} dia(s) de ${labels.overdue}. Risco de indisponibilidade ${unavailPct}%, causando ${impactTone}. Risco de acidentes ${accidentPct}%.`
  } else if (daysUntilDue != null && daysUntilDue <= 7) {
    narrative = `${asset.category} ${asset.id} com preventiva em ${daysUntilDue} dia(s) (${dueOn}). Risco de indisponibilidade ${unavailPct}% e risco de acidentes ${accidentPct}% se o ciclo não for cumprido.`
  } else if (remainingLifeDays != null && remainingLifeDays <= 0) {
    narrative = `${asset.category} ${asset.id} ultrapassou a vida útil cadastrada (fim em ${usefulLifeEnd}). Risco de indisponibilidade ${unavailPct}% e risco de acidentes ${accidentPct}%.`
  } else if (remainingLifeDays != null && remainingLifeDays <= 180) {
    narrative = `${asset.category} ${asset.id} está a ${remainingLifeDays} dia(s) do fim da vida útil cadastrada. Risco de indisponibilidade ${unavailPct}% e risco de acidentes ${accidentPct}%.`
  } else {
    narrative = `${asset.category} ${asset.id}: degradação ${DEGRADATION_LABEL[degradation].toLowerCase()}. Risco de indisponibilidade ${unavailPct}% e risco de acidentes ${accidentPct}%.`
  }

  const actionText =
    overdueDays != null && overdueDays > 0
      ? `Executar a ${labels.last.toLowerCase()} de ${asset.name} (${asset.id}) agora. O atraso de ${overdueDays} dia(s) eleva o risco de indisponibilidade a ${unavailPct}% e o risco de acidentes a ${accidentPct}%.`
      : remainingLifeDays != null && remainingLifeDays <= 0
        ? `Avaliar substituição ou revisão profunda de ${asset.name} (${asset.id}): a vida útil cadastrada já venceu.`
        : `Cumprir o ciclo cadastrado de ${asset.name} (${asset.id}) até ${dueOn ?? usefulLifeEnd ?? 'a data planejada'}.`

  return {
    assetId: asset.id,
    name: asset.name,
    category: asset.category,
    region: asset.region,
    vehicle: isVehicleAsset(asset.category),
    traffic: isTrafficAsset(asset.category),
    hasPlan: dueOn != null,
    dueOn,
    overdueDays,
    daysUntilDue,
    usefulLifeEnd,
    usefulLifeConsumedPct,
    remainingLifeDays,
    informedDegradation: informed,
    derivedDegradation: derived,
    degradation,
    unavailabilityRisk,
    accidentRisk,
    impact: impactTone,
    narrative,
    actionText,
  }
}

export function assessAssetsLifecycle(
  assets: AssetLifecycleInput[],
  today = todayYmd(),
): AssetLifecycleAssessment[] {
  return assets
    .map((a) => assessAssetLifecycle(a, today))
    .filter((a): a is AssetLifecycleAssessment => a != null)
    .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1) || b.unavailabilityRisk - a.unavailabilityRisk)
}

export function lifecyclePriority(a: AssetLifecycleAssessment): 'baixa' | 'media' | 'alta' | 'critica' {
  if ((a.overdueDays ?? 0) >= 60 || a.accidentRisk >= 0.45 || a.unavailabilityRisk >= 0.55 || a.degradation === 'critica') {
    return 'critica'
  }
  if ((a.overdueDays ?? 0) >= 30 || a.unavailabilityRisk >= 0.4 || a.degradation === 'alta') return 'alta'
  if ((a.overdueDays ?? 0) > 0 || (a.daysUntilDue != null && a.daysUntilDue <= 7) || (a.remainingLifeDays != null && a.remainingLifeDays <= 180)) {
    return 'media'
  }
  return 'baixa'
}
