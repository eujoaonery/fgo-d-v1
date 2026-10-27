import { useState } from 'react'
import { useOpsData } from '@/context/OpsDataContext'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { AlertDetailDrawer } from '@/components/alerts/AlertDetailDrawer'
import { PredictionDetailDrawer } from '@/components/predictive/PredictionDetailDrawer'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { OperationalAlert } from '@/types'
import type { PredictionRecord } from '@/lib/api'
import { isPredictionActive, predictionHeadline, predictionRiskLabel } from '@/lib/predictionView'
import { alertHeadline } from '@/lib/alertCopy'
import { isAlertPending } from '@/lib/operatorAlertStats'
import { useOpsFilter } from '@/context/OpsFilterContext'

interface CriticalAlertsPanelProps {
  onSelectIncident?: (id: string) => void
  className?: string
}

function issuedMs(iso?: string | null) {
  const n = iso ? Date.parse(iso) : NaN
  return Number.isFinite(n) ? n : 0
}

function QueueSkeleton() {
  return (
    <ul className="divide-y divide-fogo-border/80" aria-busy="true" aria-label="Carregando fila">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex gap-2 px-3 py-2.5">
          <span className="fogo-shimmer mt-1 h-2 w-2 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="fogo-shimmer block h-3 w-[88%] rounded-full" />
            <span className="fogo-shimmer block h-2.5 w-[56%] rounded-full" />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CriticalAlertsPanel({ onSelectIncident, className }: CriticalAlertsPanelProps) {
  const { alerts, incidents, predictions, dataReady, apiStatus } = useOpsData()
  const { region } = useOpsFilter()
  const [selectedPrediction, setSelectedPrediction] = useState<PredictionRecord | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<OperationalAlert | null>(null)

  const scopedAlerts = region ? alerts.filter((a) => a.region === region) : alerts
  const scopedIncidents = region ? incidents.filter((i) => i.region === region) : incidents
  const openAlerts = scopedAlerts.filter((a) => isAlertPending(a.state))
  const activePredictions = predictions.filter((p) => isPredictionActive(p) && (!region || p.region === region))
  const queue = [
    ...activePredictions.map((prediction) => ({
      kind: 'prediction' as const,
      at: issuedMs(prediction.calculatedAt),
      prediction,
    })),
    ...openAlerts.map((alert) => ({
      kind: 'alert' as const,
      at: issuedMs(alert.detectedAt),
      alert,
    })),
  ].sort((a, b) => b.at - a.at)

  const fallbackFromIncidents =
    openAlerts.length === 0 && activePredictions.length === 0
      ? scopedIncidents.filter((i) => i.status !== 'resolvida' && i.status !== 'cancelada')
          .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      : []

  return (
    <>
      <OpsPanel
        title="Fila operacional"
        subtitle="Alertas de ocorrências e previsões vigentes"
        compact
        className={cn('h-full min-h-0', className)}
        bodyClassName="fogo-scroll-hidden overflow-y-auto overscroll-contain"
      >
        {!dataReady && apiStatus !== 'offline' ? (
          <QueueSkeleton />
        ) : (
        <ul className="fogo-enter divide-y divide-fogo-border/80">
          {queue.map((entry) =>
            entry.kind === 'prediction' ? (
              <li key={entry.prediction.id}>
                <button
                  type="button"
                  className="flex w-full gap-2 border-l-2 border-fogo-prevision bg-fogo-prevision-bg/40 px-3 py-2.5 text-left transition-colors hover:bg-fogo-prevision-bg"
                  onClick={() => setSelectedPrediction(entry.prediction)}
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fogo-prevision" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-snug text-fogo-text">
                      {predictionHeadline(entry.prediction)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-fogo-prevision-bg px-2 py-0.5 text-[10px] text-fogo-prevision">
                        Previsão · {predictionRiskLabel(entry.prediction.probability)}
                      </span>
                      <span className="text-[10px] text-fogo-muted">{entry.prediction.region?.trim() || 'Cidade'}</span>
                      <time className="text-[10px] tabular-nums text-fogo-muted">
                        {formatDateTime(entry.prediction.calculatedAt)}
                      </time>
                    </span>
                  </span>
                </button>
              </li>
            ) : (
              <li key={entry.alert.id}>
                <button
                  type="button"
                  className="flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-fogo-bg/70"
                  onClick={() => setSelectedAlert(entry.alert)}
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fogo-critical" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-snug text-fogo-text">{alertHeadline(entry.alert.title)}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-fogo-muted">{entry.alert.description}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant={priorityVariant(entry.alert.severity === 'informativa' ? 'baixa' : entry.alert.severity === 'média' ? 'média' : entry.alert.severity === 'baixa' ? 'baixa' : entry.alert.severity)}>{entry.alert.severity}</Badge>
                      <time className="text-[10px] tabular-nums text-fogo-muted">
                        {formatDateTime(entry.alert.detectedAt)}
                      </time>
                    </span>
                  </span>
                </button>
              </li>
            ),
          )}
          {fallbackFromIncidents.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-fogo-bg/70"
                onClick={() => onSelectIncident?.(item.id)}
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fogo-critical" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fogo-text">{item.description}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge>
                    <time className="text-[10px] tabular-nums text-fogo-muted">{formatDateTime(item.openedAt)}</time>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        )}
      </OpsPanel>
      <AlertDetailDrawer
        alert={selectedAlert ? (alerts.find((a) => a.id === selectedAlert.id) ?? selectedAlert) : null}
        onClose={() => setSelectedAlert(null)}
      />
      <PredictionDetailDrawer prediction={selectedPrediction} onClose={() => setSelectedPrediction(null)} />
    </>
  )
}
