import { useEffect, useMemo, useState } from 'react'
import { CityWeatherSilhouette } from '@/components/maps/CityWeatherSilhouette'
import { MariliaCityMap } from '@/components/maps/MariliaCityMap'
import { WEATHER_FILL } from '@/lib/cityWeatherShape'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useOpsData } from '@/context/OpsDataContext'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { fetchPredictions, fetchRegionalOsForecasts, fetchWeatherGrid, type PredictionRecord, type WeatherGrid } from '@/lib/api'
import { WEATHER_TONE_LABEL, weatherTone, type WeatherTone } from '@/lib/weatherTone'
import { isSystemOccurrence } from '@/lib/cityOccurrence'
import { periodStart } from '@/lib/mapHeat'
import { parseAssetLocation, plottableAssetPoint } from '@/lib/mariliaAddresses'
import type { ChartPeriod, UrbanAsset } from '@/types'

type Layer = 'ocorrencias' | 'os' | 'previsao' | 'clima' | 'comparacao'

const LAYERS: { id: Layer; label: string }[] = [
  { id: 'ocorrencias', label: 'Ocorrências' },
  { id: 'os', label: 'Ordens de serviço' },
  { id: 'previsao', label: 'Previsão' },
  { id: 'clima', label: 'Clima' },
  { id: 'comparacao', label: 'Comparação' },
]

const WEATHER_LEADS = [
  { hours: 0, label: 'Agora' },
  { hours: 3, label: '+3 h' },
  { hours: 6, label: '+6 h' },
  { hours: 12, label: '+12 h' },
  { hours: 24, label: '+1 dia' },
  { hours: 48, label: '+2 dias' },
  { hours: 72, label: '+3 dias' },
  { hours: 120, label: '+5 dias' },
  { hours: 168, label: '+7 dias' },
]

const WEATHER_SWATCH = WEATHER_FILL

function leadCaption(hours: string[], index: number) {
  const stamp = hours[index]
  if (!stamp) return 'aguardando o modelo'
  const when = stamp.slice(0, 16).replace('T', ' ')
  if (index < 24) return `hoje, ${when}`
  return `daqui a ${Math.floor(index / 24)} dia(s), ${when}`
}

function neighborhoodOf(asset: UrbanAsset | undefined): string {
  return parseAssetLocation(asset?.location)?.neighborhood?.trim() || ''
}

function osQty(value: number | undefined) {
  if (value == null) return 'sem base'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function bars(rows: { label: string; value: number }[]) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="text-sm text-fogo-muted">Sem registros neste recorte.</p>
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
          <div className="h-2 rounded-full bg-fogo-border">
            <div className="h-2 rounded-full bg-fogo-accent" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RegionVisionTab({ period }: { period: ChartPeriod }) {
  const { assets, alerts, incidents, mapHome } = useOpsData()
  const mapBounds = mapHome?.bbox
  const { openAsset } = useAssetDossier()
  const [layer, setLayer] = useState<Layer>('ocorrencias')
  const [region, setRegion] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [occurrenceType, setOccurrenceType] = useState('')
  const [osStatus, setOsStatus] = useState('')
  const [horizon, setHorizon] = useState('')
  const [predictions, setPredictions] = useState<PredictionRecord[] | null>(null)
  const [predError, setPredError] = useState<string | null>(null)
  const [osForecasts, setOsForecasts] = useState<PredictionRecord[] | null>(null)
  const [osError, setOsError] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherGrid | null>(null)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [leadHours, setLeadHours] = useState(0)

  useEffect(() => {
    let cancel = false
    setPredError(null)
    fetchPredictions(300)
      .then((rows) => {
        if (!cancel) setPredictions(rows.filter((row) => row.predictionType === 'region_risk'))
      })
      .catch((e: unknown) => {
        if (!cancel) setPredError(e instanceof Error ? e.message : 'Não foi possível ler as previsões.')
      })
    fetchRegionalOsForecasts()
      .then((rows) => {
        if (!cancel) setOsForecasts(rows)
      })
      .catch((e: unknown) => {
        if (!cancel) setOsError(e instanceof Error ? e.message : 'Não foi possível ler a quantidade de OS.')
      })
    fetchWeatherGrid()
      .then((row) => {
        if (!cancel) setWeather(row)
      })
      .catch((e: unknown) => {
        if (!cancel) setWeatherError(e instanceof Error ? e.message : 'Open-Meteo indisponível.')
      })
    return () => {
      cancel = true
    }
  }, [])

  const byAsset = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const from = periodStart(period)
  const regions = useMemo(() => [...new Set(assets.map((a) => a.region).filter(Boolean))].sort(), [assets])
  const neighborhoods = useMemo(
    () => [...new Set(assets.map((a) => neighborhoodOf(a)).filter(Boolean))].sort(),
    [assets],
  )
  const types = useMemo(
    () => [...new Set(alerts.map((a) => a.category).filter(Boolean))].sort(),
    [alerts],
  )

  const occurrences = useMemo(() => {
    return alerts.filter((alert) => {
      if (isSystemOccurrence(alert)) return false
      if (Date.parse(alert.detectedAt) < from) return false
      if (region && alert.region !== region) return false
      if (occurrenceType && alert.category !== occurrenceType) return false
      const asset = byAsset.get(alert.relatedAssetId ?? '')
      if (neighborhood && neighborhoodOf(asset) !== neighborhood) return false
      return true
    })
  }, [alerts, from, region, occurrenceType, neighborhood, byAsset])

  const orders = useMemo(() => {
    return incidents.filter((incident) => {
      if (Date.parse(incident.openedAt) < from) return false
      if (region && incident.region !== region) return false
      if (osStatus && incident.status !== osStatus) return false
      const asset = byAsset.get(incident.relatedAssetId ?? '')
      if (neighborhood && neighborhoodOf(asset) !== neighborhood) return false
      return true
    })
  }, [incidents, from, region, osStatus, neighborhood, byAsset])

  const regionalForecasts = useMemo(() => {
    return (predictions ?? []).filter((row) => {
      if (region && row.region !== region) return false
      if (horizon && String(row.horizonHours) !== horizon) return false
      return true
    })
  }, [predictions, region, horizon])

  const regionalOs = useMemo(() => {
    return (osForecasts ?? []).filter((row) => !region || row.region === region)
  }, [osForecasts, region])

  const map = useMemo(() => {
    if (layer === 'ocorrencias') return heatOf(occurrences, (alert) => byAsset.get(alert.relatedAssetId ?? ''), (alert) => alert.title, mapBounds)
    if (layer === 'os') return heatOf(orders, (incident) => byAsset.get(incident.relatedAssetId ?? ''), (incident) => incident.description, mapBounds)
    if (layer === 'previsao') {
      const centroid = (name: string) => {
        const located = assets.filter((asset) => asset.region === name && plottableAssetPoint(asset, mapBounds))
        if (located.length === 0) return null
        return {
          lat: located.reduce((sum, asset) => sum + plottableAssetPoint(asset, mapBounds)!.lat, 0) / located.length,
          lng: located.reduce((sum, asset) => sum + plottableAssetPoint(asset, mapBounds)!.lng, 0) / located.length,
        }
      }
      const alertPoints = regionalForecasts.flatMap((row) => {
        if (!row.region) return []
        const point = centroid(row.region)
        if (!point) return []
        return [{ id: row.id, ...point, weight: row.probability ?? 0.5, name: row.targetLabel, assetId: undefined as string | undefined }]
      })
      const osPoints = regionalOs.flatMap((row) => {
        if (!row.region) return []
        const point = centroid(row.region)
        if (!point) return []
        return [
          {
            id: `os-${row.id}`,
            lat: point.lat,
            lng: point.lng + 0.004,
            weight: row.probability ?? 0.4,
            name: `${row.region}: ${osQty(row.predictedValue)} OS em 24 h`,
            assetId: undefined as string | undefined,
          },
        ]
      })
      const points = [...alertPoints, ...osPoints]
      return { points, missing: regionalForecasts.length + regionalOs.length - points.length }
    }
    return { points: [], missing: 0 }
  }, [layer, occurrences, orders, regionalForecasts, regionalOs, assets, byAsset, mapBounds])

  const weatherIndex = Math.min(leadHours, Math.max(0, (weather?.hours.length ?? 1) - 1))
  const weatherMesh = useMemo(() => {
    if (!weather?.cells.length) return []
    return weather.cells.map((cell) => {
      const tone = weatherTone({
        code: cell.weatherCode[weatherIndex],
        precipMm: cell.precipMm[weatherIndex],
        windKmh: cell.windKmh[weatherIndex],
        cloudPct: cell.cloudPct[weatherIndex],
      })
      const temp = cell.temperatureC[weatherIndex]
      return {
        lat: cell.lat,
        lng: cell.lng,
        halfLat: cell.halfLat,
        halfLng: cell.halfLng,
        tone,
        label: `${WEATHER_TONE_LABEL[tone]} · ${temp == null ? '—' : `${Math.round(temp)} °C`} · vento ${num(cell.windKmh[weatherIndex])} km/h · chuva ${num(cell.precipMm[weatherIndex])} mm`,
      }
    })
  }, [weather, weatherIndex])
  const toneCounts = countBy(weatherMesh, (cell) => WEATHER_TONE_LABEL[cell.tone])

  const occurrenceBars = countBy(occurrences, (alert) => alert.region || 'Sem região')
  const orderBars = countBy(orders, (incident) => incident.region || 'Sem região')
  const osForecastBars = regionalOs
    .filter((row) => row.predictedValue != null)
    .map((row) => ({ label: row.region || 'Sem região', value: row.predictedValue ?? 0 }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LAYERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              layer === item.id
                ? 'rounded-fogo-md bg-fogo-accent/15 px-2.5 py-1.5 text-xs text-fogo-text'
                : 'rounded-fogo-md px-2.5 py-1.5 text-xs text-fogo-muted'
            }
            onClick={() => setLayer(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Filter label="Região — ocorrências, OS, previsão e comparação" value={region} onChange={setRegion} options={regions} />
        <Filter
          label="Bairro — só o que está ligado a um ativo"
          value={neighborhood}
          onChange={setNeighborhood}
          options={neighborhoods}
        />
        <Filter label="Tipo de ocorrência" value={occurrenceType} onChange={setOccurrenceType} options={types} />
        <Filter
          label="Situação da OS"
          value={osStatus}
          onChange={setOsStatus}
          options={['aberta', 'triagem', 'planejada', 'agendada', 'em deslocamento', 'em atendimento', 'aguardando material', 'resolvida', 'cancelada']}
        />
        <Filter label="Horizonte da previsão (horas)" value={horizon} onChange={setHorizon} options={['24', '48']} />
      </div>
      <p className="text-xs text-fogo-muted">
        O período da página vale para ocorrências e ordens de serviço. No clima, as cores ficam só dentro do contorno de Marília e mudam com o horário, até 7 dias. A previsão mostra o pico regional de alertas e a quantidade de OS em 24 h calculada pelo Prevision Engine.
      </p>

      {layer === 'clima' ? (
        <Card className="space-y-2 p-3">
          <div className="flex flex-wrap gap-1">
            {WEATHER_LEADS.map((step) => (
              <button
                key={step.label}
                type="button"
                className={
                  leadHours === step.hours
                    ? 'rounded-fogo-md bg-fogo-accent/15 px-2 py-1 text-xs text-fogo-text'
                    : 'rounded-fogo-md px-2 py-1 text-xs text-fogo-muted'
                }
                onClick={() => setLeadHours(step.hours)}
              >
                {step.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-fogo-muted">
            Horizonte: {leadCaption(weather?.hours ?? [], weatherIndex)}
            <input
              className="mt-1 w-full"
              type="range"
              min={0}
              max={Math.max(0, (weather?.hours.length ?? 168) - 1)}
              value={weatherIndex}
              onChange={(e) => setLeadHours(Number(e.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-3 text-xs">
            {(Object.keys(WEATHER_TONE_LABEL) as WeatherTone[]).map((tone) => (
              <span key={tone} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: WEATHER_SWATCH[tone] }} />
                {WEATHER_TONE_LABEL[tone]}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {layer !== 'comparacao' ? (
        <Card className="overflow-hidden">
          <div className="h-[420px]">
            {layer === 'clima' ? (
              <CityWeatherSilhouette cells={weatherMesh} />
            ) : (
              <MariliaCityMap
                className="h-full"
                points={map.points.map((point) => ({
                  id: point.id,
                  lat: point.lat,
                  lng: point.lng,
                  kind: 'ocorrencia' as const,
                  category: layer,
                  name: point.name,
                  subtitle: layer === 'previsao' ? 'Previsão, não ocorrência confirmada' : '',
                  role: 'cadastro' as const,
                }))}
                heatEnabled
                heatPoints={map.points.map((point) => ({ lat: point.lat, lng: point.lng, weight: point.weight }))}
                onSelect={(point) => {
                  const assetId = map.points.find((row) => row.id === point.id)?.assetId
                  if (assetId) openAsset(assetId)
                }}
              />
            )}
          </div>
          <p className="border-t border-fogo-border px-3 py-2 text-xs text-fogo-muted">
            {layer === 'ocorrencias'
              ? `${map.points.length} ocorrências com coordenada conferida. ${occurrences.length - map.points.length} ficaram de fora por não terem ativo localizado.`
              : layer === 'os'
                ? `${map.points.length} ordens com coordenada conferida. ${orders.length - map.points.length} ficaram de fora.`
                : layer === 'previsao'
                  ? predictions == null
                    ? 'Carregando previsões…'
                    : predError
                      ? predError
                      : regionalForecasts.length === 0 && regionalOs.length === 0
                        ? 'O motor não emitiu pico regional nem quantidade de OS neste recorte. O mapa não copia o histórico.'
                        : `${map.points.length} previsões posicionadas no centro dos ativos conferidos da região. ${map.missing} sem ativo localizado ficam só na lista.`
                  : weatherError
                    ? weatherError
                    : weather?.error || weather?.note || 'Carregando clima…'}
          </p>
        </Card>
      ) : null}

      {layer === 'previsao' ? (
        <Card className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Quantidade de OS por região — próximas 24 h</h3>
            <Badge variant="default" className="px-1.5 py-0 text-[10px] font-semibold tracking-wide">
              Prevision Engine
            </Badge>
          </div>
          {osForecasts == null && !osError ? <p className="text-sm text-fogo-muted">Carregando a estimativa do motor…</p> : null}
          {osError ? <p className="text-sm text-fogo-muted">{osError}</p> : null}
          {osForecasts != null && regionalOs.length === 0 ? (
            <p className="text-sm text-fogo-muted">O motor ainda não emitiu quantidade para este recorte. Região sem dia fechado de OS fica sem número.</p>
          ) : null}
          {regionalOs.map((row) => (
            <p key={row.id} className="text-sm">
              <span className="font-medium">{row.region || row.targetLabel}</span>
              <span className="tabular-nums"> · {osQty(row.predictedValue)} OS</span>
              <span className="text-fogo-muted"> · {row.explanation}</span>
            </p>
          ))}
          {regionalForecasts.some((row) => String(row.inputSummary?.ruleKey ?? '').startsWith('bairro_risk:')) ? (
            <h3 className="pt-2 text-sm font-semibold">Risco por bairro</h3>
          ) : null}
          {regionalForecasts
            .filter((row) => String(row.inputSummary?.ruleKey ?? '').startsWith('bairro_risk:'))
            .map((row) => (
              <p key={row.id} className="text-sm">
                <span className="font-medium">{row.targetLabel}</span>
                <span className="text-fogo-muted"> · risco do bairro, horizonte {row.horizonHours} h · {row.explanation}</span>
              </p>
            ))}
          {regionalForecasts
            .filter((row) => !String(row.inputSummary?.ruleKey ?? '').startsWith('bairro_risk:'))
            .map((row) => {
              const rule = String(row.inputSummary?.ruleKey ?? '')
              const kind = rule.startsWith('staff_gap:') ? 'efetivo' : rule.startsWith('use_trend:') ? 'utilização' : 'pico de alertas'
              return (
                <p key={row.id} className="text-sm">
                  <span className="font-medium">{row.targetLabel}</span>
                  <span className="text-fogo-muted">
                    {' '}
                    · {kind}, horizonte {row.horizonHours} h · {row.explanation}
                  </span>
                </p>
              )
            })}
        </Card>
      ) : null}

      {layer === 'clima' ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Card className="p-3 text-sm">
            <p className="text-xs text-fogo-muted">Arquivo de ontem, ponto da cidade</p>
            {weather?.history ? (
              <p>
                {weather.history.date}: {num(weather.history.temperatureC)} °C · chuva {num(weather.history.precipitationMm)} mm
              </p>
            ) : (
              <p className="text-fogo-muted">Histórico indisponível.</p>
            )}
          </Card>
          <Card className="p-3 text-sm">
            <p className="text-xs text-fogo-muted">Dentro do contorno, no horário selecionado</p>
            {toneCounts.length ? bars(toneCounts) : <p className="text-fogo-muted">Sem células do modelo.</p>}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">Ocorrências por região</h3>
          {bars(occurrenceBars)}
        </Card>
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">OS por região</h3>
          {bars(orderBars)}
        </Card>
        <Card className="p-3">
          <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            OS previstas em 24 h
            <Badge variant="default" className="px-1.5 py-0 text-[10px] font-semibold tracking-wide">
              Prevision Engine
            </Badge>
          </h3>
          {osError ? (
            <p className="text-sm text-fogo-muted">{osError}</p>
          ) : osForecasts == null ? (
            <p className="text-sm text-fogo-muted">Carregando a estimativa do motor…</p>
          ) : (
            bars(osForecastBars)
          )}
        </Card>
      </div>
    </div>
  )
}

function heatOf<T extends { id: string }>(
  rows: T[],
  assetOf: (row: T) => UrbanAsset | undefined,
  nameOf: (row: T) => string,
  bounds?: { south: number; north: number; west: number; east: number },
) {
  const points = rows.flatMap((row) => {
    const asset = assetOf(row)
    const point = asset ? plottableAssetPoint(asset, bounds) : null
    if (!asset || !point) return []
    return [{ id: row.id, lat: point.lat, lng: point.lng, weight: 0.7, name: nameOf(row), assetId: asset.id }]
  })
  return { points, missing: rows.length - points.length }
}

function countBy<T>(rows: T[], labelOf: (row: T) => string) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(labelOf(row), (map.get(labelOf(row)) ?? 0) + 1)
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function num(value: number | null | undefined) {
  return value == null || Number.isNaN(value) ? '—' : String(Math.round(value * 10) / 10)
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="block text-[11px] text-fogo-muted">
      {label}
      <select
        className="mt-1 h-8 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 text-xs text-fogo-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
