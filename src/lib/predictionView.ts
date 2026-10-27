import type { PredictionRecord } from '@/lib/api'
import { formatWhenSpokenPtBr } from '@/lib/format'

/** Volume de OS ou tickets. Pico, contexto e situação de ativo continuam na aba Previsões. */
export function isOsTicketPrediction(p: Pick<PredictionRecord, 'predictionType' | 'inputSummary'>): boolean {
  if (p.predictionType === 'demand_forecast') return true
  const summary = p.inputSummary ?? {}
  if ('orderIds' in summary) return true
  const rule = String(summary.ruleKey ?? '')
  return rule.startsWith('demand:') || rule.startsWith('maintenance_due:')
}

export function isPredictionActive(p: PredictionRecord, now = Date.now()) {
  if (isOsTicketPrediction(p)) return false
  if (p.reviewStatus !== 'pending') return false
  if (p.decisionStatus === 'rejected' || p.decisionStatus === 'irrelevant') return false
  if (p.periodEnd) {
    const end = Date.parse(p.periodEnd)
    if (Number.isFinite(end) && end < now) return false
  }
  return true
}

export function predictionTypeLabel(type: PredictionRecord['predictionType'], ruleKey?: string) {
  if (ruleKey?.startsWith('bairro_risk:')) return 'Risco de bairro'
  if (ruleKey?.startsWith('staff_gap:')) return 'Efetivo'
  if (ruleKey?.startsWith('use_trend:')) return 'Utilização'
  switch (type) {
    case 'region_risk':
      return 'Risco de região'
    case 'incident_spike':
      return 'Pico de ocorrências'
    case 'maintenance_due':
      return 'Manutenção'
    case 'demand_forecast':
      return 'Demanda'
    default:
      return type
  }
}

export function predictionRiskLabel(probability?: number) {
  if (probability == null) return 'sem score'
  if (probability >= 0.75) return 'alto'
  if (probability >= 0.45) return 'médio'
  return 'baixo'
}

export function predictionPeriodLabel(p: PredictionRecord) {
  const start = p.periodStart || p.calculatedAt
  const end =
    p.periodEnd ||
    (start
      ? new Date(new Date(start).getTime() + p.horizonHours * 3_600_000).toISOString()
      : '')
  const startLabel = formatWhenSpokenPtBr(start).replace(', início às ', ', ')
  const endLabel = formatWhenSpokenPtBr(end).replace(', início às ', ', ')
  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`
  if (startLabel) return startLabel
  return 'Período não informado'
}

function summaryOf(p: PredictionRecord) {
  return p.inputSummary ?? {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function placeOf(p: PredictionRecord) {
  return p.region?.trim() || 'a cidade'
}

function assetNameOf(p: PredictionRecord) {
  const fromLabel = p.targetLabel.split('—')[0]?.trim()
  return fromLabel || p.assetExternalId || 'o equipamento'
}

const CATEGORY_PT: Record<string, string> = {
  corretiva: 'manutenção corretiva',
  preventiva: 'manutenção preventiva',
}

function categoryOf(summary: Record<string, unknown>) {
  const raw = typeof summary.category === 'string' ? summary.category.trim() : ''
  if (!raw) return ''
  return CATEGORY_PT[raw.toLowerCase()] ?? raw
}

function isRainRelated(p: PredictionRecord) {
  const summary = summaryOf(p)
  const rain = asNumber(summary.rainProbability)
  const weatherNote = typeof summary.weatherNote === 'string' ? summary.weatherNote : ''
  return (
    Boolean(summary.rainStart) ||
    (rain != null && rain >= 50) ||
    /chuva|precip/i.test(weatherNote)
  )
}

function rainWhenOf(p: PredictionRecord) {
  const summary = summaryOf(p)
  const rainStart = typeof summary.rainStart === 'string' ? summary.rainStart : ''
  return formatWhenSpokenPtBr(rainStart || p.periodStart || p.calculatedAt)
}

function rainCause(p: PredictionRecord) {
  const when = rainWhenOf(p)
  return when ? `Devido à chuva prevista para ${when}` : 'Devido à chuva prevista'
}

/** Frase curta da fila: causa → efeito. Sem números, método nem jargão. */
export function predictionHeadline(p: PredictionRecord): string {
  const place = placeOf(p)
  const summary = summaryOf(p)
  const rule = String(summary.ruleKey ?? '')
  const rain = asNumber(summary.rainProbability)
  const weatherNote = typeof summary.weatherNote === 'string' ? summary.weatherNote : ''

  if (summary.kind === 'urban_context' || rule.startsWith('context:')) {
    if (rain != null && rain >= 50) {
      return `${rainCause(p)}, há risco de alagamento e via lenta em ${place}.`
    }
    return `Devido ao padrão deste horário, ${place} tende a ter mais ocorrências de via.`
  }

  if (rule.startsWith('bairro_risk:')) {
    const neighborhood = typeof summary.neighborhood === 'string' ? summary.neighborhood : place
    return `Devido ao aumento de alertas nas últimas 24 h, ${neighborhood} pode ter um pico nas próximas horas.`
  }

  if (rule.startsWith('staff_gap:')) {
    const gap = asNumber(summary.gap) ?? p.predictedValue
    return `Faltam ${gap ?? ''} agentes em ${place} para a fila atual.`
  }

  if (rule.startsWith('use_trend:')) {
    const direction = summary.direction === 'subiu' ? 'subiu' : 'caiu'
    return `O uso de ${assetNameOf(p)} ${direction} em relação à semana anterior.`
  }

  if (rule.startsWith('alert_spike:')) {
    return place === 'a cidade'
      ? 'Devido ao aumento de alertas nas últimas 24 h, a cidade pode ter um pico nas próximas horas.'
      : `Devido ao aumento de alertas nas últimas 24 h, ${place} pode ter um pico nas próximas horas.`
  }

  if (rule.startsWith('alert_risk:') || p.predictionType === 'region_risk') {
    return `Devido aos alertas abertos acima das outras regiões, ${place} pode ficar sobrecarregada.`
  }

  if (p.predictionType === 'incident_spike') {
    return place === 'a cidade'
      ? 'Devido ao aumento de alertas nas últimas 24 h, a cidade pode ter um pico nas próximas horas.'
      : `Devido ao aumento de alertas nas últimas 24 h, ${place} pode ter um pico nas próximas horas.`
  }

  if (p.predictionType === 'demand_forecast') {
    const where = [p.region, categoryOf(summary)].filter(Boolean).join(' · ') || 'a cidade'
    if (/chuva|precip/i.test(weatherNote) || summary.rainStart) {
      return `${rainCause(p)}, a demanda de via em ${where} deve subir.`
    }
    return `Devido ao histórico do período, a demanda em ${where} deve ficar acima do usual.`
  }

  if (rule.startsWith('useful_life_ended:')) {
    return `Devido ao fim da vida útil, ${assetNameOf(p)} precisa de revisão.`
  }

  if (rule.startsWith('preventive_overdue:')) {
    return `Devido ao atraso na preventiva, ${assetNameOf(p)} pode ficar indisponível.`
  }

  if (p.predictionType === 'maintenance_due') {
    return 'Devido ao vencimento próximo, há risco de atraso nas manutenções.'
  }

  const first = (p.explanation ?? '').split(/(?<=[.!?])\s+/)[0]?.trim()
  if (first && first.length <= 160) return first
  if (first) return `${first.slice(0, 157)}…`
  return p.targetLabel
}

/** Recomendação só se for ação operacional — esconde o aviso técnico do motor. */
export function predictionAction(p: PredictionRecord): string | undefined {
  const text = p.recommendation?.trim()
  if (!text) return undefined
  if (/não despacha|não abre alerta|não abre os|apoio de planejamento|apoio de plantão/i.test(text)) {
    return undefined
  }
  return text
}

export type PredictionFact = { label: string; value: string }

const EVIDENCE_LABELS: Record<string, string> = {
  count24h: 'Alertas nas últimas 24 h',
  baselineDaily: 'Média diária (7 dias)',
  windowDays: 'Janela (dias)',
  openIncidents: 'OS abertas na região',
  openAlerts: 'Alertas abertos na região',
  medianPeer: 'Mediana das outras regiões',
  rainProbability: 'Chance de chuva',
  weekdayLabel: 'Dia da semana',
  hourBucket: 'Faixa de horário',
  sameSlotCount: 'Ocorrências neste horário (histórico)',
  sampleDays: 'Datas observadas',
  recent72h: 'Ocorrências nas últimas 72 h',
  overdueDays: 'Dias de atraso',
  unavailabilityRisk: 'Risco de indisponibilidade',
  accidentRisk: 'Risco de acidente',
  remainingLifeDays: 'Dias além da vida útil',
  category: 'Categoria',
  weatherNote: 'Clima',
  rainStart: 'Chuva prevista',
  cityObservations: 'Observações da cidade',
  overdue: 'Já vencidas',
  neighborhood: 'Bairro',
  demand: 'Fila (OS e alertas altos)',
  supply: 'Agentes disponíveis',
  gap: 'Agentes que faltam',
  rate7: 'Uso recente (por dia)',
  ratePrev: 'Uso da semana anterior (por dia)',
  direction: 'Tendência de uso',
}

function formatFactValue(key: string, value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : null
  if (typeof value === 'object') return null
  if (key === 'rainStart') {
    return formatWhenSpokenPtBr(String(value)) || String(value)
  }
  if (key === 'rainProbability' || key === 'unavailabilityRisk' || key === 'accidentRisk') {
    const n = asNumber(value)
    if (n == null) return String(value)
    return n <= 1 ? `${Math.round(n * 100)}%` : `${Math.round(n)}%`
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1)
  return String(value)
}

/** Fatos técnicos organizados — sem JSON cru nem texto corrido. */
export function predictionFacts(p: PredictionRecord): PredictionFact[] {
  const facts: PredictionFact[] = [
    { label: 'Onde', value: p.region?.trim() || 'Cidade inteira' },
    { label: 'Quando', value: predictionPeriodLabel(p) },
    ...(isRainRelated(p) && rainWhenOf(p)
      ? [{ label: 'Chuva prevista', value: rainWhenOf(p) }]
      : []),
    { label: 'Tipo', value: predictionTypeLabel(p.predictionType, String(summaryOf(p).ruleKey ?? '')) },
    { label: 'Risco', value: predictionRiskLabel(p.probability) },
  ]
  if (p.predictedValue != null) facts.push({ label: 'Valor previsto', value: String(p.predictedValue) })
  if (p.baselineValue != null) facts.push({ label: 'Referência', value: String(p.baselineValue) })
  if (p.observationCount != null) facts.push({ label: 'Observações usadas', value: String(p.observationCount) })
  const skip = new Set([
    'ruleKey',
    'limitations',
    'qualityRules',
    'kind',
    'sliceKey',
    'bucket',
    'method',
    'experimental',
    'weekday',
    'peerSlots',
    'caveat',
    'degradation',
    'orderIds',
    'rainStart',
  ])
  for (const [key, value] of Object.entries(summaryOf(p))) {
    if (skip.has(key)) continue
    const label = EVIDENCE_LABELS[key]
    if (!label) continue
    const formatted = formatFactValue(key, value)
    if (!formatted) continue
    facts.push({ label, value: formatted })
  }
  return facts
}
