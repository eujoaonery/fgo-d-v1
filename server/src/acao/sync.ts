import { createHash } from 'node:crypto'
import type { FogoDb } from '../db.js'
import { listRecommendations } from '../alpha/recommendations.js'
import { listPredictions, type PredictionRecord } from '../predictive/engine.js'
import { loadLatestBriefing } from '../strategy/store.js'
import {
  inferAcaoPriorityFromText,
  isAcaoPriority,
  type AcaoPriority,
} from '../../../src/lib/acao.js'
import { type AcaoDraft, upsertAcaoDrafts } from './store.js'

function hashText(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 16)
}

function clip(value: string | null | undefined, max = 500): string | null {
  if (!value) return null
  const t = value.trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function predictivePriority(p: PredictionRecord): AcaoPriority {
  const fromText = inferAcaoPriorityFromText(`${p.recommendation ?? ''} ${p.explanation ?? ''}`)
  const prob = p.probability ?? 0
  let fromProb: AcaoPriority = 'media'
  if (prob >= 0.75) fromProb = 'critica'
  else if (prob >= 0.55 || p.predictionType === 'incident_spike') fromProb = 'alta'
  const rank = { critica: 0, alta: 1, media: 2, baixa: 3 }
  return rank[fromText] <= rank[fromProb] ? fromText : fromProb
}

function joinDetail(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((p) => (p ?? '').trim()).filter(Boolean).join('\n')
  return clip(text, 800)
}

export function draftsFromIntelligence(input: {
  alpha: Array<{
    id: string
    situation: string
    actionText: string
    justification?: string
    expectedBenefit?: string
    priority: string
    region?: string
  }>
  predictions: PredictionRecord[]
  preventive: string[]
  resources: string[]
}): AcaoDraft[] {
  const drafts: AcaoDraft[] = []

  for (const rec of input.alpha) {
    const actionText = rec.actionText.trim()
    if (!actionText) continue
    drafts.push({
      source: 'alpha',
      sourceId: rec.id,
      title: rec.situation.trim() || 'Recomendação operacional',
      actionText,
      detail: joinDetail([rec.justification, rec.expectedBenefit]),
      priority: isAcaoPriority(rec.priority) ? rec.priority : inferAcaoPriorityFromText(actionText),
      region: rec.region ?? null,
      originLabel: 'Prometheus Alpha',
    })
  }

  for (const p of input.predictions) {
    if (p.decisionStatus !== 'pending') continue
    const actionText = (p.recommendation ?? '').trim()
    if (!actionText) continue
    drafts.push({
      source: 'preditivo',
      sourceId: p.id,
      title: p.targetLabel.trim() || 'Indicação preditiva',
      actionText,
      detail: joinDetail([p.explanation]),
      priority: predictivePriority(p),
      region: p.region ?? null,
      originLabel: 'Inteligência preditiva',
    })
  }

  for (const text of input.preventive) {
    const actionText = text.trim()
    if (!actionText) continue
    drafts.push({
      source: 'estrategico',
      sourceId: `prev:${hashText(actionText)}`,
      title: 'Recomendação preventiva',
      actionText,
      detail: null,
      priority: inferAcaoPriorityFromText(actionText),
      region: null,
      originLabel: 'Painel estratégico',
    })
  }

  for (const text of input.resources) {
    const raw = text.trim()
    if (!raw) continue
    const actionText = /^refor/i.test(raw) ? raw : `Reforçar: ${raw}`
    drafts.push({
      source: 'estrategico',
      sourceId: `rec:${hashText(raw)}`,
      title: 'Reforço de recursos',
      actionText,
      detail: null,
      priority: inferAcaoPriorityFromText(actionText),
      region: null,
      originLabel: 'Painel estratégico',
    })
  }

  return drafts
}

export async function syncAcoesFromIntelligence(db: FogoDb): Promise<number> {
  const [alpha, predictions, briefing] = await Promise.all([
    listRecommendations(db, 'pending'),
    listPredictions(db, 80),
    loadLatestBriefing(db),
  ])
  const drafts = draftsFromIntelligence({
    alpha,
    predictions,
    preventive: briefing?.briefing.preventiveRecommendations ?? [],
    resources: briefing?.briefing.resourcesNeedingReinforcement ?? [],
  })
  await upsertAcaoDrafts(db, drafts)
  return drafts.length
}
