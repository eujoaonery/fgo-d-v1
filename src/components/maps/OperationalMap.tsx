import type { ComponentType } from 'react'
import {
  AlertTriangle,
  Camera,
  Car,
  Layers,
  Radio,
  TrafficCone,
  Users,
  Wifi,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { formatAssetAddress, parseAssetLocation, plottableAssetPoint } from '@/lib/mariliaAddresses'
import { isMobileLocationType, validateCoordinates } from '@/lib/mariliaGeo'
import { alertSummaryForAsset, summarizeAssetAlerts } from '@/lib/mapAlerts'
import { MariliaCityMap, type MariliaMapPoint } from '@/components/maps/MariliaCityMap'
import type { CadastralStatus, ChartPeriod, MapMarkerKind } from '@/types'
import { CADASTRAL_LABELS, CADASTRAL_PIN_COLOR, normalizeCadastral } from '@/lib/assetTruth'
import {
  AGENT_FUNCTIONAL_LABELS,
} from '@/lib/agents'
import { capabilityLabel } from '@/lib/teamCapabilities'
import {
  HEAT_PERIOD_LABEL,
  HEAT_VARIABLE_LABEL,
  buildHeatPoints,
  type HeatVariable,
} from '@/lib/mapHeat'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { categoryToMarkerKind } from '@/lib/markerKind'
import { osTitle } from '@/lib/workOrders'

const layerConfig: {
  id: MapMarkerKind | 'all'
  label: string
  icon?: ComponentType<{ className?: string }>
}[] = [
  { id: 'all', label: 'Todos os ativos', icon: Layers },
  { id: 'camera', label: 'Câmeras e radares', icon: Camera },
  { id: 'semaforo', label: 'Semáforos', icon: TrafficCone },
  { id: 'sensor', label: 'Sensores e totens', icon: Radio },
  { id: 'conectividade', label: 'Conectividade', icon: Wifi },
  { id: 'movel', label: 'Frota e móveis', icon: Car },
  { id: 'equipe', label: 'Agentes', icon: Users },
  { id: 'ocorrencia', label: 'Ordens de serviço', icon: AlertTriangle },
]

interface OperationalMapProps {
  className?: string
  variant?: 'overview' | 'full'
  onOpenIncident?: (incidentId: string) => void
}

export function OperationalMap({ className, onOpenIncident }: OperationalMapProps) {
  const { mapMarkers, alerts, incidents, assets, teams, mapHome } = useOpsData()
  const mapBounds = mapHome?.bbox
  const { region } = useOpsFilter()
  const [layers, setLayers] = useState<Set<string>>(() => new Set(['all']))
  const [assetCategory, setAssetCategory] = useState('')
  const [agentRole, setAgentRole] = useState('')
  const [groupAssets, setGroupAssets] = useState(true)
  const [cadastralFilter, setCadastralFilter] = useState<CadastralStatus | ''>('')
  const { openAsset } = useAssetDossier()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [heatVariable, setHeatVariable] = useState<HeatVariable | 'off'>('alertas')
  const [heatPeriod, setHeatPeriod] = useState<ChartPeriod>('24h')
  const location = useLocation()

  const points = useMemo(() => {
    const out: MariliaMapPoint[] = []
    const allow = (kind: MapMarkerKind) => layers.has('all') || layers.has(kind)
    const alertsByAsset = summarizeAssetAlerts(alerts)
    const byAssetId = new Map(assets.map((a) => [a.id, a]))
    for (const a of assets) {
      if (region && a.region !== region) continue
      if (assetCategory && a.category !== assetCategory) continue
      const cadastralStatus = normalizeCadastral(a.cadastralStatus)
      if (cadastralFilter && cadastralStatus !== cadastralFilter) continue
      const point = plottableAssetPoint(a, mapBounds)
      if (!point) continue
      const loc = parseAssetLocation(a.location)
      const kind = categoryToMarkerKind(a.category)
      if (!allow(kind)) continue
      const alert = alertSummaryForAsset(a, alertsByAsset)
      out.push({
        id: a.id,
        lat: point.lat,
        lng: point.lng,
        kind,
        category: a.category,
        name: a.name,
        subtitle: loc ? formatAssetAddress(loc) : a.region,
        status: a.status,
        cadastralStatus,
        role: 'cadastro',
        alert,
      })
      const live = a.liveLocation
      if (live && isMobileLocationType(loc?.locationType) && validateCoordinates(live.lat, live.lng, mapBounds).ok) {
        out.push({
          id: `${a.id}::live`,
          lat: live.lat,
          lng: live.lng,
          kind,
          category: a.category,
          name: a.name,
          subtitle: `posição corrente · ${formatDateTime(live.recordedAt)}`,
          status: a.status,
          cadastralStatus,
          role: 'corrente',
          alert,
        })
      }
    }
    if (allow('equipe')) {
      for (const t of teams) {
        if (region && t.region !== region) continue
        if (agentRole && t.specialty !== agentRole) continue
        const asset = t.assignedIncidentId
          ? byAssetId.get(incidents.find((i) => i.id === t.assignedIncidentId)?.relatedAssetId ?? '')
          : undefined
        const point = asset ? plottableAssetPoint(asset, mapBounds) : null
        if (!point) continue
        out.push({
          id: t.id,
          lat: point.lat,
          lng: point.lng,
          kind: 'equipe',
          category: 'equipe',
          name: t.name,
          subtitle: `${t.specialty} · ${t.region}`,
          status: t.status,
          role: 'equipe',
        })
      }
    }
    if (allow('ocorrencia')) {
      for (const m of mapMarkers.filter((x) => x.kind === 'ocorrencia')) {
        if (region && m.region !== region) continue
        const incident = incidents.find((i) => i.id === m.incidentId)
        const asset = incident?.relatedAssetId ? byAssetId.get(incident.relatedAssetId) : undefined
        const fromAsset = asset ? plottableAssetPoint(asset, mapBounds) : null
        const fromMarker =
          m.lat != null && m.lng != null && validateCoordinates(m.lat, m.lng, mapBounds).ok
            ? { lat: m.lat, lng: m.lng }
            : null
        const c = fromAsset ?? fromMarker
        if (!c) continue
        out.push({
          id: m.incidentId ?? m.id,
          lat: c.lat,
          lng: c.lng,
          kind: 'ocorrencia',
          category: 'ocorrencia',
          name: m.name,
          subtitle: m.region,
          role: 'ocorrencia',
        })
      }
    }
    return out
  }, [assets, teams, mapMarkers, layers, region, alerts, incidents, assetCategory, agentRole, cadastralFilter, mapBounds])

  const heat = useMemo(
    () =>
      heatVariable === 'off'
        ? []
        : buildHeatPoints({ variable: heatVariable, period: heatPeriod, assets, alerts, incidents, bounds: mapBounds }),
    [heatVariable, heatPeriod, assets, alerts, incidents, mapBounds],
  )

  const selected = useMemo(() => {
    const id = selectedId?.replace(/::live$/, '') ?? null
    if (!id) return null
    const marker = mapMarkers.find((m) => m.id === id || m.incidentId === id)
    const agent = teams.find((t) => t.id === id)
    const incident = incidents.find((i) => i.id === id)
    return { id, marker, agent, incident }
  }, [selectedId, mapMarkers, teams, incidents])

  const toggleLayer = (id: string) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (id === 'all') return new Set(['all'])
      next.delete('all')
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size === 0) return new Set(['all'])
      return next
    })
  }

  return (
    <div
      className={cn(
        'relative h-full min-h-0 overflow-hidden rounded-fogo-lg border border-fogo-border bg-slate-900 shadow-fogo-panel',
        className,
      )}
    >
      <div className="absolute left-3 top-3 z-[1200] max-h-[calc(100%-1.5rem)] w-[188px] overflow-y-auto rounded-fogo-md border border-white/20 bg-black/55 p-1.5 shadow-fogo-card backdrop-blur-sm">
        <p className="px-2 py-1 text-[10px] font-medium text-white/70">Camadas</p>
        <ul className="max-h-[240px] space-y-0.5 overflow-y-auto">
          {layerConfig.map(({ id, label, icon: Icon }) => {
            const active = layers.has(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleLayer(id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                    active ? 'bg-sky-950/80 text-sky-100' : 'text-white/70 hover:bg-white/10',
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span>{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 border-t border-white/15 px-2 pt-2">
          <label className="block text-[10px] text-white/70">
            Exibição dos ativos
            <select
              className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
              value={groupAssets ? 'agrupada' : 'separada'}
              onChange={(e) => setGroupAssets(e.target.value === 'agrupada')}
              aria-label="Exibição dos ativos no mapa"
            >
              <option value="agrupada">Agrupada</option>
              <option value="separada">Separada</option>
            </select>
          </label>
          <label className="mt-2 block text-[10px] text-white/70">
            Situação
            <select
              className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
              value={cadastralFilter}
              onChange={(e) => setCadastralFilter(e.target.value as CadastralStatus | '')}
              aria-label="Situação cadastral no mapa"
            >
              <option value="">Todas</option>
              {(Object.keys(CADASTRAL_LABELS) as CadastralStatus[]).map((status) => (
                <option key={status} value={status}>
                  {CADASTRAL_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <ul className="mt-2 space-y-0.5">
            {(Object.keys(CADASTRAL_PIN_COLOR) as CadastralStatus[]).map((status) => (
              <li key={status} className="flex items-center gap-1.5 text-[10px] text-white/75">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CADASTRAL_PIN_COLOR[status] }} />
                {CADASTRAL_LABELS[status]}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] font-medium text-white/70">Mapa de calor</p>
          <select
            className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
            value={heatVariable}
            onChange={(e) => setHeatVariable(e.target.value as HeatVariable | 'off')}
            aria-label="Variável do mapa de calor"
          >
            <option value="off">Desligado</option>
            {(Object.keys(HEAT_VARIABLE_LABEL) as HeatVariable[]).map((k) => (
              <option key={k} value={k}>
                {HEAT_VARIABLE_LABEL[k]}
              </option>
            ))}
          </select>
          {heatVariable !== 'off' ? (
            <select
              className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
              value={heatPeriod}
              onChange={(e) => setHeatPeriod(e.target.value as ChartPeriod)}
              aria-label="Período do mapa de calor"
            >
              {(Object.keys(HEAT_PERIOD_LABEL) as ChartPeriod[]).map((k) => (
                <option key={k} value={k}>
                  {HEAT_PERIOD_LABEL[k]}
                </option>
              ))}
            </select>
          ) : null}
          <label className="mt-2 block text-[10px] text-white/70">
            Categoria do ativo
            <select
              className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
              value={assetCategory}
              onChange={(e) => setAssetCategory(e.target.value)}
            >
              <option value="">Todas</option>
              {[...new Set(assets.map((a) => a.category))].sort().map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-[10px] text-white/70">
            Categoria do agente
            <select
              className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-1.5 py-1 text-[10px] text-white"
              value={agentRole}
              onChange={(e) => setAgentRole(e.target.value)}
            >
              <option value="">Todas</option>
              {[...new Set(teams.map((t) => t.specialty).filter(Boolean))].sort().map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <MariliaCityMap
        className="absolute inset-0"
        points={points}
        selectedId={selectedId}
        heatEnabled={heatVariable !== 'off'}
        heatPoints={heat}
        visibleOnly
        cluster={groupAssets}
        resetViewKey={location.key}
        onSelect={(p) => {
          setSelectedId(p.id)
          if (p.kind !== 'ocorrencia' && p.kind !== 'equipe') {
            openAsset(p.id.replace(/::live$/, ''))
          }
        }}
      />

      {selected?.agent ? (
        <div className="absolute bottom-10 right-3 z-[1200] max-w-[280px] rounded-fogo-md border border-fogo-border bg-fogo-surface/95 p-3 shadow-fogo-panel">
          <p className="text-[11px] font-semibold text-fogo-text">{selected.agent.name}</p>
          <p className="text-[10px] text-fogo-muted">
            {selected.agent.jobTitle || selected.agent.specialty} · {selected.agent.region}
          </p>
          {selected.agent.registrationNumber ? (
            <p className="mt-1 font-mono text-[10px] text-fogo-muted">Matrícula {selected.agent.registrationNumber}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-fogo-muted">
            Operacional: {selected.agent.status}
            {' · '}
            Funcional: {AGENT_FUNCTIONAL_LABELS[selected.agent.functionalStatus ?? 'ativo']}
          </p>
          {selected.agent.responsibleOrg ? (
            <p className="text-[10px] text-fogo-muted">{selected.agent.responsibleOrg}</p>
          ) : null}
          {selected.agent.capabilities.length ? (
            <p className="mt-1 text-[10px] text-fogo-muted">
              {selected.agent.capabilities.map((c) => capabilityLabel(c)).join(', ')}
            </p>
          ) : null}
          {selected.agent.assignedIncidentId ? (
            <p className="mt-1 text-[10px] text-fogo-accent">OS atribuída {selected.agent.assignedIncidentId}</p>
          ) : null}
          {selected.agent.assignedIncidentId && onOpenIncident ? (
            <Button
              variant="primary"
              size="sm"
              className="mt-2 h-7 w-full text-xs"
              onClick={() => onOpenIncident(selected.agent!.assignedIncidentId!)}
            >
              Abrir OS do agente
            </Button>
          ) : null}
        </div>
      ) : null}

      {!selected?.agent && (selected?.incident || selected?.marker?.kind === 'ocorrencia') && onOpenIncident ? (
        <div className="absolute bottom-10 right-3 z-[1200] max-w-[260px] rounded-fogo-md border border-fogo-border bg-fogo-surface/95 p-3 shadow-fogo-panel">
          <p className="text-[11px] font-semibold text-fogo-text">
            {selected.incident ? osTitle(selected.incident) : selected.marker?.name}
          </p>
          {selected.incident?.priority || selected.marker?.priority ? (
            <Badge variant={priorityVariant(selected.incident?.priority ?? selected.marker?.priority ?? 'média')}>
              {selected.incident?.priority ?? selected.marker?.priority}
            </Badge>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            className="mt-2 h-7 w-full text-xs"
            onClick={() => onOpenIncident(selected.incident?.id ?? selected.marker?.incidentId ?? selected.id)}
          >
            Ver ordem de serviço
          </Button>
        </div>
      ) : null}
    </div>
  )
}
