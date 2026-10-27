import { mapPercentToLatLng, validateCoordinates } from '../../../src/lib/mariliaGeo.js'
import { parseMapMunicipality } from '../../../src/lib/mapMunicipality.js'
import { osTitle } from '../../../src/lib/workOrders.js'
import type { FogoDb } from '../db.js'
import { listAssets, listIncidents, listTeams } from '../repository.js'
import { suggestByQuery } from '../geo/suggest.js'
import type { PlannedStop } from './planner.js'

const geoCache = new Map<string, { lat: number; lng: number; label: string; at: number }>()
const GEO_TTL = 6 * 3600_000

export type AgentOrigin = {
  agentId: string
  agentName: string
  lat: number
  lng: number
  description: string
  source: 'gps' | 'cadastro_operacional' | 'manual'
  recordedAt?: string
  stale?: boolean
}

export function originFromTeam(team: { id: string; name: string; mapX?: number; mapY?: number }): AgentOrigin | null {
  if (team.mapX == null || team.mapY == null) return null
  const { lat, lng } = mapPercentToLatLng(team.mapX, team.mapY)
  const check = validateCoordinates(lat, lng)
  if (!check.ok) return null
  return {
    agentId: team.id,
    agentName: team.name,
    lat,
    lng,
    description: `Localização operacional cadastrada de ${team.name}`,
    source: 'cadastro_operacional',
  }
}

export async function geocodeAddress(
  address: string,
  area?: ReturnType<typeof parseMapMunicipality>,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const key = `${area?.ibgeId ?? 'marilia'}:${address.trim().toLowerCase()}`
  if (address.trim().length < 3) return null
  const hit = geoCache.get(key)
  if (hit && Date.now() - hit.at < GEO_TTL) return hit
  const rows = await suggestByQuery(address, area)
  const first = rows[0]
  if (!first) return null
  const value = { lat: first.lat, lng: first.lng, label: first.label, at: Date.now() }
  geoCache.set(key, value)
  return value
}

export type RouteAgentChoice = { agentId: string; agentName: string }

async function registeredCityName(db: FogoDb): Promise<string> {
  const { data, error } = await db.supabase
    .from('cities')
    .select('name')
    .eq('organization_id', db.orgId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const name = typeof data?.name === 'string' ? data.name.trim() : ''
  return name || db.tenant?.name || ''
}

export async function loadRoutableOrders(db: FogoDb): Promise<{
  orders: Array<PlannedStop & { status: string; eligible: boolean; blockReason?: string }>
  agents: AgentOrigin[]
  agentChoices: RouteAgentChoice[]
  city: string
}> {
  const [incidents, teams, assets, city] = await Promise.all([
    listIncidents(db),
    listTeams(db),
    listAssets(db),
    registeredCityName(db),
  ])
  const area = parseMapMunicipality(db.tenant?.settings)
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t]))

  const selectable = teams.filter((t) => !t.functionalStatus || t.functionalStatus === 'ativo')
  const agentChoices = selectable.map((t) => ({ agentId: t.id, agentName: t.name }))
  const agents = selectable.map(originFromTeam).filter((o): o is AgentOrigin => !!o)

  const scheduled = incidents.filter((i) => i.status === 'agendada')
  const orders: Array<PlannedStop & { status: string; eligible: boolean; blockReason?: string }> = []

  for (const os of scheduled) {
    const team =
      (os.assignedTeamId ? teamById.get(os.assignedTeamId) : undefined) ??
      (os.assignee ? teamByName.get(os.assignee.trim().toLowerCase()) : undefined)
    const asset = os.relatedAssetId ? assetById.get(os.relatedAssetId) : undefined
    const loc = asset?.location
    let lat = loc?.lat
    let lng = loc?.lng
    let coordSource = loc?.coordOrigin ?? 'cadastro'
    let address = os.location || asset?.address || ''
    if ((lat == null || lng == null) && address) {
      const geo = await geocodeAddress(address, area)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
        coordSource = 'geocodificacao'
        address = geo.label
      }
    }
    const validCoord = lat != null && lng != null && validateCoordinates(lat, lng, area?.bbox, area ? `${area.name}/${area.uf}` : undefined).ok
    let blockReason: string | undefined
    if (!team) blockReason = 'Sem agente responsável.'
    else if (!address.trim()) blockReason = 'Sem endereço de destino.'
    else if (!validCoord) blockReason = 'Endereço não localizado.'

    orders.push({
      incidentId: os.id,
      agentId: team?.id ?? '',
      agentName: team?.name ?? os.assignee ?? '—',
      title: osTitle(os),
      address: address || os.location,
      city: loc?.city || city || os.region,
      type: os.type,
      scheduledStart: os.scheduledStart ?? null,
      scheduledEnd: os.scheduledEnd ?? null,
      lat: validCoord ? lat! : 0,
      lng: validCoord ? lng! : 0,
      coordSource,
      status: os.status,
      eligible: !blockReason,
      blockReason,
    })
  }

  return { orders, agents, agentChoices, city }
}
