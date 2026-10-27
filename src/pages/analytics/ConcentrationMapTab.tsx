import { useMemo, useState } from 'react'
import { MariliaCityMap, type MapViewport } from '@/components/maps/MariliaCityMap'
import { Card } from '@/components/ui/Card'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { useOpsData } from '@/context/OpsDataContext'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import {
  HEAT_PERIOD_LABEL,
  HEAT_VARIABLE_LABEL,
  buildHeatPoints,
  type HeatVariable,
} from '@/lib/mapHeat'
import { formatAssetAddress, parseAssetLocation, plottableAssetPoint } from '@/lib/mariliaAddresses'
import { categoryToMarkerKind } from '@/lib/markerKind'
import type { ChartPeriod } from '@/types'

export function ConcentrationMapTab({ period, onPeriod }: { period: ChartPeriod; onPeriod: (p: ChartPeriod) => void }) {
  const { assets, alerts, incidents, apiConnected, mapHome } = useOpsData()
  const mapBounds = mapHome?.bbox
  const { openAsset } = useAssetDossier()
  const [variable, setVariable] = useState<HeatVariable>('alertas')
  const [viewport, setViewport] = useState<MapViewport | null>(null)

  const heat = useMemo(
    () => buildHeatPoints({ variable, period, assets, alerts, incidents, bounds: mapBounds }),
    [variable, period, assets, alerts, incidents, mapBounds],
  )

  const points = useMemo(
    () =>
      assets
        .map((a) => {
          const loc = plottableAssetPoint(a, mapBounds)
          if (!loc) return null
          return {
            id: a.id,
            lat: loc.lat,
            lng: loc.lng,
            kind: categoryToMarkerKind(a.category),
            category: a.category,
            name: a.name,
            subtitle: (() => {
              const stored = parseAssetLocation(a.location)
              return stored ? formatAssetAddress(stored) : a.region
            })(),
            status: a.status,
            role: 'cadastro' as const,
          }
        })
        .filter((p): p is NonNullable<typeof p> => p != null),
    [assets, mapBounds],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Concentração espacial</p>
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-xs"
          value={variable}
          onChange={(e) => setVariable(e.target.value as HeatVariable)}
          aria-label="Variável do mapa de calor"
        >
          {(Object.keys(HEAT_VARIABLE_LABEL) as HeatVariable[]).map((k) => (
            <option key={k} value={k}>
              {HEAT_VARIABLE_LABEL[k]}
            </option>
          ))}
        </select>
        <PeriodSelect value={period} onChange={onPeriod} />
      </div>
      <p className="text-[11px] text-fogo-muted">
        Calor: {HEAT_VARIABLE_LABEL[variable]} · {HEAT_PERIOD_LABEL[period]}. Só a área visível entra na consulta.
        Agrupamento automático até o zoom 16.
      </p>
      <Card className="overflow-hidden p-0">
        <MariliaCityMap
          heightClass="h-[420px] lg:h-[520px]"
          points={points}
          heatEnabled
          heatPoints={heat}
          visibleOnly
          cluster
          onViewportChange={setViewport}
          onSelect={(p) => openAsset(p.id)}
        />
      </Card>
      <p className="text-[11px] text-fogo-muted">
        {apiConnected
          ? `${viewport?.visibleCount ?? points.length} ativos na área visível · ${heat.length} pontos de calor no período`
          : 'Aguardando o serviço'}
      </p>
    </div>
  )
}
