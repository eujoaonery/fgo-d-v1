import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useOpsData } from '@/context/OpsDataContext'
import { addStreetBasemap } from '@/lib/mapTiles'
import { mapViewOf } from '@/lib/mapMunicipality'
import type { StreetRouteGeometry } from '@/lib/api'

export type RouteMapStop = {
  id: string
  lat: number
  lng: number
  sequence: number
  label: string
  subtitle?: string
}

type Props = {
  origin?: { lat: number; lng: number; label: string } | null
  stops: RouteMapStop[]
  geometry?: StreetRouteGeometry | null
  previewStraight?: boolean
  pickMode?: boolean
  onPick?: (lat: number, lng: number) => void
  onSelectStop?: (id: string) => void
  selectedStopId?: string | null
  className?: string
}

function numberIcon(n: number, selected: boolean) {
  return L.divIcon({
    className: 'fogo-route-pin',
    html: `<span style="display:flex;height:26px;width:26px;align-items:center;justify-content:center;border-radius:999px;background:${selected ? '#0f766e' : '#0d9488'};color:#fff;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function originIcon() {
  return L.divIcon({
    className: 'fogo-route-pin',
    html: `<span style="display:flex;height:28px;width:28px;align-items:center;justify-content:center;border-radius:999px;background:#2563eb;color:#fff;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff">A</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function RoutesMap({
  origin,
  stops,
  geometry,
  previewStraight,
  pickMode,
  onPick,
  onSelectStop,
  selectedStopId,
  className,
}: Props) {
  const { mapHome, dataReady } = useOpsData()
  const frame = mapViewOf(mapHome)
  const frameKey = mapHome ? String(mapHome.ibgeId) : 'marilia'
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  const pickModeRef = useRef(pickMode)
  const onSelectRef = useRef(onSelectStop)
  onPickRef.current = onPick
  pickModeRef.current = pickMode
  onSelectRef.current = onSelectStop

  useEffect(() => {
    if (!dataReady) return
    const el = hostRef.current
    if (!el || mapRef.current) return
    const bounds = L.latLngBounds(
      [frame.bounds.south, frame.bounds.west],
      [frame.bounds.north, frame.bounds.east],
    )
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      minZoom: frame.minZoom,
      maxZoom: 18,
      maxBounds: bounds.pad(0.08),
    }).setView([frame.lat, frame.lng], frame.zoom)
    addStreetBasemap(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!pickModeRef.current || !onPickRef.current) return
      onPickRef.current(e.latlng.lat, e.latlng.lng)
    })
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [dataReady, frameKey, frame.lat, frame.lng, frame.zoom, frame.minZoom, frame.bounds.south, frame.bounds.north, frame.bounds.west, frame.bounds.east])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const fit: L.LatLngExpression[] = []

    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: originIcon() })
        .bindPopup(origin.label)
        .addTo(layer)
      fit.push([origin.lat, origin.lng])
    }

    for (const stop of stops) {
      const marker = L.marker([stop.lat, stop.lng], {
        icon: numberIcon(stop.sequence, selectedStopId === stop.id),
      })
        .bindPopup(`<strong>${stop.sequence}. ${stop.label}</strong>${stop.subtitle ? `<br/>${stop.subtitle}` : ''}`)
        .addTo(layer)
      marker.on('click', () => onSelectRef.current?.(stop.id))
      fit.push([stop.lat, stop.lng])
    }

    if (geometry?.coordinates?.length >= 2) {
      const latlngs = geometry.coordinates.map(([lng, lat]) => [lat, lng] as L.LatLngExpression)
      L.polyline(latlngs, { color: '#0d9488', weight: 5, opacity: 0.92 }).addTo(layer)
      fit.push(...latlngs)
    } else if (previewStraight && origin && stops.length) {
      const latlngs: L.LatLngExpression[] = [[origin.lat, origin.lng], ...stops.map((s) => [s.lat, s.lng] as L.LatLngExpression)]
      L.polyline(latlngs, {
        color: '#94a3b8',
        weight: 3,
        dashArray: '7 8',
        opacity: 0.75,
      }).addTo(layer)
    }

    if (fit.length >= 2) {
      map.fitBounds(L.latLngBounds(fit), { padding: [36, 36], maxZoom: 16 })
    } else if (fit.length === 1) {
      map.setView(fit[0]!, 15)
    }
    window.setTimeout(() => map.invalidateSize(), 40)
  }, [origin, stops, geometry, previewStraight, selectedStopId])

  return (
    <div className={className ?? 'relative h-full min-h-[280px] w-full'}>
      <div ref={hostRef} className="absolute inset-0 z-0" />
      {pickMode && (
        <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-fogo-surface/95 px-2 py-1 text-[11px] text-fogo-text shadow">
          Clique no mapa para definir o ponto de partida
        </p>
      )}
      {previewStraight && !geometry && (
        <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-fogo-surface/95 px-2 py-1 text-[11px] text-fogo-muted shadow">
          Referência reta — calculando o trajeto pelas ruas
        </p>
      )}
    </div>
  )
}
