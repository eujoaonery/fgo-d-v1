import type { FogoDb } from '../supabase.js'
import { IDLE_CRISIS, type CrisisState } from './types.js'

export async function getCrisisState(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function setCrisisState(db: FogoDb, next: CrisisState): Promise<CrisisState> {
  const { data: row, error: readErr } = await db.supabase
    .from('system_settings')
    .select('simulation')
    .eq('organization_id', db.orgId)
    .maybeSingle()
  if (readErr) throw readErr
  const { error } = await db.supabase.from('system_settings').upsert({
    organization_id: db.orgId,
    simulation: row?.simulation ?? {
      enabled: false,
      intensity: 'medium',
      ticksTotal: 0,
      tickIntervalMs: 60000,
    },
    crisis: next as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return next
}

export async function evaluateCrisis(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function acknowledgeCrisis(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function conveneAllUnits(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function activateSuperIntelligence(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function advanceCrisis(_db: FogoDb): Promise<CrisisState> {
  return { ...IDLE_CRISIS }
}

export async function resetCrisisState(db: FogoDb): Promise<void> {
  await setCrisisState(db, { ...IDLE_CRISIS })
}
