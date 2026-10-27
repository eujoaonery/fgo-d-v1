import type { LatLng } from './osrm.js'

export type PlannedStop = {
  incidentId: string
  agentId: string
  agentName: string
  title: string
  address: string
  city: string
  type: string
  scheduledStart?: string | null
  scheduledEnd?: string | null
  lat: number
  lng: number
  coordSource: string
}

export type ScheduleConflict = {
  incidentId: string
  reason: string
}

export function assertSameAgent(stops: PlannedStop[]): { agentId: string; agentName: string } {
  const agents = new Set(stops.map((s) => s.agentId).filter(Boolean))
  if (agents.size === 0) {
    throw new Error('Selecione ordens com um agente responsável.')
  }
  if (agents.size > 1) {
    throw new Error('Todas as ordens da rota precisam ser do mesmo agente.')
  }
  const first = stops.find((s) => s.agentId)
  return { agentId: first!.agentId, agentName: first!.agentName }
}

export function nearestNeighborOrder(origin: LatLng, stops: PlannedStop[]): PlannedStop[] {
  const pending = [...stops]
  const ordered: PlannedStop[] = []
  let cursor = origin
  while (pending.length) {
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    pending.forEach((s, i) => {
      const d = haversine(cursor, { lat: s.lat, lng: s.lng })
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    const next = pending.splice(best, 1)[0]!
    ordered.push(next)
    cursor = { lat: next.lat, lng: next.lng }
  }
  return ordered
}

function haversine(a: LatLng, b: LatLng) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

const DEFAULT_SERVICE_SEC = 30 * 60

export function detectScheduleConflicts(
  stops: PlannedStop[],
  legDurationsSec: number[],
  startAt = Date.now(),
): { conflicts: ScheduleConflict[]; scheduleValidated: boolean } {
  const hasWindows = stops.some((s) => s.scheduledStart || s.scheduledEnd)
  if (!hasWindows) {
    return {
      conflicts: [],
      scheduleValidated: false,
    }
  }
  const conflicts: ScheduleConflict[] = []
  let t = startAt
  stops.forEach((stop, i) => {
    const travel = legDurationsSec[i] ?? 0
    t += travel * 1000
    const arrival = t
    if (stop.scheduledEnd) {
      const end = Date.parse(stop.scheduledEnd)
      if (Number.isFinite(end) && arrival > end) {
        conflicts.push({
          incidentId: stop.incidentId,
          reason: `Chegada estimada depois do fim do agendamento (${stop.scheduledEnd}).`,
        })
      }
    } else if (stop.scheduledStart) {
      const start = Date.parse(stop.scheduledStart)
      if (Number.isFinite(start) && arrival > start + 2 * 3600_000) {
        conflicts.push({
          incidentId: stop.incidentId,
          reason: `Chegada estimada mais de 2 h após o horário agendado.`,
        })
      }
    }
    t += DEFAULT_SERVICE_SEC * 1000
  })
  return { conflicts, scheduleValidated: true }
}

export function applyWaypointOrder(stops: PlannedStop[], order: number[]): PlannedStop[] {
  if (order.length !== stops.length + 1) return stops
  const destOrder = order.slice(1).map((i) => i - 1)
  if (destOrder.some((i) => i < 0 || i >= stops.length)) return stops
  return destOrder.map((i) => stops[i]!)
}
