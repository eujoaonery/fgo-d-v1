import { useCallback, useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { fetchStrategyBoard, runPrometheusAnalysis, type StrategyBoard } from '@/lib/api'
import { SOURCE_STATUS_LABEL, type SourceStatus } from '@/lib/strategy'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'

function sourceVariant(status: SourceStatus): 'success' | 'warning' | 'critical' | 'neutral' {
  if (status === 'ok') return 'success'
  if (status === 'empty') return 'neutral'
  if (status === 'stale') return 'warning'
  return 'critical'
}

export function StrategyPage() {
  const href = useCityHref()
  const [board, setBoard] = useState<StrategyBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBoard(await fetchStrategyBoard())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o painel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function regenerate() {
    setBusy(true)
    setError(null)
    try {
      const prometheus = await runPrometheusAnalysis()
      setBoard((prev) => (prev ? { ...prev, prometheus } : prev))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no PROMETHEUS')
    } finally {
      setBusy(false)
    }
  }

  const snapshot = board?.snapshot
  const prometheus = board?.prometheus

  return (
    <PageShell>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cn('space-y-4', loading && 'invisible')}>
      <header className="fogo-gradient-panel rounded-fogo-lg border border-fogo-border px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fogo-text">Painel estratégico</h2>
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            Atualizar
          </Button>
        </div>
        {snapshot ? (
          <p className="mt-2 text-xs text-fogo-muted">
            Última atualização do painel: {formatDateTime(snapshot.generatedAt)} · {snapshot.city.name}
          </p>
        ) : null}
      </header>

      {error ? <p className="text-sm text-fogo-critical">{error}</p> : null}

      {snapshot ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {snapshot.indicators.map((ind) => (
            <Card key={ind.key} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] text-fogo-muted">{ind.label}</p>
                <Badge variant={sourceVariant(ind.source.status)} className="text-[10px]">
                  {SOURCE_STATUS_LABEL[ind.source.status]}
                </Badge>
              </div>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  ind.value == null && 'text-fogo-muted',
                  ind.source.status === 'unavailable' && 'text-fogo-warning',
                )}
              >
                {ind.value == null ? '—' : ind.value}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-fogo-muted">{ind.source.note}</p>
              {ind.source.lastUpdatedAt ? (
                <p className="text-[10px] text-fogo-muted">Fonte {ind.source.origin} · {formatDateTime(ind.source.lastUpdatedAt)}</p>
              ) : (
                <p className="text-[10px] text-fogo-muted">Fonte {ind.source.origin} · sem carimbo de atualização</p>
              )}
              {ind.breakdown?.length ? (
                <p className="mt-1 text-[10px] text-fogo-muted">
                  {ind.breakdown
                    .slice(0, 3)
                    .map((b) => `${b.key}: ${b.count}`)
                    .join(' · ')}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {snapshot ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <OpsPanel title="Previsão meteorológica" subtitle={snapshot.weatherForecastSource.note}>
            <div className="space-y-2 p-3 text-sm">
              <Badge variant={sourceVariant(snapshot.weatherForecastSource.status)}>
                {SOURCE_STATUS_LABEL[snapshot.weatherForecastSource.status]}
              </Badge>
              {snapshot.weatherForecast ? (
                <p>
                  {snapshot.weatherForecast.summary}
                  {snapshot.weatherForecast.temperatureC != null
                    ? ` · ${Math.round(snapshot.weatherForecast.temperatureC)} °C`
                    : ''}
                  {snapshot.weatherForecast.nextHoursPrecipProb != null
                    ? ` · precipitação (próx. horas, modelo): ${snapshot.weatherForecast.nextHoursPrecipProb}%`
                    : ''}
                </p>
              ) : (
                <p className="text-fogo-muted">Previsão numérica indisponível.</p>
              )}
              {snapshot.weatherForecastSource.lastUpdatedAt ? (
                <p className="text-xs text-fogo-muted">
                  {snapshot.weatherForecastSource.origin} · {formatDateTime(snapshot.weatherForecastSource.lastUpdatedAt)}
                </p>
              ) : null}
            </div>
          </OpsPanel>
          <OpsPanel title="Trânsito externo" subtitle={snapshot.trafficExternalSource.note}>
            <div className="space-y-2 p-3 text-sm">
              <Badge variant={sourceVariant(snapshot.trafficExternalSource.status)}>
                {SOURCE_STATUS_LABEL[snapshot.trafficExternalSource.status]}
              </Badge>
              <p className="text-fogo-muted">
                Incidentes de trânsito no painel vêm só de alertas e OS do FOGO. Feed externo não está integrado.
              </p>
            </div>
          </OpsPanel>
        </div>
      ) : null}

      {snapshot?.changesSinceLastBriefing.length ? (
        <OpsPanel title="Alterações desde a última análise PROMETHEUS">
          <ul className="space-y-1 p-3 text-sm">
            {snapshot.changesSinceLastBriefing.map((d) => (
              <li key={d.field}>
                {d.label}: {d.previous} → {d.current} ({d.delta > 0 ? '+' : ''}
                {d.delta})
              </li>
            ))}
          </ul>
        </OpsPanel>
      ) : null}

      <OpsPanel
        title="Resumo estratégico PROMETHEUS"
        subtitle="Análise estruturada pela API da OpenAI, validada no backend. Sem simulação."
        action={
          <Button size="sm" variant="primary" onClick={() => void regenerate()} disabled={busy}>
            {busy ? 'Gerando…' : 'Gerar análise'}
          </Button>
        }
      >
        <div className="space-y-3 p-3 text-sm">
          {!prometheus?.available && !prometheus?.briefing ? (
            <p className="text-fogo-warning">
              {prometheus?.unavailableReason ?? 'PROMETHEUS indisponível.'}{' '}
              {(prometheus?.unavailableReason ?? '').includes('Integrações') ? (
                <Link to={href(ROUTES.integrations)} className="font-medium text-fogo-accent hover:underline">
                  Abrir Integrações
                </Link>
              ) : null}
            </p>
          ) : null}
          {prometheus?.stale && prometheus.briefing ? (
            <Badge variant="warning">
              Desatualizado
              {prometheus.generatedAt ? ` · ${formatDateTime(prometheus.generatedAt)}` : ''}
            </Badge>
          ) : null}
          {prometheus?.unavailableReason && prometheus.briefing ? (
            <p className="text-xs text-fogo-warning">{prometheus.unavailableReason}</p>
          ) : null}
          {prometheus?.briefing ? (
            <>
              <div>
                <p className="text-xs font-medium text-fogo-muted">Resumo executivo</p>
                <p className="mt-1">{prometheus.briefing.executiveSummary}</p>
              </div>
              {prometheus.briefing.risks.length ? (
                <div>
                  <p className="text-xs font-medium text-fogo-muted">Riscos identificados</p>
                  <ul className="mt-1 space-y-2">
                    {prometheus.briefing.risks.map((r) => (
                      <li key={r.title} className="rounded-fogo-md border border-fogo-border px-3 py-2">
                        <p className="font-medium">{r.title}</p>
                        <p className="text-xs text-fogo-muted">Horizonte: {r.horizon}</p>
                        <p className="mt-1 text-sm">{r.justification}</p>
                        {r.confidence != null ? (
                          <p className="text-xs text-fogo-muted">
                            Confiança do modelo preditivo já calculado: {Math.round(r.confidence * 100)}%
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-fogo-muted">Nenhum risco validado a partir dos dados atuais.</p>
              )}
              {prometheus.briefing.preventiveRecommendations.length ? (
                <div>
                  <p className="text-xs font-medium text-fogo-muted">Recomendações preventivas</p>
                  <ul className="mt-1 list-disc pl-4">
                    {prometheus.briefing.preventiveRecommendations.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {prometheus.briefing.resourcesNeedingReinforcement.length ? (
                <div>
                  <p className="text-xs font-medium text-fogo-muted">Recursos que podem precisar de reforço</p>
                  <ul className="mt-1 list-disc pl-4">
                    {prometheus.briefing.resourcesNeedingReinforcement.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {prometheus.briefing.missingOrInconsistentData.length ? (
                <div>
                  <p className="text-xs font-medium text-fogo-muted">Dados ausentes ou inconsistentes</p>
                  <ul className="mt-1 list-disc pl-4 text-fogo-muted">
                    {prometheus.briefing.missingOrInconsistentData.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {prometheus.generatedAt ? (
                <p className="text-[10px] text-fogo-muted">
                  Gerado em {formatDateTime(prometheus.generatedAt)}
                  {prometheus.model ? ` · modelo ${prometheus.model}` : ''}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </OpsPanel>

      {snapshot?.limitations.length ? (
        <p className="text-[11px] text-fogo-muted">Limitações: {snapshot.limitations.join(' · ')}</p>
      ) : null}

      </div>
      {loading ? (
        <div className="absolute inset-0 z-10 flex bg-fogo-bg">
          <LoadScreen full={false} />
        </div>
      ) : null}
      </div>
    </PageShell>
  )
}
