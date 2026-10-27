import type { PrometheusBriefing, PrometheusRisk, StrategySnapshot } from '../../../src/lib/strategy.js'

const CERTAINTY_RE =
  /\b(com certeza|certeza absoluta|ocorrer[aá] com certeza|é certo que|garantido que|inevit[aá]vel|100\s?%)\b/i
const ID_RE = /\b(?:OS|ALT|ALR|AE|MAN|PRV|EVT)-[A-Z0-9-]+\b/gi

export type PrometheusContext = {
  snapshot: StrategySnapshot
  knownIds: string[]
  knownRegions: string[]
  predictionProbabilities: number[]
}

export function collectKnownIds(snapshot: StrategySnapshot): string[] {
  const ids = new Set<string>()
  for (const ind of snapshot.indicators) {
    for (const item of ind.items ?? []) ids.add(item.id)
  }
  for (const w of snapshot.weatherWarnings) ids.add(w.id)
  return [...ids]
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
}

function clip(s: string, max = 1200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function parseRisk(raw: unknown, issues: string[], idx: number): PrometheusRisk | null {
  if (!raw || typeof raw !== 'object') {
    issues.push(`Risco ${idx + 1} inválido.`)
    return null
  }
  const o = raw as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const justification = typeof o.justification === 'string' ? o.justification.trim() : ''
  const horizon = typeof o.horizon === 'string' ? o.horizon.trim() : ''
  if (!title || !justification || !horizon) {
    issues.push(`Risco ${idx + 1} sem título, justificativa ou horizonte.`)
    return null
  }
  let confidence: number | null = null
  if (o.confidence != null && o.confidence !== '') {
    const n = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence)
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      issues.push(`Confiança do risco “${title}” ignorada — valor não técnico.`)
    } else {
      confidence = n
    }
  }
  return { title: clip(title, 180), justification: clip(justification), horizon: clip(horizon, 120), confidence }
}

function textMentionsKnownData(text: string, ctx: PrometheusContext): boolean {
  const ids = text.match(ID_RE) ?? []
  if (ids.some((id) => ctx.knownIds.includes(id))) return true
  const lower = text.toLowerCase()
  if (ctx.knownRegions.some((r) => r && lower.includes(r.toLowerCase()))) return true
  const digest = ctx.snapshot.digest
  if (digest.activeAlerts && /alerta/.test(lower)) return true
  if (digest.openWorkOrders && /(ordem|os\b|ocorr)/.test(lower)) return true
  if (digest.weatherWarnings && /(inmet|aviso|chuva|vento)/.test(lower)) return true
  if (digest.predictiveRisks && /preditiv/.test(lower)) return true
  if (digest.assetsUnavailable && /ativo/.test(lower)) return true
  if (ctx.snapshot.limitations.some((l) => lower.includes(l.slice(0, 18).toLowerCase()))) return true
  return /fonte|dado|indispon|aus[eê]ncia|n[aã]o h[aá]/.test(lower)
}

export function validatePrometheusBriefing(
  raw: unknown,
  ctx: PrometheusContext,
): { briefing: PrometheusBriefing | null; issues: string[] } {
  const issues: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { briefing: null, issues: ['Resposta da IA não é um objeto JSON.'] }
  }
  const o = raw as Record<string, unknown>
  const executiveSummary = typeof o.executiveSummary === 'string' ? o.executiveSummary.trim() : ''
  if (!executiveSummary) issues.push('Resumo executivo ausente.')

  const risksIn = Array.isArray(o.risks) ? o.risks : []
  const risks = risksIn.map((r, i) => parseRisk(r, issues, i)).filter((r): r is PrometheusRisk => !!r)

  const corpus = [
    executiveSummary,
    ...risks.map((r) => `${r.title} ${r.justification} ${r.horizon}`),
    ...asStringArray(o.preventiveRecommendations),
    ...asStringArray(o.resourcesNeedingReinforcement),
  ].join('\n')

  if (CERTAINTY_RE.test(corpus)) {
    issues.push('Linguagem de certeza indevida removida do uso operacional — a IA não pode declarar evento como certo.')
  }

  const invented = [...new Set(corpus.match(ID_RE) ?? [])].filter((id) => !ctx.knownIds.includes(id))
  if (invented.length) {
    issues.push(`Identificadores não presentes no contexto foram ignorados: ${invented.join(', ')}.`)
  }

  const keptRisks = risks.filter((r) => {
    if (CERTAINTY_RE.test(`${r.title} ${r.justification}`)) return false
    const ids = r.justification.match(ID_RE) ?? []
    if (ids.some((id) => !ctx.knownIds.includes(id))) return false
    if (!textMentionsKnownData(`${r.title} ${r.justification}`, ctx)) {
      issues.push(`Risco “${r.title}” sem vínculo com os dados fornecidos — omitido.`)
      return false
    }
    if (r.confidence != null) {
      const supported = ctx.predictionProbabilities.some((p) => Math.abs(p - r.confidence!) <= 0.15)
      if (!supported) {
        issues.push(`Confiança do risco “${r.title}” omitida — não há probabilidade de modelo correspondente.`)
        r.confidence = null
      }
    }
    return true
  })

  const recommendations = asStringArray(o.preventiveRecommendations).filter((line) => {
    if (CERTAINTY_RE.test(line)) return false
    const ids = line.match(ID_RE) ?? []
    if (ids.some((id) => !ctx.knownIds.includes(id))) return false
    return textMentionsKnownData(line, ctx)
  })

  const resources = asStringArray(o.resourcesNeedingReinforcement).filter((line) => !CERTAINTY_RE.test(line))
  const missing = asStringArray(o.missingOrInconsistentData)

  if (!executiveSummary && !keptRisks.length) {
    return { briefing: null, issues: issues.length ? issues : ['Briefing vazio após validação.'] }
  }

  return {
    briefing: {
      executiveSummary: clip(executiveSummary.replace(CERTAINTY_RE, 'com base nos dados atuais')),
      risks: keptRisks,
      preventiveRecommendations: recommendations.map((s) => clip(s, 400)),
      resourcesNeedingReinforcement: resources.map((s) => clip(s, 240)),
      missingOrInconsistentData: missing.length ? missing.map((s) => clip(s, 240)) : ctx.snapshot.limitations,
    },
    issues,
  }
}
