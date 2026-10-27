import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { Badge, priorityVariant, statusVariant } from '@/components/ui/Badge'
import { IncidentDetailDrawer } from '@/pages/overview/IncidentDetailDrawer'
import { useOpsData } from '@/context/OpsDataContext'
import {
  agendaHours,
  atHourOnDay,
  addHoursIso,
  formatHourRange,
  isOsUnscheduled,
  osTitle,
  priorityStripe,
  sameDay,
} from '@/lib/workOrders'
import { cn } from '@/lib/cn'
import type { Incident } from '@/types'

const HOUR_PX = 52

export function AgendaPage() {
  const { incidents, teams, scheduleWorkOrder, apiConnected, apiStatus } = useOpsData()
  const [day, setDay] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selected, setSelected] = useState<Incident | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hours = agendaHours()
  const unscheduled = useMemo(
    () => incidents.filter(isOsUnscheduled).sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()),
    [incidents],
  )
  const scheduledToday = useMemo(
    () => incidents.filter((i) => i.scheduledStart && sameDay(i.scheduledStart, day) && i.status !== 'cancelada'),
    [incidents, day],
  )

  const columns = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [teams])

  function shiftDay(delta: number) {
    const next = new Date(day)
    next.setDate(next.getDate() + delta)
    setDay(next)
  }

  async function dropOn(teamId: string, hour: number, osId: string) {
    setError(null)
    const start = atHourOnDay(day, hour)
    try {
      await scheduleWorkOrder(osId, { teamId, start, end: addHoursIso(start, 1) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao agendar')
    }
  }

  const dateLabel = day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <PageShell flush className="overflow-hidden" searchPlaceholder="Buscar OS…">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-fogo-border bg-fogo-surface">
          <div className="border-b border-fogo-border px-3 py-2">
            <p className="text-[11px] font-medium text-fogo-muted">O.S. não agendadas</p>
            <p className="text-[10px] text-fogo-muted">Arraste uma ordem para o agente e o horário.</p>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {unscheduled.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-fogo-muted">Nenhuma OS em aberto para agendar.</li>
            ) : (
              unscheduled.map((os) => (
                <li key={os.id}>
                  <article
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/os-id', os.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    className="cursor-grab rounded-md border border-fogo-border bg-fogo-bg/40 p-2 active:cursor-grabbing"
                    style={{ borderLeftWidth: 4, borderLeftColor: priorityStripe(os.priority) }}
                  >
                    <p className="font-mono text-[10px] text-fogo-accent">{os.id}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-fogo-text">{osTitle(os)}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] text-fogo-muted">
                      {os.region} · {os.location}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge variant={priorityVariant(os.priority)}>{os.priority}</Badge>
                      <Badge variant={statusVariant(os.status)}>{os.status}</Badge>
                    </div>
                  </article>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-fogo-bg">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-fogo-border bg-fogo-surface px-3 py-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setDay(new Date(new Date().setHours(0, 0, 0, 0)))}>
                Hoje
              </Button>
              <Button size="icon" variant="ghost" aria-label="Dia anterior" onClick={() => shiftDay(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="min-w-[220px] text-center text-sm font-semibold capitalize text-fogo-text">{dateLabel}</p>
              <Button size="icon" variant="ghost" aria-label="Próximo dia" onClick={() => shiftDay(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="rounded-md border border-fogo-accent/30 bg-fogo-accent/10 px-2 py-1 text-[11px] font-medium text-fogo-accent">
              Dia / Colaborador
            </p>
          </header>
          {error ? <p className="border-b border-fogo-critical/30 bg-fogo-critical-bg px-3 py-1.5 text-xs text-fogo-critical">{error}</p> : null}
          {apiStatus === 'offline' ? (
            <p className="border-b border-fogo-warning/30 bg-fogo-warning-bg px-3 py-1.5 text-xs text-fogo-warning">
              API offline — o agendamento por arraste fica indisponível.
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">
            <div
              className="grid min-w-[720px]"
              style={{ gridTemplateColumns: `64px repeat(${Math.max(columns.length, 1)}, minmax(140px, 1fr))` }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r border-fogo-border bg-fogo-surface" />
              {columns.map((team) => (
                <div
                  key={team.id}
                  className="sticky top-0 z-10 truncate border-b border-r border-fogo-border bg-fogo-surface px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-fogo-muted"
                  title={team.name}
                >
                  {team.name}
                </div>
              ))}
              {columns.length === 0 ? (
                <div className="sticky top-0 z-10 border-b border-fogo-border bg-fogo-surface px-2 py-2 text-xs text-fogo-muted">
                  Cadastre agentes para montar a grade.
                </div>
              ) : null}

              {hours.map((hour) => (
                <HourRow
                  key={hour}
                  hour={hour}
                  columns={columns.map((t) => t.id)}
                  events={scheduledToday}
                  teams={columns}
                  dragOver={dragOver}
                  onDragOverCell={(key) => setDragOver(key)}
                  onDrop={(teamId, osId) => void dropOn(teamId, hour, osId)}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <IncidentDetailDrawer incident={selected} onClose={() => setSelected(null)} />
    </PageShell>
  )
}

function HourRow({
  hour,
  columns,
  events,
  teams,
  dragOver,
  onDragOverCell,
  onDrop,
  onSelect,
}: {
  hour: number
  columns: string[]
  events: Incident[]
  teams: { id: string; name: string }[]
  dragOver: string | null
  onDragOverCell: (key: string | null) => void
  onDrop: (teamId: string, osId: string) => void
  onSelect: (os: Incident) => void
}) {
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r border-fogo-border bg-fogo-bg px-1 py-1 text-right text-[10px] tabular-nums text-fogo-muted">
        {String(hour).padStart(2, '0')}:00
      </div>
      {columns.map((teamId) => {
        const key = `${teamId}:${hour}`
        const starting = events.filter((os) => {
          if (os.assignedTeamId !== teamId || !os.scheduledStart) return false
          return new Date(os.scheduledStart).getHours() === hour
        })
        return (
          <div
            key={key}
            className={cn(
              'relative border-b border-r border-fogo-border',
              dragOver === key && 'bg-fogo-accent/10',
            )}
            style={{ height: HOUR_PX }}
            onDragOver={(e) => {
              e.preventDefault()
              onDragOverCell(key)
            }}
            onDragLeave={() => onDragOverCell(null)}
            onDrop={(e) => {
              e.preventDefault()
              onDragOverCell(null)
              const osId = e.dataTransfer.getData('text/os-id')
              if (osId) onDrop(teamId, osId)
            }}
          >
            {starting.map((os) => {
              const start = new Date(os.scheduledStart!)
              const end = os.scheduledEnd ? new Date(os.scheduledEnd) : new Date(start.getTime() + 3600_000)
              const minutes = start.getMinutes()
              const durH = Math.max((end.getTime() - start.getTime()) / 3600_000, 0.5)
              return (
                <button
                  key={os.id}
                  type="button"
                  onClick={() => onSelect(os)}
                  className="absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded-sm border border-black/10 px-1 py-0.5 text-left shadow-sm"
                  style={{
                    top: (minutes / 60) * HOUR_PX + 1,
                    height: Math.max(durH * HOUR_PX - 3, 22),
                    background: '#fde68a',
                    borderLeftWidth: 3,
                    borderLeftColor: priorityStripe(os.priority),
                  }}
                  title={`${osTitle(os)} · ${teams.find((t) => t.id === teamId)?.name ?? ''}`}
                >
                  <span className="block truncate text-[9px] font-semibold text-slate-800">
                    {formatHourRange(os.scheduledStart!, os.scheduledEnd)}
                  </span>
                  <span className="block truncate text-[10px] text-slate-700">{osTitle(os)}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
