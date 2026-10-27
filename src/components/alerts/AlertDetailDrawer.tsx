import { useEffect, useMemo, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { fetchAlertHistory } from '@/lib/api'
import { DataOriginBadge } from '@/components/ops/DataOriginBadge'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { useNow } from '@/hooks/useNow'
import type { AlertHistoryEntry, AlertState, OperationalAlert } from '@/types'
import { formatDateTime, formatDurationMs } from '@/lib/format'
import { isAlertOpen, slaClock } from '@/lib/alertSlaMetrics'
import { canSeeCategorySla, formatSlaPercent, slaPercentForAlert, slaTone } from '@/lib/categorySla'
import { isOccurrenceFinal, isOccurrencePending, occurrenceStateLabel } from '@/lib/occurrenceState'
import { SubjectSelect } from '@/components/workOrders/SubjectSelect'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { cn } from '@/lib/cn'
import { alertBody, alertHeadline } from '@/lib/alertCopy'

const NEXT_STATES: Partial<Record<AlertState, AlertState[]>> = {
  novo: ['reconhecido'],
  reconhecido: ['em atendimento', 'em observação'],
  'em atendimento': ['em observação'],
  'em observação': ['em atendimento'],
}

function isOverdue(alert: OperationalAlert): boolean {
  if (!alert.responseDueAt) return false
  if (!isOccurrencePending(alert.state)) return false
  return Date.now() > new Date(alert.responseDueAt).getTime()
}

interface AlertDetailDrawerProps {
  alert: OperationalAlert | null
  onClose: () => void
}

export function AlertDetailDrawer({ alert, onClose }: AlertDetailDrawerProps) {
  const { transitionAlert, assumeAlert, createIncidentFromAlert, apiConnected, refresh } = useOpsData()
  const { profile } = useCcoAuth()
  const { can } = useCcoAccess()
  const { openAsset } = useAssetDossier()
  const now = useNow(1000)
  const [history, setHistory] = useState<AlertHistoryEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osDescription, setOsDescription] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [showOsForm, setShowOsForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [closeState, setCloseState] = useState<'resolvido' | 'falso positivo'>('resolvido')
  const [closeNote, setCloseNote] = useState('')
  const meId = profile?.actor?.userId
  const showSla = canSeeCategorySla({
    isPlatformSuperAdmin: profile?.isPlatformSuperAdmin,
    memberRole: profile?.actor?.role,
  })

  useEffect(() => {
    if (!alert?.id || !apiConnected) {
      setHistory([])
      return
    }
    void fetchAlertHistory(alert.id)
      .then(setHistory)
      .catch(() => setHistory([]))
    setShowOsForm(false)
    setShowCloseForm(false)
    setOsDescription(alert.description)
    setSubjectId('')
    setCloseNote('')
    setError(null)
  }, [alert?.id, alert?.description, apiConnected])

  const nextStates = useMemo(() => (alert ? NEXT_STATES[alert.state] ?? [] : []), [alert])

  async function toState(state: AlertState) {
    if (!alert) return
    setBusy(state)
    setError(null)
    try {
      await transitionAlert(alert.id, state, `Transição CCO → ${occurrenceStateLabel(state)}`)
      const h = await fetchAlertHistory(alert.id)
      setHistory(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na transição')
    } finally {
      setBusy(null)
    }
  }

  async function claim() {
    if (!alert) return
    setBusy('assume')
    setError(null)
    try {
      await assumeAlert(alert.id)
      const h = await fetchAlertHistory(alert.id)
      setHistory(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao assumir')
    } finally {
      setBusy(null)
    }
  }

  async function openIncident() {
    if (!alert) return
    if (!subjectId) {
      setError('Selecione o assunto da ordem de serviço.')
      setShowOsForm(true)
      return
    }
    setBusy('incident')
    setError(null)
    try {
      await createIncidentFromAlert(alert.id, { subjectId, description: osDescription.trim() || undefined })
      await refresh()
      setShowOsForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar ordem de serviço')
    } finally {
      setBusy(null)
    }
  }

  async function closeInCco() {
    if (!alert) return
    if (!closeNote.trim()) {
      setError('Informe o relato da atuação no CCO.')
      return
    }
    setBusy('close')
    setError(null)
    try {
      await transitionAlert(alert.id, closeState, closeNote.trim())
      const h = await fetchAlertHistory(alert.id)
      setHistory(h)
      setShowCloseForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao finalizar a ocorrência')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer open={!!alert} onClose={onClose} title={alert ? alertHeadline(alert.title) : ''} subtitle={alert?.id}>
      {alert && (
        <div className="space-y-4 text-sm">
          <p className="text-fogo-muted">{alertBody(alert)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={priorityVariant(alert.severity === 'informativa' ? 'baixa' : alert.severity)}>
              {alert.severity}
            </Badge>
            <Badge variant="neutral">{occurrenceStateLabel(alert.state)}</Badge>
            <DataOriginBadge origin={alert.dataOrigin} />
            {showSla && isOverdue(alert) ? <Badge variant="critical">SLA excedido</Badge> : null}
            {(alert.escalationLevel ?? 0) > 0 ? (
              <Badge variant="warning">Escalonamento nível {alert.escalationLevel}</Badge>
            ) : null}
          </div>
          <dl className="space-y-2 text-xs">
            <Row label="Detectada" value={formatDateTime(alert.detectedAt)} />
            <Row label="Tempo desde a ocorrência" value={formatElapsed(alert, now)} />
            {showSla && alert.responseDueAt ? (
              <Row label="Prazo SLA" value={formatDateTime(alert.responseDueAt)} warn={isOverdue(alert)} />
            ) : null}
            {showSla ? (
              <Row
                label="SLA"
                value={formatSlaPercent(slaPercentForAlert(alert, now))}
                warn={slaTone(slaPercentForAlert(alert, now)) !== 'ok'}
              />
            ) : null}
            {alert.claimedByLabel ? <Row label="Assumido por" value={alert.claimedByLabel} /> : null}
            {alert.region ? <Row label="Região" value={alert.region} /> : null}
            {alert.relatedAssetId ? (
              <div className="flex items-center justify-between gap-3 border-b border-fogo-border/70 pb-1.5">
                <dt className="text-fogo-muted">Ativo</dt>
                <dd>
                  <Button size="sm" variant="outline" onClick={() => openAsset(alert.relatedAssetId!)}>
                    {alert.relatedAssetId}
                  </Button>
                </dd>
              </div>
            ) : null}
            {alert.incidentId ? <Row label="Ordem de serviço" value={alert.incidentId} mono accent /> : null}
          </dl>

          {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}

          {apiConnected && alert && isAlertOpen(alert.state) && !alert.claimedBy ? (
            <Button size="sm" variant="primary" className="w-full" disabled={busy !== null} onClick={() => void claim()}>
              {busy === 'assume' ? 'Assumindo…' : 'Assumir ocorrência'}
            </Button>
          ) : null}
          {alert.claimedBy && meId && alert.claimedBy === meId ? (
            <p className="text-xs text-fogo-success">Você assumiu esta ocorrência.</p>
          ) : null}
          {alert.claimedBy && meId && alert.claimedBy !== meId ? (
            <p className="text-xs text-fogo-warning">Em atendimento por {alert.claimedByLabel ?? 'outro operador'}.</p>
          ) : null}

          {apiConnected && nextStates.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-fogo-muted">Andamento</p>
              <div className="flex flex-wrap gap-1.5">
                {nextStates.map((s) => (
                  <Button key={s} size="sm" variant="outline" disabled={busy !== null} onClick={() => void toState(s)}>
                    {busy === s ? '…' : occurrenceStateLabel(s)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {apiConnected && isOccurrencePending(alert.state) ? (
            <div className="space-y-2 rounded-fogo-md border border-fogo-border p-3">
              {!showOsForm ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  disabled={busy !== null || !can('incidents', 'manage')}
                  onClick={() => setShowOsForm(true)}
                >
                  Abrir ordem de serviço
                </Button>
              ) : (
                <>
                  <p className="text-xs font-medium text-fogo-text">Nova ordem de serviço</p>
                  <p className="text-[11px] text-fogo-muted">
                    A OS é manual. O assunto é obrigatório. A ocorrência sai da fila pendente com status OS aberta.
                  </p>
                  <SubjectSelect value={subjectId} canCreate={can('incidents', 'manage')} onChange={(id) => setSubjectId(id)} />
                  <textarea
                    className="min-h-[72px] w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
                    value={osDescription}
                    onChange={(e) => setOsDescription(e.target.value)}
                    placeholder="Complemento para o agente (opcional)"
                  />
                  <Button size="sm" variant="primary" className="w-full" disabled={busy !== null} onClick={() => void openIncident()}>
                    {busy === 'incident' ? 'Abrindo…' : 'Confirmar ordem de serviço'}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {apiConnected && isOccurrencePending(alert.state) ? (
            <div className="space-y-2 rounded-fogo-md border border-fogo-border p-3">
              {!showCloseForm ? (
                <Button size="sm" variant="outline" className="w-full" disabled={busy !== null} onClick={() => setShowCloseForm(true)}>
                  Resolver no CCO sem OS
                </Button>
              ) : (
                <>
                  <p className="text-xs font-medium text-fogo-text">Atuação no CCO</p>
                  <p className="text-[11px] text-fogo-muted">
                    Finaliza a ocorrência sem ordem de serviço. O relato é obrigatório.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={closeState === 'resolvido' ? 'primary' : 'outline'}
                      onClick={() => setCloseState('resolvido')}
                    >
                      Resolvido
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={closeState === 'falso positivo' ? 'primary' : 'outline'}
                      onClick={() => setCloseState('falso positivo')}
                    >
                      Alarme falso
                    </Button>
                  </div>
                  <textarea
                    className="min-h-[88px] w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="Relato da atuação no CCO"
                    required
                  />
                  <Button size="sm" variant="primary" className="w-full" disabled={busy !== null} onClick={() => void closeInCco()}>
                    {busy === 'close' ? 'Finalizando…' : 'Finalizar ocorrência'}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {isOccurrenceFinal(alert.state) ? (
            <p className="text-xs text-fogo-muted">
              {alert.state === 'os_aberta'
                ? `Ocorrência encerrada na fila — ${alert.incidentId ? `OS ${alert.incidentId}` : 'OS vinculada'}.`
                : `Ocorrência finalizada no CCO (${occurrenceStateLabel(alert.state)}).`}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fogo-muted">Histórico</p>
            {history.length === 0 ? (
              <p className="text-xs text-fogo-muted">Sem registros ainda.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-fogo-md border border-fogo-border/80 px-3 py-2 text-xs">
                    <time className="text-fogo-muted">{formatDateTime(h.changedAt)}</time>
                    <p className="mt-0.5 text-fogo-text">
                      {h.fromState
                        ? `${occurrenceStateLabel(h.fromState)} → ${occurrenceStateLabel(h.toState)}`
                        : occurrenceStateLabel(h.toState)}
                      <span className="text-fogo-muted"> · {h.actorLabel}</span>
                    </p>
                    {h.note ? <p className="text-fogo-muted">{h.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}

function formatElapsed(alert: OperationalAlert, now: number) {
  const closed = !isAlertOpen(alert.state)
  const clock = slaClock(alert.detectedAt, closed ? alert.completedAt : undefined, now, closed)
  const label = formatDurationMs(clock.ms)
  return clock.pending ? `${label} em aberto` : label
}

function Row({
  label,
  value,
  mono,
  accent,
  warn,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-fogo-border/70 pb-1.5">
      <dt className="text-fogo-muted">{label}</dt>
      <dd
        className={cn(
          'text-right font-medium',
          mono && 'font-mono text-[11px]',
          accent && 'text-fogo-accent',
          warn && 'text-fogo-critical',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
