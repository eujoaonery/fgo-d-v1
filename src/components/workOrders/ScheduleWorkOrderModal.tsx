import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { capabilityForIncidentType, capabilityLabel, teamCanHandle } from '@/lib/teamCapabilities'
import { addHoursIso, datetimeLocalValue, fromDatetimeLocal, osTitle } from '@/lib/workOrders'
import type { Incident } from '@/types'

export function ScheduleWorkOrderModal({
  incident,
  onClose,
}: {
  incident: Incident | null
  onClose: () => void
}) {
  const { teams, scheduleWorkOrder } = useOpsData()
  const required = incident?.requiredCapability ?? (incident ? capabilityForIncidentType(incident.type) : 'manutencao')
  const agents = useMemo(() => {
    const list = [...teams]
    list.sort((a, b) => {
      const aq = teamCanHandle(a.capabilities, required) ? 0 : 1
      const bq = teamCanHandle(b.capabilities, required) ? 0 : 1
      if (aq !== bq) return aq - bq
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    return list
  }, [teams, required])
  const [teamId, setTeamId] = useState('')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!incident) return
    setTeamId(incident.assignedTeamId ?? '')
    setStart(datetimeLocalValue(incident.scheduledStart) || datetimeLocalValue(new Date().toISOString()))
    setError(null)
  }, [incident])

  async function save() {
    if (!incident) return
    const startIso = fromDatetimeLocal(start)
    if (!teamId || !startIso) {
      setError('Informe o agente e o horário.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await scheduleWorkOrder(incident.id, { teamId, start: startIso, end: addHoursIso(startIso, 1) })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao agendar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!incident} onClose={onClose} title={incident ? `Agendar ${incident.id}` : 'Agendar OS'}>
      {incident ? (
        <div className="space-y-3 text-sm">
          <p className="text-fogo-muted">{osTitle(incident)}</p>
          <p className="text-xs text-fogo-muted">
            Qualificação sugerida: {capabilityLabel(required)}. Qualquer agente pode ser agendado.
          </p>
          <label className="block text-xs text-fogo-muted">
            Agente
            <select
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 text-sm text-fogo-text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {agents.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.region} · {t.status}
                  {teamCanHandle(t.capabilities, required) ? ' · qualificado' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-fogo-muted">
            Início
            <input
              type="datetime-local"
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 text-sm text-fogo-text"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <p className="text-[11px] text-fogo-muted">Duração padrão: 1 hora. A OS passa para o status agendada.</p>
          {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? 'Agendando…' : 'Confirmar agendamento'}
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}
