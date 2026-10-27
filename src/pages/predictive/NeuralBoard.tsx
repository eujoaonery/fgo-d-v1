import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { provisionNeuralOfficial, type NeuralForecastView, type NeuralMaturity, type PredictiveSummary } from '@/lib/api'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { ForecastBoard } from '@/pages/predictive/ForecastBoard'

const LADDER: { id: NeuralMaturity; label: string }[] = [
  { id: 'sem_base', label: 'Sem base' },
  { id: 'inicial', label: 'Inicial' },
  { id: 'em_formacao', label: 'Em formação' },
  { id: 'em_prova', label: 'Em prova' },
  { id: 'confiavel', label: 'Confiável' },
]

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)
}

function fmtCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}

type CompareRow = { id: string; label: string; formula: number; neural: number | null; real: number }

function comparisonDays(summary: PredictiveSummary | null): { key: string; title: string; rows: CompareRow[] }[] {
  const formulaDays = summary?.accuracy?.history ?? []
  const neuralDays = summary?.neural?.history ?? []
  return formulaDays.map((day) => {
    const neuralDay = neuralDays.find((row) => row.date === day.date)
    const rows: CompareRow[] = [
      {
        id: 'day',
        label: 'Dia inteiro',
        formula: day.predicted,
        neural: neuralDay?.predicted ?? null,
        real: day.observed,
      },
      ...day.windows.map((window) => {
        const neuralWindow = neuralDay?.windows.find((row) => row.id === window.id)
        return {
          id: window.id,
          label: window.label,
          formula: window.predicted,
          neural: neuralWindow?.predicted ?? null,
          real: window.observed,
        }
      }),
    ]
    return { key: day.date, title: `${day.whenLabel} ${day.dateLabel}`, rows }
  })
}

function viewSummary(summary: PredictiveSummary | null): PredictiveSummary | null {
  const neural = summary?.neural
  if (!summary || !neural) return summary
  const hours = new Map(neural.hours.map((hour) => [hour.id, hour.predicted]))
  const days = new Map(neural.days.map((day) => [day.date, day.predicted]))
  return {
    ...summary,
    upcomingHours: (summary.upcomingHours ?? []).map((hour) => ({
      ...hour,
      predicted: hours.has(hour.id) ? (hours.get(hour.id) ?? hour.predicted) : hour.predicted,
    })),
    upcomingDays: (summary.upcomingDays ?? []).map((day) => ({
      ...day,
      predicted: days.has(day.date) ? (days.get(day.date) ?? day.predicted) : day.predicted,
    })),
    accuracy: summary.accuracy
      ? {
          ...summary.accuracy,
          history: (summary.accuracy.history ?? []).map((day) => {
            const neuralDay = neural.history.find((row) => row.date === day.date)
            if (!neuralDay) return day
            return {
              ...day,
              predicted: neuralDay.predicted,
              level: 'pending' as const,
              windows: day.windows.map((window) => {
                const neuralWindow = neuralDay.windows.find((row) => row.id === window.id)
                return neuralWindow ? { ...window, predicted: neuralWindow.predicted, level: 'pending' as const } : window
              }),
            }
          }),
        }
      : summary.accuracy,
  }
}

export function NeuralBoard({
  summary,
  loading,
  onProvisioned,
}: {
  summary: PredictiveSummary | null
  loading: boolean
  onProvisioned: () => void
}) {
  const neural: NeuralForecastView | null = summary?.neural ?? null
  const [tab, setTab] = useState<'previsoes' | 'comparacao' | 'confiabilidade'>('previsoes')
  const compared = comparisonDays(summary)
  const { can } = useCcoAccess()
  const canManage = can('settings', 'manage')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = neural?.maturity ?? 'sem_base'
  const hasProof = neural?.formulaMae != null || neural?.neuralMae != null

  async function provision() {
    if (!neural?.canProvision || !canManage || busy) return
    setBusy(true)
    setError(null)
    try {
      await provisionNeuralOfficial()
      onProvisioned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível tornar a rede oficial.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={tab === 'previsoes' ? 'primary' : 'outline'} onClick={() => setTab('previsoes')}>
          Previsões
        </Button>
        <Button type="button" size="sm" variant={tab === 'comparacao' ? 'primary' : 'outline'} onClick={() => setTab('comparacao')}>
          Comparação
        </Button>
        <Button type="button" size="sm" variant={tab === 'confiabilidade' ? 'primary' : 'outline'} onClick={() => setTab('confiabilidade')}>
          Confiabilidade
        </Button>
      </div>

      {tab === 'previsoes' ? (
        <div className="space-y-4">
          <p className="rounded-fogo-md border border-fogo-warning/40 bg-fogo-warning-bg px-3 py-2 text-sm text-fogo-warning">
            {neural?.canProvision
              ? 'Estes números são da rede e continuam só para visualização nesta aba. A fila do CCO só muda se a rede for provisionada.'
              : 'A rede ainda tem pouco tempo de treino e poucos parâmetros. Por isso estes números não são confiáveis: servem só para olhar e podem errar. Eles não entram na fila do CCO.'}
          </p>
          <ForecastBoard summary={viewSummary(summary)} loading={loading} />
        </div>
      ) : null}

      {tab === 'comparacao' ? (
        <div className="space-y-4">
          <p className="max-w-xl text-sm text-fogo-muted">
            Cada dia já fechado mostra a quantidade da fórmula, a quantidade da rede e o que aconteceu de fato.
          </p>
          {compared.length === 0 ? (
            <p className="text-sm text-fogo-muted">Ainda não há um dia fechado para comparar.</p>
          ) : (
            compared.map((day) => (
              <div key={day.key} className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
                <p className="border-b border-fogo-border px-3 py-2 text-sm text-fogo-text">{day.title}</p>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-fogo-bg/80 text-xs text-fogo-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Janela</th>
                      <th className="px-3 py-2 text-right font-medium">Previsão da fórmula</th>
                      <th className="px-3 py-2 text-right font-medium">Previsão da rede neural</th>
                      <th className="px-3 py-2 text-right font-medium">Resultado real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((row) => (
                      <tr key={row.id} className="border-t border-fogo-border/70">
                        <td className="px-3 py-2 text-fogo-text">{row.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fogo-text">{fmtCount(row.formula)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fogo-text">{fmtCount(row.neural)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fogo-text">{fmtCount(row.real)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'confiabilidade' ? (
    <div className="mx-auto max-w-5xl space-y-8">
      <section>
        <p className="text-sm text-fogo-muted">Confiabilidade da rede</p>
        <p className="mt-2 text-2xl font-semibold text-fogo-text">{neural?.maturityLabel ?? 'Sem base'}</p>
        <p className="mt-2 max-w-xl text-sm text-fogo-muted">{neural?.note ?? 'Lendo a rede.'}</p>
        <ol className="mt-4 flex flex-wrap gap-2">
          {LADDER.map((step) => {
            const active = step.id === current
            return (
              <li
                key={step.id}
                className={`rounded-fogo-md border px-2.5 py-1 text-sm ${active ? 'border-fogo-accent text-fogo-text' : 'border-fogo-border text-fogo-muted'}`}
              >
                {step.label}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-fogo-md border border-fogo-border px-3 py-3">
          <p className="text-sm text-fogo-muted">Erro da fórmula</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fogo-text">{hasProof ? fmt(neural?.formulaMae) : '—'}</p>
        </div>
        <div className="rounded-fogo-md border border-fogo-border px-3 py-3">
          <p className="text-sm text-fogo-muted">Erro da rede</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fogo-text">{hasProof ? fmt(neural?.neuralMae) : '—'}</p>
        </div>
      </section>
      <p className="text-sm text-fogo-muted">
        {hasProof
          ? 'Os dois erros são da próxima 1 hora e das próximas 3 horas, nos dias deixados de fora do treino. O número menor erra menos.'
          : 'Sem dia fechado, ainda não há erro para comparar. A mesa normal continua na fórmula.'}
      </p>

      <section className="border-t border-fogo-border/80 pt-6">
        <p className="text-sm text-fogo-text">Tornar a rede oficial</p>
        <p className="mt-1 max-w-xl text-sm text-fogo-muted">
          Isso envia a quantidade da rede para a fila de previsões, no lugar da fórmula nessas janelas. A mesa normal do
          Prevision Engine continua na fórmula.
        </p>
        {error ? <p className="mt-3 text-sm text-fogo-text">{error}</p> : null}
        {neural?.official ? <p className="mt-3 text-sm text-fogo-text">A rede já está oficial na fila de previsões.</p> : null}
        {neural?.canProvision && canManage && !neural.official ? (
          <Button type="button" className="mt-3" variant="primary" disabled={busy} onClick={() => void provision()}>
            {busy ? 'Provisionando…' : 'Provisionar rede neural'}
          </Button>
        ) : null}
        {!neural?.canProvision ? (
          <p className="mt-3 text-sm text-fogo-muted">O botão aparece quando a rede estiver confiável.</p>
        ) : null}
        {neural?.canProvision && !canManage && !neural.official ? (
          <p className="mt-3 text-sm text-fogo-muted">A rede está confiável. Só quem administra a cidade torna isso oficial.</p>
        ) : null}
      </section>
    </div>
      ) : null}
    </div>
  )
}
