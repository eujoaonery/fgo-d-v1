const DAY_MS = 86_400_000

export type NeighborhoodAlert = {
  detectedAt: string
  neighborhood: string
  region: string
  state: string
  category: string
}

export type NeighborhoodRisk = {
  neighborhood: string
  region: string
  count24: number
  baselineDaily: number
  probability: number
}

export type StaffAlert = {
  region: string
  severity: string
  state: string
  hasOrder: boolean
  category: string
}

export type StaffOrder = { region: string; status: string }
export type StaffAgent = { region: string; status: string; functionalStatus?: string }

export type StaffGap = {
  region: string
  demand: number
  supply: number
  gap: number
}

export type UseEvent = { assetId: string; occurredAt: string }

export type UseMove = {
  assetId: string
  direction: 'caiu' | 'subiu'
  rate7: number
  ratePrev: number
  deviation: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function mode(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best = ''
  let n = 0
  for (const [value, count] of counts) {
    if (count > n) {
      best = value
      n = count
    }
  }
  return best
}

/** Pico do bairro: ao menos 2 alertas em 24 h e acima de 1,4× a média diária de 7 dias. */
export function neighborhoodRisks(alerts: NeighborhoodAlert[], now: number): NeighborhoodRisk[] {
  const countable = alerts.filter(
    (alert) => alert.state !== 'falso positivo' && alert.category !== 'Preditiva' && alert.neighborhood.trim().length > 0,
  )
  const names = [...new Set(countable.map((alert) => alert.neighborhood))]
  const out: NeighborhoodRisk[] = []
  for (const neighborhood of names) {
    const rows = countable.filter((alert) => alert.neighborhood === neighborhood)
    const count24 = rows.filter((alert) => now - Date.parse(alert.detectedAt) < DAY_MS).length
    const count7 = rows.filter((alert) => now - Date.parse(alert.detectedAt) < 7 * DAY_MS).length
    const baseline = count7 / 7
    if (count24 < 2 || baseline <= 0 || count24 < baseline * 1.4) continue
    out.push({
      neighborhood,
      region: mode(rows.map((row) => row.region)),
      count24,
      baselineDaily: round1(baseline),
      probability: Math.min(0.95, count24 / (baseline * 2 + 1)),
    })
  }
  return out
}

export function countNeighborhoodAlertsInWindow(
  alerts: NeighborhoodAlert[],
  neighborhood: string,
  fromMs: number,
  toMs: number,
): number {
  return alerts.filter((alert) => {
    if (alert.neighborhood !== neighborhood) return false
    if (alert.state === 'falso positivo' || alert.category === 'Preditiva') return false
    const t = Date.parse(alert.detectedAt)
    return Number.isFinite(t) && t >= fromMs && t < toMs
  }).length
}

function orderOpen(status: string): boolean {
  return status !== 'resolvida' && status !== 'cancelada'
}

function urgentWithoutOrder(alert: StaffAlert): boolean {
  if (alert.hasOrder) return false
  if (alert.category === 'Preditiva') return false
  if (alert.state === 'resolvido' || alert.state === 'falso positivo' || alert.state === 'os_aberta') return false
  return alert.severity === 'alta' || alert.severity === 'crítica'
}

function agentAvailable(agent: StaffAgent): boolean {
  if (agent.status !== 'disponível') return false
  return (agent.functionalStatus ?? 'ativo') === 'ativo'
}

/** Falta = ordens abertas + alertas altos ou críticos sem ordem − agentes disponíveis. */
export function staffGaps(input: { alerts: StaffAlert[]; orders: StaffOrder[]; agents: StaffAgent[] }): StaffGap[] {
  const regions = new Set<string>()
  for (const row of input.alerts) if (row.region) regions.add(row.region)
  for (const row of input.orders) if (row.region) regions.add(row.region)
  for (const row of input.agents) if (row.region) regions.add(row.region)
  const out: StaffGap[] = []
  for (const region of regions) {
    const demand =
      input.orders.filter((order) => order.region === region && orderOpen(order.status)).length +
      input.alerts.filter((alert) => alert.region === region && urgentWithoutOrder(alert)).length
    const supply = input.agents.filter((agent) => agent.region === region && agentAvailable(agent)).length
    const gap = demand - supply
    if (gap < 1) continue
    out.push({ region, demand, supply, gap })
  }
  return out
}

export function isUsageEvent(eventType: string): boolean {
  const type = eventType.toLowerCase()
  if (type.includes('loss') || type.includes('falha') || type.includes('alert')) return false
  return type === 'frame_received' || type === 'radar_reading' || type.includes('reading') || type.includes('frame')
}

/** Compara a média diária dos últimos 7 dias com a dos 7 dias anteriores. No máximo 8 desvios. */
export function utilizationMoves(events: UseEvent[], now: number): UseMove[] {
  const recentFrom = now - 7 * DAY_MS
  const prevFrom = now - 14 * DAY_MS
  const byAsset = new Map<string, number[]>()
  for (const event of events) {
    const t = Date.parse(event.occurredAt)
    if (!Number.isFinite(t) || t < prevFrom || t >= now || !event.assetId) continue
    const list = byAsset.get(event.assetId)
    if (list) list.push(t)
    else byAsset.set(event.assetId, [t])
  }
  const moves: UseMove[] = []
  for (const [assetId, times] of byAsset) {
    const recent = times.filter((t) => t >= recentFrom).length / 7
    const prev = times.filter((t) => t < recentFrom).length / 7
    if (prev <= 0) continue
    let direction: UseMove['direction'] | null = null
    if (recent < prev * 0.6) direction = 'caiu'
    else if (recent > prev * 1.5) direction = 'subiu'
    if (!direction) continue
    moves.push({
      assetId,
      direction,
      rate7: round1(recent),
      ratePrev: round1(prev),
      deviation: Math.abs(recent / prev - 1),
    })
  }
  moves.sort((a, b) => b.deviation - a.deviation)
  return moves.slice(0, 8)
}

export function observedUseRate(events: UseEvent[], assetId: string, fromMs: number, toMs: number): number {
  const span = Math.max(DAY_MS, toMs - fromMs)
  const count = events.filter((event) => {
    if (event.assetId !== assetId) return false
    const t = Date.parse(event.occurredAt)
    return Number.isFinite(t) && t >= fromMs && t < toMs
  }).length
  return round1(count / (span / DAY_MS))
}
