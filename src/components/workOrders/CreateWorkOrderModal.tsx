import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { OS_CATEGORIES, OS_REGIONS } from '@/lib/workOrders'
import { capabilityForIncidentType, capabilityLabel, teamCanHandle } from '@/lib/teamCapabilities'
import { isOccurrencePending, subjectSuggestsOsType } from '@/lib/occurrenceState'
import { SubjectSelect } from '@/components/workOrders/SubjectSelect'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import type { IncidentPriority } from '@/types'
import type { PredictionRecord } from '@/lib/api'
import { alertHeadline } from '@/lib/alertCopy'

const PRIORITIES: IncidentPriority[] = ['baixa', 'média', 'alta', 'crítica']

export function CreateWorkOrderModal({
  open,
  onClose,
  presetAlertProtocol,
  presetPrediction,
}: {
  open: boolean
  onClose: () => void
  presetAlertProtocol?: string
  presetPrediction?: PredictionRecord
}) {
  const { assets, teams, alerts, createWorkOrder, apiConnected } = useOpsData()
  const { can } = useCcoAccess()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    subjectId: '',
    description: '',
    type: 'corretiva',
    region: 'Centro',
    priority: 'média' as IncidentPriority,
    relatedAssetId: '',
    location: '',
    assignee: '',
    dueDate: '',
    sourceAlertId: presetAlertProtocol ?? '',
    sourcePredictionId: presetPrediction?.id ?? '',
    predictionDuplicateNote: '',
  })

  useEffect(() => {
    if (!open || !presetPrediction) return
    setForm((f) => ({
      ...f,
      sourcePredictionId: presetPrediction.id,
      region: presetPrediction.region || f.region,
      location: presetPrediction.region || f.location,
      relatedAssetId: presetPrediction.assetExternalId || f.relatedAssetId,
      description:
        f.description ||
        `${presetPrediction.targetLabel}. ${presetPrediction.explanation}`.slice(0, 500),
      dueDate: presetPrediction.periodEnd ? presetPrediction.periodEnd.slice(0, 10) : f.dueDate,
    }))
  }, [open, presetPrediction])

  const pendingOccurrences = useMemo(
    () => alerts.filter((a) => isOccurrencePending(a.state)).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [alerts],
  )

  const required = capabilityForIncidentType(form.type)
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!apiConnected) return
    if (!form.subjectId) {
      setError('Selecione o assunto da ordem de serviço.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const asset = assets.find((a) => a.id === form.relatedAssetId)
      await createWorkOrder({
        subjectId: form.subjectId,
        description: form.description.trim() || undefined,
        type: form.type,
        region: form.region || asset?.region,
        priority: form.priority,
        relatedAssetId: form.relatedAssetId || undefined,
        location: form.location.trim() || asset?.name || undefined,
        assignee: form.assignee.trim() || undefined,
        dueAt: form.dueDate ? `${form.dueDate}T12:00:00.000Z` : undefined,
        sourceAlertId: form.sourceAlertId || undefined,
        sourcePredictionId: form.sourcePredictionId || undefined,
        predictionDuplicateNote: form.predictionDuplicateNote.trim() || undefined,
      })
      setForm({
        subjectId: '',
        description: '',
        type: 'corretiva',
        region: 'Centro',
        priority: 'média',
        relatedAssetId: '',
        location: '',
        assignee: '',
        dueDate: '',
        sourceAlertId: '',
        sourcePredictionId: '',
        predictionDuplicateNote: '',
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar ordem de serviço')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova ordem de serviço">
      <form className="space-y-3 text-sm" onSubmit={(e) => void submit(e)}>
        {presetPrediction ? (
          <p className="rounded-fogo-md border border-fogo-prevision/30 bg-fogo-prevision-bg px-3 py-2 text-xs text-fogo-text">
            Origem: previsão {presetPrediction.id}. Revise o assunto e os dados antes de abrir a OS. A previsão
            permanece no motor.
            {presetPrediction.workOrderProtocol
              ? ` Já existe ${presetPrediction.workOrderProtocol} vinculada — justifique se for abrir outra.`
              : null}
          </p>
        ) : null}
        <SubjectSelect
          value={form.subjectId}
          canCreate={can('incidents', 'manage')}
          onChange={(id, subject) =>
            setForm((f) => ({
              ...f,
              subjectId: id,
              type: subject ? subjectSuggestsOsType(subject.name) : f.type,
            }))
          }
        />
        <label className="block">
          <span className="text-fogo-muted">Ocorrência (opcional)</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.sourceAlertId}
            onChange={(e) => {
              const id = e.target.value
              const occ = pendingOccurrences.find((a) => a.id === id)
              setForm((f) => ({
                ...f,
                sourceAlertId: id,
                relatedAssetId: occ?.relatedAssetId || f.relatedAssetId,
                region: occ?.region || f.region,
                location: occ?.region || f.location,
                description: f.description || (occ ? `${alertHeadline(occ.title)} — ${occ.description}` : ''),
              }))
            }}
          >
            <option value="">— sem vínculo —</option>
            {pendingOccurrences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} · {alertHeadline(a.title)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-fogo-muted">
            Vincular alimenta a documentação da OS e tira a ocorrência da fila pendente.
          </span>
        </label>
        <label className="block">
          <span className="text-fogo-muted">Complemento (opcional)</span>
          <textarea
            className="mt-1 min-h-[72px] w-full rounded-fogo-md border border-fogo-border px-2 py-1.5"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Detalhe operacional, endereço ou instrução ao agente"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-fogo-muted">Categoria</span>
            <select
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, assignee: '' }))}
            >
              {OS_CATEGORIES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-fogo-muted">Prioridade</span>
            <select
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as IncidentPriority }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-fogo-muted">Ativo (opcional)</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.relatedAssetId}
            onChange={(e) => {
              const id = e.target.value
              const asset = assets.find((a) => a.id === id)
              setForm((f) => ({
                ...f,
                relatedAssetId: id,
                location: asset?.name ?? f.location,
                region: asset?.region ?? f.region,
              }))
            }}
          >
            <option value="">— sem ativo —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-fogo-muted">Região</span>
            <select
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            >
              {OS_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-fogo-muted">Prazo</span>
            <input
              type="date"
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-fogo-muted">Agente (opcional)</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.assignee}
            onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
          >
            <option value="">Agendar depois</option>
            {agents.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
                {teamCanHandle(t.capabilities, required) ? ' · qualificado' : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-fogo-muted">
            Qualificação sugerida: {capabilityLabel(required)}. Qualquer agente pode ser escolhido.
          </span>
        </label>
        {presetPrediction?.workOrderProtocol ? (
          <label className="block">
            <span className="text-fogo-muted">Justificativa para nova OS nesta previsão</span>
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-fogo-md border border-fogo-border px-2 py-1.5"
              value={form.predictionDuplicateNote}
              onChange={(e) => setForm((f) => ({ ...f, predictionDuplicateNote: e.target.value }))}
              placeholder="Motivo operacional para abrir outra ordem (mínimo 8 caracteres)"
            />
          </label>
        ) : null}
        {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={submitting || !apiConnected}>
          {submitting ? 'Salvando…' : 'Abrir ordem de serviço'}
        </Button>
      </form>
    </Modal>
  )
}
