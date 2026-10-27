import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Route as RouteIcon } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { OpsFlushBody, OpsTabBar } from '@/components/layout/OpsTabBar'
import { TabLoadScreen } from '@/components/ui/TabLoadScreen'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useOpsData } from '@/context/OpsDataContext'
import { useTenant } from '@/context/TenantContext'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { formatDateTime } from '@/lib/format'
import { mapPercentToLatLng, validateCoordinates } from '@/lib/mariliaGeo'
import { osTitle } from '@/lib/workOrders'
import type { Incident, Team, UrbanAsset } from '@/types'
import {
  duplicateOperationalRoute,
  fetchRoutableOrders,
  fetchRouteHistory,
  fetchSavedRoutes,
  patchOperationalRoute,
  planOperationalRoute,
  saveOperationalRoute,
  type PlannedRoute,
  type RouteHistoryRow,
  type RoutableOrder,
  type RouteAgentChoice,
  type RouteAgentOrigin,
  type SavedOperationalRoute,
} from '@/lib/api'
import { RoutesMap } from '@/pages/routing/RoutesMap'

type Tab = 'planejar' | 'salvas'

const STATUS_LABEL: Record<SavedOperationalRoute['status'], string> = {
  draft: 'Rascunho',
  planned: 'Planejada',
  available: 'Disponível ao agente',
  in_progress: 'Em execução',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const ORIGIN_LABEL: Record<string, string> = {
  gps: 'Última localização (GPS)',
  cadastro_operacional: 'Cadastro operacional',
  manual: 'Informado no mapa',
}

function formatDistance(m?: number | null) {
  if (m == null) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

function formatDuration(sec?: number | null) {
  if (sec == null) return '—'
  const h = Math.floor(sec / 3600)
  const min = Math.round((sec % 3600) / 60)
  if (h <= 0) return `${min} min`
  return `${h} h ${min} min`
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ymdInSaoPaulo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function originFromTeam(team: Team): RouteAgentOrigin | null {
  if (team.mapX == null || team.mapY == null) return null
  const { lat, lng } = mapPercentToLatLng(team.mapX, team.mapY)
  if (!validateCoordinates(lat, lng).ok) return null
  return {
    agentId: team.id,
    agentName: team.name,
    lat,
    lng,
    description: `Localização operacional cadastrada de ${team.name}`,
    source: 'cadastro_operacional',
  }
}

function incidentToRoutable(
  os: Incident,
  teamList: Team[],
  assetList: UrbanAsset[],
  city: string,
  bounds?: { south: number; north: number; west: number; east: number },
): RoutableOrder {
  const team =
    teamList.find((t) => t.id === os.assignedTeamId) ??
    teamList.find((t) => os.assignee && t.name.trim().toLowerCase() === os.assignee.trim().toLowerCase())
  const asset = os.relatedAssetId ? assetList.find((a) => a.id === os.relatedAssetId) : undefined
  const lat = asset?.location?.lat
  const lng = asset?.location?.lng
  const address = os.location || asset?.address || ''
  const valid = lat != null && lng != null && validateCoordinates(lat, lng, bounds).ok
  let blockReason: string | undefined
  if (!team) blockReason = 'Sem agente responsável.'
  else if (!address.trim()) blockReason = 'Sem endereço de destino.'
  else if (!valid) blockReason = 'Endereço não localizado.'
  return {
    incidentId: os.id,
    agentId: team?.id ?? '',
    agentName: team?.name ?? os.assignee ?? '—',
    title: osTitle(os),
    address,
    city: asset?.location?.city || city || os.region,
    type: os.type,
    scheduledStart: os.scheduledStart ?? null,
    scheduledEnd: os.scheduledEnd ?? null,
    lat: valid ? lat! : 0,
    lng: valid ? lng! : 0,
    coordSource: asset?.location?.coordOrigin ?? 'cadastro',
    status: os.status,
    eligible: !blockReason,
    blockReason,
  }
}

export function RoutesPage() {
  const { can } = useCcoAccess()
  const canManage = can('routes', 'manage')
  const { incidents, teams, assets, mapHome } = useOpsData()
  const { publicTenant } = useTenant()
  const registeredCity = (publicTenant.cityName || publicTenant.name || '').trim()
  const [tab, setTab] = useState<Tab>('planejar')
  const [ready, setReady] = useState(false)
  const [apiOrders, setApiOrders] = useState<RoutableOrder[] | null>(null)
  const [apiAgents, setApiAgents] = useState<RouteAgentOrigin[]>([])
  const [agentChoices, setAgentChoices] = useState<RouteAgentChoice[]>([])
  const [apiCity, setApiCity] = useState('')
  const cityName = registeredCity || apiCity
  const [saved, setSaved] = useState<SavedOperationalRoute[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [agentFilter, setAgentFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [plan, setPlan] = useState<PlannedRoute | null>(null)
  const [manualOrigin, setManualOrigin] = useState<{ lat: number; lng: number; description: string } | null>(null)
  const [pickOrigin, setPickOrigin] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState('')
  const [plannedDate, setPlannedDate] = useState(todayYmd())
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null)
  const [savedSearch, setSavedSearch] = useState('')
  const [savedAgent, setSavedAgent] = useState('')
  const [savedDate, setSavedDate] = useState('')
  const [savedStatus, setSavedStatus] = useState('')
  const [history, setHistory] = useState<RouteHistoryRow[]>([])
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [inconsistencies, setInconsistencies] = useState<string[]>([])

  const loadOrders = useCallback(async () => {
    const data = await fetchRoutableOrders()
    setApiOrders(Array.isArray(data.orders) ? data.orders : [])
    setApiAgents(Array.isArray(data.agents) ? data.agents : [])
    setAgentChoices(Array.isArray(data.agentChoices) ? data.agentChoices : [])
    setApiCity(typeof data.city === 'string' ? data.city.trim() : '')
  }, [])

  const loadSaved = useCallback(async () => {
    setSaved(await fetchSavedRoutes())
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        await loadOrders()
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Falha ao carregar rotas.')
      }
      try {
        await loadSaved()
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Falha ao carregar rotas salvas.')
      }
      if (!cancel) setReady(true)
    })()
    return () => {
      cancel = true
    }
  }, [loadOrders, loadSaved])

  const localOrders = useMemo(
    () =>
      incidents
        .filter((os) => os.status === 'agendada')
        .map((os) => incidentToRoutable(os, teams, assets, cityName, mapHome?.bbox)),
    [incidents, teams, assets, cityName, mapHome?.bbox],
  )
  const orders = useMemo(() => {
    if (apiOrders && apiOrders.length > 0) return apiOrders
    if (localOrders.length > 0) return localOrders
    return apiOrders ?? []
  }, [apiOrders, localOrders])
  const agents = useMemo(() => {
    const map = new Map<string, RouteAgentOrigin>()
    for (const team of teams) {
      const origin = originFromTeam(team)
      if (origin) map.set(origin.agentId, origin)
    }
    for (const agent of apiAgents) map.set(agent.agentId, agent)
    return [...map.values()]
  }, [teams, apiAgents])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      if (!team.functionalStatus || team.functionalStatus === 'ativo') map.set(team.id, team.name)
    }
    for (const agent of agentChoices) map.set(agent.agentId, agent.agentName)
    for (const order of orders) {
      if (order.agentId && !map.has(order.agentId)) map.set(order.agentId, order.agentName)
    }
    return [...map.entries()]
      .map(([agentId, agentName]) => ({ agentId, agentName }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName, 'pt-BR'))
  }, [teams, agentChoices, orders])
  const cities = useMemo(() => {
    const names = new Set<string>()
    if (cityName) names.add(cityName)
    for (const order of orders) if (order.city) names.add(order.city)
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [orders, cityName])
  const types = useMemo(
    () => [...new Set(orders.map((o) => o.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [orders],
  )

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (agentFilter && o.agentId !== agentFilter) return false
      if (cityFilter && cityFilter !== cityName && o.city !== cityFilter) return false
      if (typeFilter && o.type !== typeFilter) return false
      if (dateFilter && ymdInSaoPaulo(o.scheduledStart ?? '') !== dateFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !o.incidentId.toLowerCase().includes(q) &&
          !o.title.toLowerCase().includes(q) &&
          !o.address.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [orders, agentFilter, cityFilter, cityName, typeFilter, dateFilter, search])

  const selected = selectedIds.map((id) => orders.find((o) => o.incidentId === id)).filter((o): o is RoutableOrder => !!o)
  const filteredAgent = agentOptions.find((a) => a.agentId === agentFilter)
  const selectedAgentId = selected[0]?.agentId ?? agentFilter
  const selectedAgentName = selected[0]?.agentName ?? filteredAgent?.agentName ?? ''
  const origin = manualOrigin
    ? {
        agentId: selectedAgentId,
        agentName: selectedAgentName,
        lat: manualOrigin.lat,
        lng: manualOrigin.lng,
        description: manualOrigin.description,
        source: 'manual' as const,
      }
    : agents.find((a) => a.agentId === selectedAgentId) ?? null
  const needsOrigin = selected.length > 0 && !origin

  function toggleOrder(row: RoutableOrder) {
    setSelectionError('')
    setError('')
    if (!row.eligible) {
      setSelectionError(row.blockReason || 'Ordem não elegível para roteirização.')
      return
    }
    if (selectedIds.includes(row.incidentId)) {
      setSelectedIds((ids) => ids.filter((id) => id !== row.incidentId))
      setPlan(null)
      setDirty(true)
      return
    }
    if (selectedIds.length && selectedAgentId && row.agentId !== selectedAgentId) {
      setSelectionError('Selecione apenas ordens do mesmo agente para esta rota.')
      return
    }
    setSelectedIds((ids) => [...ids, row.incidentId])
    setPlan(null)
    setDirty(true)
  }

  async function calculate(
    optimize = true,
    order = selectedIds,
    originOverride?: { lat: number; lng: number; description?: string } | null,
  ) {
    if (!order.length) {
      setError('Selecione ao menos uma ordem de serviço agendada.')
      return
    }
    const originPayload = originOverride ?? manualOrigin
    if (needsOrigin && !originPayload) {
      setPickOrigin(true)
      setError('Informe o ponto de partida no mapa. O agente não tem localização cadastrada.')
      return
    }
    setPlanning(true)
    setError('')
    setToast('')
    try {
      const next = await planOperationalRoute({
        incidentIds: order,
        stopOrder: optimize ? undefined : order,
        optimize,
        origin: originPayload ?? undefined,
      })
      setPlan(next)
      setSelectedIds(next.stops.map((s) => s.incidentId))
      if (!name) setName(`Rota ${next.agentName}`)
      setDirty(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no cálculo da rota.')
      setPlan(null)
    } finally {
      setPlanning(false)
    }
  }

  function moveStop(index: number, dir: -1 | 1) {
    const next = [...selectedIds]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    const tmp = next[index]!
    next[index] = next[j]!
    next[j] = tmp
    setSelectedIds(next)
    void calculate(false, next)
  }

  async function save() {
    if (!plan) {
      setError('Calcule a rota antes de salvar.')
      return
    }
    if (!name.trim()) {
      setError('Informe o nome da rota.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        incidentIds: selectedIds,
        stopOrder: selectedIds,
        optimize: false,
        origin: manualOrigin ?? undefined,
        name: name.trim(),
        plannedDate,
        notes: notes.trim() || null,
        expectedUpdatedAt: editingUpdatedAt ?? undefined,
      }
      const row = editingId
        ? await patchOperationalRoute(editingId, body)
        : await saveOperationalRoute(body)
      setToast(`Rota ${row.id} salva.`)
      setDirty(false)
      setEditingId(row.id)
      setEditingUpdatedAt(row.updatedAt)
      await loadSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a rota.')
    } finally {
      setSaving(false)
    }
  }

  function openSaved(row: SavedOperationalRoute) {
    const ids = row.stops.map((s) => s.incidentId)
    const missing = ids.filter((id) => !orders.some((o) => o.incidentId === id && o.eligible && o.agentId === row.agentId))
    const notesInc: string[] = []
    if (missing.length) {
      notesInc.push(
        `Revise a rota: ${missing.length} ordem(ns) mudaram de status, de agente ou não estão mais agendadas.`,
      )
    }
    setInconsistencies(notesInc)
    setSelectedIds(ids)
    setName(row.name)
    setPlannedDate(row.plannedDate ?? todayYmd())
    setNotes(row.notes ?? '')
    setEditingId(row.id)
    setEditingUpdatedAt(row.updatedAt)
    setManualOrigin({
      lat: row.origin.lat,
      lng: row.origin.lng,
      description: row.origin.description || 'Origem da rota salva',
    })
    setPlan({
      agentId: row.agentId,
      agentName: row.agentName,
      origin: {
        agentId: row.agentId,
        agentName: row.agentName,
        lat: row.origin.lat,
        lng: row.origin.lng,
        description: row.origin.description || '',
        source: row.origin.source,
        recordedAt: row.origin.recordedAt ?? undefined,
      },
      stops: ids
        .map((id) => orders.find((o) => o.incidentId === id))
        .filter((o): o is RoutableOrder => !!o),
      street: {
        geometry: row.geometry ?? { type: 'LineString', coordinates: [] },
        distanceMeters: row.distanceMeters ?? 0,
        durationSeconds: row.durationSeconds ?? 0,
        legs: [],
        waypointOrder: [],
        optimized: row.optimization === 'osrm-trip',
        provider: row.provider ?? 'osrm',
        providerVersion: row.providerVersion ?? '',
      },
      conflicts: Array.isArray((row.constraints as { conflicts?: unknown })?.conflicts)
        ? ((row.constraints as { conflicts: PlannedRoute['conflicts'] }).conflicts ?? [])
        : [],
      scheduleValidated: Boolean((row.constraints as { scheduleValidated?: boolean })?.scheduleValidated),
      optimization: row.optimization ?? 'salvo',
      optimizationNote: 'Rota persistida. Recalcule para atualizar o trajeto.',
    })
    setDirty(false)
    setTab('planejar')
    setToast(`Rota ${row.id} aberta no mapa.`)
  }

  async function cancelRoute(id: string, updatedAt: string) {
    try {
      await patchOperationalRoute(id, { status: 'cancelled', expectedUpdatedAt: updatedAt })
      await loadSaved()
      setToast(`Rota ${id} cancelada.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar.')
    }
  }

  async function duplicate(id: string) {
    try {
      const copy = await duplicateOperationalRoute(id)
      await loadSaved()
      openSaved(copy)
      setToast(`Cópia ${copy.id} criada como rascunho.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível duplicar.')
    }
  }

  async function showHistory(id: string) {
    setHistoryFor(id)
    setHistory(await fetchRouteHistory(id))
  }

  const mapStops = (plan?.stops.length ? plan.stops : selected).map((s, i) => ({
    id: s.incidentId,
    lat: s.lat,
    lng: s.lng,
    sequence: i + 1,
    label: `${s.incidentId} · ${s.title}`,
    subtitle: s.address,
  }))

  const filteredSaved = saved.filter((r) => {
    if (savedAgent && r.agentName !== savedAgent) return false
    if (savedDate && r.plannedDate !== savedDate) return false
    if (savedStatus && r.status !== savedStatus) return false
    if (savedSearch.trim()) {
      const q = savedSearch.toLowerCase()
      if (!r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <PageShell flush>
      <div className="fogo-glass min-w-0 shrink-0 border-b border-fogo-border/80 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Rotas</p>
            <p className="text-[11px] text-fogo-muted">
              Planejamento viário das ordens agendadas. Não altera o status operacional da OS.
            </p>
          </div>
          {dirty && <span className="text-[11px] text-fogo-warning">Alterações não salvas</span>}
        </div>
        <OpsTabBar className="mt-3" aria-label="Seções de rotas">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'planejar'}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'planejar' ? 'bg-fogo-accent text-white' : 'text-fogo-muted hover:bg-fogo-bg'}`}
            onClick={() => setTab('planejar')}
          >
            Planejar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'salvas'}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'salvas' ? 'bg-fogo-accent text-white' : 'text-fogo-muted hover:bg-fogo-bg'}`}
            onClick={() => setTab('salvas')}
          >
            Rotas salvas
          </button>
        </OpsTabBar>
      </div>

      <TabLoadScreen ready={ready}>
        {tab === 'planejar' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)_300px]">
            <aside className="flex min-h-0 flex-col border-b border-fogo-border lg:border-b-0 lg:border-r">
              <div className="space-y-2 border-b border-fogo-border p-3">
                <p className="text-[12px] font-medium text-fogo-text">
                  {cityName || 'Cidade não cadastrada'}
                  <span className="font-normal text-fogo-muted">
                    {' '}
                    · {agentOptions.length} agente{agentOptions.length === 1 ? '' : 's'}
                  </span>
                </p>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Número da ordem"
                  className="h-8 w-full rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm text-fogo-text"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-surface px-1 text-xs text-fogo-text">
                    <option value="">Agente</option>
                    {agentOptions.map((agent) => (
                      <option key={agent.agentId} value={agent.agentId}>{agent.agentName}</option>
                    ))}
                  </select>
                  <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-1 text-xs" />
                  <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-surface px-1 text-xs text-fogo-text">
                    <option value="">Cidade</option>
                    {cities.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-1 text-xs">
                    <option value="">Tipo</option>
                    {types.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-fogo-muted">
                  {selectedIds.length} selecionada{selectedIds.length === 1 ? '' : 's'} · {filtered.length} na lista
                </p>
                {error && <p className="text-[12px] text-red-500">{error}</p>}
              </div>
              <OpsFlushBody>
                {filtered.length === 0 ? (
                  <p className="p-4 text-sm text-fogo-muted">
                    {orders.length === 0
                      ? 'Nenhuma ordem agendada. Agende uma OS na agenda ou na lista de ordens para montar a rota.'
                      : 'Nenhuma ordem agendada com os filtros atuais.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-fogo-border">
                    {filtered.map((row) => {
                      const checked = selectedIds.includes(row.incidentId)
                      return (
                        <li key={row.incidentId} className={`px-3 py-2.5 ${row.eligible ? '' : 'opacity-60'}`}>
                          <label className="flex cursor-pointer gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              disabled={!row.eligible && !checked}
                              onChange={() => toggleOrder(row)}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{row.incidentId}</p>
                              <p className="truncate text-[12px] text-fogo-text">{row.title}</p>
                              <p className="text-[11px] text-fogo-muted">{row.agentName || 'Sem agente'}</p>
                              <p className="text-[11px] text-fogo-muted">
                                {row.scheduledStart ? formatDateTime(row.scheduledStart) : 'Sem horário'}
                              </p>
                              <p className="truncate text-[11px] text-fogo-muted">{row.address}</p>
                              <p className="text-[11px] text-fogo-muted">{row.city || cityName || '—'}</p>
                              <Badge className="mt-1">{row.status}</Badge>
                              {row.blockReason && (
                                <p className="mt-1 text-[11px] text-fogo-warning">{row.blockReason}</p>
                              )}
                            </div>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </OpsFlushBody>
            </aside>

            <section className="relative min-h-[320px] min-w-0">
              <RoutesMap
                origin={origin ? { lat: origin.lat, lng: origin.lng, label: origin.description } : null}
                stops={mapStops}
                geometry={plan?.street.geometry}
                previewStraight={planning}
                pickMode={pickOrigin || needsOrigin}
                onPick={(lat, lng) => {
                  setManualOrigin({ lat, lng, description: 'Ponto informado no mapa' })
                  setPickOrigin(false)
                  setError('')
                }}
                selectedStopId={selectedStopId}
                onSelectStop={setSelectedStopId}
              />
            </section>

            <aside className="flex min-h-0 flex-col border-t border-fogo-border lg:border-l lg:border-t-0">
              <OpsFlushBody className="p-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-fogo-muted">Agente</p>
                    <p className="text-sm font-medium">{selectedAgentName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-fogo-muted">Ponto de partida</p>
                    {origin ? (
                      <>
                        <p className="text-sm">{origin.description}</p>
                        <p className="text-[11px] text-fogo-muted">
                          {ORIGIN_LABEL[origin.source] ?? origin.source}
                          {origin.recordedAt ? ` · ${formatDateTime(origin.recordedAt)}` : ''}
                          {origin.stale ? ' · pode não ser a posição atual' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-fogo-warning">Indisponível — clique no mapa para informar.</p>
                    )}
                    <Button size="xs" variant="ghost" className="mt-1" onClick={() => setPickOrigin(true)}>
                      Redefinir origem no mapa
                    </Button>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-fogo-muted">Paradas</p>
                    <ul className="mt-1 space-y-1">
                      {(plan?.stops.length ? plan.stops : selected).map((s, i) => (
                        <li key={s.incidentId} className="flex items-start gap-1 rounded-md border border-fogo-border/70 px-2 py-1.5">
                          <span className="mt-0.5 w-5 text-xs font-semibold text-fogo-accent">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium">{s.incidentId}</p>
                            <p className="truncate text-[11px] text-fogo-muted">{s.address}</p>
                          </div>
                          <div className="flex flex-col">
                            <button type="button" className="text-fogo-muted hover:text-fogo-text" onClick={() => moveStop(i, -1)} aria-label="Subir parada">
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" className="text-fogo-muted hover:text-fogo-text" onClick={() => moveStop(i, 1)} aria-label="Descer parada">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <p className="text-fogo-muted">Distância</p>
                      <p className="font-medium">{formatDistance(plan?.street.distanceMeters)}</p>
                    </div>
                    <div>
                      <p className="text-fogo-muted">Deslocamento</p>
                      <p className="font-medium">{formatDuration(plan?.street.durationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-fogo-muted">Ordens</p>
                      <p className="font-medium">{selectedIds.length}</p>
                    </div>
                    <div>
                      <p className="text-fogo-muted">Data</p>
                      <input type="date" value={plannedDate} onChange={(e) => { setPlannedDate(e.target.value); setDirty(true) }} className="h-7 w-full rounded border border-fogo-border bg-fogo-bg px-1 text-xs" />
                    </div>
                  </div>

                  {plan && (
                    <p className="text-[11px] text-fogo-muted">{plan.optimizationNote}</p>
                  )}
                  {!plan?.scheduleValidated && plan && (
                    <p className="text-[11px] text-fogo-warning">
                      Estimativa de deslocamento. A viabilidade dos agendamentos não foi validada integralmente.
                    </p>
                  )}
                  {plan?.conflicts.map((c) => (
                    <p key={c.incidentId} className="text-[11px] text-fogo-warning">
                      {c.incidentId}: {c.reason}
                    </p>
                  ))}
                  {inconsistencies.map((t) => (
                    <p key={t} className="text-[11px] text-fogo-warning">{t}</p>
                  ))}

                  <label className="block">
                    <span className="text-[11px] text-fogo-muted">Nome da rota</span>
                    <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true) }} className="mt-0.5 h-8 w-full rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-fogo-muted">Observações</span>
                    <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true) }} rows={2} className="mt-0.5 w-full rounded-md border border-fogo-border bg-fogo-bg px-2 py-1 text-sm" />
                  </label>

                  {selectionError && <p className="text-[12px] text-fogo-warning">{selectionError}</p>}
                  {error && <p className="text-[12px] text-red-500">{error}</p>}
                  {toast && <p className="text-[12px] text-fogo-success">{toast}</p>}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!selectedIds.length || planning}
                      onClick={() => void calculate(true)}
                    >
                      <RouteIcon className="h-3.5 w-3.5" />
                      {planning ? 'Calculando…' : selectedIds.length > 1 ? 'Roteirizar' : 'Calcular rota'}
                    </Button>
                    <Button size="sm" disabled={!plan || planning} onClick={() => void calculate(false, selectedIds)}>
                      Recalcular
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="primary" disabled={!plan || saving} onClick={() => void save()}>
                        {saving ? 'Salvando…' : editingId ? 'Atualizar rota' : 'Salvar rota'}
                      </Button>
                    )}
                  </div>
                </div>
              </OpsFlushBody>
            </aside>
          </div>
        ) : (
          <OpsFlushBody className="p-4">
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <input
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Nome ou identificador"
                className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm"
              />
              <select value={savedAgent} onChange={(e) => setSavedAgent(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm">
                <option value="">Agente</option>
                {[...new Set(saved.map((r) => r.agentName))].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <input type="date" value={savedDate} onChange={(e) => setSavedDate(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm" />
              <select value={savedStatus} onChange={(e) => setSavedStatus(e.target.value)} className="h-8 rounded-md border border-fogo-border bg-fogo-bg px-2 text-sm">
                <option value="">Status</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {filteredSaved.length === 0 ? (
              <p className="text-sm text-fogo-muted">Nenhuma rota salva com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-fogo-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-fogo-bg text-[11px] uppercase text-fogo-muted">
                    <tr>
                      <th className="px-3 py-2">Rota</th>
                      <th className="px-3 py-2">Agente</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Paradas</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSaved.map((row) => {
                      const locked = row.status === 'in_progress' || row.status === 'completed'
                      return (
                        <tr key={row.id} className="border-t border-fogo-border">
                          <td className="px-3 py-2">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-[11px] text-fogo-muted">{row.id}</p>
                          </td>
                          <td className="px-3 py-2">{row.agentName}</td>
                          <td className="px-3 py-2">{row.plannedDate ?? '—'}</td>
                          <td className="px-3 py-2">{STATUS_LABEL[row.status]}</td>
                          <td className="px-3 py-2">{row.stops.length}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <Button size="xs" onClick={() => openSaved(row)}>Abrir</Button>
                              {canManage && !locked && (
                                <Button size="xs" onClick={() => { openSaved(row); setTab('planejar') }}>Editar</Button>
                              )}
                              {canManage && !locked && (
                                <Button
                                  size="xs"
                                  onClick={() => {
                                    openSaved(row)
                                    void calculate(
                                      true,
                                      row.stops.map((s) => s.incidentId),
                                      {
                                        lat: row.origin.lat,
                                        lng: row.origin.lng,
                                        description: row.origin.description || 'Origem da rota salva',
                                      },
                                    )
                                  }}
                                >
                                  Recalcular
                                </Button>
                              )}
                              {canManage && row.status !== 'cancelled' && !locked && (
                                <Button size="xs" onClick={() => void cancelRoute(row.id, row.updatedAt)}>Cancelar</Button>
                              )}
                              {canManage && (
                                <Button size="xs" onClick={() => void duplicate(row.id)}>Duplicar</Button>
                              )}
                              <Button size="xs" variant="ghost" onClick={() => void showHistory(row.id)}>Histórico</Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {historyFor && (
              <div className="mt-4 rounded-lg border border-fogo-border p-3">
                <p className="text-sm font-medium">Histórico · {historyFor}</p>
                <ul className="mt-2 space-y-1 text-[12px] text-fogo-muted">
                  {history.length === 0 && <li>Sem alterações registradas.</li>}
                  {history.map((h, i) => (
                    <li key={`${h.created_at}-${i}`}>
                      {formatDateTime(h.created_at)} · {h.action} · {h.performed_by ?? '—'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            {toast && <p className="mt-3 text-sm text-fogo-success">{toast}</p>}
          </OpsFlushBody>
        )}
      </TabLoadScreen>
    </PageShell>
  )
}
