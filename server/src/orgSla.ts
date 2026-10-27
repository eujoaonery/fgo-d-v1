import type { FogoDb } from './supabase.js'
import { listAlerts, upsertAlert } from './repository.js'
import { loadOrgById, patchOrgSettings } from './tenant/orgs.js'
import { responseDueAtForAlert } from './alertSla.js'
import {
  DEFAULT_SLA_CATEGORIES,
  DEFAULT_SLA_MINUTES,
  parseSlaByCategory,
  slaMinutesForCategory,
  slaSettingsPayload,
} from '../../src/lib/categorySla.js'

export type CategorySlaRow = { category: string; minutes: number }

export async function getCategorySlaConfig(db: FogoDb): Promise<{
  defaultMinutes: number
  categories: CategorySlaRow[]
}> {
  const settings = db.tenant?.settings ?? {}
  const configured = parseSlaByCategory(settings)
  const alerts = await listAlerts(db)
  const names = new Set<string>([...DEFAULT_SLA_CATEGORIES, ...Object.keys(configured)])
  for (const alert of alerts) {
    if (alert.category?.trim()) names.add(alert.category.trim())
  }
  const categories = [...names]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((category) => ({
      category,
      minutes: slaMinutesForCategory(category, settings, DEFAULT_SLA_MINUTES),
    }))
  return { defaultMinutes: DEFAULT_SLA_MINUTES, categories }
}

export async function saveCategorySlaConfig(
  db: FogoDb,
  minutesByCategory: Record<string, number>,
): Promise<{ defaultMinutes: number; categories: CategorySlaRow[] }> {
  const tenant = await patchOrgSettings(db.supabase, db.orgId, slaSettingsPayload(minutesByCategory))
  db.tenant = tenant
  const alerts = await listAlerts(db)
  for (const alert of alerts) {
    if (alert.state === 'resolvido' || alert.state === 'falso positivo' || alert.state === 'os_aberta') continue
    const due = responseDueAtForAlert(
      alert.category,
      alert.severity,
      new Date(alert.detectedAt),
      tenant.settings,
    )
    if (due !== alert.responseDueAt) {
      await upsertAlert(db, { ...alert, responseDueAt: due })
    }
  }
  return getCategorySlaConfig(db)
}

export async function refreshTenantSettings(db: FogoDb) {
  const tenant = await loadOrgById(db.supabase, db.orgId)
  if (tenant) db.tenant = tenant
}
