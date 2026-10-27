import type { PredictiveSummary } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { AlertTriangle, ArrowUpRight, Lightbulb, Wrench } from 'lucide-react'

const recIcons = [Lightbulb, Wrench, AlertTriangle]

export function PredictiveSignalsTab({
  summary,
  loading,
}: {
  summary: PredictiveSummary | null
  loading: boolean
}) {
  const kpis = summary?.kpis ?? []
  const anomalies = summary?.anomalies ?? []
  const recommendations = summary?.recommendations ?? []

  return (
    <div className="space-y-4">
      {summary?.insufficientHistory ? (
        <Card className="border-fogo-warning/40 p-3">
          <p className="text-sm font-medium text-fogo-warning">Histórico insuficiente</p>
          <p className="mt-1 text-xs text-fogo-muted">
            {summary.observationCount ?? 0} alerta(s) no conjunto atual. A previsão experimental só é habilitada a
            partir de {summary.minObservations ?? 50} alertas. O motor não prevê OS nem tickets.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <p className="text-[10px] text-fogo-muted">{k.label}</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums',
                k.tone === 'warning' && 'text-fogo-warning',
                k.tone === 'critical' && 'text-fogo-critical',
                k.tone === 'success' && 'text-fogo-success',
              )}
            >
              {k.value}
              <span className="ml-1 text-xs font-normal text-fogo-muted">{k.unit}</span>
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OpsPanel title="Sinais preditivos" subtitle="Previsões pendentes de confirmação">
          <ul className="divide-y divide-fogo-border/80">
            {loading ? (
              <li className="px-3 py-4 text-xs text-fogo-muted">Carregando…</li>
            ) : anomalies.length === 0 ? (
              <li className="px-3 py-4 text-xs text-fogo-muted">
                Nenhum sinal ativo. O motor avalia picos de alerta e pressão por região.
              </li>
            ) : (
              anomalies.map((a) => (
                <li key={a.id} className="flex gap-3 px-3 py-3">
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-fogo-border bg-gradient-to-br from-[#edf5f8] to-[#dbeafe]">
                    <AlertTriangle className="h-5 w-5 text-fogo-warning" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-fogo-text">{a.title}</p>
                    <p className="text-[10px] text-fogo-muted">
                      {a.location} · {a.time}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[10px] text-fogo-muted">{a.explanation}</p>
                    <Badge variant={a.severity === 'alta' ? 'critical' : 'warning'} className="mt-1">
                      {a.severity}
                    </Badge>
                  </div>
                </li>
              ))
            )}
          </ul>
        </OpsPanel>

        <OpsPanel title="Recomendações em aberto" subtitle="Decida na aba Recomendações — nada despacha sozinho">
          <ul className="space-y-2 p-3">
            {recommendations.length === 0 ? (
              <li className="text-xs text-fogo-muted">Sem recomendações — não há previsão pendente no momento.</li>
            ) : null}
            {recommendations.map((r, i) => {
              const Icon = recIcons[i] ?? Lightbulb
              return (
                <li
                  key={r.id}
                  className="flex items-start gap-2 rounded-fogo-md border border-fogo-border bg-fogo-bg/60 px-3 py-2.5"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fogo-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fogo-text">{r.text}</p>
                    <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-fogo-success">
                      Impacto {r.impact}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </OpsPanel>
      </div>
    </div>
  )
}
