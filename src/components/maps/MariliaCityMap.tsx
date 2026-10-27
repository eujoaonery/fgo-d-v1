import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { useOpsData } from '@/context/OpsDataContext'
import { addStreetBasemap } from '@/lib/mapTiles'
import { mapViewOf } from '@/lib/mapMunicipality'
import type { AssetAlertSummary } from '@/lib/mapAlerts'
import { mapPinHtml } from '@/lib/mapGlyph'
import { CADASTRAL_LABELS, CADASTRAL_PIN_COLOR } from '@/lib/assetTruth'
import type { CadastralStatus, MapMarkerKind } from '@/types'
import { cn } from '@/lib/cn'
import { useTheme } from '@/context/ThemeContext'

export type MariliaMapPoint = {
  id: string
  lat: number
  lng: number
  kind: MapMarkerKind
  name: string
  category?: string
  subtitle?: string
  status?: string
  cadastralStatus?: CadastralStatus
  role?: 'cadastro' | 'corrente' | 'ocorrencia' | 'equipe'
  alert?: AssetAlertSummary
}

export type MapHeatPoint = { lat: number; lng: number; weight: number; id?: string }

export type WeatherMeshCell = {
  lat: number
  lng: number
  halfLat: number
  halfLng: number
  tone: 'sol' | 'nublado' | 'vento' | 'chuva'
  label: string
}

const WEATHER_FILL: Record<WeatherMeshCell['tone'], string> = {
  sol: '#f5c542',
  nublado: '#64748b',
  vento: '#38bdf8',
  chuva: '#1d4ed8',
}

export type MapViewport = {
  north: number
  south: number
  east: number
  west: number
  zoom: number
  visibleCount: number
}

const KIND_COLOR: Record<MapMarkerKind, string> = {
  camera: '#38bdf8',
  semaforo: '#34d399',
  sensor: '#a78bfa',
  conectividade: '#22d3ee',
  equipe: '#60a5fa',
  ocorrencia: '#f87171',
  movel: '#fbbf24',
}

type Props = {
  points: MariliaMapPoint[]
  selectedId?: string | null
  onSelect?: (point: MariliaMapPoint) => void
  onPick?: (lat: number, lng: number) => void
  pickMode?: boolean
  interactive?: boolean
  className?: string
  heightClass?: string
  heatPoints?: MapHeatPoint[]
  heatEnabled?: boolean
  weatherCells?: WeatherMeshCell[]
  visibleOnly?: boolean
  cluster?: boolean
  onViewportChange?: (view: MapViewport) => void
  /** Muda ao entrar de novo na aba — recentra na cidade configurada. */
  resetViewKey?: string | number
}

function clusterCellSize(zoom: number): number {
  if (zoom >= 17) return 0
  if (zoom >= 16) return 0.002
  if (zoom >= 15) return 0.005
  if (zoom >= 14) return 0.012
  if (zoom >= 13) return 0.024
  return 0.05
}

function clusterIcon(count: number): L.DivIcon {
  const size = count > 40 ? 44 : count > 12 ? 38 : 32
  return L.divIcon({
    className: 'fogo-cluster-icon',
    html: `<span class="fogo-cluster">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function MariliaCityMap({
  points,
  selectedId,
  onSelect,
  onPick,
  pickMode,
  interactive = true,
  className,
  heightClass = 'h-full',
  heatPoints,
  heatEnabled,
  weatherCells,
  visibleOnly = true,
  cluster = true,
  onViewportChange,
  resetViewKey,
}: Props) {
  const { isDark } = useTheme()
  const { mapHome, dataReady } = useOpsData()
  const frame = mapViewOf(mapHome)
  const frameKey = mapHome ? String(mapHome.ibgeId) : 'marilia'
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const heatRef = useRef<L.LayerGroup | null>(null)
  const weatherRef = useRef<L.LayerGroup | null>(null)
  const onSelectRef = useRef(onSelect)
  const onPickRef = useRef(onPick)
  const pickModeRef = useRef(pickMode)
  const onViewportRef = useRef(onViewportChange)
  onSelectRef.current = onSelect
  onPickRef.current = onPick
  pickModeRef.current = pickMode
  onViewportRef.current = onViewportChange

  const [view, setView] = useState<{ zoom: number; bounds: L.LatLngBounds | null }>({
    zoom: 12,
    bounds: null,
  })
  const homeAfterData = useRef(false)

  useEffect(() => {
    if (!dataReady) return
    const el = hostRef.current
    if (!el || mapRef.current) return
    homeAfterData.current = false
    const bounds = L.latLngBounds(
      [frame.bounds.south, frame.bounds.west],
      [frame.bounds.north, frame.bounds.east],
    )
    const map = L.map(el, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      attributionControl: true,
      minZoom: frame.minZoom,
      maxZoom: 18,
      maxBounds: bounds.pad(0.08),
    }).setView([frame.lat, frame.lng], frame.zoom)
    addStreetBasemap(map)
    const weather = L.layerGroup().addTo(map)
    const group = L.layerGroup().addTo(map)
    const heat = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = group
    heatRef.current = heat
    weatherRef.current = weather
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!pickModeRef.current || !onPickRef.current) return
      onPickRef.current(e.latlng.lat, e.latlng.lng)
    })
    const emitView = () => {
      setView({ zoom: map.getZoom(), bounds: map.getBounds() })
    }
    const goHome = () => {
      map.invalidateSize()
      map.setView([frame.lat, frame.lng], frame.zoom, { animate: false })
      emitView()
    }
    map.on('moveend', emitView)
    map.on('zoomend', emitView)
    const t1 = window.setTimeout(goHome, 80)
    const t2 = window.setTimeout(goHome, 400)
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      ro.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
      heatRef.current = null
      weatherRef.current = null
    }
  }, [interactive, dataReady, frameKey, frame.lat, frame.lng, frame.zoom, frame.minZoom, frame.bounds.south, frame.bounds.north, frame.bounds.west, frame.bounds.east])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.invalidateSize()
    map.setView([frame.lat, frame.lng], frame.zoom, { animate: false })
    homeAfterData.current = false
  }, [resetViewKey, frame.lat, frame.lng, frame.zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !points.length || homeAfterData.current) return
    homeAfterData.current = true
    map.invalidateSize()
    map.setView([frame.lat, frame.lng], frame.zoom, { animate: false })
  }, [points.length, frame.lat, frame.lng, frame.zoom])

  const visible = useMemo(() => {
    if (!visibleOnly || !view.bounds) return points
    return points.filter((p) => view.bounds!.contains([p.lat, p.lng]))
  }, [points, visibleOnly, view.bounds])

  const heatVisible = useMemo(() => {
    const src = heatPoints ?? []
    if (!visibleOnly || !view.bounds) return src
    return src.filter((p) => view.bounds!.contains([p.lat, p.lng]))
  }, [heatPoints, visibleOnly, view.bounds])

  useEffect(() => {
    if (!onViewportRef.current || !view.bounds) return
    onViewportRef.current({
      north: view.bounds.getNorth(),
      south: view.bounds.getSouth(),
      east: view.bounds.getEast(),
      west: view.bounds.getWest(),
      zoom: view.zoom,
      visibleCount: visible.length,
    })
  }, [view, visible.length])

  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    const cell = cluster ? clusterCellSize(view.zoom) : 0
    const singles: MariliaMapPoint[] = []
    const clusters: { lat: number; lng: number; count: number }[] = []
    if (!cell) {
      singles.push(...visible)
    } else {
      const buckets = new Map<string, MariliaMapPoint[]>()
      for (const p of visible) {
        const key = `${Math.round(p.lat / cell)}_${Math.round(p.lng / cell)}`
        const list = buckets.get(key)
        if (list) list.push(p)
        else buckets.set(key, [p])
      }
      for (const list of buckets.values()) {
        if (list.length === 1) {
          singles.push(list[0])
          continue
        }
        clusters.push({
          lat: list.reduce((s, p) => s + p.lat, 0) / list.length,
          lng: list.reduce((s, p) => s + p.lng, 0) / list.length,
          count: list.length,
        })
      }
    }

    for (const c of clusters) {
      const marker = L.marker([c.lat, c.lng], {
        icon: clusterIcon(c.count),
        keyboard: false,
        zIndexOffset: 600,
      })
      marker.bindTooltip(`${c.count} pontos — aproxime o zoom`, { direction: 'top', opacity: 0.95 })
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        map.setView([c.lat, c.lng], Math.min(18, map.getZoom() + 2))
      })
      marker.addTo(group)
    }

    for (const p of singles) {
      const color =
        (p.role === 'cadastro' || p.role === 'corrente') && p.cadastralStatus
          ? CADASTRAL_PIN_COLOR[p.cadastralStatus]
          : (KIND_COLOR[p.kind] ?? '#38bdf8')
      const isLive = p.role === 'corrente'
      const isBase = p.role === 'cadastro' && p.kind === 'movel'
      const selected = selectedId === p.id && !isLive
      const size = selected ? 34 : isLive ? 30 : 30
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'fogo-map-glyph-icon',
          html: mapPinHtml({
            color,
            category: p.category,
            kind: p.kind,
            selected,
            alert: Boolean(p.alert),
            live: isLive,
            base: isBase,
            inactive: p.status === 'inativo' || p.status === 'offline',
          }),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: false,
        zIndexOffset: selected ? 800 : p.alert ? 500 : isLive ? 350 : p.role === 'equipe' ? 400 : 200,
      })
      marker.bindTooltip(pointTooltip(p), { direction: 'top', opacity: 0.95, offset: [0, -size / 2] })
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        onSelectRef.current?.(p)
      })
      marker.addTo(group)
      if (p.alert && p.role !== 'corrente') {
        const badge = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: 'fogo-alert-badge-icon',
            html: alertPinHtml(p.alert),
            iconSize: [148, 22],
            iconAnchor: [20, 34],
          }),
          interactive: true,
          keyboard: false,
        })
        badge.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev)
          onSelectRef.current?.(p)
        })
        badge.addTo(group)
      }
    }
  }, [visible, selectedId, pickMode, cluster, view.zoom])

  useEffect(() => {
    const heat = heatRef.current
    if (!heat) return
    heat.clearLayers()
    if (!heatEnabled) return
    for (const p of heatVisible) {
      L.circle([p.lat, p.lng], {
        radius: 70 + p.weight * 160,
        stroke: false,
        fillColor: p.weight > 0.7 ? '#b91c1c' : p.weight > 0.4 ? '#c2410c' : '#ca8a04',
        fillOpacity: Math.min(0.45, 0.12 + p.weight * 0.28),
        interactive: false,
      }).addTo(heat)
    }
  }, [heatEnabled, heatVisible])

  useEffect(() => {
    const layer = weatherRef.current
    if (!layer) return
    layer.clearLayers()
    for (const cell of weatherCells ?? []) {
      const bounds = L.latLngBounds(
        [cell.lat - cell.halfLat, cell.lng - cell.halfLng],
        [cell.lat + cell.halfLat, cell.lng + cell.halfLng],
      )
      const rect = L.rectangle(bounds, {
        stroke: false,
        fillColor: WEATHER_FILL[cell.tone],
        fillOpacity: 0.46,
        interactive: true,
      })
      rect.bindTooltip(cell.label, { sticky: true })
      rect.addTo(layer)
    }
  }, [weatherCells])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.invalidateSize()
  }, [heightClass])

  return (
    <div className={cn('relative min-h-[240px] overflow-hidden', heightClass, className)}>
      <div
        ref={hostRef}
        className={cn(
          'absolute inset-0 z-0 bg-fogo-bg [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-fogo-bg',
          isDark && 'fogo-map-dark',
        )}
      />
    </div>
  )
}

function pointTooltip(p: MariliaMapPoint): string {
  const extra = p.alert
    ? `<br/><span class="fogo-map-tip-alert">${escapeHtml(p.alert.label)}</span>`
    : p.role === 'corrente'
      ? '<br/>posição corrente'
      : p.role === 'cadastro' && p.kind === 'movel'
        ? '<br/>base cadastral'
        : p.role === 'equipe'
          ? '<br/>agente — clique para o dossiê'
          : p.role === 'ocorrencia'
            ? '<br/>ordem de serviço'
            : ''
  const cat =
    p.category && p.category !== 'equipe' && p.category !== 'ocorrencia'
      ? `<br/>${escapeHtml(p.category)}`
      : ''
  const situation = p.cadastralStatus ? `<br/>${escapeHtml(CADASTRAL_LABELS[p.cadastralStatus])}` : ''
  return `<strong>${escapeHtml(p.name)}</strong>${cat}${situation}${p.subtitle ? `<br/>${escapeHtml(p.subtitle)}` : ''}${extra}`
}

function alertPinHtml(alert: AssetAlertSummary): string {
  const tone =
    alert.severity === 'crítica' || alert.severity === 'alta'
      ? 'alta'
      : alert.severity === 'média'
        ? 'media'
        : 'baixa'
  const mark = alert.count > 1 ? String(alert.count) : '!'
  const text = alert.label.length > 28 ? `${alert.label.slice(0, 27)}…` : alert.label
  return `<div class="fogo-alert-pin fogo-alert-pin--${tone}"><span class="fogo-alert-pin__mark">${escapeHtml(mark)}</span><span class="fogo-alert-pin__text">${escapeHtml(text)}</span></div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
