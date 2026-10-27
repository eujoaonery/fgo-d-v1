import { assessAssetLifecycle, resolvePreventiveDue } from '../../../src/lib/assetLifecycle.js'
import { isOccurrencePending } from '../../../src/lib/occurrenceState.js'
import type { FogoDb } from '../db.js'
import { generatedSignalOrigin } from '../dataOrigin.js'
import {
  insertActivity,
  listAlerts,
  listAssets,
  nextCounter,
  upsertAlert,
  MONITORING_ALERT_SOURCE,
} from '../repository.js'

/** Aviso de vencimento do plano por ativo — nunca altera situação cadastral. */
export async function scanMaintenancePlanAlerts(db: FogoDb): Promise<number> {
  const [assets, alerts] = await Promise.all([listAssets(db), listAlerts(db)])
  const openRules = new Set(alerts.filter((a) => isOccurrencePending(a.state)).map((a) => a.rule))
  const now = Date.now()
  let created = 0
  for (const asset of assets) {
    const dueOn = resolvePreventiveDue(asset)
    if (!dueOn) continue
    const dueMs = Date.parse(`${dueOn}T12:00:00.000Z`)
    if (!Number.isFinite(dueMs)) continue
    const days = (dueMs - now) / 86_400_000
    if (days > 7 || days < -90) continue
    const rule = `maintenance.plan:${asset.id}`
    if (openRules.has(rule)) continue
    const n = await nextCounter(db, 'alert')
    const overdue = days < 0
    const life = assessAssetLifecycle(asset)
    const description = life
      ? `${life.narrative} A situação cadastral do equipamento não foi alterada.`
      : `${asset.name} (${asset.id}) — próximo vencimento ${dueOn}. A situação cadastral do equipamento não foi alterada.`
    await upsertAlert(db, {
      id: `ALT-${2800 + n}`,
      category: 'Manutenção',
      severity: overdue ? 'alta' : days <= 1 ? 'média' : 'informativa',
      title: overdue ? 'Plano de manutenção vencido' : 'Plano de manutenção próximo do vencimento',
      description,
      source: MONITORING_ALERT_SOURCE,
      dataOrigin: generatedSignalOrigin(db, asset.dataOrigin),
      relatedAssetId: asset.id,
      region: asset.region,
      detectedAt: new Date().toISOString(),
      state: 'novo',
      rule,
    })
    await insertActivity(db, {
      id: `EVT-${Date.now()}-plan-${asset.id}`,
      timestamp: new Date().toISOString(),
      message: `Aviso de plano de manutenção: ${asset.name} (${asset.id})`,
      kind: 'alert',
      dataOrigin: generatedSignalOrigin(db, asset.dataOrigin),
    })
    openRules.add(rule)
    created += 1
    if (created >= 8) break
  }
  return created
}
