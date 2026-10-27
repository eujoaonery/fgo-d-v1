import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { Button } from '@/components/ui/Button'
import { Badge, priorityVariant, statusVariant } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/tables/DataTable'
import { IncidentDetailDrawer } from '@/pages/overview/IncidentDetailDrawer'
import { ScheduleWorkOrderModal } from '@/components/workOrders/ScheduleWorkOrderModal'
import { CreateWorkOrderModal } from '@/components/workOrders/CreateWorkOrderModal'
import { useOpsData } from '@/context/OpsDataContext'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import type { Incident } from '@/types'
import { formatDateTime } from '@/lib/format'
import { OS_REGIONS, OS_STATUSES, formatHourRange, isOsOpen, osTitle } from '@/lib/workOrders'

const PAGE_SIZE = 8

export function IncidentsPage() {
  const { incidents, apiConnected } = useOpsData()
  const { can } = useCcoAccess()
  const { region: sharedRegion } = useOpsFilter()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('openedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Incident | null>(null)
  const [toSchedule, setToSchedule] = useState<Incident | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const canManage = can('incidents', 'manage')

  const estadoFilter = params.get('estado') ?? ''
  const prioridadeFilter = params.get('prioridade') ?? ''
  const categoriaFilter = params.get('categoria') ?? ''
  const regiaoFilter = params.get('regiao') ?? ''

  const categories = useMemo(
    () => [...new Set(incidents.map((i) => i.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [incidents],
  )

  const filtered = useMemo(() => {
    let rows = [...incidents]
    if (estadoFilter) rows = rows.filter((i) => i.status === estadoFilter)
    if (prioridadeFilter) rows = rows.filter((i) => i.priority === prioridadeFilter)
    if (categoriaFilter) rows = rows.filter((i) => i.type === categoriaFilter)
    if (regiaoFilter) rows = rows.filter((i) => i.region === regiaoFilter)
    if (sharedRegion) rows = rows.filter((i) => i.region === sharedRegion)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          osTitle(i).toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q),
      )
    }
    rows.sort((a, b) => {
      const av =
        sortKey === 'openedAt'
          ? new Date(a.openedAt).getTime()
          : sortKey === 'scheduledStart'
            ? new Date(a.scheduledStart ?? 0).getTime()
            : String(a[sortKey as keyof Incident] ?? '')
      const bv =
        sortKey === 'openedAt'
          ? new Date(b.openedAt).getTime()
          : sortKey === 'scheduledStart'
            ? new Date(b.scheduledStart ?? 0).getTime()
            : String(b[sortKey as keyof Incident] ?? '')
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [
    incidents,
    estadoFilter,
    prioridadeFilter,
    categoriaFilter,
    regiaoFilter,
    sharedRegion,
    search,
    sortKey,
    sortDir,
  ])

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const openCount = incidents.filter((i) => isOsOpen(i.status)).length

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
    setPage(0)
  }

  const columns: Column<Incident>[] = [
    { key: 'id', header: 'OS', sortable: true, render: (r) => <span className="font-medium text-fogo-accent">{r.id}</span> },
    {
      key: 'workOrderDescription',
      header: 'Assunto',
      render: (r) => (
        <div>
          <p className="line-clamp-2 text-fogo-text">{osTitle(r)}</p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-fogo-muted">
            {r.sourceAlertId ? `Ocorrência ${r.sourceAlertId}` : r.description}
          </p>
        </div>
      ),
    },
    { key: 'type', header: 'Categoria', render: (r) => r.type },
    { key: 'region', header: 'Região', sortable: true, render: (r) => r.region },
    {
      key: 'priority',
      header: 'Prioridade',
      render: (r) => <Badge variant={priorityVariant(r.priority)}>{r.priority}</Badge>,
    },
    {
      key: 'scheduledStart',
      header: 'Agenda',
      sortable: true,
      render: (r) =>
        r.scheduledStart ? (
          <span className="text-xs tabular-nums">
            {formatDateTime(r.scheduledStart)}
            {r.scheduledEnd ? ` · ${formatHourRange(r.scheduledStart, r.scheduledEnd)}` : ''}
          </span>
        ) : (
          <span className="text-fogo-muted">—</span>
        ),
    },
    { key: 'assignee', header: 'Agente', render: (r) => r.assignee ?? '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (r) =>
        r.status !== 'resolvida' && r.status !== 'cancelada' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              setToSchedule(r)
            }}
          >
            {r.status === 'agendada' ? 'Reagendar' : 'Agendar'}
          </Button>
        ) : null,
    },
  ]

  return (
    <PageShell searchValue={search} onSearchChange={setSearch} searchPlaceholder="Buscar OS, descrição ou local…">
      <OpsRegionFilterBar />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fogo-muted">
          {openCount} ordem(ns) em aberto, agendada(s) ou em atendimento — inclui preventiva, corretiva e inspeção
        </p>
        {canManage ? (
          <Button variant="primary" size="sm" disabled={!apiConnected} onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nova OS
          </Button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect label="Categoria" value={categoriaFilter} onChange={(v) => setFilter('categoria', v)} options={['', ...categories]} />
        <FilterSelect label="Estado" value={estadoFilter} onChange={(v) => setFilter('estado', v)} options={['', ...OS_STATUSES]} />
        <FilterSelect
          label="Prioridade"
          value={prioridadeFilter}
          onChange={(v) => setFilter('prioridade', v)}
          options={['', 'baixa', 'média', 'alta', 'crítica']}
        />
        <FilterSelect label="Região" value={regiaoFilter} onChange={(v) => setFilter('regiao', v)} options={['', ...OS_REGIONS]} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setParams(new URLSearchParams())
            setSearch('')
            setPage(0)
          }}
        >
          Limpar filtros
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(r) => r.id}
        onRowClick={setSelected}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(key) => {
          if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
          else {
            setSortKey(key)
            setSortDir('asc')
          }
        }}
        emptyMessage="Nenhuma ordem de serviço corresponde aos filtros."
      />

      <div className="mt-3 flex items-center justify-between text-sm text-fogo-muted">
        <span>
          Página {page + 1} de {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <IncidentDetailDrawer incident={selected} onClose={() => setSelected(null)} />
      <ScheduleWorkOrderModal incident={toSchedule} onClose={() => setToSchedule(null)} />
      <CreateWorkOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageShell>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="text-xs text-fogo-muted">
      {label}
      <select
        className="ml-1.5 rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o || 'all'} value={o}>
            {o || 'Todos'}
          </option>
        ))}
      </select>
    </label>
  )
}
