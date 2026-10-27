import type { FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import type {
  AlphaRecPriority,
  AlphaRecommendation,
  AlphaRecommendationDraft,
  AlphaRecStatus,
} from '../../../src/lib/prometheusAlpha.js'
import { isAlphaRecStatus } from '../../../src/lib/prometheusAlpha.js'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function rowToRec(row: Record<string, unknown>): AlphaRecommendation {
  return {
    id: String(row.id),
    analysisId: row.analysis_id ? String(row.analysis_id) : undefined,
    category: String(row.category),
    priority: row.priority as AlphaRecPriority,
    region: row.region ? String(row.region) : undefined,
    relatedRef: row.related_ref ? String(row.related_ref) : undefined,
    situation: String(row.situation),
    evidence: asStringArray(row.evidence),
    justification: String(row.justification),
    actionText: String(row.action_text),
    suggestedDeadline: row.suggested_deadline ? String(row.suggested_deadline) : undefined,
    expectedBenefit: row.expected_benefit ? String(row.expected_benefit) : undefined,
    uncertainties: String(row.uncertainties ?? ''),
    generator: String(row.generator),
    modelVersion: row.model_version ? String(row.model_version) : undefined,
    status: (row.status as AlphaRecStatus) || 'pending',
    createdAt: String(row.created_at),
    decisionJustification: row.decision_justification ? String(row.decision_justification) : undefined,
    decisionAt: row.decision_at ? String(row.decision_at) : undefined,
    decisionBy: row.decision_by ? String(row.decision_by) : undefined,
    observedResult: row.observed_result ? String(row.observed_result) : undefined,
    observedAt: row.observed_at ? String(row.observed_at) : undefined,
  }
}

export async function listRecommendations(db: FogoDb, status?: AlphaRecStatus): Promise<AlphaRecommendation[]> {
  let q = db.supabase
    .from('prometheus_alpha_recommendations')
    .select('*')
    .eq('organization_id', db.orgId)
    .order('created_at', { ascending: false })
    .limit(80)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => rowToRec(r as Record<string, unknown>))
}

export async function persistRecommendations(
  db: FogoDb,
  analysisId: string,
  drafts: AlphaRecommendationDraft[],
  modelVersion: string,
): Promise<AlphaRecommendation[]> {
  if (!drafts.length) return []
  const pending = await listRecommendations(db, 'pending')
  const fresh = drafts.filter((d) => {
    const key = `${d.category}|${d.region ?? ''}|${d.actionText}`
    return !pending.some((p) => `${p.category}|${p.region ?? ''}|${p.actionText}` === key)
  })
  if (!fresh.length) return pending
  const { data, error } = await db.supabase
    .from('prometheus_alpha_recommendations')
    .insert(
      fresh.map((d) => ({
        organization_id: db.orgId,
        analysis_id: analysisId,
        category: d.category,
        priority: d.priority,
        region: d.region ?? null,
        related_ref: d.relatedRef ?? null,
        situation: d.situation,
        evidence: d.evidence,
        justification: d.justification,
        action_text: d.actionText,
        suggested_deadline: d.suggestedDeadline ?? null,
        expected_benefit: d.expectedBenefit ?? null,
        uncertainties: d.uncertainties,
        generator: d.generator,
        model_version: modelVersion,
        status: 'pending',
      })),
    )
    .select('*')
  if (error) throw error
  return (data ?? []).map((r) => rowToRec(r as Record<string, unknown>))
}

export async function decideRecommendation(
  db: FogoDb,
  id: string,
  status: Exclude<AlphaRecStatus, 'pending'>,
  justification: string,
): Promise<AlphaRecommendation> {
  if (!isAlphaRecStatus(status) || status === 'pending') {
    throw new HttpError(400, 'Estado de decisão inválido.')
  }
  if (justification.trim().length < 8) {
    throw new HttpError(400, 'Justificativa com pelo menos 8 caracteres.')
  }
  const actor = db.actor?.userId
  if (!actor) throw new HttpError(401, 'Autenticação necessária.')
  const { data, error } = await db.supabase
    .from('prometheus_alpha_recommendations')
    .update({
      status,
      decision_justification: justification.trim(),
      decision_at: new Date().toISOString(),
      decision_by: actor,
    })
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Recomendação não encontrada.')
  return rowToRec(data as Record<string, unknown>)
}

export async function observeRecommendation(db: FogoDb, id: string, observedResult: string): Promise<AlphaRecommendation> {
  if (observedResult.trim().length < 8) {
    throw new HttpError(400, 'Resultado observado com pelo menos 8 caracteres.')
  }
  const actor = db.actor?.userId
  if (!actor) throw new HttpError(401, 'Autenticação necessária.')
  const { data, error } = await db.supabase
    .from('prometheus_alpha_recommendations')
    .update({
      observed_result: observedResult.trim(),
      observed_at: new Date().toISOString(),
      observed_by: actor,
    })
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Recomendação não encontrada.')
  return rowToRec(data as Record<string, unknown>)
}

export function acceptanceNextStep(rec: AlphaRecommendation): { type: string; hint: string } {
  if (rec.category === 'inspecao' || rec.category === 'manutencao' || rec.category === 'frota') {
    return {
      type: 'work_order_draft',
      hint: 'O aceite registra a decisão. Abra uma OS em Ordens de serviço para executar — o Alpha não cria OS sozinho.',
    }
  }
  if (rec.category === 'defesa_civil') {
    return {
      type: 'human_confirmation',
      hint: 'O aceite não aciona a Defesa Civil. Use o canal oficial do município para prontidão e registro.',
    }
  }
  if (rec.category.startsWith('clima')) {
    return {
      type: 'human_confirmation',
      hint: 'O aceite registra a orientação operacional. Ajuste agenda e interdições no CCO — o Alpha não bloqueia via nem cancela OS.',
    }
  }
  return {
    type: 'human_confirmation',
    hint: 'O aceite não dispara ação operacional automática. Siga o fluxo previsto no CCO com a autorização correspondente.',
  }
}
