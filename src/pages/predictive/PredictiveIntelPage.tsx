import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { OpsFlushBody, OpsTabBar } from '@/components/layout/OpsTabBar'
import { fetchPredictiveSummary, type PredictiveSummary } from '@/lib/api'
import { useOpsData } from '@/context/OpsDataContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PredictiveSignalsTab } from '@/pages/predictive/PredictiveSignalsTab'
import { ModelEvaluationTab } from '@/pages/predictive/ModelEvaluationTab'
import { RecommendationCycleTab } from '@/pages/predictive/RecommendationCycleTab'
import { PrevisibilidadeTab } from '@/pages/predictive/PrevisibilidadeTab'
import { PredictiveControlsTab } from '@/pages/predictive/PredictiveControlsTab'
import { ForecastBoard } from '@/pages/predictive/ForecastBoard'
import { NeuralBoard } from '@/pages/predictive/NeuralBoard'
import { PrevisionThinkScreen } from '@/pages/predictive/PrevisionThinkScreen'
import { PrometheusModeToggle } from '@/pages/predictive/PrometheusModeToggle'

type Tab = 'sinais' | 'avaliacao' | 'recomendacoes' | 'previsibilidade' | 'controles'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sinais', label: 'Sinais' },
  { id: 'avaliacao', label: 'Avaliação do modelo' },
  { id: 'recomendacoes', label: 'Recomendações' },
  { id: 'previsibilidade', label: 'Previsibilidade' },
  { id: 'controles', label: 'Controles' },
]

export function PredictiveIntelPage() {
  const { apiConnected, apiStatus, refresh, incidents, alerts } = useOpsData()
  const [params, setParams] = useSearchParams()
  const prometheus = params.get('prometheus') === '1'
  const neuralPage = params.get('rede') === '1'
  const tabParam = params.get('aba')
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'sinais'

  const setPrometheus = (on: boolean) => {
    const next = new URLSearchParams(params)
    if (on) next.set('prometheus', '1')
    else {
      next.delete('prometheus')
      next.delete('aba')
    }
    setParams(next, { replace: true })
  }

  const openNeural = () => {
    const next = new URLSearchParams(params)
    next.delete('prometheus')
    next.delete('aba')
    next.set('rede', '1')
    setParams(next, { replace: true })
  }

  const closeNeural = () => {
    const next = new URLSearchParams(params)
    next.delete('rede')
    setParams(next, { replace: true })
  }

  const setTab = (id: Tab) => {
    const next = new URLSearchParams(params)
    next.set('prometheus', '1')
    if (id === 'sinais') next.delete('aba')
    else next.set('aba', id)
    setParams(next, { replace: true })
  }

  const [summary, setSummary] = useState<PredictiveSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [booted, setBooted] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    if (!apiConnected) return
    setFailed(false)
    setLoading(true)
    void fetchPredictiveSummary()
      .then((data) => {
        setSummary(data)
        setBooted(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [apiConnected])

  useEffect(() => {
    load()
  }, [load, incidents.length, alerts.length])

  const reloadEngine = () => {
    setSummary(null)
    setFailed(false)
    setLoading(true)
    setBooted(false)
    if (!apiConnected) {
      setBooted(true)
      return
    }
    load()
  }

  useEffect(() => {
    if (apiStatus === 'offline') setBooted(true)
  }, [apiStatus])

  if (!booted) {
    return (
      <PageShell flush header={<></>}>
        <PrevisionThinkScreen failed={failed} onRetry={load} />
      </PageShell>
    )
  }

  return (
    <PageShell flush>
      <div className="fogo-glass min-w-0 shrink-0 border-b border-fogo-border/80 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {neuralPage ? 'Rede neural' : 'Prevision Engine'}
                {neuralPage ? null : (
                  <Badge variant="default" className="px-1.5 py-0 text-[10px] font-semibold tracking-wide">
                    Beta
                  </Badge>
                )}
              </p>
              <p className="text-[11px] text-fogo-muted">
                {neuralPage
                  ? 'Previsão da rede. A mesa normal continua na fórmula.'
                  : prometheus
                    ? 'Modo Prometheus — sinais, avaliação e recomendações técnicas.'
                    : 'Motor de correlação histórica, clima e calendário. As previsões operacionais ficam em Operações.'}
              </p>
            </div>
            {neuralPage ? (
              <Button type="button" size="sm" variant="outline" onClick={closeNeural}>
                Voltar
              </Button>
            ) : prometheus ? null : (
              <Button type="button" size="sm" variant="outline" onClick={openNeural}>
                Rede neural
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Recarregar engine"
              title="Recarregar engine"
              onClick={reloadEngine}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {neuralPage ? null : <PrometheusModeToggle on={prometheus} onToggle={setPrometheus} />}
          </div>
          {neuralPage ? null : prometheus ? (
            <div className="fogo-prometheus-tabs min-w-0 w-full">
              <OpsTabBar aria-label="Abas técnicas do Prometheus">
                {TABS.map(({ id, label }) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={tab === id ? 'primary' : 'outline'}
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </Button>
                ))}
              </OpsTabBar>
            </div>
          ) : null}
        </div>
      </div>

      <OpsFlushBody className="flex min-h-0 flex-col">
        {apiStatus === 'offline' ? (
          <p className="shrink-0 px-3 pt-3 text-sm text-fogo-warning lg:px-4">API offline — previsões indisponíveis.</p>
        ) : null}
        <div className="space-y-4 p-3 lg:p-4">
        {prometheus ? (
          <>
            {tab === 'sinais' ? <PredictiveSignalsTab summary={summary} loading={loading} /> : null}
            {tab === 'avaliacao' ? (
              <ModelEvaluationTab metrics={summary?.metrics} accuracy={summary?.accuracy} />
            ) : null}
            {tab === 'recomendacoes' ? (
              <RecommendationCycleTab predictions={summary?.predictions ?? []} onChanged={() => { void refresh(); load() }} />
            ) : null}
            {tab === 'previsibilidade' ? <PrevisibilidadeTab /> : null}
            {tab === 'controles' ? (
              <PredictiveControlsTab controls={summary?.controls} runs={summary?.runs} onChanged={load} />
            ) : null}
          </>
        ) : neuralPage ? (
          <NeuralBoard summary={summary} loading={loading} onProvisioned={load} />
        ) : (
          <ForecastBoard summary={summary} loading={loading} />
        )}
        </div>
      </OpsFlushBody>
    </PageShell>
  )
}
