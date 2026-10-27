import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { OpsFlushBody, OpsTabBar } from '@/components/layout/OpsTabBar'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { BottomAnalyticsStrip } from '@/components/charts/BottomAnalyticsStrip'
import { OverviewCharts } from '@/components/charts/OverviewCharts'
import { fetchRegionSummaries, fetchTelemetry } from '@/lib/api'
import { DataOriginBadge } from '@/components/ops/DataOriginBadge'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useOpsData } from '@/context/OpsDataContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { AlertResolutionTab } from '@/pages/analytics/AlertResolutionTab'
import { AvailabilityTab } from '@/pages/analytics/AvailabilityTab'
import { ConcentrationMapTab } from '@/pages/analytics/ConcentrationMapTab'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'
import type { ChartPeriod, RegionSummary, TelemetryEvent } from '@/types'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

type Tab = 'indicadores' | 'resolucao' | 'telemetria' | 'disponibilidade' | 'concentracao'

const TABS: { id: Tab; label: string }[] = [
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'disponibilidade', label: 'Disponibilidade' },
  { id: 'concentracao', label: 'Concentração' },
  { id: 'resolucao', label: 'Alertas × resolução' },
  { id: 'telemetria', label: 'Eventos / telemetria' },
]

function parsePeriod(raw: string | null): ChartPeriod {
  return raw === '24h' || raw === '7d' || raw === '30d' ? raw : '7d'
}

export function AnalyticsPage() {
  const href = useCityHref()
  const { region } = useOpsFilter()
  const { apiStatus, dataReady } = useOpsData()
  const { openAsset } = useAssetDossier()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('aba')
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'indicadores'
  const period = parsePeriod(params.get('periodo'))
  const setTab = (id: Tab) => {
    const next = new URLSearchParams(params)
    if (id === 'indicadores') next.delete('aba')
    else next.set('aba', id)
    setParams(next, { replace: true })
  }
  const setPeriod = (value: ChartPeriod) => {
    const next = new URLSearchParams(params)
    if (value === '7d') next.delete('periodo')
    else next.set('periodo', value)
    setParams(next, { replace: true })
  }
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([])
  const [regions, setRegions] = useState<RegionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tab === 'telemetria' || tab === 'disponibilidade') setLoading(true)
  }, [tab])

  useEffect(() => {
    if (tab === 'telemetria') {
      setLoading(true)
      void fetchTelemetry({ region: region || undefined, limit: 120 })
        .then(setTelemetry)
        .finally(() => setLoading(false))
    }
  }, [tab, region])

  useEffect(() => {
    if (tab === 'disponibilidade') {
      setLoading(true)
      void fetchRegionSummaries()
        .then(setRegions)
        .finally(() => setLoading(false))
    }
  }, [tab])

  const regionRows = region ? regions.filter((r) => r.region === region) : regions
  const { data: analytics, loading: analyticsLoading } = useAnalytics(period)
  const tabFetch = tab === 'telemetria' || tab === 'disponibilidade'
  const opsFetch = tab === 'concentracao' || tab === 'resolucao'
  const screenReady =
    apiStatus === 'offline' ||
    (apiStatus === 'online' && !analyticsLoading && (!tabFetch || !loading) && (!opsFetch || dataReady))

  const kpiCards = analytics
    ? [
        ['Ocorrências no período', String(analytics.totals.incidents)],
        ['Resolvidas', String(analytics.totals.incidentsResolved)],
        ['Disponibilidade (elegíveis)', `${analytics.assetAvailability}%`],
        ['Alertas no período', String(analytics.totals.alerts)],
        ['Ativos em alerta', String(analytics.totals.assetsAlert)],
      ]
    : [
        ['Ocorrências no período', '—'],
        ['Resolvidas', '—'],
        ['Disponibilidade ativos', '—'],
        ['Alertas no período', '—'],
        ['Ativos em alerta', '—'],
      ]

  if (tabParam === 'regioes') {
    return <Navigate to={href(ROUTES.regionVision)} replace />
  }

  return (
    <PageShell flush>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cn('flex min-h-0 flex-1 flex-col', !screenReady && 'invisible')}>
      <div className="fogo-glass min-w-0 shrink-0 border-b border-fogo-border/80 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Análises</p>
              <p className="text-[11px] text-fogo-muted">
                O que já aconteceu: indicadores, cruzamentos e resolução. As previsões ficam em Previsões.
              </p>
            </div>
            {tab === 'indicadores' || tab === 'disponibilidade' ? (
              <PeriodSelect value={period} onChange={setPeriod} />
            ) : null}
          </div>
          <OpsTabBar aria-label="Abas de análises">
            {TABS.map(({ id, label }) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? 'primary' : 'outline'}
                onClick={() => setTab(id)}
                className="shrink-0 whitespace-nowrap"
              >
                {label}
              </Button>
            ))}
          </OpsTabBar>
        </div>
      </div>

      <OpsFlushBody className="flex min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 lg:px-4">
          <OpsRegionFilterBar />
        </div>
          <div className="space-y-4 p-3 lg:p-4">
        {tab === 'resolucao' ? <AlertResolutionTab /> : null}

        {tab === 'indicadores' ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              {kpiCards.map(([l, v]) => (
                <Card key={l} className="fogo-glass px-3 py-2.5">
                  <p className="text-[10px] text-fogo-muted">{l}</p>
                  <p className="text-lg font-semibold tabular-nums">{v}</p>
                </Card>
              ))}
            </div>
            {analytics?.alertsBySeverity?.length ? (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {analytics.alertsBySeverity.map((s) => (
                  <Card key={s.severity} className="px-3 py-2">
                    <p className="text-[10px] capitalize text-fogo-muted">Alertas {s.severity}</p>
                    <p className="text-lg font-semibold tabular-nums">{s.count}</p>
                  </Card>
                ))}
              </div>
            ) : null}
            <BottomAnalyticsStrip period={period} />
            <OverviewCharts period={period} />
            <section>
              <h3 className="mb-2 text-sm font-semibold">Insights operacionais</h3>
              <ul className="grid gap-2 lg:grid-cols-2">
                {(analytics?.insights?.length ? analytics.insights : []).map((item) => (
                  <Card key={item.title} className="p-3 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-fogo-muted">{item.body}</p>
                  </Card>
                ))}
                {!analytics?.insights?.length ? (
                  <p className="text-sm text-fogo-muted">Conecte a API e acumule ocorrências para insights automáticos.</p>
                ) : null}
              </ul>
            </section>
          </>
        ) : null}

        {tab === 'telemetria' ? (
          <div className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
            {loading ? (
              <p className="p-4 text-sm text-fogo-muted">Carregando eventos…</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-fogo-bg/70 text-xs text-fogo-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Ocorrido</th>
                    <th className="px-3 py-2 text-left">Recebido</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Detalhe</th>
                    <th className="px-3 py-2 text-left">Ativo</th>
                    <th className="px-3 py-2 text-left">Região</th>
                    <th className="px-3 py-2 text-left">Procedência</th>
                    <th className="px-3 py-2 text-left">Qualidade</th>
                    <th className="px-3 py-2 text-left">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.map((ev) => (
                    <tr key={ev.id} className="border-t border-fogo-border">
                      <td className="px-3 py-2 tabular-nums text-xs">{formatDateTime(ev.occurredAt)}</td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        {ev.receivedAt ? formatDateTime(ev.receivedAt) : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium">{ev.eventType}</td>
                      <td className="max-w-[280px] px-3 py-2 text-xs text-fogo-muted">
                        {typeof ev.payload?.title === 'string' ? ev.payload.title : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fogo-accent">
                        {ev.assetExternalId ? (
                          <button type="button" className="underline-offset-2 hover:underline" onClick={() => openAsset(ev.assetExternalId!)}>
                            {ev.assetExternalId}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">{ev.region ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <DataOriginBadge origin={ev.dataOrigin} />
                        <span className="ml-1 text-fogo-muted">{ev.source}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-fogo-muted">{ev.quality ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-fogo-muted">{ev.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && telemetry.length === 0 ? (
              <p className="p-6 text-center text-sm text-fogo-muted">
                Nenhum evento operacional no período — alertas e ocorrências do CCO aparecem aqui automaticamente.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'disponibilidade' ? <AvailabilityTab period={period} regions={regionRows} /> : null}

        {tab === 'concentracao' ? <ConcentrationMapTab period={period} onPeriod={setPeriod} /> : null}
          </div>
      </OpsFlushBody>
      </div>
      {screenReady ? null : (
        <div className="absolute inset-0 z-10 flex bg-fogo-bg">
          <LoadScreen full={false} />
        </div>
      )}
      </div>
    </PageShell>
  )
}
