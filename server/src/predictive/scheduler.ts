import type { SupabaseClient } from '@supabase/supabase-js'
import { dbForTenant } from '../supabase.js'
import { listActiveOrgs } from '../tenant/orgs.js'
import { getPredictiveControls } from './controls.js'
import { runPredictiveCycle } from './engine.js'

const TICK_MS = 30_000
const inFlight = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null

function due(lastAt: string | undefined, intervalSec: number): boolean {
  if (!lastAt) return true
  const t = Date.parse(lastAt)
  if (!Number.isFinite(t)) return true
  return Date.now() - t >= intervalSec * 1000
}

async function tick(supabase: SupabaseClient) {
  const orgs = await listActiveOrgs(supabase)
  for (const tenant of orgs) {
    if (inFlight.has(tenant.id)) continue
    const db = dbForTenant(supabase, tenant)
    let controls
    try {
      controls = await getPredictiveControls(db)
    } catch (err) {
      console.error('[fogo] predictive controls', tenant.slug, err instanceof Error ? err.message : err)
      continue
    }
    if (!controls.learningEnabled && !controls.forecastsEnabled && !controls.evaluationEnabled) continue
    const last = controls.lastForecastAt ?? controls.lastEvalAt ?? controls.lastLearnAt
    if (!due(last, controls.intervalSec)) continue
    inFlight.add(tenant.id)
    void runPredictiveCycle(db)
      .catch((err) => console.error('[fogo] predictive cycle', tenant.slug, err instanceof Error ? err.message : err))
      .finally(() => inFlight.delete(tenant.id))
  }
}

export function startPredictiveScheduler(supabase: SupabaseClient) {
  if (timer) return
  timer = setInterval(() => {
    void tick(supabase).catch((err) => console.error('[fogo] predictive scheduler', err))
  }, TICK_MS)
  void tick(supabase).catch((err) => console.error('[fogo] predictive scheduler', err))
}
