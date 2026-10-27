import { useMemo, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { PredictionDetailDrawer } from '@/components/predictive/PredictionDetailDrawer'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import type { PredictionRecord } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import {
  isOsTicketPrediction,
  isPredictionActive,
  predictionHeadline,
  predictionPeriodLabel,
  predictionRiskLabel,
  predictionTypeLabel,
} from '@/lib/predictionView'
import { cn } from '@/lib/cn'

export function ForecastsPage() {
  const { predictions, apiStatus } = useOpsData()
  const { region } = useOpsFilter()
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [selected, setSelected] = useState<PredictionRecord | null>(null)

  const scoped = useMemo(() => {
    let list = predictions.filter((p) => !isOsTicketPrediction(p))
    if (region) list = list.filter((p) => p.region === region)
    return list.sort((a, b) => Date.parse(b.calculatedAt) - Date.parse(a.calculatedAt))
  }, [predictions, region])

  const rows = useMemo(
    () => (filter === 'active' ? scoped.filter((p) => isPredictionActive(p)) : scoped),
    [scoped, filter],
  )

  return (
    <PageShell searchPlaceholder="Buscar previsão…">
      <OpsRegionFilterBar />
      <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fogo-text">Previsões</h1>
          <p className="text-sm text-fogo-muted">
            Alertas e situações previstos para a operação. Não estima quantas ordens de serviço vão ocorrer.
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={cn(
              'rounded-fogo-md px-2.5 py-1 text-xs',
              filter === 'active' ? 'bg-fogo-prevision-bg text-fogo-prevision' : 'text-fogo-muted',
            )}
          >
            Vigentes ({scoped.filter((p) => isPredictionActive(p)).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-fogo-md px-2.5 py-1 text-xs',
              filter === 'all' ? 'bg-fogo-prevision-bg text-fogo-prevision' : 'text-fogo-muted',
            )}
          >
            Todas ({scoped.length})
          </button>
        </div>
      </div>
      {apiStatus === 'offline' ? <p className="mb-2 text-xs text-fogo-warning">API offline — lista pode estar desatualizada.</p> : null}
      <div className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-fogo-bg/80 text-xs text-fogo-muted">
            <tr>
              <th className="px-3 py-2 text-left">Previsão</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Local</th>
              <th className="px-3 py-2 text-left">Período</th>
              <th className="px-3 py-2 text-left">Risco</th>
              <th className="px-3 py-2 text-left">Emitida</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-t border-fogo-border/70 hover:bg-fogo-prevision-bg/40"
                onClick={() => setSelected(p)}
              >
                <td className="px-3 py-2">
                  <p className="font-medium leading-snug text-fogo-text">{predictionHeadline(p)}</p>
                </td>
                <td className="px-3 py-2 text-fogo-text">
                  {predictionTypeLabel(p.predictionType, String(p.inputSummary?.ruleKey ?? ''))}
                </td>
                <td className="px-3 py-2 text-fogo-text">{p.region ?? 'Cidade'}</td>
                <td className="px-3 py-2 text-[12px] text-fogo-muted">{predictionPeriodLabel(p)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-fogo-prevision-bg px-2 py-0.5 text-[11px] text-fogo-prevision">
                    {predictionRiskLabel(p.probability)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-fogo-muted">{formatDateTime(p.calculatedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-sm text-fogo-muted">
                  Nenhuma previsão {filter === 'active' ? 'vigente' : 'persistida'} neste recorte.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <PredictionDetailDrawer prediction={selected} onClose={() => setSelected(null)} />
    </PageShell>
  )
}
