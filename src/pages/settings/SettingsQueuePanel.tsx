import { useState } from 'react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { resolveOpenOccurrences } from '@/lib/api'
import { isOccurrencePending } from '@/lib/occurrenceState'

export function SettingsQueuePanel({ canManage, apiConnected }: { canManage: boolean; apiConnected: boolean }) {
  const { alerts, refresh } = useOpsData()
  const openCount = alerts.filter((alert) => isOccurrencePending(alert.state)).length
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function solveOpen() {
    const ok = window.confirm(
      'Isso marca todas as ocorrências em aberto como solucionadas. Os registros continuam no histórico para o Prevision Engine. A fila do CCO fica sem pendências. Deseja continuar?',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await resolveOpenOccurrences()
      await refresh()
      setMessage(
        result.resolved === 0
          ? 'Não havia ocorrência em aberto.'
          : `${result.resolved.toLocaleString('pt-BR')} ocorrência(s) solucionada(s). O histórico permanece.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível solucionar a fila.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <OpsPanel
      title="Fila do CCO"
      subtitle="Soluciona as ocorrências em aberto e conserva o histórico que o Prevision Engine analisa."
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-fogo-text">
          <span className="text-2xl font-semibold tabular-nums">{openCount.toLocaleString('pt-BR')}</span>
          <span className="ml-2 text-sm text-fogo-muted">em aberto agora</span>
        </p>
        <p className="text-xs leading-relaxed text-fogo-muted">
          Cada ocorrência sai da fila pendente e fica solucionada. O cadastro, a data e o conteúdo continuam no banco,
          então a previsão segue com os mesmos parâmetros. Nada é apagado.
        </p>
        {message ? (
          <p className="rounded-fogo-md border border-fogo-success/40 bg-fogo-success/10 px-3 py-2 text-xs text-fogo-text">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-3 py-2 text-xs text-fogo-text">
            {error}
          </p>
        ) : null}
        {!canManage ? (
          <p className="text-xs text-fogo-muted">Somente quem administra a cidade pode executar esta ação.</p>
        ) : null}
        <Button type="button" variant="primary" disabled={!canManage || !apiConnected || busy} onClick={() => void solveOpen()}>
          {busy ? 'Solucionando…' : 'Solucionar ocorrências em aberto'}
        </Button>
      </div>
    </OpsPanel>
  )
}
