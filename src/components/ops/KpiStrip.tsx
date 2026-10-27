import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CircleCheck,
  Minus,
  Radio,
  Sparkles,
  Users,
} from 'lucide-react'
import { overviewKpis } from '@/data/overview'
import { computeAvailability } from '@/lib/assetAvailability'
import { formatDelta } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { ROUTES } from '@/lib/routes'
import { isPredictionActive } from '@/lib/predictionView'
import { alertKpiTotals } from '@/lib/operatorAlertStats'
import { useCityHref } from '@/context/TenantContext'
import type { ActivityEvent, KpiMetric } from '@/types'

type LiveKpi = KpiMetric & { value: number; spark: number[]; liveHint?: string }

const kpiIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'assets-total': Boxes,
  'assets-operational': CircleCheck,
  'incidents-open': Radio,
  'occurrence-alerts': AlertTriangle,
  'predictions-active': Sparkles,
  'teams-field': Users,
}

const kpiActivityKind: Partial<Record<string, ActivityEvent['kind']>> = {
  'assets-total': 'asset',
  'assets-operational': 'asset',
  'incidents-open': 'incident',
  'teams-field': 'team',
}

function seedSpark(id: string, value: number, bins: number): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Array.from({ length: bins }, (_, i) => {
    const n = Math.abs(Math.sin((h + i * 7 + value) * 0.17)) * 0.65 + 0.2
    return n
  })
}

function sparkFromActivity(events: ActivityEvent[], kind: ActivityEvent['kind'], bins = 10): number[] {
  const now = Date.now()
  const windowMs = 45 * 60 * 1000
  const binMs = windowMs / bins
  const counts = new Array(bins).fill(0) as number[]
  for (const ev of events) {
    if (ev.kind !== kind) continue
    const t = new Date(ev.timestamp).getTime()
    if (Number.isNaN(t) || t < now - windowMs) continue
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((t - (now - windowMs)) / binMs)))
    counts[idx] += 1
  }
  const max = Math.max(...counts, 1)
  return counts.map((c) => (c === 0 ? 0.12 : 0.25 + (c / max) * 0.75))
}

function toneAccent(tone: KpiMetric['tone'], id?: string): string {
  if (id === 'predictions-active') return 'bg-fogo-prevision'
  if (tone === 'critical') return 'bg-fogo-critical'
  if (tone === 'warning') return 'bg-fogo-warning'
  if (tone === 'success') return 'bg-fogo-success'
  return 'bg-fogo-accent'
}

function KpiSparkline({ series, className }: { series: number[]; className?: string }) {
  const w = 52
  const h = 18
  const max = Math.max(...series, 0.001)
  const points = series
    .map((v, i) => {
      const x = series.length <= 1 ? w / 2 : (i / (series.length - 1)) * w
      const y = h - (v / max) * (h - 3) - 1.5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} className={cn('shrink-0 opacity-80', className)} aria-hidden viewBox={`0 0 ${w} ${h}`}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function KpiCard({ kpi, live }: { kpi: LiveKpi; live: boolean }) {
  const navigate = useNavigate()
  const href = useCityHref()
  const prev = useRef(kpi.value)
  const [flash, setFlash] = useState(false)
  const Icon = kpiIcons[kpi.id] ?? Boxes
  const display = kpi.value.toLocaleString('pt-BR')
  const stepDelta = live && prev.current !== kpi.value ? kpi.value - prev.current : 0

  useEffect(() => {
    if (prev.current === kpi.value) return
    prev.current = kpi.value
    setFlash(true)
    const id = window.setTimeout(() => setFlash(false), 700)
    return () => window.clearTimeout(id)
  }, [kpi.value])

  const footerLive =
    live && stepDelta !== 0 ? (
      <span className="inline-flex items-center gap-0.5">
        {stepDelta > 0 ? (
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDownRight className="h-3 w-3" aria-hidden />
        )}
        {stepDelta > 0 ? '+' : ''}
        {stepDelta.toLocaleString('pt-BR')} agora
      </span>
    ) : live ? (
      <span className="inline-flex items-center gap-1">
        <Minus className="h-3 w-3 opacity-60" aria-hidden />
        {kpi.liveHint ?? 'estável'}
      </span>
    ) : null

  return (
    <button
      type="button"
      onClick={() => {
        const q = kpi.search ? `?${new URLSearchParams(kpi.search)}` : ''
        navigate(`${href(kpi.route)}${q}`)
      }}
      className={cn(
        'group relative min-w-[152px] flex-1 overflow-hidden rounded-none border-0 bg-transparent text-left shadow-none',
        'transition-colors duration-200 hover:bg-fogo-surface/40 active:scale-[0.995]',
        flash && 'fogo-kpi-flash',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', toneAccent(kpi.tone, kpi.id))} aria-hidden />
      <div className="flex flex-col gap-1 px-3 py-2.5 pl-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-medium leading-tight text-fogo-muted">{kpi.label}</p>
          <Icon className="h-3.5 w-3.5 shrink-0 text-fogo-muted/70 transition-colors group-hover:text-fogo-accent" aria-hidden />
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-xl font-semibold tabular-nums tracking-tight text-fogo-text">{display}</p>
          <KpiSparkline
            series={kpi.spark}
            className={cn(
              kpi.tone === 'critical' && 'text-fogo-critical',
              kpi.tone === 'warning' && 'text-fogo-warning',
              kpi.tone === 'success' && 'text-fogo-success',
              !kpi.tone && kpi.id !== 'predictions-active' && 'text-fogo-accent',
              kpi.id === 'predictions-active' && 'text-fogo-prevision',
            )}
          />
        </div>
        {kpi.suffix ? <p className="text-[10px] font-medium text-fogo-accent">{kpi.suffix}</p> : null}
        <p
          className={cn(
            'text-[10px] leading-snug',
            kpi.tone === 'critical' && 'text-fogo-critical',
            kpi.tone === 'warning' && 'text-fogo-warning',
            kpi.tone === 'success' && 'text-fogo-success',
            !kpi.tone && 'text-fogo-muted',
          )}
        >
          {footerLive ?? (
            <>
              {formatDelta(kpi.delta)} · {kpi.deltaLabel}
            </>
          )}
        </p>
      </div>
    </button>
  )
}

function KpiStripSkeleton() {
  return (
    <section className="px-1 py-1" aria-label="Carregando indicadores" aria-busy="true">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="fogo-shimmer h-2.5 w-2.5 rounded-full" />
        <span className="fogo-shimmer h-3 w-36 rounded-full" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="min-w-[152px] flex-1 px-3 py-2.5 pl-3.5">
            <span className="absolute" />
            <div className="fogo-shimmer mb-2 h-2.5 w-20 rounded-full" />
            <div className="fogo-shimmer mb-2 h-6 w-14 rounded-md" />
            <div className="fogo-shimmer h-2 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function KpiStrip() {
  const { incidents, alerts, assets, mapMarkers, activity, apiConnected, apiStatus, dataReady, simulation, predictions } =
    useOpsData()
  const { region } = useOpsFilter()
  const [lastSync, setLastSync] = useState(() => new Date())
  const live = apiConnected
  const monitoring = live && simulation?.enabled === true

  useEffect(() => {
    if (!live) return
    setLastSync(new Date())
  }, [live, incidents, alerts, assets, mapMarkers, activity, region])

  const syncLabel = lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const kpis = useMemo((): LiveKpi[] => {
    const inc = region ? incidents.filter((i) => i.region === region) : incidents
    const al = region ? alerts.filter((a) => a.region === region) : alerts
    const ast = region ? assets.filter((a) => a.region === region) : assets
    const mm = region ? mapMarkers.filter((m) => m.region === region) : mapMarkers
    const openIncidents = inc.filter((i) => i.status !== 'resolvida' && i.status !== 'cancelada').length
    const occurrence = alertKpiTotals(al)
    const availability = computeAvailability(ast)
    const operational = availability.operational
    const totalAssets = availability.total
    const eligible = availability.eligible
    const teamsField = mm.filter((m) => m.kind === 'equipe' && m.status === 'campo').length
    const pred = region ? predictions.filter((p) => p.region === region) : predictions
    const activePredictions = pred.filter((p) => isPredictionActive(p)).length

    const mapped = overviewKpis.map((kpi) => {
      const actKind = kpiActivityKind[kpi.id]
      const spark =
        live && actKind && activity.length
          ? sparkFromActivity(activity, actKind)
          : seedSpark(kpi.id, kpi.value, 10)

      switch (kpi.id) {
        case 'assets-total':
          return {
            ...kpi,
            value: totalAssets,
            spark,
            liveHint: 'sincronizado',
            deltaLabel:
              availability.excluded > 0
                ? `${eligible} na conta · ${availability.excluded} não instalado/baixado`
                : 'inventário ao vivo',
          }
        case 'assets-operational': {
          const pct = eligible ? (operational / eligible) * 100 : 0
          return {
            ...kpi,
            value: operational,
            suffix: eligible ? `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% disp.` : 'sem elegíveis',
            spark,
            liveHint: 'exclui não instalado/baixado',
            deltaLabel: `${eligible} ativos na conta`,
          }
        }
        case 'incidents-open':
          return {
            ...kpi,
            value: openIncidents,
            deltaLabel: monitoring ? 'monitoramento ativo' : 'tempo real',
            liveHint: openIncidents ? 'fila operacional' : 'sem novas OS',
            spark,
          }
        case 'teams-field':
          return {
            ...kpi,
            value: teamsField,
            spark,
            liveHint: 'posição no mapa',
            deltaLabel: 'agentes ativos',
          }
        default:
          return { ...kpi, spark }
      }
    })
    const incidentsAt = mapped.findIndex((kpi) => kpi.id === 'incidents-open')
    mapped.splice(incidentsAt + 1, 0, {
      id: 'occurrence-alerts',
      label: 'Alertas de ocorrências',
      value: occurrence.pending,
      suffix: `${occurrence.total.toLocaleString('pt-BR')} no total`,
      delta: 0,
      deltaLabel: 'mesma conta da grade de alertas',
      trend: 'neutral',
      tone: occurrence.pending > 0 ? 'warning' : 'success',
      route: ROUTES.alerts,
      spark: seedSpark('occurrence-alerts', occurrence.pending, 10),
      liveHint: occurrence.pending ? 'pendentes' : 'nenhuma pendente',
    })
    mapped.splice(mapped.findIndex((kpi) => kpi.id === 'teams-field'), 0, {
      id: 'predictions-active',
      label: 'Previsões vigentes',
      value: activePredictions,
      delta: 0,
      deltaLabel: live ? 'motor persistido' : 'aguardando',
      trend: 'neutral',
      route: ROUTES.forecasts,
      spark: seedSpark('predictions-active', activePredictions, 10),
      liveHint: activePredictions ? 'vigentes agora' : 'sem previsão ativa',
    })
    return mapped
  }, [incidents, alerts, assets, mapMarkers, activity, live, monitoring, region, predictions, dataReady])

  if (!dataReady && apiStatus !== 'offline') {
    return <KpiStripSkeleton />
  }

  return (
    <section
      className="fogo-enter px-1 py-1"
      aria-label="Painel de indicadores operacionais"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            {monitoring ? (
              <span className="absolute inline-flex h-full w-full rounded-full bg-fogo-success/40 fogo-live-pulse" />
            ) : null}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                live ? 'bg-fogo-success' : 'bg-fogo-warning',
              )}
            />
          </span>
          <p className="text-xs font-semibold text-fogo-text">
            {monitoring ? 'Monitoramento em tempo real' : live ? 'Indicadores ao vivo' : 'Indicadores'}
          </p>
        </div>
        <p className="text-[10px] tabular-nums text-fogo-muted">
          {live ? (
            <>
              Última leitura <time dateTime={lastSync.toISOString()}>{syncLabel}</time>
              {monitoring ? ' · atualização contínua' : ' · sincronização periódica'}
            </>
          ) : (
            'Aguardando conexão com o serviço'
          )}
        </p>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} live={live} />
        ))}
      </div>
    </section>
  )
}
