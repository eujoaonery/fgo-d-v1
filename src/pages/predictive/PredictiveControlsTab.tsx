import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  patchPredictiveControls,
  runPredictiveCycleNow,
  type PredictiveControls,
  type PredictiveRunRow,
} from '@/lib/api'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { formatDateTime } from '@/lib/format'

const TOGGLES: { key: keyof Pick<PredictiveControls, 'learningEnabled' | 'forecastsEnabled' | 'evaluationEnabled' | 'retrainEnabled' | 'includeSimulated'>; label: string; hint: string }[] = [
  { key: 'learningEnabled', label: 'Aprendizagem', hint: 'Atualiza a base de alertas usada nas regras. Não treina previsão de OS.' },
  { key: 'forecastsEnabled', label: 'Previsões', hint: 'Emite previsões de alerta. Pausar preserva o histórico já gravado.' },
  { key: 'evaluationEnabled', label: 'Avaliação', hint: 'Compara o previsto com os alertas emitidos depois do horizonte.' },
  { key: 'retrainEnabled', label: 'Retreinamento', hint: 'Mantido para o ciclo. O motor não troca um modelo de OS.' },
  { key: 'includeSimulated', label: 'Incluir simulados', hint: 'Quando desligado, o conjunto do motor fica só com dados reais.' },
]

export function PredictiveControlsTab({
  controls,
  runs,
  onChanged,
}: {
  controls?: PredictiveControls | null
  runs?: PredictiveRunRow[]
  onChanged: () => void
}) {
  const { can } = useCcoAccess()
  const manage = can('settings', 'manage')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intervalSec, setIntervalSec] = useState(controls?.intervalSec ?? 900)

  useEffect(() => {
    if (controls?.intervalSec) setIntervalSec(controls.intervalSec)
  }, [controls?.intervalSec])

  async function patch(next: Partial<PredictiveControls>, key = 'save') {
    if (!manage) return
    setBusy(key)
    setError(null)
    try {
      await patchPredictiveControls(next)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o controle.')
    } finally {
      setBusy(null)
    }
  }

  async function runNow() {
    if (!manage) return
    setBusy('run')
    setError(null)
    try {
      await runPredictiveCycleNow()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao executar o ciclo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Controles operacionais</h3>
        <p className="mt-1 text-xs text-fogo-muted">
          Estado persistente por cidade. O backend executa o ciclo mesmo com este painel fechado.
        </p>
        {error ? <p className="mt-2 text-sm text-fogo-critical">{error}</p> : null}
        <ul className="mt-3 divide-y divide-fogo-border/80">
          {TOGGLES.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-[11px] text-fogo-muted">{item.hint}</p>
              </div>
              <Button
                size="sm"
                variant={controls?.[item.key] ? 'primary' : 'outline'}
                disabled={!manage || busy != null || !controls}
                onClick={() => void patch({ [item.key]: !controls?.[item.key] }, item.key)}
              >
                {controls?.[item.key] ? 'Ligado' : 'Pausado'}
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-xs">
            <span className="text-fogo-muted">Intervalo do ciclo (segundos)</span>
            <input
              type="number"
              min={60}
              max={86400}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              className="mt-1 h-9 w-36 rounded-md border border-fogo-border bg-fogo-surface px-2 text-sm tabular-nums"
            />
          </label>
          <Button size="sm" variant="outline" disabled={!manage || busy != null} onClick={() => void patch({ intervalSec }, 'interval')}>
            Aplicar intervalo
          </Button>
          <Button size="sm" disabled={!manage || busy != null} onClick={() => void runNow()}>
            {busy === 'run' ? 'Executando…' : 'Rodar ciclo agora'}
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-fogo-muted">
          Última alteração {controls?.lastChangedAt ? formatDateTime(controls.lastChangedAt) : '—'}
          {controls?.lastChangedBy ? ` · ${controls.lastChangedBy}` : ''}
          {controls?.lastError ? ` · ${controls.lastError}` : ''}
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold">Execuções em segundo plano</h3>
        <ul className="mt-2 divide-y divide-fogo-border/80 text-xs">
          {(runs ?? []).length === 0 ? <li className="py-3 text-fogo-muted">Nenhum ciclo registrado ainda.</li> : null}
          {(runs ?? []).map((run) => (
            <li key={`${run.startedAt}-${run.step}`} className="py-2">
              <p className="font-medium">
                {run.step} · {run.status}
                {run.durationMs != null ? ` · ${Math.round(run.durationMs / 1000)}s` : ''}
              </p>
              <p className="text-fogo-muted">
                {formatDateTime(run.startedAt)}
                {run.error ? ` · ${run.error}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
