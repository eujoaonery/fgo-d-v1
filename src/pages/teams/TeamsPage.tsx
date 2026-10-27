import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { useOpsData } from '@/context/OpsDataContext'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { canAccessModule } from '@/lib/ccoPermissions'
import { ALL_TEAM_CAPABILITIES, agentRoleOptions, capabilityLabel } from '@/lib/teamCapabilities'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import type { AgentFunctionalStatus, AgentOperationalStatus, AgentShift, Team, TeamCapability } from '@/types'
import { DataGridCsvBar } from '@/components/data/DataGridCsvBar'
import { teamsToCsv, teamCsvTemplateRow } from '@/lib/csv/teamsCsv'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import {
  AGENT_FUNCTIONAL_LABELS,
  AGENT_FUNCTIONAL_STATUSES,
  AGENT_OPERATIONAL_STATUSES,
  WEEKDAY_LABELS,
  isAgentBusy,
} from '@/lib/agents'
import { datetimeLocalValue, fromDatetimeLocal } from '@/lib/workOrders'

const REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste']

const emptyForm = {
  name: '',
  specialty: '',
  region: 'Centro',
  status: 'disponível' as AgentOperationalStatus,
  registrationNumber: '',
  responsibleOrg: '',
  unit: '',
  jobTitle: '',
  qualifications: '',
  functionalStatus: 'ativo' as AgentFunctionalStatus,
  locationShareUntil: '',
  shifts: [] as AgentShift[],
  capabilities: [] as TeamCapability[],
}

export function TeamsPage() {
  const { teams: teamsRaw, simulation, saveTeam, patchTeam, removeTeam, apiConnected, apiStatus, refresh } = useOpsData()
  const { can } = useCcoAccess()
  const teams = teamsRaw ?? []
  const { profile } = useCcoAuth()
  const canManage = profile
    ? canAccessModule(profile.permissions, 'teams', 'manage', {
        memberRole: profile.actor?.role as import('@/lib/ccoPermissions').CcoMemberRole | undefined,
      })
    : false

  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(params.get('estado') === 'campo' ? 'em campo' : '')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [selected, setSelected] = useState<Team | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false
      if (regionFilter && t.region !== regionFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.specialty.toLowerCase().includes(q) ||
          (t.registrationNumber ?? '').toLowerCase().includes(q) ||
          (t.qualifications ?? []).some((m) => m.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [teams, statusFilter, regionFilter, search])

  const stats = {
    total: teams.length,
    disponivel: teams.filter((t) => t.status === 'disponível').length,
    campo: teams.filter((t) => isAgentBusy(t.status)).length,
    atendimentos: teams.filter((t) => t.assignedIncidentId).length,
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(team: Team) {
    setEditingId(team.id)
    setForm({
      name: team.name,
      specialty: team.specialty,
      region: team.region,
      status: team.status,
      registrationNumber: team.registrationNumber ?? '',
      responsibleOrg: team.responsibleOrg ?? '',
      unit: team.unit ?? '',
      jobTitle: team.jobTitle ?? '',
      qualifications: (team.qualifications ?? []).join(', '),
      functionalStatus: team.functionalStatus ?? 'ativo',
      locationShareUntil: datetimeLocalValue(team.locationShareUntil),
      shifts: team.shifts ?? [],
      capabilities: [...team.capabilities],
    })
    setFormError(null)
    setModalOpen(true)
  }

  function toggleCapability(c: TeamCapability) {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(c) ? f.capabilities.filter((x) => x !== c) : [...f.capabilities, c],
    }))
  }

  async function submitTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!apiConnected || !canManage) return
    setSubmitting(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      region: form.region,
      status: form.status,
      members: [] as string[],
      capabilities: form.capabilities,
      registrationNumber: form.registrationNumber.trim() || undefined,
      responsibleOrg: form.responsibleOrg.trim() || undefined,
      unit: form.unit.trim() || undefined,
      jobTitle: form.jobTitle.trim() || undefined,
      qualifications: form.qualifications
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      functionalStatus: form.functionalStatus,
      locationShareUntil: fromDatetimeLocal(form.locationShareUntil),
      shifts: form.shifts,
    }
    try {
      if (editingId) {
        await patchTeam(editingId, payload)
      } else {
        await saveTeam(payload)
      }
      setModalOpen(false)
      setSelected(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar agente')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell searchValue={search} onSearchChange={setSearch} searchPlaceholder="Buscar agente, matrícula ou especialização…">
      {!simulation?.enabled ? (
        <p className="mb-3 rounded-fogo-md border border-fogo-border bg-fogo-bg/80 px-3 py-2 text-xs text-fogo-muted">
          Com o monitoramento pausado, agentes permanecem cadastrados; o acionamento ocorre nas ordens de serviço quando o
          monitoramento estiver ativo.
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ['Agentes cadastrados', stats.total],
          ['Disponíveis', stats.disponivel],
          ['Em campo', stats.campo],
          ['Atendimentos', stats.atendimentos],
        ].map(([l, v]) => (
          <Card key={l} className="fogo-glass px-3 py-2.5">
            <p className="text-[10px] text-fogo-muted">{l}</p>
            <p className="text-xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant={view === 'grid' ? 'primary' : 'outline'} size="sm" onClick={() => setView('grid')}>
          Grade
        </Button>
        <Button variant={view === 'table' ? 'primary' : 'outline'} size="sm" onClick={() => setView('table')}>
          Tabela
        </Button>
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="">Todas regiões</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos estados</option>
          {AGENT_OPERATIONAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(regionFilter || statusFilter || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRegionFilter('')
              setStatusFilter('')
              setSearch('')
            }}
          >
            Limpar filtros
          </Button>
        )}
        {canManage ? (
          <Button variant="primary" size="sm" className="ml-auto" disabled={!apiConnected} onClick={openCreate}>
            Novo agente
          </Button>
        ) : null}
      </div>

      <div className="mb-3">
        <DataGridCsvBar
          kind="teams"
          apiConnected={apiConnected}
          canView={can('teams', 'view')}
          canManage={can('teams', 'manage')}
          canExport={can('teams', 'export')}
          filteredCount={filtered.length}
          totalCount={teams.length}
          getFilteredCsv={() => teamsToCsv(filtered)}
          getTemplateCsv={teamCsvTemplateRow}
          filteredFilename="fogo-agentes-filtrado.csv"
          onImported={refresh}
        />
      </div>

      {apiStatus === 'offline' ? (
        <p className="mb-3 rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-3 py-2 text-sm text-fogo-text">
          Não foi possível carregar agentes. Verifique a conexão com o serviço e o login.
        </p>
      ) : null}

      {filtered.length === 0 && apiConnected ? (
        <p className="mb-3 rounded-fogo-md border border-dashed border-fogo-border px-4 py-8 text-center text-sm text-fogo-muted">
          {teams.length === 0
            ? 'Nenhum agente cadastrado. Use “Novo agente” ou importe CSV.'
            : 'Nenhum agente corresponde aos filtros.'}
        </p>
      ) : null}

      {view === 'grid' ? (
      <div className="grid gap-2 lg:grid-cols-2">
        {filtered.map((team) => (
          <Card key={team.id} interactive className="p-4" onClick={() => setSelected(team)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{team.name}</p>
                <p className="text-xs text-fogo-muted">{team.specialty}</p>
              </div>
              <Badge variant={isAgentBusy(team.status) ? 'default' : team.status === 'disponível' ? 'success' : 'neutral'}>
                {team.status}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(team.capabilities ?? []).map((c) => (
                <Badge key={c} variant="neutral" className="text-[10px]">
                  {capabilityLabel(c)}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-fogo-muted">Região: {team.region}</p>
            <p className="text-xs text-fogo-muted">
              {team.registrationNumber ? `Matrícula ${team.registrationNumber} · ` : ''}
              {AGENT_FUNCTIONAL_LABELS[team.functionalStatus ?? 'ativo']}
            </p>
            {team.assignedIncidentId ? (
              <p className="mt-1 text-xs text-fogo-accent">OS: {team.assignedIncidentId}</p>
            ) : null}
          </Card>
        ))}
      </div>
      ) : (
        <div className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
          <table className="w-full text-sm">
            <thead className="bg-fogo-bg/70 text-xs text-fogo-muted">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Matrícula</th>
                <th className="px-3 py-2 text-left">Região</th>
                <th className="px-3 py-2 text-left">Operacional</th>
                <th className="px-3 py-2 text-left">Funcional</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((team) => (
                <tr
                  key={team.id}
                  className="cursor-pointer border-t border-fogo-border hover:bg-fogo-bg/70"
                  onClick={() => setSelected(team)}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">{team.name}</p>
                    <p className="text-xs text-fogo-muted">{team.specialty}</p>
                  </td>
                  <td className="px-3 py-2 text-fogo-accent">{team.registrationNumber || team.id}</td>
                  <td className="px-3 py-2">{team.region}</td>
                  <td className="px-3 py-2">
                    <Badge variant={isAgentBusy(team.status) ? 'default' : team.status === 'disponível' ? 'success' : 'neutral'}>
                      {team.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-fogo-muted">{AGENT_FUNCTIONAL_LABELS[team.functionalStatus ?? 'ativo']}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} subtitle={selected?.specialty}>
        {selected && (
          <div className="space-y-4 text-sm">
            <p className="text-fogo-muted">
              {selected.jobTitle ? `${selected.jobTitle} · ` : ''}
              {selected.responsibleOrg || 'Órgão não informado'}
              {selected.unit ? ` · ${selected.unit}` : ''}
            </p>
            <p className="text-xs text-fogo-muted">
              Situação funcional: {AGENT_FUNCTIONAL_LABELS[selected.functionalStatus ?? 'ativo']} — independente do estado
              operacional ({selected.status}).
            </p>
            <div>
              <p className="text-xs font-medium text-fogo-muted">Especialização / qualificações operacionais</p>
              <ul className="mt-1 list-inside list-disc text-xs text-fogo-text">
                {selected.capabilities.map((c) => (
                  <li key={c}>{capabilityLabel(c)}</li>
                ))}
              </ul>
            </div>
            {(selected.qualifications ?? []).length > 0 ? (
              <p className="text-xs">Habilitações: {selected.qualifications!.join(', ')}</p>
            ) : null}
            {(selected.shifts ?? []).length > 0 ? (
              <div>
                <p className="text-xs font-medium text-fogo-muted">Escala</p>
                <ul className="mt-1 text-xs text-fogo-text">
                  {selected.shifts!.map((s, i) => (
                    <li key={`${s.weekday}-${i}`}>
                      {WEEKDAY_LABELS[s.weekday] ?? s.weekday}: {s.start}–{s.end}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.assignedIncidentId ? (
              <p className="text-xs">
                Atendendo <span className="font-medium text-fogo-accent">{selected.assignedIncidentId}</span>
              </p>
            ) : (
              <p className="text-xs text-fogo-muted">Nenhuma ordem de serviço atribuída no momento.</p>
            )}
            {canManage && apiConnected ? (
              <>
                <Button variant="outline" className="w-full" onClick={() => openEdit(selected)}>
                  Editar agente
                </Button>
                {!selected.assignedIncidentId ? (
                  <Button
                    variant="outline"
                    className="w-full text-fogo-critical"
                    onClick={() => void removeTeam(selected.id).then(() => setSelected(null))}
                  >
                    Excluir agente
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </Drawer>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar agente' : 'Novo agente'}>
        <form className="space-y-3 text-sm" onSubmit={(e) => void submitTeam(e)}>
          <label className="block">
            <span className="text-fogo-muted">Nome</span>
            <input
              required
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-fogo-muted">Categoria operacional</span>
            <select
              required
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.specialty}
              onChange={(e) => {
                const specialty = e.target.value
                setForm((f) => ({
                  ...f,
                  specialty,
                  responsibleOrg:
                    f.responsibleOrg.trim() ||
                    (specialty === 'Agente de trânsito' || specialty === 'Guarda de trânsito'
                      ? 'Mobilidade'
                      : specialty === 'Guarda municipal'
                        ? 'Guarda Municipal'
                        : specialty === 'Policial militar'
                          ? 'Polícia Militar'
                          : f.responsibleOrg),
                }))
              }}
            >
              <option value="">Selecione</option>
              {agentRoleOptions(form.specialty).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Matrícula</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.registrationNumber}
                onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-fogo-muted">Cargo</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.jobTitle}
                onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Órgão</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.responsibleOrg}
                onChange={(e) => setForm((f) => ({ ...f, responsibleOrg: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-fogo-muted">Unidade</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Região</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-fogo-muted">Estado operacional</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AgentOperationalStatus }))}
              >
                {AGENT_OPERATIONAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-fogo-muted">Situação funcional</span>
            <select
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.functionalStatus}
              onChange={(e) => setForm((f) => ({ ...f, functionalStatus: e.target.value as AgentFunctionalStatus }))}
            >
              {AGENT_FUNCTIONAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {AGENT_FUNCTIONAL_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-fogo-muted">Habilitações (vírgula)</span>
            <input
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              placeholder="NR-10, CNH D, eletricista"
              value={form.qualifications}
              onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-fogo-muted">Compartilhar localização até</span>
            <input
              type="datetime-local"
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.locationShareUntil}
              onChange={(e) => setForm((f) => ({ ...f, locationShareUntil: e.target.value }))}
            />
          </label>
          <fieldset>
            <legend className="text-fogo-muted">Escala</legend>
            <div className="mt-2 space-y-1">
              {form.shifts.map((s, idx) => (
                <div key={`${s.weekday}-${idx}`} className="flex items-center gap-1">
                  <select
                    className="h-8 rounded-fogo-md border border-fogo-border px-1 text-xs"
                    value={s.weekday}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shifts: f.shifts.map((row, i) => (i === idx ? { ...row, weekday: Number(e.target.value) } : row)),
                      }))
                    }
                  >
                    {WEEKDAY_LABELS.map((label, day) => (
                      <option key={label} value={day}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    className="h-8 rounded-fogo-md border border-fogo-border px-1 text-xs"
                    value={s.start}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shifts: f.shifts.map((row, i) => (i === idx ? { ...row, start: e.target.value } : row)),
                      }))
                    }
                  />
                  <input
                    type="time"
                    className="h-8 rounded-fogo-md border border-fogo-border px-1 text-xs"
                    value={s.end}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shifts: f.shifts.map((row, i) => (i === idx ? { ...row, end: e.target.value } : row)),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, shifts: f.shifts.filter((_, i) => i !== idx) }))}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, shifts: [...f.shifts, { weekday: 1, start: '08:00', end: '17:00' }] }))}
              >
                Adicionar turno
              </Button>
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-fogo-muted">Qualificações operacionais</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_TEAM_CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={form.capabilities.includes(c)} onChange={() => toggleCapability(c)} />
                  {capabilityLabel(c)}
                </label>
              ))}
            </div>
          </fieldset>
          {formError ? <p className="text-xs text-fogo-critical">{formError}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </PageShell>
  )
}
