import type { FogoDb } from './supabase.js'
import type { AlertState, OperationalAlert } from './types.js'
import { isAlertOverdue } from './alertSla.js'
import { listAlerts } from './repository.js'
import { slaElapsedMs, slaPercentForAlert } from '../../src/lib/categorySla.js'

const OPEN: AlertState[] = ['novo', 'reconhecido', 'em atendimento', 'em observação']

export type AlertSlaRow = {
  protocol: string
  title: string
  category: string
  severity: OperationalAlert['severity']
  state: AlertState
  region?: string
  detectedAt: string
  responseDueAt?: string
  claimedBy?: string
  claimedByLabel?: string
  elapsedMs: number
  slaPercent: number
  assumeAt?: string
  dispatchAt?: string
  completeAt?: string
  assumeMs: number | null
  dispatchMs: number | null
  completeMs: number | null
  assumePending: boolean
  dispatchPending: boolean
  completePending: boolean
  firstResponseOverdue: boolean
}

export type CcoSlaSummary = {
  openAlerts: number
  assumed: number
  dispatched: number
  completed: number
  overdueOpen: number
  avgAssumeMs: number | null
  avgDispatchMs: number | null
  avgCompleteMs: number | null
}

function firstMap(entries: Array<{ protocol: string; at: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of entries) {
    if (!map.has(e.protocol)) map.set(e.protocol, e.at)
  }
  return map
}

function msBetween(fromIso: string, toIso: string | null | undefined, nowMs: number): number {
  return Math.max(0, (toIso ? new Date(toIso).getTime() : nowMs) - new Date(fromIso).getTime())
}

function clock(detectedAt: string, actionAt: string | undefined, nowMs: number, closed: boolean) {
  if (actionAt) return { ms: msBetween(detectedAt, actionAt, nowMs), pending: false }
  if (closed) return { ms: null, pending: false }
  return { ms: msBetween(detectedAt, undefined, nowMs), pending: true }
}

function avg(values: number[]): number | null {
  if (!values.length) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

async function loadHistoryFallbacks(db: FogoDb) {
  const assumeBy = new Map<string, string>()
  const completeBy = new Map<string, string>()
  const { data: alertIds } = await db.supabase
    .from('alerts')
    .select('id, protocol')
    .eq('organization_id', db.orgId)
  const idToProtocol = new Map((alertIds ?? []).map((r) => [String(r.id), String(r.protocol)]))

  const { data: hist } = await db.supabase
    .from('alert_history')
    .select('alert_id, to_state, changed_at, actor_label')
    .eq('organization_id', db.orgId)
    .order('changed_at', { ascending: true })
    .limit(8000)

  for (const row of hist ?? []) {
    const protocol = idToProtocol.get(String((row as { alert_id?: string }).alert_id ?? ''))
    if (!protocol) continue
    const toState = String((row as { to_state?: string }).to_state ?? '')
    const at = String((row as { changed_at?: string }).changed_at ?? '')
    const actor = String((row as { actor_label?: string }).actor_label ?? '').toLowerCase()
    if (!at) continue
    const human =
      actor.length > 0 && actor !== 'sistema' && !actor.includes('super inteligência') && !actor.includes('simulação')
    if (
      human &&
      (toState === 'reconhecido' || toState === 'em atendimento' || toState === 'em observação') &&
      !assumeBy.has(protocol)
    ) {
      assumeBy.set(protocol, at)
    }
    if (toState === 'resolvido' && !completeBy.has(protocol)) completeBy.set(protocol, at)
  }

  const { data: disp } = await db.supabase
    .from('incident_history')
    .select('changed_at, incident_protocol')
    .eq('organization_id', db.orgId)
    .ilike('note', '%Equipe%acionada%')
    .order('changed_at', { ascending: true })
    .limit(4000)

  const dispatchByIncident = firstMap(
    (disp ?? [])
      .map((row) => {
        const protocol = String((row as { incident_protocol?: string }).incident_protocol ?? '')
        const at = String((row as { changed_at?: string }).changed_at ?? '')
        return protocol && at ? { protocol, at } : null
      })
      .filter((x): x is { protocol: string; at: string } => !!x),
  )

  return { assumeBy, completeBy, dispatchByIncident }
}

export function buildAlertSlaRow(
  alert: OperationalAlert,
  nowMs: number,
  fallback?: { assumeAt?: string; dispatchAt?: string; completeAt?: string },
): AlertSlaRow {
  const closed = alert.state === 'resolvido' || alert.state === 'falso positivo'
  const assumeAt = alert.claimedAt ?? fallback?.assumeAt
  const dispatchAt = alert.dispatchedAt ?? fallback?.dispatchAt
  const completeAt = alert.completedAt ?? fallback?.completeAt
  const assume = clock(alert.detectedAt, assumeAt, nowMs, closed)
  const dispatch = clock(alert.detectedAt, dispatchAt, nowMs, closed)
  const complete = clock(alert.detectedAt, completeAt, nowMs, closed)
  const checkpoint = assumeAt ? new Date(assumeAt).getTime() : nowMs
  const firstResponseOverdue = alert.responseDueAt
    ? (closed && !assumeAt ? false : checkpoint > new Date(alert.responseDueAt).getTime())
    : isAlertOverdue(alert.responseDueAt, alert.state)

  return {
    protocol: alert.id,
    title: alert.title,
    category: alert.category,
    severity: alert.severity,
    state: alert.state,
    region: alert.region,
    detectedAt: alert.detectedAt,
    responseDueAt: alert.responseDueAt,
    claimedBy: alert.claimedBy,
    claimedByLabel: alert.claimedByLabel,
    elapsedMs: slaElapsedMs(alert, nowMs),
    slaPercent: slaPercentForAlert(alert, nowMs),
    assumeAt,
    dispatchAt,
    completeAt,
    assumeMs: assume.ms,
    dispatchMs: dispatch.ms,
    completeMs: complete.ms,
    assumePending: assume.pending,
    dispatchPending: dispatch.pending,
    completePending: complete.pending,
    firstResponseOverdue,
  }
}

export async function listAlertSla(db: FogoDb): Promise<{ summary: CcoSlaSummary; alerts: AlertSlaRow[] }> {
  const nowMs = Date.now()
  const alerts = await listAlerts(db)
  const fallback = await loadHistoryFallbacks(db)
  const rows = alerts.map((alert) =>
    buildAlertSlaRow(alert, nowMs, {
      assumeAt: fallback.assumeBy.get(alert.id),
      dispatchAt: alert.incidentId ? fallback.dispatchByIncident.get(alert.incidentId) : undefined,
      completeAt: fallback.completeBy.get(alert.id),
    }),
  )

  const open = rows.filter((r) => OPEN.includes(r.state))
  const assumed = rows.filter((r) => r.assumeAt)
  const dispatched = rows.filter((r) => r.dispatchAt)
  const completed = rows.filter((r) => r.completeAt)
  const summary: CcoSlaSummary = {
    openAlerts: open.length,
    assumed: assumed.length,
    dispatched: dispatched.length,
    completed: completed.length,
    overdueOpen: open.filter((r) => r.firstResponseOverdue).length,
    avgAssumeMs: avg(assumed.map((r) => r.assumeMs).filter((n): n is number => n != null)),
    avgDispatchMs: avg(dispatched.map((r) => r.dispatchMs).filter((n): n is number => n != null)),
    avgCompleteMs: avg(completed.map((r) => r.completeMs).filter((n): n is number => n != null)),
  }
  return { summary, alerts: rows }
}
