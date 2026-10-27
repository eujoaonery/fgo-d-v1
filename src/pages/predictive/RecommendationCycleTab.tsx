import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import {
  decidePrediction,
  reviewPrediction,
  type PredictionDecisionStatus,
  type PredictionRecord,
} from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

const DECISION_LABEL: Record<PredictionDecisionStatus, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
  deferred: 'Adiada',
  irrelevant: 'Irrelevante',
}

const OUTCOME_LABEL: Record<PredictionRecord['reviewStatus'], string> = {
  pending: 'Aguardando horizonte',
  confirmed: 'Confirmou',
  missed: 'Errou / não ocorreu',
  partial: 'Parcial',
  expired: 'Expirada',
}

const DECISIONS: Exclude<PredictionDecisionStatus, 'pending'>[] = [
  'accepted',
  'rejected',
  'deferred',
  'irrelevant',
]

const OUTCOMES: Exclude<PredictionRecord['reviewStatus'], 'pending'>[] = [
  'confirmed',
  'missed',
  'partial',
  'expired',
]

export function RecommendationCycleTab({
  predictions,
  onChanged,
}: {
  predictions: PredictionRecord[]
  onChanged: () => void
}) {
  const { can } = useCcoAccess()
  const manage = can('predictiveIntel', 'manage')
  const [selectedId, setSelectedId] = useState<string | null>(predictions[0]?.id ?? null)
  const [justification, setJustification] = useState('')
  const [observedNote, setObservedNote] = useState('')
  const [observedValue, setObservedValue] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = predictions.find((p) => p.id === selectedId) ?? predictions[0]

  async function decide(status: Exclude<PredictionDecisionStatus, 'pending'>) {
    if (!selected) return
    setError(null)
    setBusy(status)
    try {
      await decidePrediction(selected.id, { status, justification })
      setJustification('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar a decisão')
    } finally {
      setBusy(null)
    }
  }

  async function outcome(status: Exclude<PredictionRecord['reviewStatus'], 'pending'>) {
    if (!selected) return
    setError(null)
    setBusy(status)
    try {
      const n = observedValue.trim() ? Number(observedValue.replace(',', '.')) : undefined
      await reviewPrediction(selected.id, {
        status,
        note: observedNote.trim() || undefined,
        observedValue: n != null && Number.isFinite(n) ? n : undefined,
      })
      setObservedNote('')
      setObservedValue('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar o resultado')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-fogo-bg/70 text-xs text-fogo-muted">
            <tr>
              <th className="px-3 py-2 text-left">Previsão</th>
              <th className="px-3 py-2 text-left">Região</th>
              <th className="px-3 py-2 text-left">Decisão</th>
              <th className="px-3 py-2 text-left">Resultado observado</th>
              <th className="px-3 py-2 text-left">Previsto / observado</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p) => (
              <tr
                key={p.id}
                className={cn(
                  'cursor-pointer border-t border-fogo-border',
                  selected?.id === p.id && 'bg-fogo-accent/5',
                )}
                onClick={() => {
                  setSelectedId(p.id)
                  setJustification(p.decisionJustification ?? '')
                }}
              >
                <td className="px-3 py-2">
                  <p className="font-medium">{p.targetLabel}</p>
                  <p className="font-mono text-[10px] text-fogo-muted">{p.id}</p>
                </td>
                <td className="px-3 py-2 text-xs">{p.region ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge variant={p.decisionStatus === 'accepted' ? 'success' : p.decisionStatus === 'rejected' ? 'critical' : 'neutral'}>
                    {DECISION_LABEL[p.decisionStatus ?? 'pending']}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={p.reviewStatus === 'confirmed' ? 'success' : p.reviewStatus === 'missed' ? 'critical' : 'neutral'}>
                    {OUTCOME_LABEL[p.reviewStatus]}
                  </Badge>
                </td>
                <td className="px-3 py-2 tabular-nums text-xs">
                  {p.predictedValue ?? '—'} / {p.observedValue ?? '—'}
                </td>
              </tr>
            ))}
            {predictions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-fogo-muted">
                  Nenhuma previsão registrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-4 p-4">
        {!selected ? (
          <p className="text-sm text-fogo-muted">Selecione uma previsão.</p>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold">{selected.targetLabel}</h3>
              <p className="mt-1 text-xs text-fogo-muted">{selected.explanation}</p>
              {selected.recommendation ? (
                <p className="mt-2 rounded-fogo-md border border-fogo-border bg-fogo-bg/50 px-2 py-1.5 text-xs">
                  {selected.recommendation}
                </p>
              ) : null}
              <p className="mt-2 text-[10px] text-fogo-muted">
                Calculada {formatDateTime(selected.calculatedAt)} · horizonte {selected.horizonHours} h
              </p>
            </div>

            <section>
              <h4 className="text-xs font-semibold">Decisão da recomendação</h4>
              <p className="mt-0.5 text-[10px] text-fogo-muted">Aceitar, rejeitar, adiar ou marcar irrelevante — com justificativa.</p>
              <textarea
                className="mt-2 w-full rounded-fogo-md border border-fogo-border bg-fogo-bg px-2 py-1.5 text-xs"
                rows={3}
                minLength={8}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Justificativa obrigatória (mínimo 8 caracteres)"
                disabled={!manage}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {DECISIONS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={d === 'accepted' ? 'primary' : 'outline'}
                    disabled={!manage || busy != null || justification.trim().length < 8}
                    onClick={() => void decide(d)}
                  >
                    {busy === d ? '…' : DECISION_LABEL[d]}
                  </Button>
                ))}
              </div>
              {selected.decisionBy ? (
                <p className="mt-1 text-[10px] text-fogo-muted">
                  Última decisão: {DECISION_LABEL[selected.decisionStatus]} por {selected.decisionBy}
                  {selected.decisionAt ? ` em ${formatDateTime(selected.decisionAt)}` : ''}
                </p>
              ) : null}
            </section>

            <section>
              <h4 className="text-xs font-semibold">Resultado observado</h4>
              <p className="mt-0.5 text-[10px] text-fogo-muted">
                Depois do horizonte: o que de fato ocorreu, com valor numérico quando houver.
              </p>
              <input
                className="mt-2 w-full rounded-fogo-md border border-fogo-border bg-fogo-bg px-2 py-1.5 text-xs"
                value={observedValue}
                onChange={(e) => setObservedValue(e.target.value)}
                placeholder="Valor observado (opcional)"
                disabled={!manage}
              />
              <textarea
                className="mt-1 w-full rounded-fogo-md border border-fogo-border bg-fogo-bg px-2 py-1.5 text-xs"
                rows={2}
                value={observedNote}
                onChange={(e) => setObservedNote(e.target.value)}
                placeholder="Nota do resultado observado"
                disabled={!manage}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {OUTCOMES.map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant="outline"
                    disabled={!manage || busy != null}
                    onClick={() => void outcome(o)}
                  >
                    {busy === o ? '…' : OUTCOME_LABEL[o]}
                  </Button>
                ))}
              </div>
            </section>

            {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}
            {!manage ? (
              <p className="text-[10px] text-fogo-muted">Somente quem gerencia inteligência preditiva registra decisão e resultado.</p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
