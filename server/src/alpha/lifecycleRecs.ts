import type { AlphaClaim, AlphaRecommendationDraft } from '../../../src/lib/prometheusAlpha.js'
import {
  assessAssetsLifecycle,
  lifecyclePriority,
  type AssetLifecycleAssessment,
} from '../../../src/lib/assetLifecycle.js'
import type { UrbanAsset } from '../types.js'
import { ALPHA_MODEL_VERSION } from './forecast.js'

export function lifecycleAssessments(assets: UrbanAsset[], today: string): AssetLifecycleAssessment[] {
  return assessAssetsLifecycle(assets, today)
}

export function lifecycleIntel(
  assets: UrbanAsset[],
  today: string,
  generator = ALPHA_MODEL_VERSION,
): { claims: AlphaClaim[]; recs: AlphaRecommendationDraft[] } {
  const all = lifecycleAssessments(assets, today)
  const overdue = all.filter((a) => (a.overdueDays ?? 0) > 0)
  const dueSoon = all.filter((a) => a.overdueDays === 0 && a.daysUntilDue != null && a.daysUntilDue <= 7)
  const lifeEnd = all.filter((a) => a.remainingLifeDays != null && a.remainingLifeDays <= 180)
  const claims: AlphaClaim[] = []
  const recs: AlphaRecommendationDraft[] = []

  if (overdue.length) {
    const worst = overdue[0]!
    claims.push({
      kind: 'fact',
      title: 'Preventiva em atraso',
      body: `${overdue.length} ativo(s) com ciclo de preventiva vencido. Pior caso: ${worst.narrative}`,
      sourceKeys: ['assets'],
    })
  }
  if (dueSoon.length) {
    claims.push({
      kind: 'fact',
      title: 'Ciclo de preventiva nos próximos 7 dias',
      body: `${dueSoon.length} ativo(s) com vencimento próximo: ${dueSoon
        .slice(0, 6)
        .map((a) => `${a.assetId} em ${a.daysUntilDue} dia(s)`)
        .join('; ')}.`,
      sourceKeys: ['assets'],
    })
  }
  if (lifeEnd.length) {
    claims.push({
      kind: 'model',
      title: 'Vida útil no horizonte',
      body: `${lifeEnd.length} ativo(s) com vida útil vencida ou a vencer em até 6 meses. Estimativa a partir do cadastro; não é telemetria de falha.`,
      sourceKeys: ['assets'],
    })
  }

  for (const a of overdue.slice(0, 8)) {
    recs.push({
      category: a.vehicle ? 'frota' : 'manutencao',
      priority: lifecyclePriority(a),
      region: a.region,
      relatedRef: a.assetId,
      situation: a.narrative,
      evidence: [
        a.dueOn ? `Vencimento do ciclo: ${a.dueOn}` : '',
        `Degradação: ${a.degradation}`,
        `Risco de indisponibilidade ${Math.round(a.unavailabilityRisk * 100)}%`,
        `Risco de acidentes ${Math.round(a.accidentRisk * 100)}%`,
      ].filter(Boolean),
      justification:
        'Cálculo a partir do ciclo e da vida útil cadastrados. Não marca o ativo como defeituoso e não executa OS sozinho.',
      actionText: a.actionText,
      expectedBenefit: `Reduzir o risco de indisponibilidade (${Math.round(a.unavailabilityRisk * 100)}%) e o risco de acidentes (${Math.round(a.accidentRisk * 100)}%).`,
      uncertainties: 'Sem telemetria de falha neste ativo, o percentual é estimativa operacional do atraso, não probabilidade observada.',
      generator,
    })
  }

  for (const a of lifeEnd.filter((x) => (x.overdueDays ?? 0) === 0).slice(0, 4)) {
    recs.push({
      category: a.vehicle ? 'frota' : 'manutencao',
      priority: lifecyclePriority(a),
      region: a.region,
      relatedRef: a.assetId,
      situation: a.narrative,
      evidence: [
        a.usefulLifeEnd ? `Fim da vida útil cadastrada: ${a.usefulLifeEnd}` : '',
        a.usefulLifeConsumedPct != null ? `Consumo estimado ${Math.round(a.usefulLifeConsumedPct * 100)}%` : '',
      ].filter(Boolean),
      justification: 'Vida útil informada no cadastro. Não implica falha imediata.',
      actionText: a.actionText,
      uncertainties: 'A vida útil é nominal. O estado real depende de uso, revisão e inspeção.',
      generator,
    })
  }

  return { claims, recs }
}
