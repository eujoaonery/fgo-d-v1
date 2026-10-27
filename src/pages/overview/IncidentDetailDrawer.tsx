import { useEffect, useMemo, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Badge, priorityVariant, statusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { fetchIncidentAlerts, fetchIncidentHistory, type IncidentHistoryEntry } from '@/lib/api'
import type { OperationalAlert } from '@/types'
import { capabilityForIncidentType, capabilityLabel, teamCanHandle } from '@/lib/teamCapabilities'
import type { Incident, IncidentStatus, TeamCapability } from '@/types'
import { formatDateTime } from '@/lib/format'
import { DataOriginBadge } from '@/components/ops/DataOriginBadge'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { ScheduleWorkOrderModal } from '@/components/workOrders/ScheduleWorkOrderModal'
import { OsCloseForm } from '@/components/workOrders/OsCloseForm'
import { isOsClosed, OS_WORKFLOW_STATUSES } from '@/lib/workOrders'
import { alertHeadline } from '@/lib/alertCopy'

interface IncidentDetailDrawerProps {
  incident: Incident | null
  onClose: () => void
}

function requiredForIncident(incident: Incident): TeamCapability {
  return incident.requiredCapability ?? capabilityForIncidentType(incident.type)
}

export function IncidentDetailDrawer({ incident, onClose }: IncidentDetailDrawerProps) {
  const {
    updateIncidentStatus,
    patchIncidentFields,
    linkAlertsToIncident,
    teams,
    alerts,
    apiConnected,
  } = useOpsData()
  const [history, setHistory] = useState<IncidentHistoryEntry[]>([])
  const [linkedAlerts, setLinkedAlerts] = useState<OperationalAlert[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<Incident['priority']>('média')
  const [notesEdit, setNotesEdit] = useState('')
  const [linkProtocol, setLinkProtocol] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const { openAsset } = useAssetDossier()

  const required = incident ? requiredForIncident(incident) : null

  const qualifiedTeams = useMemo(() => {
    if (!incident || !required) return []
    return teams.filter((t) => teamCanHandle(t.capabilities, required))
  }, [teams, incident, required])

  useEffect(() => {
    if (!incident) return
    setDueAt(incident.dueAt?.slice(0, 10) ?? '')
    setPriority(incident.priority)
    setNotesEdit(incident.notes ?? '')
  }, [incident])

  useEffect(() => {
    if (!incident || !apiConnected) {
      setHistory([])
      setLinkedAlerts([])
      return
    }
    void fetchIncidentHistory(incident.id)
      .then(setHistory)
      .catch(() => setHistory([]))
    void fetchIncidentAlerts(incident.id)
      .then(setLinkedAlerts)
      .catch(() => setLinkedAlerts([]))
  }, [incident, apiConnected])

  async function setStatus(status: IncidentStatus) {
    if (!incident) return
    setActionError(null)
    setBusy(status)
    try {
      await updateIncidentStatus(incident.id, status, `Estado da OS alterado para ${status}`)
      const h = await fetchIncidentHistory(incident.id)
      setHistory(h)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível atualizar a ordem de serviço.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
    <Drawer
      open={!!incident}
      onClose={onClose}
      title={incident?.id ?? ''}
      subtitle={incident?.type}
    >
      {incident && (
        <div className="space-y-5">
          {incident.workOrderDescription ? (
            <div>
              <p className="text-[11px] font-medium text-fogo-muted">Descrição da OS</p>
              <p className="text-sm leading-relaxed text-fogo-text">{incident.workOrderDescription}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-medium text-fogo-muted">Dados da ocorrência</p>
            <p className="text-sm leading-relaxed text-fogo-text">{incident.description}</p>
          </div>

          {required ? (
            <div className="rounded-fogo-md border border-fogo-accent/25 bg-fogo-gradient-to/30 px-3 py-2.5 text-xs">
              <p className="font-medium text-fogo-text">Qualificação sugerida</p>
              <p className="mt-0.5 text-fogo-muted">{capabilityLabel(required)}</p>
              <p className="mt-2 text-fogo-muted">
                {qualifiedTeams.length
                  ? `${qualifiedTeams.length} agente(s) com este perfil. A OS pode ser agendada para qualquer agente.`
                  : 'Nenhum agente cadastrado tem este perfil. A OS ainda pode ser agendada para qualquer agente.'}
              </p>
            </div>
          ) : null}

          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
              <dt className="text-fogo-muted">Prioridade</dt>
              <dd>
                <Badge variant={priorityVariant(incident.priority)}>{incident.priority}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
              <dt className="text-fogo-muted">Estado</dt>
              <dd>
                <Badge variant={statusVariant(incident.status)}>{incident.status}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
              <dt className="text-fogo-muted">Região</dt>
              <dd className="font-medium">{incident.region}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
              <dt className="text-fogo-muted">Local</dt>
              <dd className="max-w-[220px] text-right font-medium">{incident.location}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
              <dt className="text-fogo-muted">Abertura</dt>
              <dd className="tabular-nums">{formatDateTime(incident.openedAt)}</dd>
            </div>
            {incident.assignee && (
              <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
                <dt className="text-fogo-muted">Agente atribuído</dt>
                <dd>{incident.assignee}</dd>
              </div>
            )}
            {incident.scheduledStart ? (
              <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
                <dt className="text-fogo-muted">Agenda</dt>
                <dd className="tabular-nums">{formatDateTime(incident.scheduledStart)}</dd>
              </div>
            ) : null}
            {incident.dueAt ? (
              <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
                <dt className="text-fogo-muted">Prazo</dt>
                <dd className="tabular-nums">{formatDateTime(incident.dueAt)}</dd>
              </div>
            ) : null}
            {incident.diagnosis ? (
              <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
                <dt className="text-fogo-muted">Diagnóstico</dt>
                <dd className="max-w-[220px] text-right">{incident.diagnosis}</dd>
              </div>
            ) : null}
            {incident.materials ? (
              <div className="flex justify-between gap-4 border-b border-fogo-border pb-2">
                <dt className="text-fogo-muted">Materiais</dt>
                <dd className="max-w-[220px] text-right">{incident.materials}</dd>
              </div>
            ) : null}
            {incident.relatedAssetId && (
              <div className="flex justify-between gap-4">
                <dt className="text-fogo-muted">Ativo relacionado</dt>
                <dd>
                  <Button size="sm" variant="outline" onClick={() => openAsset(incident.relatedAssetId!)}>
                    {incident.relatedAssetId}
                  </Button>
                </dd>
              </div>
            )}
            {incident.dataOrigin ? (
              <div className="flex justify-between gap-4">
                <dt className="text-fogo-muted">Procedência</dt>
                <dd>
                  <DataOriginBadge origin={incident.dataOrigin} />
                </dd>
              </div>
            ) : null}
          </dl>

          {apiConnected && incident.status !== 'resolvida' && incident.status !== 'cancelada' ? (
            <div className="space-y-2 rounded-fogo-md border border-fogo-border p-3 text-xs">
              <p className="font-medium text-fogo-text">Metadados da OS</p>
              <label className="block">
                Prioridade
                <select
                  className="mt-1 h-8 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Incident['priority'])}
                >
                  {(['baixa', 'média', 'alta', 'crítica'] as const).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Prazo (data)
                <input
                  type="date"
                  className="mt-1 h-8 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
              <label className="block">
                Notas operacionais
                <textarea
                  className="mt-1 min-h-[56px] w-full rounded-fogo-md border border-fogo-border px-2 py-1"
                  value={notesEdit}
                  onChange={(e) => setNotesEdit(e.target.value)}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={busy !== null}
                onClick={() => {
                  setBusy('save-meta')
                  void patchIncidentFields(incident.id, {
                    priority,
                    dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
                    notes: notesEdit,
                  })
                    .catch((e) => setActionError(e instanceof Error ? e.message : 'Erro ao salvar'))
                    .finally(() => setBusy(null))
                }}
              >
                Salvar prioridade e prazo
              </Button>
              <div className="border-t border-fogo-border pt-2">
                <p className="mb-1 text-fogo-muted">Vincular alertas (N → 1 OS)</p>
                <div className="flex gap-1">
                  <select
                    className="h-8 flex-1 rounded-fogo-md border border-fogo-border px-2"
                    value={linkProtocol}
                    onChange={(e) => setLinkProtocol(e.target.value)}
                  >
                    <option value="">Selecione alerta…</option>
                    {alerts
                      .filter((a) => !a.incidentId || a.incidentId === incident.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} — {alertHeadline(a.title).slice(0, 48)}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!linkProtocol || busy !== null}
                    onClick={() => {
                      setBusy('link')
                      void linkAlertsToIncident(incident.id, [linkProtocol])
                        .then(() => fetchIncidentAlerts(incident.id).then(setLinkedAlerts))
                        .catch((e) => setActionError(e instanceof Error ? e.message : 'Erro ao vincular'))
                        .finally(() => setBusy(null))
                    }}
                  >
                    Vincular
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {linkedAlerts.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-fogo-muted">Alertas vinculados</h4>
              <ul className="mt-1 space-y-1 text-xs">
                {linkedAlerts.map((a) => (
                  <li key={a.id} className="rounded border border-fogo-border/80 px-2 py-1">
                    <span className="font-mono text-fogo-accent">{a.id}</span> — {alertHeadline(a.title)}{' '}
                    <span className="text-fogo-muted">({a.state})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {incident.notes && (
            <div className="rounded-fogo-md border border-fogo-border bg-fogo-bg p-3 text-sm text-fogo-muted">
              {incident.notes}
            </div>
          )}

          {actionError ? (
            <p className="rounded-fogo-md border border-fogo-critical/30 bg-fogo-critical-bg px-3 py-2 text-xs text-fogo-critical">
              {actionError}
            </p>
          ) : null}

          {apiConnected && !isOsClosed(incident.status) ? (
            <div className="space-y-3">
              <Button size="sm" variant="primary" className="w-full" onClick={() => setScheduleOpen(true)}>
                {incident.scheduledStart ? 'Reagendar ordem' : 'Agendar ordem de serviço'}
              </Button>

              <div>
                <p className="mb-1 text-[11px] font-medium text-fogo-muted">Estado da OS</p>
                <div className="flex flex-wrap gap-1">
                  {OS_WORKFLOW_STATUSES.map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={incident.status === st ? 'primary' : 'outline'}
                      disabled={busy !== null || incident.status === st}
                      onClick={() => void setStatus(st)}
                    >
                      {st}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void setStatus('cancelada')}
                  >
                    cancelada
                  </Button>
                </div>
              </div>

              <OsCloseForm
                incident={incident}
                busy={busy !== null}
                onSave={async (fields) => {
                  setActionError(null)
                  setBusy(fields.status ?? 'save-close')
                  try {
                    await patchIncidentFields(incident.id, {
                      ...fields,
                      actorLabel: 'agente de campo',
                    })
                    const h = await fetchIncidentHistory(incident.id)
                    setHistory(h)
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : 'Não foi possível salvar o fechamento.')
                  } finally {
                    setBusy(null)
                  }
                }}
              />
            </div>
          ) : null}

          {isOsClosed(incident.status) && (incident.closeProblem || incident.closeSolution || (incident.closeImages?.length ?? 0) > 0) ? (
            <div className="space-y-2 rounded-fogo-md border border-fogo-border p-3 text-xs">
              <p className="font-medium text-fogo-text">Registro de fechamento</p>
              {incident.closeProblem ? <p>Problema: {incident.closeProblem}</p> : null}
              {incident.closeSolution ? <p>Solução: {incident.closeSolution}</p> : null}
              {incident.closeImages?.length ? (
                <div className="flex flex-wrap gap-1">
                  {incident.closeImages.map((img, idx) => (
                    <img key={`${img.fileName}-${idx}`} src={img.dataUrl} alt={img.fileName} className="h-16 w-16 rounded object-cover" />
                  ))}
                </div>
              ) : null}
              {incident.closeSignature ? (
                <img src={incident.closeSignature} alt="Assinatura" className="h-16 rounded border border-fogo-border bg-white" />
              ) : null}
            </div>
          ) : null}

          {history.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fogo-muted">Histórico</h4>
              <ul className="mt-2 space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-fogo-md border border-fogo-border/80 px-3 py-2 text-xs">
                    <time className="text-fogo-muted">{formatDateTime(h.changedAt)}</time>
                    <p className="mt-0.5 text-fogo-text">
                      {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                      <span className="text-fogo-muted"> · {h.actorLabel}</span>
                    </p>
                    {h.note ? <p className="text-fogo-muted">{h.note}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button variant="primary" className="flex-1" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </Drawer>
    <ScheduleWorkOrderModal incident={scheduleOpen ? incident : null} onClose={() => setScheduleOpen(false)} />
    </>
  )
}
