import { useMemo, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { AlertDetailDrawer } from '@/components/alerts/AlertDetailDrawer'
import { AlertKpiStrip } from '@/components/alerts/AlertKpiStrip'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useCcoAuth } from '@/context/CcoAuthContext'
import type { OperationalAlert } from '@/types'
import { formatDurationMs } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { isAlertOpen, slaClock } from '@/lib/alertSlaMetrics'
import { occurrenceStateLabel } from '@/lib/occurrenceState'
import { isAlertPending, operatorAlertKpis } from '@/lib/operatorAlertStats'
import { canSeeCategorySla, formatSlaPercent, slaPercentForAlert, slaTone } from '@/lib/categorySla'
import { cn } from '@/lib/cn'
import { alertHeadline } from '@/lib/alertCopy'

export function AlertsPage() {
  const { alerts, incidents, apiConnected, apiStatus } = useOpsData()
  const { region } = useOpsFilter()
  const { profile } = useCcoAuth()
  const now = useNow(1000)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [selected, setSelected] = useState<OperationalAlert | null>(null)
  const showSla = canSeeCategorySla({
    isPlatformSuperAdmin: profile?.isPlatformSuperAdmin,
    memberRole: profile?.actor?.role,
  })
  const meId = profile?.actor?.userId

  const scoped = useMemo(() => {
    let list = [...alerts]
    if (region) list = list.filter((a) => a.region === region)
    return list
  }, [alerts, region])

  const kpis = useMemo(() => operatorAlertKpis(scoped, incidents, meId), [scoped, incidents, meId])

  const rows = useMemo(() => {
    const sorted = [...scoped].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    )
    if (filter === 'open') return sorted.filter((a) => isAlertPending(a.state))
    return sorted
  }, [scoped, filter])

  return (
    <PageShell searchPlaceholder="Buscar ocorrência…">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="shrink-0 space-y-4">
          <OpsRegionFilterBar />
          <AlertKpiStrip values={kpis} variant="queue" />
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'open'} onClick={() => setFilter('open')}>
              Pendentes
            </FilterChip>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Todas
            </FilterChip>
            {apiStatus === 'offline' ? (
              <span className="text-xs text-fogo-warning">API offline — ações indisponíveis</span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-fogo-bg text-xs text-fogo-muted">
            <tr>
              <th className="px-3 py-2 text-left">Ocorrência</th>
              <th className="px-3 py-2 text-left">Severidade</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Operador</th>
              <th className="px-3 py-2 text-left">Tempo desde a ocorrência</th>
              {showSla ? <th className="px-3 py-2 text-left">SLA</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const elapsed = slaClock(a.detectedAt, isAlertOpen(a.state) ? undefined : a.completedAt, now, !isAlertOpen(a.state))
              const percent = showSla ? slaPercentForAlert(a, now) : null
              const tone = percent != null ? slaTone(percent) : null
              return (
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-fogo-border align-top hover:bg-fogo-bg/60"
                  onClick={() => setSelected(a)}
                >
                  <td className="px-3 py-3">
                    <p className="font-medium text-fogo-text">{alertHeadline(a.title)}</p>
                    <p className="mt-0.5 text-xs text-fogo-muted">{a.id} · {a.category}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={priorityVariant(a.severity === 'informativa' ? 'baixa' : a.severity)}>
                      {a.severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">{occurrenceStateLabel(a.state)}</td>
                  <td className="px-3 py-3 text-xs">{a.claimedByLabel ?? '—'}</td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {formatDurationMs(elapsed.ms)}
                    {elapsed.pending ? <span className="ml-1 text-[10px] text-fogo-muted">em aberto</span> : null}
                  </td>
                  {showSla ? (
                    <td
                      className={cn(
                        'px-3 py-3 text-xs font-medium tabular-nums',
                        tone === 'critical' && 'text-fogo-critical',
                        tone === 'warn' && 'text-fogo-warning',
                        tone === 'ok' && 'text-fogo-success',
                      )}
                    >
                      {percent != null ? formatSlaPercent(percent) : '—'}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      <AlertDetailDrawer
        alert={selected ? (alerts.find((a) => a.id === selected.id) ?? selected) : null}
        onClose={() => setSelected(null)}
      />
    </PageShell>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-fogo-md border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-fogo-accent bg-fogo-accent/10 text-fogo-accent'
          : 'border-fogo-border text-fogo-muted hover:border-fogo-accent/40',
      )}
    >
      {children}
    </button>
  )
}
